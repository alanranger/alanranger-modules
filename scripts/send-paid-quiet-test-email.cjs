/**
 * Send one paid-quiet dummy test email to info@alanranger.com (Claude BUILD).
 * Usage: node scripts/send-paid-quiet-test-email.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const {
  PAID_QUIET_DUMMY_PROFILE,
  DAY2_TEST_SUBJECT_PREFIX,
} = require("../lib/day2EmailTestProfiles");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return {};
  return dotenv.parse(fs.readFileSync(envPath));
}

const envLocal = loadEnvLocal();
const SUPABASE_URL =
  envLocal.SUPABASE_URL ||
  envLocal.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
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
const TEST_TO = LIFECYCLE_BCC;

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

async function main() {
  if (!EMAIL_FROM || !EMAIL_PASSWORD) {
    console.error("SMTP not configured");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const rendered = await renderStageEmail(supabase, "paid-quiet", PAID_QUIET_DUMMY_PROFILE);
  if (!rendered) throw new Error("Template render failed");
  const subject = `${DAY2_TEST_SUBJECT_PREFIX.paidQuiet} ${rendered.subject}`;
  const transporter = nodemailer.createTransport({
    host: envLocal.EMAIL_SMTP_HOST || process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(envLocal.EMAIL_SMTP_PORT || process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(envLocal.EMAIL_SMTP_PORT || process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: TEST_TO,
    subject,
    text: rendered.body,
    html: htmlFromMarkdown(rendered.body),
  });
  console.log(
    JSON.stringify(
      {
        success: true,
        stageKey: "paid-quiet",
        to: TEST_TO,
        subject,
        messageId: info.messageId,
        preview: { subject: rendered.subject, body: rendered.body },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
