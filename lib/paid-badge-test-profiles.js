/**
 * Dummy render profiles for paid-badge-earned test sends.
 */

const { SUSTAINED_ACTIVITY_LINE } = require("./paid-lifecycle-email");
const { getFoundationModuleMeta } = require("./foundation-module-meta");

const SITE = "https://www.alanranger.com";

function moduleLabel(path) {
  return getFoundationModuleMeta(path).label;
}

const PAID_BADGE_TEST_PROFILES = Object.freeze({
  practitioner: Object.freeze({
    firstName: "Alan",
    newBadge: "Practitioner",
    nextBadge: "Certified",
    remainingActionsList: [
      "- Pass 7 more exams (8 of 15 done)",
      "- Open 12 more foundation modules (18 of 30 done)",
    ].join("\n"),
    sustainedActivityLine: "",
    nextModuleLabel: moduleLabel("/blog-on-photography/what-is-framing-in-photography"),
    dashboardUrl: `${SITE}/academy/dashboard`,
    moduleMapUrl: `${SITE}/academy/online-photography-course/`,
  }),
  certified: Object.freeze({
    firstName: "Alan",
    newBadge: "Certified",
    nextBadge: "Graduate",
    remainingActionsList: [
      "- Open 5 more applied learning modules (10 of 15 done)",
      "- Open 3 more practice packs (7 of 10 done)",
    ].join("\n"),
    sustainedActivityLine: SUSTAINED_ACTIVITY_LINE,
    nextModuleLabel: moduleLabel("/blog-on-photography/what-is-exposure-in-photography"),
    dashboardUrl: `${SITE}/academy/dashboard`,
    moduleMapUrl: `${SITE}/academy/online-photography-course/`,
  }),
  graduate: Object.freeze({
    firstName: "Alan",
    newBadge: "Graduate",
    nextBadge: "Master",
    remainingActionsList: [
      "- Open 4 more applied learning modules (18 of 22 done)",
      "- Open 2 more active months (5 of 7 done)",
    ].join("\n"),
    sustainedActivityLine: SUSTAINED_ACTIVITY_LINE,
    nextModuleLabel: moduleLabel("/blog-on-photography/what-is-aperture-in-photography"),
    dashboardUrl: `${SITE}/academy/dashboard`,
    moduleMapUrl: `${SITE}/academy/online-photography-course/`,
  }),
  pointsOnly: Object.freeze({
    firstName: "Alan",
    newBadge: "Certified",
    nextBadge: "Graduate",
    remainingActionsList: "",
    sustainedActivityLine: SUSTAINED_ACTIVITY_LINE,
    nextModuleLabel: moduleLabel("/blog-on-photography/what-is-shutter-speed"),
    dashboardUrl: `${SITE}/academy/dashboard`,
    moduleMapUrl: `${SITE}/academy/online-photography-course/`,
  }),
});

const PAID_BADGE_TEST_PREFIX = Object.freeze({
  practitioner: "[TEST – paid-badge-earned Practitioner]",
  certified: "[TEST – paid-badge-earned Certified]",
  graduate: "[TEST – paid-badge-earned Graduate]",
  pointsOnly: "[TEST – paid-badge-earned points-only]",
});

const PAID_RENEWAL_TEST_PROFILE = Object.freeze({
  firstName: "Alan",
  renewalDate: "Monday, 23 June 2026",
  daysUntilRenewal: 14,
  currentBadge: "Practitioner",
  renewalProgressLine: "Explored 22 modules and made real progress through the course",
  nextModuleLabel: moduleLabel("/blog-on-photography/what-is-framing-in-photography"),
  dashboardUrl: `${SITE}/academy/dashboard`,
});

const PAID_RENEWAL_TEST_PREFIX = "[TEST – paid-renewal-soon]";

module.exports = {
  PAID_BADGE_TEST_PROFILES,
  PAID_BADGE_TEST_PREFIX,
  PAID_RENEWAL_TEST_PROFILE,
  PAID_RENEWAL_TEST_PREFIX,
};
