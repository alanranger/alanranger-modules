/**
 * Pure badge gate evaluation (single source of truth).
 * SYNC: Squarespace Snippets/academy-do-next-strip-squarespace-snippet-v1.html (BEGIN/END BADGE-GATES-SYNC)
 * Run: node scripts/sync-badge-gates-to-snippets.mjs after edits.
 */
const { APPLIED_LEARNING_TOTAL } = require("./academy-longevity-stats");
const {
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  PDF_ASSIGNMENT_PATHS,
  PRACTICE_PACK_URLS,
  FOUNDATION_MODULE_PATHS,
} = require("./academy-module-paths");

const FOUNDATION_EXAMS_TOTAL = 15;
const COMPOSITION_EXAMS_TOTAL = 15;
const ALL_EXAMS_TOTAL = FOUNDATION_EXAMS_TOTAL + COMPOSITION_EXAMS_TOTAL;
const FOUNDATION_REQUIRED_MODULE_PATH = "/blog-on-photography/what-is-exposure-in-photography";

/** Section totals for requirements matrix display (validated in badge-gates.test.mjs). */
const BADGE_SECTION_TOTALS = {
  cameraModules: 15,
  compositionGuides: 10,
  foundationModules: 60,
  pdfAssignments: 15,
  foundationExams: FOUNDATION_EXAMS_TOTAL,
  compositionExams: COMPOSITION_EXAMS_TOTAL,
  appliedLearning: 40,
  practicePacks: 30,
};

const FOUNDATION_GATE = {
  requiredModulePaths: [FOUNDATION_REQUIRED_MODULE_PATH],
  minModules: 3,
  minActiveDays: 3,
  module01ProgressWeight: 0.6,
  bonusModules: 6,
  bonusActiveDays: 5,
};

const PRACTITIONER_GATE = {
  minCameraModules: 10,
  minCompositionModules: 5,
  minPdfAssignments: 3,
  minFoundationExamsPassed: 6,
  minCompositionExamsPassed: 4,
};

const CERTIFIED_GATE = {
  minFoundationExamsPassed: 15,
  minCompositionExamsPassed: 7,
  minAssignmentsAndPacksPool: 5,
  minAppliedLearning: 3,
};

const POINTS_WEIGHTS = {
  appliedLearning: 2,
  practicePack: 2,
  pdfAssignment: 4,
  activeMonth: 7,
};

const GRADUATE_GATE = { minPoints: 190 };
const MASTER_GATE = { minPoints: 270 };

const GRADUATE_TARGETS = {
  appliedLearning: 25,
  practicePacks: 18,
  pdfAssignments: 9,
  activeMonths: 6,
};

const MASTER_TARGETS = {
  appliedLearning: 32,
  practicePacks: 24,
  pdfAssignments: 12,
  activeMonths: 12,
};

const KEEPALIVE_DECAY_DAYS = 60;
const DAY_MS = 86_400_000;

const JOURNEY_STAGES = [
  { key: "enrolled", label: "Enrolled", sublabel: "Joined", iconClass: "ti-school", colour: "green", stars: 0, alwaysEarned: true },
  { key: "foundation", label: "Foundation", sublabel: "3 modules, 3 active days", iconClass: "ti-camera", colour: "green", stars: 1, foundationGate: true },
  { key: "practitioner", label: "Practitioner", sublabel: "Camera + composition, 3 assignments, 8 exams", iconClass: "ti-aperture", colour: "green", stars: 2, practitionerGate: true },
  { key: "certified", label: "Certified", sublabel: "All 15 exams, 30 modules", iconClass: "ti-certificate", colour: "green", stars: 3, certifiedGate: true },
  { key: "graduate", label: "Graduate", sublabel: "Applied breadth + 4 active months", iconClass: "ti-award", colour: "green", stars: 4, graduateGate: true },
  { key: "master", label: "Master", sublabel: "Deeper breadth + 7 active months", iconClass: "ti-trophy", colour: "gold", stars: 5, masterGate: true },
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
    compositionExamsPassed: safeNum(stats.compositionExamsPassed, 0),
    module01Opened: stats.module01Opened === true,
    appliedLearningOpened: stats.appliedLearningOpened == null ? null : safeNum(stats.appliedLearningOpened, 0),
    practicePacksOpened: stats.practicePacksOpened == null ? null : safeNum(stats.practicePacksOpened, 0),
    distinctActiveMonthsAllTime:
      stats.distinctActiveMonthsAllTime == null ? null : safeNum(stats.distinctActiveMonthsAllTime, 0),
  };
}

