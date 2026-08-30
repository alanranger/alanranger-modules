// api/admin/email-health-watchdog.js
// Daily info@ health email. Cron 08:30 + 09:30 UTC, London hour 9 (09:30).
// Always sends, healthy or not. Absence of the email is itself an alert.

const { createClient } = require("@supabase/supabase-js");
const nodemailer = require("nodemailer");
const { londonHour } = require("../../lib/london-trial-days");
const { LIFECYCLE_BCC } = require("../../lib/lifecycleEmailConfig");
const { detectTriggerSource } = require("../../lib/emailCronHeartbeat");
const {
  WATCHDOG_STAGES,
  latestUsefulCronRun,
  classifyWatchdogRow,
  formatWatchdogEmail,
} = require("../../lib/emailHealthWatchdog");
const { verifyGmailSent, countFoundFor } = require("../../lib/gmailSentVerify");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const EMAIL_FROM = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
const EMAIL_SMTP_HOST = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
const EMAIL_SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || "587", 10);
const WATCHDOG_TO = process.env.EMAIL_WATCHDOG_TO || LIFECYCLE_BCC;

function parseBool(v, defaultVal) {
  if (v === undefined || v === null || v === "") return defaultVal;
  const s = String(v).toLowerCase();
  if (["false", "0", "no", "off"].includes(s)) return false;
  if (["true", "1", "yes", "on"].includes(s)) return true;
  return defaultVal;
}

function isRequestAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization || "";
    if (authHeader === `Bearer ${cronSecret}`) return "ok";
  }
  const webhookSecret = process.env.ORPHANED_WEBHOOK_SECRET;
  if (!webhookSecret) return "ok";
  const provided = req.query.secret || req.headers["x-webhook-secret"];
  if (!provided) return "open";
  return provided === webhookSecret ? "ok" : "unauthorized";
}

function shouldRunNow(req, authOk) {
  if (parseBool(req.query.forceSend, false) && authOk) return true;
  return londonHour(Date.now()) === 9;
}

async function loadEventsLast24h(sinceIso) {
  const { data, error } = await supabase
    .from("academy_email_events")
    .select("stage_key, email, created_at")
    .eq("dry_run", false)
    .eq("status", "sent")
    .gte("created_at", sinceIso);
  if (error) throw new Error(`academy_email_events: ${error.message}`);
  return data || [];
}

async function loadCronRuns() {
  const { data, error } = await supabase
    .from("academy_email_cron_runs")
    .select("stage_key, run_at, auth_ok, sent, error, members_evaluated, trigger_source, webhook")
    .order("run_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(`academy_email_cron_runs: ${error.message}`);
  return data || [];
}

function eventsForStage(events, key) {
  return events.filter((e) => e.stage_key === key);
}

// Sent multipart: HTML table for reading, plain text as the fallback for
// clients that block HTML.
async function sendWatchdogMail(subject, text, html) {
  if (!EMAIL_FROM || !EMAIL_PASSWORD) throw new Error("Email SMTP not configured");
  const transporter = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    secure: EMAIL_SMTP_PORT === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  return transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
    to: WATCHDOG_TO,
    subject,
    text,
    html,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authResult = isRequestAuthorized(req);
  if (authResult === "unauthorized") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!shouldRunNow(req, authResult === "ok")) {
    return res.status(200).json({ success: true, skipped: true, reason: "outside London 09:00 hour (watchdog is 09:30)" });
  }

  const nowMs = Date.now();
  const generatedAt = new Date(nowMs).toISOString();
  const sinceIso = new Date(nowMs - 24 * 3600000).toISOString();
  const sourceErrors = [];
  let events = [];
  let cronRows = [];
  let dbOk = true;

  if (!supabase) {
    dbOk = false;
    sourceErrors.push("DB");
  } else {
    try {
      events = await loadEventsLast24h(sinceIso);
      cronRows = await loadCronRuns();
    } catch (err) {
      dbOk = false;
      sourceErrors.push("DB");
      events = [];
      cronRows = [];
      sourceErrors.push(err.message);
    }
  }

  const allRecipients = events.map((e) => e.email);
  const gmail = await verifyGmailSent(allRecipients, new Date(sinceIso));
  const gmailNote = gmail.ok
    ? `Gmail Sent lookup: ok (${allRecipients.length} logged recipient(s) checked)`
    : `⚠ monitor could NOT verify source Gmail Sent — ${gmail.error}`;

  const byStage = {};
  for (const row of cronRows) {
    if (!byStage[row.stage_key]) byStage[row.stage_key] = [];
    byStage[row.stage_key].push(row);
  }

  const rows = WATCHDOG_STAGES.map((stage) => {
    const stageEvents = eventsForStage(events, stage.key);
    const lastRun = latestUsefulCronRun(byStage[stage.key] || []);
    const emails = [...new Set(stageEvents.map((e) => String(e.email || "").toLowerCase()).filter(Boolean))];
    const loggedSent = emails.length;
    const gmailFound = gmail.ok ? countFoundFor(emails, gmail.counts) : 0;
    const classified = classifyWatchdogRow({
      eligible: lastRun && lastRun.members_evaluated != null ? Number(lastRun.members_evaluated) : null,
      loggedSent,
      gmailFound,
      gmailOk: gmail.ok,
      lastRun,
      nowMs,
      sourceErrors: dbOk ? [] : ["DB"],
    });
    return {
      key: stage.key,
      label: stage.label,
      eligible: lastRun && lastRun.members_evaluated != null ? Number(lastRun.members_evaluated) : null,
      loggedSent,
      gmailFound,
      gmailOk: gmail.ok,
      state: classified.state,
      firingLabel: classified.label,
      detail: classified.detail,
    };
  });

  const formatted = formatWatchdogEmail({
    rows,
    generatedAt,
    gmailNote,
  });

  try {
    const info = await sendWatchdogMail(formatted.subject, formatted.text, formatted.html);
    return res.status(200).json({
      success: true,
      trigger_source: detectTriggerSource(req),
      to: WATCHDOG_TO,
      subject: formatted.subject,
      messageId: info.messageId,
      body: formatted.text,
      html: formatted.html,
      rows,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      subject: formatted.subject,
      body: formatted.text,
      html: formatted.html,
      rows,
    });
  }
};
