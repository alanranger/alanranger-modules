/**
 * Longevity breadth + active-month helpers for engagement-summary.
 */
const {
  PRACTICE_PACK_URLS,
  PDF_ASSIGNMENT_PATHS,
  normalizePath,
  countOpenedInList,
} = require("./academy-module-paths");

const APPLIED_LEARNING_TOTAL = 40;

function countAppliedLearningOpened(arAcademy) {
  const opened = arAcademy?.appliedLearning?.opened;
  if (!opened || typeof opened !== "object") return 0;
  return Math.min(Object.keys(opened).filter(Boolean).length, APPLIED_LEARNING_TOTAL);
}

function buildModulesOpenedSet(arAcademy) {
  const opened = arAcademy?.modules?.opened || {};
  const set = new Set();
  Object.keys(opened).forEach((key) => {
    const p = normalizePath(key);
    if (p) set.add(p);
  });
  return set;
}

function countBreadthFromMemberJson(rawJson) {
  const arAcademy = rawJson?.arAcademy || {};
  const openedSet = buildModulesOpenedSet(arAcademy);
  return {
    appliedLearningOpened: countAppliedLearningOpened(arAcademy),
    practicePacksOpened: countOpenedInList(openedSet, PRACTICE_PACK_URLS),
    pdfAssignmentsOpened: countOpenedInList(openedSet, PDF_ASSIGNMENT_PATHS),
  };
}

function monthKeyFromIso(iso) {
  if (!iso || typeof iso !== "string" || iso.length < 7) return null;
  return iso.slice(0, 7);
}

function countDistinctActiveMonths(events) {
  const months = new Set();
  (events || []).forEach((row) => {
    const key = monthKeyFromIso(row.created_at);
    if (key) months.add(key);
  });
  return months.size;
}

module.exports = {
  APPLIED_LEARNING_TOTAL,
  countAppliedLearningOpened,
  buildModulesOpenedSet,
  countBreadthFromMemberJson,
  countDistinctActiveMonths,
};
