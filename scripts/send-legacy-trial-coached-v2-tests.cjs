/**
 * Sync day-minus-1 DB override + send coached v2 test emails.
 * Usage: node scripts/send-legacy-trial-coached-v2-tests.cjs
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { getDefault } = require("../lib/emailTemplateDefaults");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const { LIFECYCLE_BCC, DASHBOARD_URL } = require("../lib/lifecycleEmailConfig");

const envLocal = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env.local")));
const supabase = createClient(
  envLocal.NEXT_PUBLIC_SUPABASE_URL || envLocal.SUPABASE_URL,
  envLocal.SUPABASE_SERVICE_ROLE_KEY
);
const EMAIL_FROM = envLocal.ORPHANED_EMAIL_FROM || envLocal.EMAIL_FROM;
const EMAIL_PASSWORD = envLocal.ORPHANED_EMAIL_PASSWORD || envLocal.EMAIL_PASSWORD;
const TEST_TO = LIFECYCLE_BCC;

function htmlFromMarkdown(body) {
  return String(body || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

async function syncDayMinus1Override() {
  const def = getDefault("day-minus-1");
  const { error } = await supabase.from("academy_email_templates").upsert(
    {
      stage_key: "day-minus-1",
      label: def.label,
      subject: def.subject,
      body_md: def.body_md,
      updated_at: new Date().toISOString(),
      updated_by: "cursor-handoff",
    },
    { onConflict: "stage_key" }
  );
  if (error) throw error;
  const { data } = await supabase
    .from("academy_email_templates")
    .select("stage_key, subject")
    .eq("stage_key", "day-minus-1")
    .maybeSingle();
  return data;
}

const TESTS = [
  {
    stageKey: "day-minus-7",
    prefix: "[TEST – day-minus-7 v2]",
    vars: {
      firstName: "Alan",
      modulesOpened: 2,
      modulesToNextBadge: 2,
      examsToNextBadge: 1,
      badgeGapPhrase: "2 modules and 1 exam",
      nextBadge: "Foundation",
      nextModuleLabel: "#03 · What Is Shutter Speed In Photography (Camera Settings)",
      annualPriceGbp: "79",
      expiryDate: "Monday, 16 June 2026",
      upgradeUrl: "https://www.alanranger.com/academy/dashboard?token=example",
      dashboardUrl: DASHBOARD_URL,
    },
  },
  {
    stageKey: "day-minus-1",
    prefix: "[TEST – day-minus-1 v2]",
    vars: {
      firstName: "Alan",
      modulesOpened: 2,
      modulesToNextBadge: 2,
      examsToNextBadge: 1,
      badgeGapPhrase: "2 modules and 1 exam",
      nextBadge: "Foundation",
      nextModuleLabel: "#03 · What Is Shutter Speed In Photography (Camera Settings)",
      annualPriceGbp: "79",
      expiryDate: "Tuesday, 17 June 2026",
      upgradeUrl: "https://www.alanranger.com/academy/dashboard?token=example",
      dashboardUrl: DASHBOARD_URL,
    },
  },
  {
    stageKey: "day-plus-7",
    prefix: "[TEST – day-plus-7 v2]",
    vars: {
      firstName: "Alan",
      modulesOpened: 2,
      modulesToNextBadge: 2,
      examsToNextBadge: 1,
      badgeGapPhrase: "2 modules and 1 exam",
      nextBadge: "Foundation",
      couponCode: "SAVE20",
      daysLeft: 6,
      daysWord: "days",
      daysLeftPhrase: "**6 days**",
      save20DiscountGbp: "20",
      save20PriceGbp: "59",
      annualPriceGbp: "79",
      expiryDate: "Monday, 2 June 2026",
      upgradeUrl: "https://www.alanranger.com/academy/dashboard?token=example",
      dashboardUrl: DASHBOARD_URL,
    },
  },
];

async function main() {
  const override = await syncDayMinus1Override();
  const transporter = nodemailer.createTransport({
    host: envLocal.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(envLocal.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(envLocal.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });
  const results = [];
  for (const test of TESTS) {
    const rendered = await renderStageEmail(supabase, test.stageKey, test.vars);
    if (!rendered) throw new Error(`Render failed: ${test.stageKey}`);
    const subject = `${test.prefix} ${rendered.subject}`;
    const info = await transporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
      to: TEST_TO,
      subject,
      text: rendered.body,
      html: htmlFromMarkdown(rendered.body),
    });
    results.push({
      stageKey: test.stageKey,
      prefix: test.prefix,
      subject,
      messageId: info.messageId,
      is_overridden: rendered.is_overridden,
    });
  }
  console.log(JSON.stringify({ success: true, override, to: TEST_TO, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
