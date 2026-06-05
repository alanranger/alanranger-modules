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

const JOURNEY_STAGES = [
  { key: "enrolled", label: "Enrolled", alwaysEarned: true },
  { key: "foundation", label: "Foundation", foundationGate: true },
  { key: "practitioner", label: "Practitioner", practitionerGate: true },
  { key: "certified", label: "Certified", certifiedGate: true },
  { key: "graduate", label: "Graduate", stageEarned: false },
  { key: "master", label: "Master", stageEarned: false },
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

function isStageConditionsMet(stage, stats, activeDays, engagementDegraded) {
  if (stage.stageEarned === false) return false;
  if (stage.alwaysEarned) return true;
  if (stage.foundationGate) {
    return isFoundationGateEarned(stats.foundationModulesOpened, activeDays, engagementDegraded);
  }
  if (stage.practitionerGate) return isPractitionerGateEarned(stats);
  if (stage.certifiedGate) return isCertifiedGateEarned(stats);
  if (stage.minExams) return stats.examsPassed >= stage.minExams;
  return false;
}

function computeJourneyBadges(stats, activeDays, engagementDegraded) {
  const safeStats = normaliseStats(stats);
  const safeDays = safeNum(activeDays, 0);
  const degraded = engagementDegraded === true;
  let canEarnHigher = true;
  return JOURNEY_STAGES.map((stage) => {
    let earned = false;
    if (canEarnHigher) {
      earned = isStageConditionsMet(stage, safeStats, safeDays, degraded);
      if (!earned) canEarnHigher = false;
    }
    return {
      key: stage.key,
      label: stage.label,
      earned,
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
    if (!badges[i].earned && badges[i].key !== "master") return badges[i];
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

function evaluateBadges(stats, activeDays, engagementDegraded) {
  const badges = computeJourneyBadges(stats, activeDays, engagementDegraded);
  const earned = {};
  badges.forEach((badge) => {
    earned[badge.key] = badge.earned;
  });
  const highestConsecutive = getHighestConsecutiveEarned(badges);
  const target = getNextUnearnedBadge(badges);
  return {
    earned,
    badges,
    highestConsecutive: highestConsecutive.key,
    target: target ? target.key : null,
    earnedCount: badges.filter((b) => b.earned).length,
    earnedTotal: badges.length,
    practitionerProximity: practitionerRequirementsMet(stats),
  };
}

module.exports = {
  FOUNDATION_GATE,
  PRACTITIONER_GATE,
  CERTIFIED_GATE,
  JOURNEY_STAGES,
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  normaliseStats,
  isFoundationGateEarned,
  isPractitionerGateEarned,
  isCertifiedGateEarned,
  isStageConditionsMet,
  computeJourneyBadges,
  getHighestConsecutiveEarned,
  getCurrentStage,
  getNextUnearnedBadge,
  practitionerRequirementsMet,
  evaluateBadges,
};
