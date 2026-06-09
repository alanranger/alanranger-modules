/**
 * Shared REWIND20 merge vars for day-plus-20/30/60/90 win-back templates.
 */

const { buildMemberEmailSnapshot } = require("./member-email-snapshot");
const { getFoundationModuleMeta } = require("./foundation-module-meta");
const { FOUNDATION_MODULE_PATHS } = require("./academy-module-paths");
const {
  DASHBOARD_URL,
  WINDOW_DAYS,
  computeTokenExpiryMs,
  buildPersonalUpgradeUrl,
  buildUnsubUrl,
  formatCouponExpiryDate,
} = require("./reengage-link");

const REWIND_CAMPAIGN = Object.freeze({
  windowDays: WINDOW_DAYS,
  annualPriceGbp: 79,
  discountGbp: 20,
  discountedPriceGbp: 59,
  couponCode: "REWIND20",
});

function firstNameFromMember(member) {
  return (member?.name || "").split(/\s+/)[0] || "there";
}

async function buildWinbackMergeVars(supabase, opts) {
  const {
    memberId,
    member,
    sendAtMs = Date.now(),
    unsubUrl,
    daysLapsed = null,
  } = opts;
  const windowExpiresAtMs = computeTokenExpiryMs(sendAtMs, REWIND_CAMPAIGN.windowDays);
  const email = member?.email || "";
  const upgradeUrl = buildPersonalUpgradeUrl(
    memberId,
    email,
    windowExpiresAtMs,
    REWIND_CAMPAIGN.couponCode
  );
  const fallbackMeta = getFoundationModuleMeta(FOUNDATION_MODULE_PATHS[0]);
  let snapshot = null;
  if (supabase && memberId) {
    try {
      snapshot = await buildMemberEmailSnapshot(supabase, memberId, sendAtMs);
    } catch (err) {
      console.warn("[winback-email-vars] snapshot failed:", err.message);
    }
  }
  return {
    firstName: firstNameFromMember(member),
    fullName: member?.name || "there",
    upgradeUrl,
    dashboardUrl: DASHBOARD_URL,
    unsubUrl: unsubUrl || "",
    daysLapsed,
    annualPriceGbp: REWIND_CAMPAIGN.annualPriceGbp,
    save20PriceGbp: REWIND_CAMPAIGN.discountedPriceGbp,
    save20DiscountGbp: REWIND_CAMPAIGN.discountGbp,
    couponCode: REWIND_CAMPAIGN.couponCode,
    couponExpiryDate: formatCouponExpiryDate(sendAtMs, REWIND_CAMPAIGN.windowDays),
    modulesOpened: snapshot?.modulesOpened ?? 0,
    modulesToNextBadge: snapshot?.modulesToNextBadge ?? 0,
    examsToNextBadge: snapshot?.examsToNextBadge ?? 0,
    nextBadge: snapshot?.nextBadge || "Foundation",
    nextModuleLabel: snapshot?.nextModuleLabel || fallbackMeta.label,
    activityBlock: snapshot?.activityBlock || "",
  };
}

module.exports = {
  REWIND_CAMPAIGN,
  buildWinbackMergeVars,
};
