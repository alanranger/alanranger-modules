#!/usr/bin/env node
/**
 * Audit rendered HTML hrefs for all lifecycle email stages.
 * Usage: node scripts/audit-lifecycle-email-links.cjs
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const { renderStageEmail } = require("../lib/emailTemplateRenderer");
const { EMAIL_STAGES } = require("../lib/emailStages");
const { htmlFromMarkdown, plainTextFromMarkdown, extractLinksFromHtml } = require("../lib/emailHtml");
const { enrichRenderVars } = require("../lib/emailMergeVars");
const { getFoundationModuleMeta } = require("../lib/foundation-module-meta");
const { FOUNDATION_MODULE_PATHS } = require("../lib/academy-module-paths");
const { formatCouponExpiryDate } = require("../lib/reengage-link");

const ROOT = path.join(__dirname, "..");
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, ".env.local")));
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const fallbackLabel = getFoundationModuleMeta(FOUNDATION_MODULE_PATHS[0]).label;
const sampleVars = enrichRenderVars({
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
  upgradeUrl: "https://www.alanranger.com/academy/dashboard?ar_rewind=SAMPLE-TOKEN",
  dashboardUrl: "https://www.alanranger.com/academy/dashboard",
  moduleMapUrl: "https://www.alanranger.com/academy/online-photography-course/",
  unsubUrl: "https://alanranger-modules.vercel.app/api/academy/reengagement-unsubscribe?token=sample",
});

const STAGES = EMAIL_STAGES.map((s) => s.key).filter((k) => !k.startsWith("paid-badge") && !k.startsWith("paid-milestone") && !k.startsWith("paid-renewal"));

async function auditStage(stageKey) {
  const rendered = await renderStageEmail(supabase, stageKey, sampleVars);
  if (!rendered) return { stageKey, error: "no template" };
  const html = htmlFromMarkdown(rendered.body);
  const plain = plainTextFromMarkdown(rendered.body);
  const links = extractLinksFromHtml(html);
  const plainHasTrailingParen = /\)\s*$/.test(
    (plain.match(/https?:\/\/[^\s]+/g) || []).pop() || ""
  );
  return {
    stageKey,
    linkCount: links.length,
    links: links.map((l) => ({ text: l.text.slice(0, 40), href: l.href })),
    plainHasTrailingParenOnLastUrl: plainHasTrailingParen,
    ok: links.length > 0 && links.every((l) => !l.href.endsWith(")")),
  };
}

async function main() {
  const results = [];
  for (const stageKey of STAGES) {
    results.push(await auditStage(stageKey));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
