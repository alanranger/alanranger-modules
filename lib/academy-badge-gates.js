/**
 * Pure badge gate evaluation (single source of truth).
 * SYNC: academy-do-next-strip-squarespace-snippet-v1.html (BEGIN/END BADGE-GATES-SYNC)
 * Run: node scripts/sync-badge-gates-to-strip.mjs after edits.
 */
const {
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
} = require("./academy-module-paths");

const FOUNDATION_GATE = {
  minModules: 3,
  minActiveDays: 3,
  bonusModules: 6,
  bonusActiveDays: 5,
};

const PRACTITIONER_GATE = {
  requireAllCamera: true,
  requireAllComposition: true,
  minPdfAssignments: 3,
  minExamsPassed: 8,
};

const CERTIFIED_GATE = {
  requireAllExamsPassed: true,
  minModulesOpened: 30,
};

const POINTS_WEIGHTS = {
  appliedLearning: 2,
  practicePack: 2,
  pdfAssignment: 4,
  activeMonth: 7,
};

const GRADUATE_GATE = { minPoints: 98 };
const MASTER_GATE = { minPoints: 163 };

const GRADUATE_TARGETS = {
  appliedLearning: 15,
  practicePacks: 10,
  pdfAssignments: 5,
  activeMonths: 4,
};

const MASTER_TARGETS = {
  appliedLearning: 22,
  practicePacks: 17,
  pdfAssignments: 9,
  activeMonths: 7,
};

const KEEPALIVE_DECAY_DAYS = 60;
const DAY_MS = 86_400_000;

const JOURNEY_STAGES = [
  { key: "enrolled", label: "Enrolled", alwaysEarned: true },
  { key: "foundation", label: "Foundation", foundationGate: true },
  { key: "practitioner", label: "Practitioner", practitionerGate: true },
  { key: "certified", label: "Certified", certifiedGate: true },
  { key: "graduate", label: "Graduate", graduateGate: true },
  { key: "master", label: "Master", masterGate: true },
];

function safeNum(value, fallback) {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function normaliseStats(raw) {
  const stats = raw || {};
  return {
    foundationModulesOpened: safeNum(stats.foundationModulesOpened, 0),
    cameraOpened: safeNum(stats.cameraOpened, 0),
    compositionOpened: safeNum(stats.compositionOpened, 0),
    pdfAssignmentsOpened: safeNum(stats.pdfAssignmentsOpened, 0),
    totalModulesOpened: safeNum(stats.totalModulesOpened, 0),
    examsPassed: safeNum(stats.examsPassed, 0),
    appliedLearningOpened: stats.appliedLearningOpened == null ? null : safeNum(stats.appliedLearningOpened, 0),
    practicePacksOpened: stats.practicePacksOpened == null ? null : safeNum(stats.practicePacksOpened, 0),
    distinctActiveMonthsAllTime:
      stats.distinctActiveMonthsAllTime == null ? null : safeNum(stats.distinctActiveMonthsAllTime, 0),
  };
}

function isFoundationGateEarned(modulesOpened, activeDays, engagementDegraded) {
  if (modulesOpened < FOUNDATION_GATE.minModules) return false;
  if (engagementDegraded) return true;
  return safeNum(activeDays, 0) >= FOUNDATION_GATE.minActiveDays;
}

function isPractitionerGateEarned(stats) {
  if (PRACTITIONER_GATE.requireAllCamera && stats.cameraOpened < CAMERA_MODULE_PATHS.length) {
    return false;
  }
  if (
    PRACTITIONER_GATE.requireAllComposition &&
    stats.compositionOpened < COMPOSITION_MODULE_PATHS.length
  ) {
    return false;
  }
  if (stats.pdfAssignmentsOpened < PRACTITIONER_GATE.minPdfAssignments) return false;
  if (stats.examsPassed < PRACTITIONER_GATE.minExamsPassed) return false;
  return true;
}

function isCertifiedGateEarned(stats) {
  if (CERTIFIED_GATE.requireAllExamsPassed && stats.examsPassed < 15) return false;
  if (stats.totalModulesOpened < CERTIFIED_GATE.minModulesOpened) return false;
  return true;
}

function isLongevityDegraded(stats) {
  const safe = normaliseStats(stats);
  return (
    safe.appliedLearningOpened == null ||
    safe.practicePacksOpened == null ||
    safe.distinctActiveMonthsAllTime == null
  );
}

function computeLongevityPoints(stats) {
  const safe = normaliseStats(stats);
  return (
    safe.appliedLearningOpened * POINTS_WEIGHTS.appliedLearning +
    safe.practicePacksOpened * POINTS_WEIGHTS.practicePack +
    safe.pdfAssignmentsOpened * POINTS_WEIGHTS.pdfAssignment +
    safe.distinctActiveMonthsAllTime * POINTS_WEIGHTS.activeMonth
  );
}

function warnLongevityDegraded() {
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[badge-gates] engagementDegraded: Graduate/Master blocked (longevity fields missing)");
  }
}

