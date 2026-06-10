/**
 * Real-member Day-2 preview: render from live snapshot, deliver copies to info@ only.
 * Usage: node scripts/run-day2-real-member-preview.cjs [welcomeEmail] [progressEmail]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return {};
  return dotenv.parse(fs.readFileSync(envPath));
}

const envLocal = loadEnvLocal();

const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { buildMemberEmailSnapshot } = require("../lib/member-email-snapshot");
const { evaluateStageTrigger } = require("../lib/emailStageTriggers");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const { LIFECYCLE_BCC, realPreviewSubjectPrefix } = require("../lib/lifecycleEmailConfig");

const SUPABASE_URL =
  envLocal.SUPABASE_URL ||
  envLocal.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const SUPABASE_SERVICE_ROLE_KEY =
  envLocal.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_FROM =
  envLocal.ORPHANED_EMAIL_FROM ||
  envLocal.EMAIL_FROM ||
  process.env.ORPHANED_EMAIL_FROM ||
  process.env.EMAIL_FROM;
const EMAIL_PASSWORD =
  envLocal.ORPHANED_EMAIL_PASSWORD ||
  envLocal.EMAIL_PASSWORD ||
  process.env.ORPHANED_EMAIL_PASSWORD ||
  process.env.EMAIL_PASSWORD;

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

async function findMemberId(supabase, email) {
  const { data } = await supabase
    .from("ms_members_cache")
    .select("member_id")
    .eq("email", email)
    .maybeSingle();
  return data?.member_id || null;
}

async function previewStage(supabase, transporter, stageKey, memberEmail) {
  const memberId = await findMemberId(supabase, memberEmail);
  if (!memberId) throw new Error(`No member for ${memberEmail}`);
  const snapshot = await buildMemberEmailSnapshot(supabase, memberId);
  if (!snapshot) throw new Error(`Snapshot failed for ${memberEmail}`);
  const rendered = await renderStageEmail(supabase, stageKey, {
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
  });
  if (!rendered) throw new Error(`Render failed for ${stageKey}`);
  const subject = `${realPreviewSubjectPrefix(stageKey)} ${rendered.subject}`;
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: LIFECYCLE_BCC,
    subject,
    text: rendered.body,
    html: htmlFromMarkdown(rendered.body),
  });
  return {
    stageKey,
    memberEmail,
    triggerMatched: evaluateStageTrigger(snapshot, stageKey),
    snapshot: {
      modulesOpened: snapshot.modulesOpened,
      trialDayNumber: snapshot.trialDayNumber,
      daysSinceLastLogin: snapshot.daysSinceLastLogin,
      currentBadge: snapshot.currentBadgeLabel,
    },
    preview: { subject: rendered.subject, body: rendered.body },
    previewMessageId: info.messageId,
    previewDeliveredTo: LIFECYCLE_BCC,
  };
}

async function main() {
  if (!EMAIL_FROM || !EMAIL_PASSWORD) {
    console.error("SMTP not configured");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const welcomeEmail = process.argv[2];
  const progressEmail = process.argv[3];
  if (!welcomeEmail || !progressEmail) {
    console.error("Usage: node scripts/run-day2-real-member-preview.cjs <welcomeEmail> <progressEmail>");
    process.exit(1);
  }
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  const results = [];
  results.push(await previewStage(supabase, transporter, "trial-welcome-nudge", welcomeEmail));
  results.push(await previewStage(supabase, transporter, "trial-progress-nudge", progressEmail));
  console.log(JSON.stringify({ success: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
