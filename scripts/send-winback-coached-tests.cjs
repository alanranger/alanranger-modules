#!/usr/bin/env node
/**
 * Send coached win-back v2 test emails to info@alanranger.com
 * Usage: node scripts/send-winback-coached-tests.cjs
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const { STAGE_KEYS } = require("../lib/emailTemplateDefaults");
const { enrichRenderVars } = require("../lib/emailMergeVars");
const { getFoundationModuleMeta } = require("../lib/foundation-module-meta");
const { FOUNDATION_MODULE_PATHS } = require("../lib/academy-module-paths");
const { formatCouponExpiryDate } = require("../lib/reengage-link");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const ROOT = path.join(__dirname, "..");
const envPath = path.join(ROOT, ".env.local");
const env = dotenv.parse(fs.readFileSync(envPath));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY);

const TEST_TO = "info@alanranger.com";
const fallbackLabel = getFoundationModuleMeta(FOUNDATION_MODULE_PATHS[0]).label;
const sendAtMs = Date.now();
const couponExpiryDate = formatCouponExpiryDate(sendAtMs);

const CASES = [
  {
    stageKey: STAGE_KEYS.DAY_PLUS_20,
    prefix: "[TEST – day-plus-20 v2]",
    modulesOpened: 2,
    modulesToNextBadge: 6,
    examsToNextBadge: 0,
  },
  {
    stageKey: STAGE_KEYS.DAY_PLUS_30,
    prefix: "[TEST – day-plus-30 v2]",
    modulesOpened: 0,
    modulesToNextBadge: 8,
    examsToNextBadge: 0,
  },
  {
    stageKey: STAGE_KEYS.DAY_PLUS_60,
    prefix: "[TEST – day-plus-60 v2]",
    modulesOpened: 3,
    modulesToNextBadge: 5,
    examsToNextBadge: 0,
  },
  {
    stageKey: STAGE_KEYS.DAY_PLUS_90,
    prefix: "[TEST – day-plus-90 v2]",
    modulesOpened: 1,
    modulesToNextBadge: 7,
    examsToNextBadge: 0,
  },
];

function baseVars(modulesOpened, modulesToNextBadge, examsToNextBadge) {
  return enrichRenderVars({
    firstName: "Alan",
    fullName: "Alan Ranger",
    modulesOpened,
    modulesToNextBadge,
    examsToNextBadge,
    nextBadge: "Foundation",
    nextModuleLabel: fallbackLabel,
    couponCode: "REWIND20",
    save20DiscountGbp: 20,
    save20PriceGbp: 59,
    annualPriceGbp: 79,
    couponExpiryDate,
    upgradeUrl: "https://www.alanranger.com/academy/dashboard?ar_rewind=TEST-REWIND20",
    dashboardUrl: "https://www.alanranger.com/academy/dashboard",
    unsubUrl: "https://alanranger-modules.vercel.app/api/academy/reengagement-unsubscribe?token=test-unsub",
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
    const vars = baseVars(testCase.modulesOpened, testCase.modulesToNextBadge, testCase.examsToNextBadge);
    const rendered = await renderStageEmail(supabase, testCase.stageKey, vars);
    if (!rendered) throw new Error(`Render failed: ${testCase.stageKey}`);
    const subject = `${testCase.prefix} ${rendered.subject}`;
    const info = await transporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${from}>`,
      to: TEST_TO,
      bcc: LIFECYCLE_BCC,
      subject,
      text: rendered.body,
    });
    results.push({
      stage: testCase.stageKey,
      subject,
      messageId: info.messageId,
      badgeGapPhrase: vars.badgeGapPhrase,
      modulesOpened: testCase.modulesOpened,
    });
  }

  console.log(JSON.stringify({ ok: true, couponExpiryDate, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