function isGraduateGateEarned(stats, hasConverted, engagementDegraded) {
  if (!hasConverted) return false;
  if (engagementDegraded || isLongevityDegraded(stats)) {
    warnLongevityDegraded();
    return false;
  }
  return computeLongevityPoints(stats) >= GRADUATE_GATE.minPoints;
}

function isMasterGateEarned(stats, hasConverted, graduateEarned, engagementDegraded) {
  if (!graduateEarned || !hasConverted) return false;
  if (engagementDegraded || isLongevityDegraded(stats)) {
    warnLongevityDegraded();
    return false;
  }
  return computeLongevityPoints(stats) >= MASTER_GATE.minPoints;
}

function daysSinceActivity(lastActivityAt, nowMs) {
  if (!lastActivityAt) return Infinity;
  const t = new Date(lastActivityAt).getTime();
  if (Number.isNaN(t)) return Infinity;
  const DAY_MS_LOCAL = 86400000;
  return Math.floor((nowMs - t) / DAY_MS_LOCAL);
}

function isSummitBadgePaused(earned, badgeKey, lastActivityAt, nowMs) {
  if (!earned || (badgeKey !== "graduate" && badgeKey !== "master")) return false;
  return daysSinceActivity(lastActivityAt, nowMs) >= KEEPALIVE_DECAY_DAYS;
}

function isStageConditionsMet(stage, stats, activeDays, engagementDegraded, gateContext) {
  const ctx = gateContext || {};
  const hasConverted = ctx.hasConverted === true;
  const graduateEarned = ctx.graduateEarned === true;

  if (stage.alwaysEarned) return true;
  if (stage.foundationGate) {
    return isFoundationGateEarned(stats.foundationModulesOpened, activeDays, engagementDegraded);
  }
  if (stage.practitionerGate) return isPractitionerGateEarned(stats);
  if (stage.certifiedGate) return isCertifiedGateEarned(stats);
  if (stage.graduateGate) return isGraduateGateEarned(stats, hasConverted, engagementDegraded);
  if (stage.masterGate) return isMasterGateEarned(stats, hasConverted, graduateEarned, engagementDegraded);
  if (stage.minExams) return stats.examsPassed >= stage.minExams;
  return false;
}

function computeJourneyBadges(stats, activeDays, engagementDegraded, gateContext) {
  const safeStats = normaliseStats(stats);
  const safeDays = safeNum(activeDays, 0);
  const degraded = engagementDegraded === true;
  const ctx = gateContext || {};
  const nowMs = typeof ctx.nowMs === "number" ? ctx.nowMs : Date.now();
  let canEarnHigher = true;
  let graduateEarned = false;

  return JOURNEY_STAGES.map((stage) => {
    let earned = false;
    const stageCtx = Object.assign({}, ctx, { graduateEarned });
    if (canEarnHigher) {
      earned = isStageConditionsMet(stage, safeStats, safeDays, degraded, stageCtx);
      if (!earned) canEarnHigher = false;
    }
    if (stage.key === "graduate" && earned) graduateEarned = true;
    const paused = isSummitBadgePaused(earned, stage.key, ctx.lastActivityAt, nowMs);
    return {
      key: stage.key,
      label: stage.label,
      earned,
      paused: paused === true,
    };
  });
}

function getHighestConsecutiveEarned(badges) {
  let current = badges[0];
  for (let i = 0; i < badges.length; i += 1) {
    if (badges[i].earned) current = badges[i];
    else break;
  }
  return current;
}

function getCurrentStage(badges) {
  const current = getHighestConsecutiveEarned(badges);
  return {
    key: current.key,
    label: current.label,
    levelIndex: JOURNEY_STAGES.findIndex((s) => s.key === current.key) + 1,
    levelTotal: JOURNEY_STAGES.length,
  };
}

