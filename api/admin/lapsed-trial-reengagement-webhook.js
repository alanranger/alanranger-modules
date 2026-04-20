// api/admin/lapsed-trial-reengagement-webhook.js
// Win-back (REWIND20) re-engagement webhook. Designed to be called weekly by
// Zapier (Schedule → Webhook). Identifies members whose trial ended 8–180 days
// ago and never converted, then emails them a personal £20-off offer valid for
// 7 days from send.
//
// Re-sends are gated to max 3 attempts per member with a 90-day cooldown
// between attempts; any click on the unsubscribe link opts the member out
// permanently.
//
// Query parameters:
//   secret       — matches ORPHANED_WEBHOOK_SECRET (same as trial-expiry-reminder)
//   sendEmail    — false|0|no|off for dry-run (returns candidates only)
//   testEmail    — send a single test email to the given address (member must
//                  exist in academy_trial_history; still respects sendEmail=false)
//   limit        — cap the number of members processed per run (default 500)
//
// Response:
//   { success, candidates_found, emails_sent, emails_failed, email_results }

const { createClient } = require("@supabase/supabase-js");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const EMAIL_FROM = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
const EMAIL_SMTP_HOST = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
const EMAIL_SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || "587", 10);

let emailTransporter = null;
if (EMAIL_FROM && EMAIL_PASSWORD) {
  emailTransporter = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    secure: EMAIL_SMTP_PORT === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Campaign configuration
// ─────────────────────────────────────────────────────────────────────────
const DASHBOARD_URL =
  process.env.ACADEMY_UPGRADE_URL || "https://www.alanranger.com/academy/dashboard";
const API_BASE_URL =
  process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";

const CAMPAIGN = {
  reachBackDays: 180,        // only contact trials that ended within the last 180 days
  minDaysSinceExpiry: 8,     // skip anyone still inside the SAVE20 grace window
  windowDays: 7,             // personal REWIND20 coupon window
  maxSends: 3,               // never email any member more than 3 times
  cooldownDays: 90,          // wait 90 days between sends for the same member
  annualPriceGbp: 79,
  discountGbp: 20,
  discountedPriceGbp: 59,
  couponCode: "REWIND20",
  defaultLimit: 500,
};

// ─────────────────────────────────────────────────────────────────────────
// Email content
// ─────────────────────────────────────────────────────────────────────────

const FEATURE_BULLETS = [
  "**60 training modules** — in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing",
  "**35 one-page field checklists** — print-ready PDFs for every shoot scenario",
  "**30 practice packs** — self-paced assignments built around Alan's frameworks and guidance",
  "**15 exams with downloadable certificates** — individual pass certificates plus a master certificate when you complete them all",
  "**741-page searchable eBook** — every module in a printable PDF, yours for life",
  "**Applied Learning Library** — 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)",
  "**Pro photographer toolkit** — Exposure Calculator, Print Size Calculator, Photography Style Quiz, Colour IQ / Hue Test",
  "**Robo-Ranger AI assistant** — on-demand answers on technique, gear and Academy content",
  "**Direct messaging & Q&A with Alan** — message Alan with questions and join the live Q&A sessions",
  "**New modules and exams planned through 2026** — the syllabus is actively growing, not frozen",
  "**RPS Accreditation pathway (coming soon)** — routes to Licentiate and Associate with resources to support your panel",
];

function renderFeatureList() {
  return FEATURE_BULLETS.map((b) => "- " + b).join("\n");
}

function buildSubject(attempt) {
  if (attempt === 1) return "Your Academy trial — £20 off to come back and pick up where you left off";
  if (attempt === 2) return "Still thinking it over? £20 off your Academy annual membership (7 days)";
  return "Final offer — £20 off your Academy annual membership (7 days only)";
}

function buildReengagementBody({ memberName, dashboardUrl, unsubUrl, daysLapsed }) {
  const greeting = memberName ? `Hi ${memberName.split(" ")[0]},` : "Hi there,";
  return `
${greeting}

It's been around ${daysLapsed} days since your **Alan Ranger Photography Academy** trial ended — and you didn't end up joining. That's completely fine; people pick up free trials all the time and life gets in the way.

But I wanted to reach out with one honest reason to give the Academy another look: **it has grown a lot since your trial**, and for the next **7 days only** I'd like to offer you **£${CAMPAIGN.discountGbp} off your first year** of annual membership with the code **${CAMPAIGN.couponCode}** — £${CAMPAIGN.annualPriceGbp} down to **£${CAMPAIGN.discountedPriceGbp}** for a full 12 months.

**What's included — and what's new since your trial:**

${renderFeatureList()}

**What Academy members have gone on to do**

I don't want to oversell this, but I think it's worth saying plainly: Academy members have gone on to **win photography competitions**, launch **paid photography work** as side hustles or small businesses, earn **professional qualifications and accreditations**, and — most commonly of all — simply enjoy their cameras far more, coming home with photos they're genuinely proud of rather than feeling lost in settings and menus.

Twelve months is usually long enough for a committed learner to make a real leap forward in their photography — and at £${CAMPAIGN.discountedPriceGbp} for the entire year, that's a little over £1 a week for everything listed above.

**Ready to come back?**

Just log into your Academy dashboard with your existing email and password — the upgrade option will be waiting with **${CAMPAIGN.couponCode} already applied**, no codes to type:

${dashboardUrl}

**This personal offer is open for 7 days from today.** After that, ${CAMPAIGN.couponCode} closes for your account and annual membership returns to the standard £${CAMPAIGN.annualPriceGbp}/year.

Any questions — technical, creative, or "is this right for me at all?" — just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy

---
If you'd prefer not to receive any more re-engagement emails from the Academy, you can unsubscribe in one click:
${unsubUrl}
  `.trim();
}

function htmlFromMarkdown(body) {
  return body
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function buildEmailContent({ member, daysLapsed, attempt, dashboardUrl, unsubUrl }) {
  const subject = buildSubject(attempt);
  const body = buildReengagementBody({
    memberName: member.name || null,
    dashboardUrl,
    unsubUrl,
    daysLapsed,
  });
  return { subject, body, html: htmlFromMarkdown(body) };
}

// ─────────────────────────────────────────────────────────────────────────
// Candidate selection
// ─────────────────────────────────────────────────────────────────────────

function buildCandidateWindow() {
  const now = Date.now();
  const DAY = 86400000;
  return {
    maxEnd: new Date(now - CAMPAIGN.minDaysSinceExpiry * DAY).toISOString(),
    minEnd: new Date(now - CAMPAIGN.reachBackDays * DAY).toISOString(),
    cooldownCutoff: new Date(now - CAMPAIGN.cooldownDays * DAY).toISOString(),
    now,
  };
}

async function fetchTrialRows(windowBounds, limit) {
  // Pull candidates from academy_trial_history. We apply the cooldown filter
  // and per-member max-sends cap in code so the SQL stays simple and indexable.
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select(
      "member_id, trial_end_at, converted_at, reengagement_send_count, reengagement_last_sent_at, reengagement_opted_out, reengagement_unsub_token"
    )
    .is("converted_at", null)
    .eq("reengagement_opted_out", false)
    .gte("trial_end_at", windowBounds.minEnd)
    .lte("trial_end_at", windowBounds.maxEnd)
    .order("trial_end_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

function passesResendGate(row, cooldownCutoff) {
  const count = row.reengagement_send_count || 0;
  if (count >= CAMPAIGN.maxSends) return false;
  const last = row.reengagement_last_sent_at;
  if (!last) return true;
  return new Date(last).getTime() <= new Date(cooldownCutoff).getTime();
}

async function fetchMemberContact(memberId) {
  const { data, error } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name")
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) {
    console.warn(`[lapsed-trial-reengagement] member lookup failed for ${memberId}:`, error.message);
    return null;
  }
  return data || null;
}

function daysBetween(fromIso, now) {
  const ms = now - new Date(fromIso).getTime();
  return Math.floor(ms / 86400000);
}

// ─────────────────────────────────────────────────────────────────────────
// Per-member send pipeline
// ─────────────────────────────────────────────────────────────────────────

function generateUnsubToken() {
  return crypto.randomBytes(24).toString("hex");
}

function buildUnsubUrl(token) {
  return `${API_BASE_URL}/api/academy/reengagement-unsubscribe?token=${encodeURIComponent(token)}`;
}

async function stampTrialRow(row, windowBounds, token) {
  const nowIso = new Date(windowBounds.now).toISOString();
  const expiresIso = new Date(windowBounds.now + CAMPAIGN.windowDays * 86400000).toISOString();
  const update = {
    reengagement_last_sent_at: nowIso,
    reengagement_expires_at: expiresIso,
    reengagement_send_count: (row.reengagement_send_count || 0) + 1,
  };
  if (!row.reengagement_sent_at) update.reengagement_sent_at = nowIso;
  if (!row.reengagement_unsub_token) update.reengagement_unsub_token = token;

  const { error } = await supabase
    .from("academy_trial_history")
    .update(update)
    .eq("member_id", row.member_id);
  if (error) {
    console.error(`[lapsed-trial-reengagement] failed to stamp row for ${row.member_id}:`, error.message);
  }
}

async function deliverEmail({ member, content }) {
  if (!emailTransporter) {
    return { sent: false, error: "Email not configured" };
  }
  try {
    const info = await emailTransporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
      to: member.email,
      bcc: "info@alanranger.com",
      subject: content.subject,
      text: content.body,
      html: content.html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[lapsed-trial-reengagement] send failed for ${member.email}:`, err.message);
    return { sent: false, error: err.message };
  }
}

async function processCandidate(row, windowBounds, sendEmail) {
  const contact = await fetchMemberContact(row.member_id);
  if (!contact?.email) {
    return { skipped: true, reason: "no email on file", member_id: row.member_id };
  }
  const token = row.reengagement_unsub_token || generateUnsubToken();
  const attempt = (row.reengagement_send_count || 0) + 1;
  const daysLapsed = daysBetween(row.trial_end_at, windowBounds.now);
  const content = buildEmailContent({
    member: contact,
    daysLapsed,
    attempt,
    dashboardUrl: DASHBOARD_URL,
    unsubUrl: buildUnsubUrl(token),
  });

  if (!sendEmail) {
    return {
      skipped: true,
      dry_run: true,
      member_id: row.member_id,
      email: contact.email,
      name: contact.name,
      attempt,
      days_lapsed: daysLapsed,
    };
  }

  const result = await deliverEmail({ member: contact, content });
  if (result.sent) await stampTrialRow(row, windowBounds, token);
  return {
    member_id: row.member_id,
    email: contact.email,
    name: contact.name,
    attempt,
    days_lapsed: daysLapsed,
    sent: result.sent,
    messageId: result.messageId || null,
    error: result.error || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Request handler
// ─────────────────────────────────────────────────────────────────────────

function shouldSendEmail(req) {
  const v = req.query?.sendEmail;
  if (v === undefined || v === null || String(v).trim() === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "false" || s === "0" || s === "no" || s === "off");
}

function parseLimit(req) {
  const raw = parseInt(req.query?.limit || "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return CAMPAIGN.defaultLimit;
  return Math.min(raw, CAMPAIGN.defaultLimit);
}

function authorize(req) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET;
  if (!secret) return { ok: true };
  const provided = req.query?.secret || req.headers["x-webhook-secret"];
  if (provided !== secret) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

async function runTestMode(req, res, sendEmail) {
  const testEmail = req.query.testEmail;
  const { data: cache, error: cacheErr } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name")
    .eq("email", testEmail)
    .maybeSingle();
  if (cacheErr || !cache?.member_id) {
    return res.status(400).json({ success: false, error: `Test email ${testEmail} not found in ms_members_cache` });
  }
  const { data: trial } = await supabase
    .from("academy_trial_history")
    .select("member_id, trial_end_at, converted_at, reengagement_send_count, reengagement_last_sent_at, reengagement_opted_out, reengagement_unsub_token")
    .eq("member_id", cache.member_id)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trial) {
    return res.status(400).json({ success: false, error: `No trial history row for ${testEmail}` });
  }
  const windowBounds = buildCandidateWindow();
  const result = await processCandidate(trial, windowBounds, sendEmail);
  return res.status(200).json({
    success: true,
    test_mode: true,
    send_email: sendEmail,
    result,
  });
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const auth = authorize(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const sendEmail = shouldSendEmail(req);
  if (req.query.testEmail) {
    return runTestMode(req, res, sendEmail);
  }

  const windowBounds = buildCandidateWindow();
  const limit = parseLimit(req);

  try {
    const rows = await fetchTrialRows(windowBounds, limit);
    const eligible = rows.filter((r) => passesResendGate(r, windowBounds.cooldownCutoff));
    const results = [];
    let sent = 0;
    let failed = 0;
    for (const row of eligible) {
      const outcome = await processCandidate(row, windowBounds, sendEmail);
      results.push(outcome);
      if (outcome.sent) sent++;
      else if (!outcome.skipped) failed++;
    }
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      send_email: sendEmail,
      window: {
        reach_back_days: CAMPAIGN.reachBackDays,
        min_days_since_expiry: CAMPAIGN.minDaysSinceExpiry,
        cooldown_days: CAMPAIGN.cooldownDays,
        max_sends_per_member: CAMPAIGN.maxSends,
      },
      candidates_found: rows.length,
      candidates_eligible: eligible.length,
      emails_sent: sent,
      emails_failed: failed,
      email_results: results,
    });
  } catch (err) {
    console.error("[lapsed-trial-reengagement] fatal:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
