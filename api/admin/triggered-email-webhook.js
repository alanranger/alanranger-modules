// api/admin/triggered-email-webhook.js
//
// State-triggered email dispatcher. Cron runs daily (London 09:00 gate) but
// only sends when buildMemberEmailSnapshot() + trigger rules match.
//
// Query params:
//   stageKey   — single stage (required unless stage=all)
//   stage=all  — evaluate all cronEnabled trigger stages (none live yet)
//   sendEmail  — false for dry-run preview JSON
//   testEmail  — single-member preview/send (bypasses London gate + cronEnabled)
//   secret     — ORPHANED_WEBHOOK_SECRET for manual calls

const { createClient } = require("@supabase/supabase-js");
const nodemailer = require("nodemailer");
const { EMAIL_STAGES, getStageByKey } = require("../../lib/emailStages");
const { buildMemberEmailSnapshot } = require("../../lib/member-email-snapshot");
const {
  evaluateStageTrigger,
  listEligibleMembers,
  memberAlreadySent,
} = require("../../lib/emailStageTriggers");
const { logEmailEvent } = require("../../lib/emailEvents");
const { renderStageEmail } = require("../../lib/emailTemplateRenderer");
const { londonHour } = require("../../lib/london-trial-days");
const {
  DAY2_DUMMY_PROFILES,
  DAY2_TEST_SUBJECT_PREFIX,
} = require("../../lib/day2EmailTestProfiles");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const EMAIL_FROM = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
const EMAIL_SMTP_HOST = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
const EMAIL_SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || "587", 10);

function parseBool(v, defaultVal) {
  if (v === undefined || v === null || v === "") return defaultVal;
  const s = String(v).toLowerCase();
  if (["false", "0", "no", "off"].includes(s)) return false;
  if (["true", "1", "yes", "on"].includes(s)) return true;
  return defaultVal;
}

function isAuthorized(req) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return true;
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (bearer && bearer === secret) return true;
  if (req.query.secret === secret) return true;
  return false;
}

function shouldSendNow(req, testEmail) {
  if (testEmail) return true;
  if (!parseBool(req.query.sendEmail, true)) return false;
  const isCron = req.headers["x-vercel-cron"] === "1";
  if (!isCron && !parseBool(req.query.sendEmail, false)) return false;
  return londonHour(Date.now()) === 9;
}

function snapshotToVars(snapshot) {
  return {
    firstName: snapshot.firstName,
    fullName: snapshot.fullName,
    currentBadge: snapshot.currentBadgeLabel,
    modulesOpened: snapshot.modulesOpened,
    modulesToNextBadge: snapshot.modulesToNextBadge,
    examsToNextBadge: snapshot.examsToNextBadge,
    percentToNextBadge: snapshot.percentToNextBadge,
    nextBadge: snapshot.nextBadge,
    nextModuleTitle: snapshot.nextModuleTitle,
    nextModuleUrl: snapshot.nextModuleUrl,
    trialDayNumber: snapshot.trialDayNumber,
    trialDaysRemaining: snapshot.trialDaysRemaining,
    daysSinceLastLogin: snapshot.daysSinceLastLogin,
    upgradeUrl: snapshot.upgradeUrl,
    activityBlock: snapshot.activityBlock,
    dashboardUrl: snapshot.upgradeUrl,
  };
}

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

async function sendMail(to, subject, body) {
  if (!EMAIL_FROM || !EMAIL_PASSWORD) {
    throw new Error("Email SMTP not configured");
  }
  const transporter = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    secure: EMAIL_SMTP_PORT === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  return transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text: body,
    html: htmlFromMarkdown(body),
  });
}

async function processMemberStage(stageKey, memberId, snapshot, sendEmail, dryRun) {
  const rendered = await renderStageEmail(supabase, stageKey, snapshotToVars(snapshot));
  if (!rendered) {
    return { memberId, status: "skipped", reason: "no template" };
  }
  if (!sendEmail) {
    return {
      memberId,
      status: "preview",
      preview: { subject: rendered.subject, body: rendered.body, html: htmlFromMarkdown(rendered.body) },
    };
  }
  const info = await sendMail(snapshot.email, rendered.subject, rendered.body);
  await logEmailEvent(supabase, {
    member_id: memberId,
    email: snapshot.email,
    stage_key: stageKey,
    status: "sent",
    messageId: info.messageId,
    subject: rendered.subject,
    dryRun,
  });
  return { memberId, status: "sent", messageId: info.messageId };
}

