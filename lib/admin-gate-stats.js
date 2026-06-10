/**
 * Admin badge gate stats from Memberstack JSON (mirrors do-next strip computeGateStats).
 */
const {
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  PDF_ASSIGNMENT_PATHS,
  FOUNDATION_MODULE_PATHS,
  countOpenedInList,
  normalizePath,
} = require("./academy-module-paths");
const {
  getCurrentStage,
  evaluateBadges,
  FOUNDATION_GATE,
  PRACTITIONER_GATE,
  CERTIFIED_GATE,
  GRADUATE_GATE,
  MASTER_GATE,
  POINTS_WEIGHTS,
  KEEPALIVE_DECAY_DAYS,
  computeLongevityPoints,
  isFoundationGateEarned,
  isPractitionerGateEarned,
  isCertifiedGateEarned,
  isGraduateGateEarned,
  isMasterGateEarned,
  isSummitBadgePaused,
} = require("./academy-badge-gates");

function parseMemberJson(raw) {
  if (!raw) return {};
  const json = raw.json || raw.data?.json || raw;
  if (typeof json === "string") {
    try {
      return JSON.parse(json);
    } catch (e) {
      return {};
    }
  }
  return json || {};
}

function buildOpenedSet(raw) {
  const parsed = parseMemberJson(raw);
  const opened = parsed?.arAcademy?.modules?.opened || {};
  const set = new Set();
  Object.keys(opened).forEach((key) => {
    const p = normalizePath(key);
    if (FOUNDATION_MODULE_PATHS.includes(p)) set.add(p);
  });
  return set;
}

function computeGateStatsFromRaw(raw, examsPassed) {
  const openedSet = buildOpenedSet(raw);
  return {
    foundationModulesOpened: openedSet.size,
    cameraOpened: countOpenedInList(openedSet, CAMERA_MODULE_PATHS),
    compositionOpened: countOpenedInList(openedSet, COMPOSITION_MODULE_PATHS),
    pdfAssignmentsOpened: countOpenedInList(openedSet, PDF_ASSIGNMENT_PATHS),
    totalModulesOpened: openedSet.size,
    examsPassed: examsPassed || 0,
  };
}

function mergeEngagementIntoStats(stats, engagement) {
  if (!engagement) return { ...stats };
  const merged = { ...stats };
  if (typeof engagement.appliedLearningOpened === "number") {
    merged.appliedLearningOpened = engagement.appliedLearningOpened;
  }
  if (typeof engagement.practicePacksOpened === "number") {
    merged.practicePacksOpened = engagement.practicePacksOpened;
  }
  if (typeof engagement.distinctActiveMonthsAllTime === "number") {
    merged.distinctActiveMonthsAllTime = engagement.distinctActiveMonthsAllTime;
  }
  if (typeof engagement.pdfAssignmentsOpened === "number") {
    merged.pdfAssignmentsOpened = Math.max(
      stats.pdfAssignmentsOpened,
      engagement.pdfAssignmentsOpened
    );
  }
  return merged;
}

function evaluateTableBadge(raw, examsPassed, hasConverted, lastSeen) {
  const stats = computeGateStatsFromRaw(raw, examsPassed);
  const gateContext = {
    hasConverted: !!hasConverted,
    lastActivityAt: lastSeen || null,
    nowMs: Date.now(),
  };
  const result = evaluateBadges(stats, 0, true, gateContext);
  const stage = getCurrentStage(result.badges);
  return {
    badge_key: stage.key,
    badge_label: stage.label,
    badge_paused: stage.paused,
    badge_is_master: stage.key === "master",
    badge_stars: stage.stars,
    badge_source: "json_exams_degraded",
  };
}

