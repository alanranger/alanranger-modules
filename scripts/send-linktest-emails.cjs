#!/usr/bin/env node
/**
 * Send LINKTEST confirmation emails after link-rendering fix.
 * Usage: node scripts/send-linktest-emails.cjs
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const { STAGE_KEYS } = require("../lib/emailTemplateDefaults");
const { enrichRenderVars } = require("../lib/emailMergeVars");
const { htmlFromMarkdown, plainTextFromMarkdown, extractLinksFromHtml } = require("../lib/emailHtml");
const { getFoundationModuleMeta } = require("../lib/foundation-module-meta");
const { FOUNDATION_MODULE_PATHS } = require("../lib/academy-module-paths");
const { formatCouponExpiryDate } = require("../lib/reengage-link");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const ROOT = path.join(__dirname, "..");
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, ".env.local")));
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_TO = "info@alanranger.com";
const fallbackLabel = getFoundationModuleMeta(FOUNDATION_MODULE_PATHS[0]).label;

const CASES = [
  { stageKey: STAGE_KEYS.TRIAL_WELCOME_NUDGE, prefix: "[LINKTEST – trial-welcome-nudge]" },
  { stageKey: STAGE_KEYS.DAY_MINUS_7, prefix: "[LINKTEST – day-minus-7]" },
  { stageKey: STAGE_KEYS.DAY_PLUS_60, prefix: "[LINKTEST – day-plus-60]" },
  { stageKey: STAGE_KEYS.PAID_QUIET, prefix: "[LINKTEST – paid-quiet]" },
];

function sampleVars() {
  return enrichRenderVars({
    firstName: "Alan",
    fullName: "Alan Ranger",
    modulesOpened: 2,
    modulesToNextBadge: 6,
    examsToNextBadge: 0,
    nextBadge: "Foundation",
    nextModuleLabel: fallbackLabel,
    currentBadge: "Enrolled",
    couponCode: "REWIND20",
    save20DiscountGbp: 20,
    save20PriceGbp: 59,
    annualPriceGbp: 79,
    couponExpiryDate: formatCouponExpiryDate(Date.now()),
    expiryDate: "Monday, 16 June 2026",
    daysLeft: 7,
    daysWord: "days",
    daysLeftPhrase: "**7 days**",
    upgradeUrl: "https://www.alanranger.com/academy/dashboard?ar_rewind=LINKTEST-TOKEN",
    dashboardUrl: "https://www.alanranger.com/academy/dashboard",
    moduleMapUrl: "https://www.alanranger.com/academy/online-photography-course/",
    unsubUrl: "https://alanranger-modules.vercel.app/api/academy/reengagement-unsubscribe?token=linktest",
  });
}

async function main() {
  const transporter = nodemailer.createTransport({
    host: env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(env.EMAIL_SMTP_PORT || "587", 10),
    secure: (env.EMAIL_SMTP_PORT || "587") === "465",
    auth: { user: env.ORPHANED_EMAIL_FROM || env.EMAIL_FROM, pass: env.ORPHANED_EMAIL_PASSWORD || env.EMAIL_PASSWORD },
  });
  const from = env.ORPHANED_EMAIL_FROM || env.EMAIL_FROM;
  const results = [];

  for (const testCase of CASES) {
    const rendered = await renderStageEmail(supabase, testCase.stageKey, sampleVars());
    const html = htmlFromMarkdown(rendered.body);
    const plain = plainTextFromMarkdown(rendered.body);
    const links = extractLinksFromHtml(html);
    const subject = `${testCase.prefix} ${rendered.subject}`;
    const info = await transporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${from}>`,
      to: TEST_TO,
      bcc: LIFECYCLE_BCC,
      subject,
      text: plain,
      html,
    });
    results.push({
      stage: testCase.stageKey,
      subject,
      messageId: info.messageId,
      hrefs: links.map((l) => l.href),
      plainUpgradeLine: plain.split("\n").find((l) => l.includes("ar_rewind=LINKTEST")) || null,
    });
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
