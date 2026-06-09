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
//   memberEmail — real-member dry-run; never sends to member; delivers preview to LIFECYCLE_BCC
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
const { LIFECYCLE_BCC, realPreviewSubjectPrefix } = require("../../lib/lifecycleEmailConfig");
const { buildWinbackMergeVars } = require("../../lib/winback-email-vars");
const {
  generateUnsubToken,
  buildUnsubUrl,
  DASHBOARD_URL,
} = require("../../lib/reengage-link");
const { markWinbackExhausted } = require("../../lib/winback-exhaustion");
const { STAGE_KEYS } = require("../../lib/emailTemplateDefaults");

const WINBACK_TRIGGER_STAGES = new Set([STAGE_KEYS.DAY_PLUS_90]);

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
    nextModuleRef: snapshot.nextModuleRef,
    nextModuleSection: snapshot.nextModuleSection,
    nextModuleLabel: snapshot.nextModuleLabel,
    trialDayNumber: snapshot.trialDayNumber,
    trialDaysRemaining: snapshot.trialDaysRemaining,
    daysSinceLastLogin: snapshot.daysSinceLastLogin,
    upgradeUrl: snapshot.upgradeUrl,
    activityBlock: snapshot.activityBlock,
    dashboardUrl: DASHBOARD_URL,
  };
}

async function resolveRenderVars(stageKey, memberId, snapshot) {
  if (!WINBACK_TRIGGER_STAGES.has(stageKey)) return snapshotToVars(snapshot);
  const { data: trial } = await supabase
    .from("academy_trial_history")
    .select("reengagement_unsub_token, trial_end_at")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = trial?.reengagement_unsub_token || generateUnsubToken();
  const sendAtMs = Date.now();
  const daysLapsed = trial?.trial_end_at
    ? Math.floor((sendAtMs - new Date(trial.trial_end_at).getTime()) / 86400000)
    : null;
  return buildWinbackMergeVars(supabase, {
    memberId,
    member: { name: snapshot.fullName, email: snapshot.email },
    sendAtMs,
    unsubUrl: buildUnsubUrl(token),
    daysLapsed,
  });
}

async function afterWinbackTriggerSend(stageKey, memberId, unsubToken, sendAtMs) {
  if (stageKey !== STAGE_KEYS.DAY_PLUS_90) return;
  const nowIso = new Date(sendAtMs).toISOString();
  const expiresIso = new Date(sendAtMs + 7 * 86400000).toISOString();
  await supabase
    .from("academy_trial_history")
    .update({
      reengagement_last_sent_at: nowIso,
      reengagement_expires_at: expiresIso,
      reengagement_unsub_token: unsubToken,
    })
    .eq("member_id", memberId);
  await markWinbackExhausted(supabase, memberId);
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
    from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
    to,
    bcc: LIFECYCLE_BCC,
    subject,
    text: body,
    html: htmlFromMarkdown(body),
  });
}

async function processMemberStage(stageKey, memberId, snapshot, sendEmail, dryRun) {
  const vars = await resolveRenderVars(stageKey, memberId, snapshot);
  const rendered = await renderStageEmail(supabase, stageKey, vars);
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
  if (WINBACK_TRIGGER_STAGES.has(stageKey)) {
    const tokenMatch = String(vars.unsubUrl || "").match(/token=([^&]+)/);
    const unsubToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : generateUnsubToken();
    await afterWinbackTriggerSend(stageKey, memberId, unsubToken, Date.now());
  }
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

async function handleRealMemberPreview(stageKey, memberEmail) {
  const { data } = await supabase
    .from("ms_members_cache")
    .select("member_id")
    .eq("email", memberEmail)
    .maybeSingle();
  if (!data?.member_id) {
    return { success: false, error: `No member found for memberEmail=${memberEmail}` };
  }
  const snapshot = await buildMemberEmailSnapshot(supabase, data.member_id);
  if (!snapshot) return { success: false, error: "Snapshot build failed" };
  const vars = await resolveRenderVars(stageKey, data.member_id, snapshot);
  const rendered = await renderStageEmail(supabase, stageKey, vars);
  if (!rendered) return { success: false, error: "Template render failed" };
  const previewSubject = `${realPreviewSubjectPrefix(stageKey)} ${rendered.subject}`;
  const info = await sendMail(LIFECYCLE_BCC, previewSubject, rendered.body);
  return {
    success: true,
    stageKey,
    memberEmail,
    sendEmail: false,
    triggerMatched: evaluateStageTrigger(snapshot, stageKey),
    snapshot: {
      modulesOpened: snapshot.modulesOpened,
      trialDayNumber: snapshot.trialDayNumber,
      daysSinceLastLogin: snapshot.daysSinceLastLogin,
      currentBadge: snapshot.currentBadgeLabel,
    },
    preview: { subject: rendered.subject, body: rendered.body, html: htmlFromMarkdown(rendered.body) },
    previewDeliveredTo: LIFECYCLE_BCC,
    previewMessageId: info.messageId,
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
  const memberEmail = req.query.memberEmail || null;
  const dummyTest = req.query.dummyTest || null;
  const sendEmail = parseBool(req.query.sendEmail, false);

  try {
    if (memberEmail && stageKey && stageKey !== "all" && !sendEmail) {
      const payload = await handleRealMemberPreview(stageKey, memberEmail);
      return res.status(payload.success ? 200 : 400).json(payload);
    }

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
