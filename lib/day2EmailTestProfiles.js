/**
 * Dummy render profiles for Day-2 test sends (Claude-signed BUILD spec).
 */

const SITE = "https://www.alanranger.com";

const DAY2_DUMMY_PROFILES = Object.freeze({
  welcome: Object.freeze({
    firstName: "Alan",
    modulesOpened: 0,
    currentBadge: "Enrolled",
    nextBadge: "Foundation",
    nextModuleTitle: "Exposure",
    nextModuleUrl: `${SITE}/blog-on-photography/what-is-exposure-in-photography`,
    trialDayNumber: 2,
  }),
  progress: Object.freeze({
    firstName: "Alan",
    modulesOpened: 2,
    modulesToNextBadge: 1,
    currentBadge: "Enrolled",
    nextBadge: "Foundation",
    nextModuleTitle: "Shutter Speed",
    nextModuleUrl: `${SITE}/blog-on-photography/what-is-shutter-speed`,
    daysSinceLastLogin: 1,
    trialDayNumber: 2,
  }),
});

const DAY2_TEST_SUBJECT_PREFIX = Object.freeze({
  welcome: "[TEST – welcome-nudge]",
  progress: "[TEST – progress-nudge]",
});

module.exports = {
  DAY2_DUMMY_PROFILES,
  DAY2_TEST_SUBJECT_PREFIX,
};
