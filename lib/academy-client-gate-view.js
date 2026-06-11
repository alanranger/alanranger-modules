/**
 * Shared client badge stats pipeline (strip + foundation module map).
 * SYNC: scripts/sync-client-gate-view-to-snippets.mjs → strip + foundation snippets.
 */
const {
  FOUNDATION_MODULE_PATHS,
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  PDF_ASSIGNMENT_PATHS,
  PRACTICE_PACK_URLS,
  normalizePath,
  countOpenedInList,
} = require("./academy-module-paths");
const { getModuleIds } = require("./academy-exam-modules");
const { FOUNDATION_REQUIRED_MODULE_PATH, computeJourneyBadges, computeNextBadgeProgress } = require("./academy-badge-gates");
const { APPLIED_LEARNING_TOTAL } = require("./academy-longevity-stats");

const EXAM_MODULE_IDS = getModuleIds("foundation");
const COMPOSITION_EXAM_MODULE_IDS = getModuleIds("composition_creative");
const FOUNDATION_EXAMS_TOTAL = EXAM_MODULE_IDS.length;

function parseExamProgress(progressData) {
  const statusMap = {};
  let source = "none";
  let examsPassed = 0;
  let compositionExamsPassed = 0;
  let nextExamModuleId = null;
  let hasData = false;

  EXAM_MODULE_IDS.forEach((id) => {
    statusMap[id] = "not_taken";
  });
  COMPOSITION_EXAM_MODULE_IDS.forEach((id) => {
    statusMap[id] = "not_taken";
  });

  function applyTrackModules(modules, allowedIds) {
    if (!modules || !modules.length) return;
    modules.forEach((m) => {
      if (!m || !m.moduleId) return;
      if (allowedIds.indexOf(m.moduleId) === -1) return;
      statusMap[m.moduleId] = m.status || "not_taken";
    });
  }

  if (progressData && progressData.tracks) {
    hasData = true;
    const fTrack = progressData.tracks.foundation;
    const cTrack = progressData.tracks.composition_creative;
    if (fTrack && fTrack.modules) applyTrackModules(fTrack.modules, EXAM_MODULE_IDS);
    if (cTrack && cTrack.modules) applyTrackModules(cTrack.modules, COMPOSITION_EXAM_MODULE_IDS);
    examsPassed = EXAM_MODULE_IDS.filter((id) => statusMap[id] === "passed").length;
    compositionExamsPassed = COMPOSITION_EXAM_MODULE_IDS.filter((id) => statusMap[id] === "passed").length;
    source = "tracks-modules";
  } else if (progressData && Array.isArray(progressData.modules) && progressData.modules.length) {
    hasData = true;
    applyTrackModules(progressData.modules, EXAM_MODULE_IDS.concat(COMPOSITION_EXAM_MODULE_IDS));
    examsPassed = EXAM_MODULE_IDS.filter((id) => statusMap[id] === "passed").length;
    compositionExamsPassed = COMPOSITION_EXAM_MODULE_IDS.filter((id) => statusMap[id] === "passed").length;
    source = "modules-count";
  } else if (progressData && progressData.summary && typeof progressData.summary.passedCount === "number") {
    hasData = true;
    examsPassed = Math.min(FOUNDATION_EXAMS_TOTAL, Math.max(0, progressData.summary.passedCount));
    source = "summary.passedCount";
  }

  if (source === "modules-count" || source === "tracks-modules") {
    for (let i = 0; i < EXAM_MODULE_IDS.length; i += 1) {
      if (statusMap[EXAM_MODULE_IDS[i]] !== "passed") {
        nextExamModuleId = EXAM_MODULE_IDS[i];
        break;
      }
    }
  }

  return {
    statusMap,
    examsPassed,
    compositionExamsPassed,
    nextExamModuleId,
    source,
    hasData,
    hasModuleStatus: source === "modules-count" || source === "tracks-modules",
  };
}

function getFoundationOpenedSet(normalized) {
  const opened = (normalized && normalized.arAcademy && normalized.arAcademy.modules && normalized.arAcademy.modules.opened) || {};
  const set = new Set();
  Object.keys(opened).forEach((key) => {
    const p = normalizePath(key);
    if (FOUNDATION_MODULE_PATHS.indexOf(p) !== -1) set.add(p);
  });
  return set;
}

function getAllModulesOpenedCount(normalized) {
  return getFoundationOpenedSet(normalized).size;
}

function countAppliedLearningOpenedFromJson(normalized) {
  const opened = (normalized && normalized.arAcademy && normalized.arAcademy.appliedLearning && normalized.arAcademy.appliedLearning.opened) || {};
  return Math.min(Object.keys(opened).filter(Boolean).length, APPLIED_LEARNING_TOTAL);
}