function hasRequiredModulePaths(stats, requiredPaths) {
  const paths = requiredPaths || [];
  if (!paths.length) return true;
  if (paths.length === 1 && paths[0] === FOUNDATION_REQUIRED_MODULE_PATH) {
    return normaliseStats(stats).module01Opened;
  }
  const opened = stats.openedFoundationPaths;
  if (opened instanceof Set) {
    return paths.every((p) => opened.has(p));
  }
  return false;
}

function assignmentsAndPacksPoolCount(stats) {
  const safe = normaliseStats(stats);
  return safe.pdfAssignmentsOpened + safeNum(safe.practicePacksOpened, 0);
}

function allExamsPassed(stats) {
  const safe = normaliseStats(stats);
  return safe.examsPassed >= FOUNDATION_EXAMS_TOTAL && safe.compositionExamsPassed >= COMPOSITION_EXAMS_TOTAL;
}

function isFoundationGateEarned(stats, activeDays, engagementDegraded) {
  const safe = normaliseStats(stats);
  if (!hasRequiredModulePaths(safe, FOUNDATION_GATE.requiredModulePaths)) return false;
  if (safe.foundationModulesOpened < FOUNDATION_GATE.minModules) return false;
  if (engagementDegraded) return true;
  return safeNum(activeDays, 0) >= FOUNDATION_GATE.minActiveDays;
}

function isPractitionerGateEarned(stats) {
  const safe = normaliseStats(stats);
  if (safe.cameraOpened < PRACTITIONER_GATE.minCameraModules) return false;
  if (safe.compositionOpened < PRACTITIONER_GATE.minCompositionModules) return false;
  if (safe.pdfAssignmentsOpened < PRACTITIONER_GATE.minPdfAssignments) return false;
  if (safe.examsPassed < PRACTITIONER_GATE.minFoundationExamsPassed) return false;
  if (safe.compositionExamsPassed < PRACTITIONER_GATE.minCompositionExamsPassed) return false;
  return true;
}

function isCertifiedGateEarned(stats) {
  const safe = normaliseStats(stats);
  if (safe.examsPassed < CERTIFIED_GATE.minFoundationExamsPassed) return false;
  if (safe.compositionExamsPassed < CERTIFIED_GATE.minCompositionExamsPassed) return false;
  if (safe.cameraOpened < CAMERA_MODULE_PATHS.length) return false;
  if (safe.compositionOpened < COMPOSITION_MODULE_PATHS.length) return false;
  if (assignmentsAndPacksPoolCount(safe) < CERTIFIED_GATE.minAssignmentsAndPacksPool) return false;
  if (safeNum(safe.appliedLearningOpened, 0) < CERTIFIED_GATE.minAppliedLearning) return false;
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
  if (!allExamsPassed(stats)) return false;
  if (engagementDegraded || isLongevityDegraded(stats)) {
    warnLongevityDegraded();
    return false;
  }
  return computeLongevityPoints(stats) >= GRADUATE_GATE.minPoints;
}

function isMasterGateEarned(stats, hasConverted, graduateEarned, engagementDegraded) {
  if (!graduateEarned || !hasConverted) return false;
  if (!allExamsPassed(stats)) return false;
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
  const safeStats = normaliseStats(stats);

  if (stage.alwaysEarned) return true;
  if (stage.foundationGate) {
    return isFoundationGateEarned(safeStats, activeDays, engagementDegraded);
  }
  if (stage.practitionerGate) return isPractitionerGateEarned(safeStats);
  if (stage.certifiedGate) return isCertifiedGateEarned(safeStats);
  if (stage.graduateGate) return isGraduateGateEarned(safeStats, hasConverted, engagementDegraded);
  if (stage.masterGate) return isMasterGateEarned(safeStats, hasConverted, graduateEarned, engagementDegraded);
  if (stage.minExams) return safeStats.examsPassed >= stage.minExams;
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
      colour: stage.colour,
      stars: stage.stars,
      iconClass: stage.iconClass,
      sublabel: stage.sublabel,
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
    colour: current.colour,
    stars: current.stars,
    iconClass: current.iconClass,
    sublabel: current.sublabel,
    paused: current.paused === true,
  };
}

function getNextUnearnedBadge(badges) {
  for (let i = 0; i < badges.length; i += 1) {
    if (!badges[i].earned) return badges[i];
  }
  return null;
}