async function handleDummyTest(stageKey, testEmail, sendEmail, profileKey) {
  const profile = DAY2_DUMMY_PROFILES[profileKey];
  if (!profile) {
    return { success: false, error: `Unknown dummyTest profile: ${profileKey}` };
  }
  const rendered = await renderStageEmail(supabase, stageKey, profile);
  if (!rendered) return { success: false, error: "Template render failed" };
  const prefix = DAY2_TEST_SUBJECT_PREFIX[profileKey] || "[TEST]";
  const subject = `${prefix} ${rendered.subject}`;
  if (!sendEmail) {
    return {
      success: true,
      stageKey,
      testEmail,
      dummyTest: profileKey,
      preview: { subject, body: rendered.body, html: htmlFromMarkdown(rendered.body) },
    };
  }
  const info = await sendMail(testEmail, subject, rendered.body);
  await logEmailEvent(supabase, {
    member_id: "dummy-test",
    email: testEmail,
    stage_key: stageKey,
    status: "sent",
    messageId: info.messageId,
    subject,
    dryRun: false,
  });
  return {
    success: true,
    stageKey,
    testEmail,
    dummyTest: profileKey,
    messageId: info.messageId,
    subject,
  };
}

async function handleTestEmail(stageKey, testEmail, sendEmail) {
  const { data } = await supabase
    .from("ms_members_cache")
    .select("member_id")
    .eq("email", testEmail)
    .maybeSingle();
  if (!data?.member_id) {
    return { success: false, error: `No member found for testEmail=${testEmail}` };
  }
  const snapshot = await buildMemberEmailSnapshot(supabase, data.member_id);
  if (!snapshot) return { success: false, error: "Snapshot build failed" };
  const matches = evaluateStageTrigger(snapshot, stageKey);
  const result = await processMemberStage(stageKey, data.member_id, snapshot, sendEmail, !sendEmail);
  return {
    success: true,
    stageKey,
    testEmail,
    triggerMatched: matches,
    result,
    snapshot: {
      modulesOpened: snapshot.modulesOpened,
      trialDayNumber: snapshot.trialDayNumber,
      daysSinceLastLogin: snapshot.daysSinceLastLogin,
      currentBadge: snapshot.currentBadgeLabel,
    },
  };
}

async function runStageBulk(stageKey, sendEmail) {
  const stage = getStageByKey(stageKey);
  if (!stage) return { stageKey, error: "unknown stage" };
  if (!stage.cronEnabled && sendEmail) {
    return { stageKey, skipped: true, reason: "cronEnabled=false" };
  }
  const contactable = new Set();
  const { data: rows } = await supabase
    .from("ms_members_cache")
    .select("member_id")
    .not("email", "is", null);
  (rows || []).forEach((r) => contactable.add(r.member_id));

  const eligible = await listEligibleMembers(supabase, stageKey, contactable);
  const outcomes = [];
  for (const row of eligible) {
    try {
      outcomes.push(await processMemberStage(stageKey, row.memberId, row.snapshot, sendEmail, !sendEmail));
    } catch (err) {
      outcomes.push({ memberId: row.memberId, status: "failed", error: err.message });
      await logEmailEvent(supabase, {
        member_id: row.memberId,
        email: row.snapshot.email,
        stage_key: stageKey,
        status: "failed",
        error: err.message,
        dryRun: !sendEmail,
      });
    }
  }
  return { stageKey, eligible: eligible.length, outcomes };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stageKey = req.query.stageKey || req.query.stage;
  const testEmail = req.query.testEmail || null;
  const dummyTest = req.query.dummyTest || null;
  const sendEmail = parseBool(req.query.sendEmail, false);

  try {
    if (testEmail && dummyTest && stageKey && stageKey !== "all") {
      const payload = await handleDummyTest(stageKey, testEmail, sendEmail, dummyTest);
      return res.status(payload.success ? 200 : 400).json(payload);
    }

    if (testEmail && stageKey && stageKey !== "all") {
      const payload = await handleTestEmail(stageKey, testEmail, sendEmail);
      return res.status(payload.success ? 200 : 400).json(payload);
    }

    if (!shouldSendNow(req, testEmail) && sendEmail) {
      return res.status(200).json({ success: true, skipped: true, reason: "outside London 09:00 gate" });
    }

    const keys =
      stageKey === "all"
        ? EMAIL_STAGES.filter((s) => s.sentBy === "triggered-email-webhook").map((s) => s.key)
        : [stageKey];

    const results = [];
    for (const key of keys) {
      if (!key || !getStageByKey(key)) continue;
      results.push(await runStageBulk(key, sendEmail));
    }
    return res.status(200).json({ success: true, sendEmail, results });
  } catch (err) {
    console.error("[triggered-email-webhook]", err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
};