function mergeLongevityIntoStats(stats, normalized, foundationOpenedSet, engagement) {
  const merged = {
    foundationModulesOpened: stats.foundationModulesOpened,
    cameraOpened: stats.cameraOpened,
    compositionOpened: stats.compositionOpened,
    pdfAssignmentsOpened: stats.pdfAssignmentsOpened,
    totalModulesOpened: stats.totalModulesOpened,
    examsPassed: stats.examsPassed,
    compositionExamsPassed: stats.compositionExamsPassed || 0,
    module01Opened: stats.module01Opened === true,
    appliedLearningOpened: null,
    practicePacksOpened: null,
    distinctActiveMonthsAllTime: null,
  };

  if (engagement && typeof engagement.appliedLearningOpened === "number") {
    merged.appliedLearningOpened = engagement.appliedLearningOpened;
    merged.practicePacksOpened = engagement.practicePacksOpened;
    merged.distinctActiveMonthsAllTime = engagement.distinctActiveMonthsAllTime;
    if (typeof engagement.pdfAssignmentsOpened === "number") {
      merged.pdfAssignmentsOpened = Math.max(stats.pdfAssignmentsOpened, engagement.pdfAssignmentsOpened);
    }
  } else {
    merged.appliedLearningOpened = countAppliedLearningOpenedFromJson(normalized);
    merged.practicePacksOpened = countOpenedInList(foundationOpenedSet, PRACTICE_PACK_URLS);
  }

  return merged;
}

function buildGateContext(engagement) {
  return {
    hasConverted: !!(engagement && engagement.hasConverted === true),
    lastActivityAt: engagement ? engagement.lastActivityAt : null,
    nowMs: Date.now(),
  };
}

/** Canonical first-14-day active-day count (same source as gate evaluation). */
function resolveGateActiveDays(engagement, fallback) {
  if (engagement && engagement.distinctActiveDaysFirst14d != null) {
    const n = Number(engagement.distinctActiveDaysFirst14d);
    if (!Number.isNaN(n)) return n;
  }
  if (fallback != null) {
    const fb = Number(fallback);
    if (!Number.isNaN(fb)) return fb;
  }
  return 0;
}

function computeGateStats(normalized, foundationOpenedSet, examInfo, preview) {
  const exposurePath = normalizePath(FOUNDATION_REQUIRED_MODULE_PATH);
  return {
    foundationModulesOpened: foundationOpenedSet.size,
    cameraOpened: countOpenedInList(foundationOpenedSet, CAMERA_MODULE_PATHS),
    compositionOpened: countOpenedInList(foundationOpenedSet, COMPOSITION_MODULE_PATHS),
    pdfAssignmentsOpened: countOpenedInList(foundationOpenedSet, PDF_ASSIGNMENT_PATHS),
    totalModulesOpened: preview ? preview.modulesOpened : getAllModulesOpenedCount(normalized),
    examsPassed: examInfo.examsPassed || 0,
    compositionExamsPassed: examInfo.compositionExamsPassed || 0,
    module01Opened: exposurePath ? foundationOpenedSet.has(exposurePath) : false,
  };
}

function buildAcademyBadgeView(normalized, engagement, examProgressData, options) {
  const opts = options || {};
  const foundationOpenedSet = opts.foundationOpenedSet || getFoundationOpenedSet(normalized);
  const examInfo = opts.examInfo || parseExamProgress(examProgressData);
  const gateStats = computeGateStats(normalized, foundationOpenedSet, examInfo, opts.preview || null);
  const activeDays = resolveGateActiveDays(engagement, 0);
  const engagementDegraded = !engagement;
  const gateStatsWithLongevity = mergeLongevityIntoStats(gateStats, normalized, foundationOpenedSet, engagement);
  const gateContext = buildGateContext(engagement);
  const badges = computeJourneyBadges(gateStatsWithLongevity, activeDays, engagementDegraded, gateContext);
  const modulesTotal = opts.modulesTotal != null ? opts.modulesTotal : 60;
  const openedCount = gateStats.totalModulesOpened;
  const progress = computeNextBadgeProgress(
    badges,
    gateStatsWithLongevity,
    activeDays,
    engagementDegraded,
    openedCount,
    modulesTotal
  );

  return {
    badges,
    stats: gateStatsWithLongevity,
    gateStats,
    examInfo,
    foundationOpenedSet,
    activeDays,
    engagementDegraded,
    openedCount,
    modulesTotal,
    progress,
    gateContext,
    hasConverted: !!(gateContext && gateContext.hasConverted),
  };
}

module.exports = {
  EXAM_MODULE_IDS,
  COMPOSITION_EXAM_MODULE_IDS,
  parseExamProgress,
  getFoundationOpenedSet,
  getAllModulesOpenedCount,
  countAppliedLearningOpenedFromJson,
  mergeLongevityIntoStats,
  buildGateContext,
  resolveGateActiveDays,
  computeGateStats,
  buildAcademyBadgeView,
};
