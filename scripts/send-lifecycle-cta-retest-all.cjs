/**
 * Re-send all 7 lifecycle email tests with gated CTA block (Claude BUILD).
 * Usage: node scripts/send-lifecycle-cta-retest-all.cjs
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
  DAY2_DUMMY_PROFILES,
  DAY2_TEST_SUBJECT_PREFIX,
  TRIAL_STALLED_DUMMY_PROFILE,
  PAID_QUIET_LADDER_TESTS,
} = require("../lib/day2EmailTestProfiles");
const { LIFECYCLE_BCC, DASHBOARD_URL, MODULE_MAP_URL } = require("../lib/lifecycleEmailConfig");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return {};
  return dotenv.parse(fs.readFileSync(envPath));
}

const envLocal = loadEnvLocal();
const SUPABASE_URL = envLocal.SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = envLocal.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_FROM = envLocal.ORPHANED_EMAIL_FROM || envLocal.EMAIL_FROM || "";
const EMAIL_PASSWORD = envLocal.ORPHANED_EMAIL_PASSWORD || envLocal.EMAIL_PASSWORD || "";
const TEST_TO = LIFECYCLE_BCC;

const TESTS = [
  { stageKey: "trial-welcome-nudge", prefix: DAY2_TEST_SUBJECT_PREFIX.welcome, profile: DAY2_DUMMY_PROFILES.welcome },
  { stageKey: "trial-progress-nudge", prefix: DAY2_TEST_SUBJECT_PREFIX.progress, profile: DAY2_DUMMY_PROFILES.progress },
  { stageKey: "trial-stalled", prefix: DAY2_TEST_SUBJECT_PREFIX.stalled, profile: TRIAL_STALLED_DUMMY_PROFILE },
  ...PAID_QUIET_LADDER_TESTS.map((t) => ({ stageKey: t.stageKey, prefix: t.prefix, profile: t.profile })),
];

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function auditBody(body) {
  const lessonLink = /blog-on-photography/i.test(body);
  const hasDashboard = body.includes(DASHBOARD_URL);
  const hasModuleMap = body.includes(MODULE_MAP_URL);
  return { lessonLink, hasDashboard, hasModuleMap };
}

async function sendOne(supabase, transporter, { stageKey, prefix, profile }) {
  const rendered = await renderStageEmail(supabase, stageKey, profile);
  if (!rendered) throw new Error(`Render failed for ${stageKey}`);
  const subject = `${prefix} ${rendered.subject}`;
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: TEST_TO,
    subject,
    text: rendered.body,
    html: htmlFromMarkdown(rendered.body),
  });
  return { stageKey, subject, messageId: info.messageId, audit: auditBody(rendered.body) };
}

async function main() {
  if (!EMAIL_FROM || !EMAIL_PASSWORD) {
    console.error("SMTP not configured");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const transporter = nodemailer.createTransport({
    host: envLocal.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(envLocal.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(envLocal.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  const results = [];
  for (const test of TESTS) results.push(await sendOne(supabase, transporter, test));
  console.log(JSON.stringify({ success: true, to: TEST_TO, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