function buildGateBreakdown(stats, activeDays, engagementDegraded, gateContext) {
  const ctx = gateContext || {};
  const nowMs = typeof ctx.nowMs === "number" ? ctx.nowMs : Date.now();
  const hasConverted = ctx.hasConverted === true;
  const graduateEarned = isGraduateGateEarned(stats, hasConverted, engagementDegraded);
  const longevityPoints = computeLongevityPoints(stats);

  const foundationMet = isFoundationGateEarned(
    stats.foundationModulesOpened,
    activeDays,
    engagementDegraded
  );
  const practitionerMet = isPractitionerGateEarned(stats);
  const certifiedMet = isCertifiedGateEarned(stats);
  const graduateMet = isGraduateGateEarned(stats, hasConverted, engagementDegraded);
  const masterMet = isMasterGateEarned(stats, hasConverted, graduateEarned, engagementDegraded);

  return {
    foundation: {
      met: foundationMet,
      modulesOpened: stats.foundationModulesOpened,
      modulesTarget: FOUNDATION_GATE.minModules,
      activeDaysFirst14: activeDays,
      activeDaysTarget: FOUNDATION_GATE.minActiveDays,
      activeDaysDegraded: engagementDegraded,
    },
    practitioner: {
      met: practitionerMet,
      cameraOpened: stats.cameraOpened,
      cameraTarget: CAMERA_MODULE_PATHS.length,
      compositionOpened: stats.compositionOpened,
      compositionTarget: COMPOSITION_MODULE_PATHS.length,
      pdfAssignmentsOpened: stats.pdfAssignmentsOpened,
      pdfAssignmentsTarget: PRACTITIONER_GATE.minPdfAssignments,
      examsPassed: stats.examsPassed,
      examsPassedTarget: PRACTITIONER_GATE.minExamsPassed,
    },
    certified: {
      met: certifiedMet,
      examsPassed: stats.examsPassed,
      examsPassedTarget: 15,
      totalModulesOpened: stats.totalModulesOpened,
      totalModulesTarget: CERTIFIED_GATE.minModulesOpened,
    },
    graduate: {
      met: graduateMet,
      appliedLearningOpened: stats.appliedLearningOpened,
      practicePacksOpened: stats.practicePacksOpened,
      pdfAssignmentsOpened: stats.pdfAssignmentsOpened,
      distinctActiveMonthsAllTime: stats.distinctActiveMonthsAllTime,
      points: longevityPoints,
      pointsTarget: GRADUATE_GATE.minPoints,
      paused: isSummitBadgePaused(graduateMet, "graduate", ctx.lastActivityAt, nowMs),
      decayDays: KEEPALIVE_DECAY_DAYS,
      lastActivityAt: ctx.lastActivityAt || null,
      requiresConversion: !hasConverted,
    },
    master: {
      met: masterMet,
      appliedLearningOpened: stats.appliedLearningOpened,
      practicePacksOpened: stats.practicePacksOpened,
      pdfAssignmentsOpened: stats.pdfAssignmentsOpened,
      distinctActiveMonthsAllTime: stats.distinctActiveMonthsAllTime,
      points: longevityPoints,
      pointsTarget: MASTER_GATE.minPoints,
      paused: isSummitBadgePaused(masterMet, "master", ctx.lastActivityAt, nowMs),
      decayDays: KEEPALIVE_DECAY_DAYS,
      lastActivityAt: ctx.lastActivityAt || null,
      requiresGraduate: !graduateEarned,
    },
    pointsWeights: POINTS_WEIGHTS,
  };
}

function evaluateFullBadge(stats, activeDays, engagementDegraded, gateContext) {
  const result = evaluateBadges(stats, activeDays, engagementDegraded, gateContext);
  const stage = getCurrentStage(result.badges);
  const breakdown = buildGateBreakdown(stats, activeDays, engagementDegraded, gateContext);
  return {
    badge_key: stage.key,
    badge_label: stage.label,
    badge_paused: stage.paused,
    badge_is_master: stage.key === "master",
    badge_stars: stage.stars,
    badges: result.badges,
    breakdown,
    longevityPoints: result.longevityPoints,
    longevityDegraded: result.longevityDegraded,
  };
}

const BADGE_SORT_RANK = {
  enrolled: 0,
  foundation: 1,
  practitioner: 2,
  certified: 3,
  graduate: 4,
  master: 5,
};

function attachTableBadgeFields(target, raw, examsPassed, hasConverted, lastSeen) {
  const badge = evaluateTableBadge(raw, examsPassed, hasConverted, lastSeen);
  Object.assign(target, badge);
  return target;
}

function compareBadgeSortRank(aKey, bKey) {
  return (BADGE_SORT_RANK[aKey] ?? 0) - (BADGE_SORT_RANK[bKey] ?? 0);
}

module.exports = {
  parseMemberJson,
  buildOpenedSet,
  computeGateStatsFromRaw,
  mergeEngagementIntoStats,
  evaluateTableBadge,
  attachTableBadgeFields,
  buildGateBreakdown,
  evaluateFullBadge,
  BADGE_SORT_RANK,
  compareBadgeSortRank,
};
