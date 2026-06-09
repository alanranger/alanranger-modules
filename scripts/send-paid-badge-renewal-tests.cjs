/**
 * Send paid-badge-earned + paid-renewal-soon dummy tests to info@alanranger.com.
 * Usage: node scripts/send-paid-badge-renewal-tests.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const { logEmailEvent } = require("../lib/emailEvents");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");
const {
  PAID_BADGE_TEST_PROFILES,
  PAID_BADGE_TEST_PREFIX,
  PAID_RENEWAL_TEST_PROFILE,
  PAID_RENEWAL_TEST_PREFIX,
} = require("../lib/paid-badge-test-profiles");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_FROM = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
const TEST_TO = LIFECYCLE_BCC;

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

async function sendBadgeTest(supabase, transporter, profileKey) {
  const profile = PAID_BADGE_TEST_PROFILES[profileKey];
  const rendered = await renderStageEmail(supabase, "paid-badge-earned", profile);
  if (!rendered) throw new Error(`Render failed for paid-badge-earned/${profileKey}`);
  const subject = `${PAID_BADGE_TEST_PREFIX[profileKey]} ${rendered.subject}`;
  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
    to: TEST_TO,
    bcc: LIFECYCLE_BCC,
    subject,
    text: rendered.body,
    html: htmlFromMarkdown(rendered.body),
  });
  await logEmailEvent(supabase, {
    member_id: `dummy-test-paid-badge-${profileKey}`,
    email: TEST_TO,
    stage_key: "paid-badge-earned",
    status: "sent",
    messageId: info.messageId,
    subject,
    dryRun: false,
    eventDetail: profileKey,
  });
  const hasPointsNumber = /\b\d+\s+more points\b|\b\d+\s+points\b/i.test(rendered.body);
  return { stageKey: "paid-badge-earned", profileKey, subject, messageId: info.messageId, hasPointsNumber };
}

async function sendRenewalTest(supabase, transporter) {
  const rendered = await renderStageEmail(supabase, "paid-renewal-soon", PAID_RENEWAL_TEST_PROFILE);
  if (!rendered) throw new Error("Render failed for paid-renewal-soon");
  const subject = `${PAID_RENEWAL_TEST_PREFIX} ${rendered.subject}`;
  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
    to: TEST_TO,
    bcc: LIFECYCLE_BCC,
    subject,
    text: rendered.body,
    html: htmlFromMarkdown(rendered.body),
  });
  await logEmailEvent(supabase, {
    member_id: "dummy-test-paid-renewal",
    email: TEST_TO,
    stage_key: "paid-renewal-soon",
    status: "sent",
    messageId: info.messageId,
    subject,
    dryRun: false,
    eventDetail: "2026-06-23T00:00:00.000Z",
  });
  return { stageKey: "paid-renewal-soon", subject, messageId: info.messageId };
}

async function main() {
  if (!EMAIL_FROM || !EMAIL_PASSWORD) {
    console.error("SMTP not configured");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  const results = [];
  for (const key of ["practitioner", "certified", "graduate", "pointsOnly"]) {
    results.push(await sendBadgeTest(supabase, transporter, key));
  }
  results.push(await sendRenewalTest(supabase, transporter));
  console.log(JSON.stringify({ success: true, to: TEST_TO, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