function getNextUnearnedBadge(badges) {
  for (let i = 0; i < badges.length; i += 1) {
    if (!badges[i].earned) return badges[i];
  }
  return null;
}

function practitionerRequirementsMet(stats) {
  const safeStats = normaliseStats(stats);
  const total = 4;
  let met = 0;
  if (!PRACTITIONER_GATE.requireAllCamera || safeStats.cameraOpened >= CAMERA_MODULE_PATHS.length) {
    met += 1;
  }
  if (
    !PRACTITIONER_GATE.requireAllComposition ||
    safeStats.compositionOpened >= COMPOSITION_MODULE_PATHS.length
  ) {
    met += 1;
  }
  if (safeStats.pdfAssignmentsOpened >= PRACTITIONER_GATE.minPdfAssignments) met += 1;
  if (safeStats.examsPassed >= PRACTITIONER_GATE.minExamsPassed) met += 1;
  return { met, total };
}

function graduateRequirementsMet(stats) {
  const safe = normaliseStats(stats);
  const targets = GRADUATE_TARGETS;
  const rows = [
    { key: "appliedLearning", current: safe.appliedLearningOpened, target: targets.appliedLearning },
    { key: "practicePacks", current: safe.practicePacksOpened, target: targets.practicePacks },
    { key: "pdfAssignments", current: safe.pdfAssignmentsOpened, target: targets.pdfAssignments },
    { key: "activeMonths", current: safe.distinctActiveMonthsAllTime, target: targets.activeMonths },
  ];
  let met = 0;
  rows.forEach((row) => {
    if (row.current != null && row.current >= row.target) met += 1;
  });
  return { met, total: rows.length, rows, targets };
}

function masterRequirementsMet(stats) {
  const safe = normaliseStats(stats);
  const targets = MASTER_TARGETS;
  const rows = [
    { key: "appliedLearning", current: safe.appliedLearningOpened, target: targets.appliedLearning },
    { key: "practicePacks", current: safe.practicePacksOpened, target: targets.practicePacks },
    { key: "pdfAssignments", current: safe.pdfAssignmentsOpened, target: targets.pdfAssignments },
    { key: "activeMonths", current: safe.distinctActiveMonthsAllTime, target: targets.activeMonths },
  ];
  let met = 0;
  rows.forEach((row) => {
    if (row.current != null && row.current >= row.target) met += 1;
  });
  return { met, total: rows.length, rows, targets };
}

function evaluateBadges(stats, activeDays, engagementDegraded, gateContext) {
  const badges = computeJourneyBadges(stats, activeDays, engagementDegraded, gateContext);
  const earned = {};
  const paused = {};
  badges.forEach((badge) => {
    earned[badge.key] = badge.earned;
    paused[badge.key] = badge.paused === true;
  });
  const highestConsecutive = getHighestConsecutiveEarned(badges);
  const target = getNextUnearnedBadge(badges);
  const longevityDegraded = isLongevityDegraded(stats);
  return {
    earned,
    paused,
    badges,
    highestConsecutive: highestConsecutive.key,
    target: target ? target.key : null,
    earnedCount: badges.filter((b) => b.earned).length,
    earnedTotal: badges.length,
    practitionerProximity: practitionerRequirementsMet(stats),
    longevityDegraded,
    longevityPoints: longevityDegraded ? null : computeLongevityPoints(stats),
  };
}

module.exports = {
  FOUNDATION_GATE,
  PRACTITIONER_GATE,
  CERTIFIED_GATE,
  POINTS_WEIGHTS,
  GRADUATE_GATE,
  MASTER_GATE,
  GRADUATE_TARGETS,
  MASTER_TARGETS,
  KEEPALIVE_DECAY_DAYS,
  JOURNEY_STAGES,
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  normaliseStats,
  isFoundationGateEarned,
  isPractitionerGateEarned,
  isCertifiedGateEarned,
  isLongevityDegraded,
  computeLongevityPoints,
  isGraduateGateEarned,
  isMasterGateEarned,
  isSummitBadgePaused,
  isStageConditionsMet,
  computeJourneyBadges,
  getHighestConsecutiveEarned,
  getCurrentStage,
  getNextUnearnedBadge,
  practitionerRequirementsMet,
  graduateRequirementsMet,
  masterRequirementsMet,
  evaluateBadges,
};