function practitionerRequirementsMet(stats) {
  const safe = normaliseStats(stats);
  const total = 5;
  let met = 0;
  if (safe.cameraOpened >= PRACTITIONER_GATE.minCameraModules) met += 1;
  if (safe.compositionOpened >= PRACTITIONER_GATE.minCompositionModules) met += 1;
  if (safe.pdfAssignmentsOpened >= PRACTITIONER_GATE.minPdfAssignments) met += 1;
  if (safe.examsPassed >= PRACTITIONER_GATE.minFoundationExamsPassed) met += 1;
  if (safe.compositionExamsPassed >= PRACTITIONER_GATE.minCompositionExamsPassed) met += 1;
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

function componentRatio(current, target) {
  if (target <= 0) return 100;
  const val = current == null ? 0 : current;
  return Math.min(100, (val / target) * 100);
}

function computeFoundationProgressPct(safe, activeDays, engagementDegraded) {
  const module01Pct = safe.module01Opened ? FOUNDATION_GATE.module01ProgressWeight * 100 : 0;
  const otherOpens = Math.max(0, safe.foundationModulesOpened - (safe.module01Opened ? 1 : 0));
  const otherRatio = componentRatio(otherOpens, FOUNDATION_GATE.minModules - 1);
  const remainder = (1 - FOUNDATION_GATE.module01ProgressWeight) * 100;
  if (engagementDegraded) {
    return Math.round(module01Pct + (otherRatio / 100) * remainder);
  }
  const daysRatio = componentRatio(safeNum(activeDays, 0), FOUNDATION_GATE.minActiveDays);
  const halfRemainder = remainder / 2;
  return Math.round(
    module01Pct + (otherRatio / 100) * halfRemainder + (daysRatio / 100) * halfRemainder
  );
}

function computeBadgeProgressForKey(badgeKey, stats, activeDays, engagementDegraded, openedCount, modulesTotal) {
  const safe = normaliseStats(stats);
  const modTotal = typeof modulesTotal === "number" && modulesTotal > 0 ? modulesTotal : 60;

  if (badgeKey === "enrolled") {
    return { pct: 100, label: "100%", degraded: false, breakdown: null };
  }

  if ((badgeKey === "graduate" || badgeKey === "master") && isLongevityDegraded(stats)) {
    const pct = Math.round((safeNum(openedCount, 0) / modTotal) * 100);
    return { pct, label: `${pct}%`, degraded: true, breakdown: null };
  }

  const ratios = [];
  if (badgeKey === "foundation") {
    const pct = computeFoundationProgressPct(safe, activeDays, engagementDegraded);
    if (!engagementDegraded) {
      const otherOpens = Math.min(
        Math.max(0, safe.foundationModulesOpened - (safe.module01Opened ? 1 : 0)),
        FOUNDATION_GATE.minModules - 1
      );
      const days = Math.min(safeNum(activeDays, 0), FOUNDATION_GATE.minActiveDays);
      const modPart = safe.module01Opened ? "01 Exposure ✓" : "01 Exposure ✗";
      const breakdown = `Foundation: ${modPart} · +${otherOpens}/2 modules · ${days}/${FOUNDATION_GATE.minActiveDays} active days`;
      return { pct, label: `${pct}%`, degraded: false, breakdown };
    }
    return { pct, label: `${pct}%`, degraded: false, breakdown: null };
  }
  if (badgeKey === "practitioner") {
    ratios.push(componentRatio(safe.cameraOpened, PRACTITIONER_GATE.minCameraModules));
    ratios.push(componentRatio(safe.compositionOpened, PRACTITIONER_GATE.minCompositionModules));
    ratios.push(componentRatio(safe.pdfAssignmentsOpened, PRACTITIONER_GATE.minPdfAssignments));
    ratios.push(componentRatio(safe.examsPassed, PRACTITIONER_GATE.minFoundationExamsPassed));
    ratios.push(componentRatio(safe.compositionExamsPassed, PRACTITIONER_GATE.minCompositionExamsPassed));
  } else if (badgeKey === "certified") {
    ratios.push(componentRatio(safe.examsPassed, CERTIFIED_GATE.minFoundationExamsPassed));
    ratios.push(componentRatio(safe.compositionExamsPassed, CERTIFIED_GATE.minCompositionExamsPassed));
    ratios.push(componentRatio(safe.cameraOpened, CAMERA_MODULE_PATHS.length));
    ratios.push(componentRatio(safe.compositionOpened, COMPOSITION_MODULE_PATHS.length));
    ratios.push(componentRatio(assignmentsAndPacksPoolCount(safe), CERTIFIED_GATE.minAssignmentsAndPacksPool));
    ratios.push(componentRatio(safe.appliedLearningOpened, CERTIFIED_GATE.minAppliedLearning));
  } else if (badgeKey === "graduate") {
    ratios.push(componentRatio(safe.appliedLearningOpened, GRADUATE_TARGETS.appliedLearning));
    ratios.push(componentRatio(safe.practicePacksOpened, GRADUATE_TARGETS.practicePacks));
    ratios.push(componentRatio(safe.pdfAssignmentsOpened, GRADUATE_TARGETS.pdfAssignments));
    ratios.push(componentRatio(safe.distinctActiveMonthsAllTime, GRADUATE_TARGETS.activeMonths));
  } else if (badgeKey === "master") {
    ratios.push(componentRatio(safe.appliedLearningOpened, MASTER_TARGETS.appliedLearning));
    ratios.push(componentRatio(safe.practicePacksOpened, MASTER_TARGETS.practicePacks));
    ratios.push(componentRatio(safe.pdfAssignmentsOpened, MASTER_TARGETS.pdfAssignments));
    ratios.push(componentRatio(safe.distinctActiveMonthsAllTime, MASTER_TARGETS.activeMonths));
  }

  const pct = ratios.length
    ? Math.round(ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length)
    : Math.round((safeNum(openedCount, 0) / modTotal) * 100);
  return { pct, label: `${pct}%`, degraded: false, breakdown: null };
}

function computeBadgeProgressPctForKey(badgeKey, stats, activeDays, engagementDegraded) {
  return computeBadgeProgressForKey(badgeKey, stats, activeDays, engagementDegraded, 0, 60).pct;
}

function buildBadgeRequirementsMatrix(stats, gateContext) {
  const safe = normaliseStats(stats);
  const hasConverted = !!(gateContext && gateContext.hasConverted === true);

  return [
    {
      label: `Module 01 Exposure`,
      foundation: { text: "✓", met: safe.module01Opened },
    },
    {
      label: `Camera modules (${CAMERA_MODULE_PATHS.length})`,
      practitioner: { text: String(PRACTITIONER_GATE.minCameraModules), met: safe.cameraOpened >= PRACTITIONER_GATE.minCameraModules },
      certified: { text: String(CAMERA_MODULE_PATHS.length), met: safe.cameraOpened >= CAMERA_MODULE_PATHS.length },
    },
    {
      label: `Composition guides (${COMPOSITION_MODULE_PATHS.length})`,
      practitioner: { text: String(PRACTITIONER_GATE.minCompositionModules), met: safe.compositionOpened >= PRACTITIONER_GATE.minCompositionModules },
      certified: { text: String(COMPOSITION_MODULE_PATHS.length), met: safe.compositionOpened >= COMPOSITION_MODULE_PATHS.length },
    },
    {
      label: `Assignments + packs pool (${CERTIFIED_GATE.minAssignmentsAndPacksPool})`,
      certified: { text: String(CERTIFIED_GATE.minAssignmentsAndPacksPool), met: assignmentsAndPacksPoolCount(safe) >= CERTIFIED_GATE.minAssignmentsAndPacksPool },
    },
    {
      label: `Assignments (${PDF_ASSIGNMENT_PATHS.length})`,
      practitioner: { text: String(PRACTITIONER_GATE.minPdfAssignments), met: safe.pdfAssignmentsOpened >= PRACTITIONER_GATE.minPdfAssignments },
      graduate: { text: String(GRADUATE_TARGETS.pdfAssignments), met: safe.pdfAssignmentsOpened >= GRADUATE_TARGETS.pdfAssignments },
      master: { text: String(MASTER_TARGETS.pdfAssignments), met: safe.pdfAssignmentsOpened >= MASTER_TARGETS.pdfAssignments },
    },
    {
      label: "Foundation exams (15)",
      practitioner: { text: String(PRACTITIONER_GATE.minFoundationExamsPassed), met: safe.examsPassed >= PRACTITIONER_GATE.minFoundationExamsPassed },
      certified: { text: "15", met: safe.examsPassed >= CERTIFIED_GATE.minFoundationExamsPassed },
      graduate: { text: "15", met: safe.examsPassed >= FOUNDATION_EXAMS_TOTAL },
      master: { text: "15", met: safe.examsPassed >= FOUNDATION_EXAMS_TOTAL },
    },
    {
      label: "Composition exams (15)",
      practitioner: { text: String(PRACTITIONER_GATE.minCompositionExamsPassed), met: safe.compositionExamsPassed >= PRACTITIONER_GATE.minCompositionExamsPassed },
      certified: { text: String(CERTIFIED_GATE.minCompositionExamsPassed), met: safe.compositionExamsPassed >= CERTIFIED_GATE.minCompositionExamsPassed },
      graduate: { text: "15", met: safe.compositionExamsPassed >= COMPOSITION_EXAMS_TOTAL },
      master: { text: "15", met: safe.compositionExamsPassed >= COMPOSITION_EXAMS_TOTAL },
    },
    {
      label: "Applied learning (40)",
      certified: { text: String(CERTIFIED_GATE.minAppliedLearning), met: safe.appliedLearningOpened != null && safe.appliedLearningOpened >= CERTIFIED_GATE.minAppliedLearning },
      graduate: { text: String(GRADUATE_TARGETS.appliedLearning), met: safe.appliedLearningOpened != null && safe.appliedLearningOpened >= GRADUATE_TARGETS.appliedLearning },
      master: { text: String(MASTER_TARGETS.appliedLearning), met: safe.appliedLearningOpened != null && safe.appliedLearningOpened >= MASTER_TARGETS.appliedLearning },
    },
    {
      label: "Practice packs (30)",
      graduate: { text: String(GRADUATE_TARGETS.practicePacks), met: safe.practicePacksOpened != null && safe.practicePacksOpened >= GRADUATE_TARGETS.practicePacks },
      master: { text: String(MASTER_TARGETS.practicePacks), met: safe.practicePacksOpened != null && safe.practicePacksOpened >= MASTER_TARGETS.practicePacks },
    },
    {
      label: "Active months",
      graduate: { text: String(GRADUATE_TARGETS.activeMonths), met: safe.distinctActiveMonthsAllTime != null && safe.distinctActiveMonthsAllTime >= GRADUATE_TARGETS.activeMonths },
      master: { text: String(MASTER_TARGETS.activeMonths), met: safe.distinctActiveMonthsAllTime != null && safe.distinctActiveMonthsAllTime >= MASTER_TARGETS.activeMonths },
    },
    {
      label: "Paid conversion",
      graduate: { text: "✓", met: hasConverted },
      master: { text: "✓", met: hasConverted },
    },
  ];
}

function computeNextBadgeProgress(badges, stats, activeDays, engagementDegraded, openedCount, modulesTotal) {
  const next = getNextUnearnedBadge(badges);
  if (!next) {
    return { pct: 100, label: "100% - all badges earned", degraded: false, nextKey: null, breakdown: null };
  }

  const result = computeBadgeProgressForKey(
    next.key,
    stats,
    activeDays,
    engagementDegraded,
    openedCount,
    modulesTotal
  );
  if ((next.key === "graduate" || next.key === "master") && result.degraded) {
    return {
      pct: result.pct,
      label: `${result.pct}% of the foundations course`,
      degraded: true,
      nextKey: next.key,
      breakdown: null,
    };
  }
  return {
    pct: result.pct,
    label: `${result.pct}% to ${next.label}`,
    degraded: result.degraded,
    nextKey: next.key,
    breakdown: result.breakdown || null,
  };
}

function computeTrackFillPct(badges, progressPct) {
  if (!badges || !badges.length) return 0;
  const segmentCount = badges.length - 1;
  if (segmentCount <= 0) return 100;
  if (!getNextUnearnedBadge(badges)) return 100;
  let lastEarnedIdx = -1;
  for (let i = 0; i < badges.length; i += 1) {
    if (badges[i].earned) lastEarnedIdx = i;
    else break;
  }
  const fillUnits = lastEarnedIdx + safeNum(progressPct, 0) / 100;
  return Math.min(100, Math.round((fillUnits / segmentCount) * 100));
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
  FOUNDATION_EXAMS_TOTAL,
  COMPOSITION_EXAMS_TOTAL,
  ALL_EXAMS_TOTAL,
  FOUNDATION_REQUIRED_MODULE_PATH,
  BADGE_SECTION_TOTALS,
  JOURNEY_STAGES,
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  normaliseStats,
  hasRequiredModulePaths,
  assignmentsAndPacksPoolCount,
  allExamsPassed,
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
  componentRatio,
  computeFoundationProgressPct,
  computeBadgeProgressForKey,
  computeBadgeProgressPctForKey,
  buildBadgeRequirementsMatrix,
  computeNextBadgeProgress,
  computeTrackFillPct,
  evaluateBadges,
};
