/**
 * Send Day-2 dummy test emails to info@alanranger.com (BUILD handoff).
 * Usage: node scripts/send-day2-test-emails.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const {
  DAY2_DUMMY_PROFILES,
  DAY2_TEST_SUBJECT_PREFIX,
} = require("../lib/day2EmailTestProfiles");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_FROM = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
const TEST_TO = "info@alanranger.com";

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

async function sendOne(supabase, stageKey, profileKey) {
  const rendered = await renderStageEmail(supabase, stageKey, DAY2_DUMMY_PROFILES[profileKey]);
  if (!rendered) throw new Error(`No template for ${stageKey}`);
  const subject = `${DAY2_TEST_SUBJECT_PREFIX[profileKey]} ${rendered.subject}`;
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: TEST_TO,
    subject,
    text: rendered.body,
    html: htmlFromMarkdown(rendered.body),
  });
  return { stageKey, profileKey, subject, messageId: info.messageId };
}

async function main() {
  if (!EMAIL_FROM || !EMAIL_PASSWORD) {
    console.error("SMTP not configured");
    process.exit(1);
  }
  const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;
  const results = [];
  results.push(await sendOne(supabase, "trial-welcome-nudge", "welcome"));
  results.push(await sendOne(supabase, "trial-progress-nudge", "progress"));
  console.log(JSON.stringify({ success: true, to: TEST_TO, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
