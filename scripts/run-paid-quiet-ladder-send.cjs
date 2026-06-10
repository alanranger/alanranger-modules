/**
 * One-shot production send for all eligible paid-quiet ladder members.
 * Usage: node scripts/run-paid-quiet-ladder-send.cjs
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { listEligibleMembers } = require("../lib/emailStageTriggers");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const { logEmailEvent } = require("../lib/emailEvents");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const envLocal = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env.local")));
const SUPABASE_URL = envLocal.SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = envLocal.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_FROM = envLocal.ORPHANED_EMAIL_FROM || envLocal.EMAIL_FROM || "";
const EMAIL_PASSWORD = envLocal.ORPHANED_EMAIL_PASSWORD || envLocal.EMAIL_PASSWORD || "";

const STAGES = ["paid-quiet", "paid-quiet-45", "paid-quiet-60", "paid-quiet-90"];

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
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
    dashboardUrl: snapshot.upgradeUrl,
  };
}

async function main() {
  if (!EMAIL_FROM || !EMAIL_PASSWORD || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SMTP or Supabase config");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const transporter = nodemailer.createTransport({
    host: envLocal.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(envLocal.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(envLocal.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  const { data: rows } = await supabase
    .from("ms_members_cache")
    .select("member_id")
    .not("email", "is", null);
  const contactable = new Set((rows || []).map((r) => r.member_id));
  const summary = [];

  for (const stageKey of STAGES) {
    const eligible = await listEligibleMembers(supabase, stageKey, contactable);
    const outcomes = [];
    for (const row of eligible) {
      const rendered = await renderStageEmail(
        supabase,
        stageKey,
        snapshotToVars(row.snapshot)
      );
      if (!rendered) {
        outcomes.push({ memberId: row.memberId, status: "skipped", reason: "no template" });
        continue;
      }
      const info = await transporter.sendMail({
        from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
        to: row.snapshot.email,
        bcc: LIFECYCLE_BCC,
        subject: rendered.subject,
        text: rendered.body,
        html: htmlFromMarkdown(rendered.body),
      });
      await logEmailEvent(supabase, {
        member_id: row.memberId,
        email: row.snapshot.email,
        stage_key: stageKey,
        status: "sent",
        messageId: info.messageId,
        subject: rendered.subject,
        dryRun: false,
      });
      outcomes.push({
        memberId: row.memberId,
        email: row.snapshot.email,
        status: "sent",
        messageId: info.messageId,
        daysSinceLastLogin: row.snapshot.daysSinceLastLogin,
      });
    }
    summary.push({ stageKey, eligible: eligible.length, outcomes });
  }
  console.log(JSON.stringify({ success: true, bcc: LIFECYCLE_BCC, summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
