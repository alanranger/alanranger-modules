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
const { getModuleIds } = require("./academy-exam-modules");
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
  FOUNDATION_EXAMS_TOTAL,
  COMPOSITION_EXAMS_TOTAL,
  FOUNDATION_REQUIRED_MODULE_PATH,
  computeLongevityPoints,
  assignmentsAndPacksPoolCount,
  isFoundationGateEarned,
  isPractitionerGateEarned,
  isCertifiedGateEarned,
  isGraduateGateEarned,
  isMasterGateEarned,
  isSummitBadgePaused,
} = require("./academy-badge-gates");

const FOUNDATION_EXAM_ID_SET = new Set(getModuleIds("foundation"));
const COMPOSITION_EXAM_ID_SET = new Set(getModuleIds("composition_creative"));

function countsFromPassedRows(rows) {
  const entry = { foundation: new Set(), composition: new Set() };
  (rows || []).forEach((row) => {
    if (!row.passed || !row.module_id) return;
    if (FOUNDATION_EXAM_ID_SET.has(row.module_id)) entry.foundation.add(row.module_id);
    else if (COMPOSITION_EXAM_ID_SET.has(row.module_id)) entry.composition.add(row.module_id);
  });
  return {
    foundationExamsPassed: entry.foundation.size,
    compositionExamsPassed: entry.composition.size,
  };
}

function tallyExamPassCountsFromRows(rows, memberIdField) {
  const field = memberIdField || "memberstack_id";
  const byMember = new Map();
  (rows || []).forEach((row) => {
    if (!row.passed || !row[field] || !row.module_id) return;
    let entry = byMember.get(row[field]);
    if (!entry) {
      entry = { foundation: new Set(), composition: new Set() };
      byMember.set(row[field], entry);
    }
    if (FOUNDATION_EXAM_ID_SET.has(row.module_id)) entry.foundation.add(row.module_id);
    else if (COMPOSITION_EXAM_ID_SET.has(row.module_id)) entry.composition.add(row.module_id);
  });
  const out = new Map();
  byMember.forEach((sets, memberId) => {
    out.set(memberId, {
      foundationExamsPassed: sets.foundation.size,
      compositionExamsPassed: sets.composition.size,
    });
  });
  return out;
}

async function fetchExamPassCountsForMember(supabase, memberId, email) {
  const empty = { foundationExamsPassed: 0, compositionExamsPassed: 0 };
  if (!memberId) return empty;
  const { data, error } = await supabase
    .from("module_results_ms")
    .select("module_id, passed")
    .eq("memberstack_id", memberId)
    .eq("passed", true);
  if (error) throw error;
  let counts = countsFromPassedRows(data);
  if (counts.foundationExamsPassed === 0 && counts.compositionExamsPassed === 0 && email) {
    const legacy = await supabase
      .from("module_results_ms")
      .select("module_id, passed")
      .eq("email", email)
      .eq("passed", true);
    if (!legacy.error && legacy.data && legacy.data.length) counts = countsFromPassedRows(legacy.data);
  }
  return counts;
}

async function fetchExamPassCountsMap(supabase, memberIds) {
  const map = new Map();
  if (!memberIds.length) return map;
  const chunkSize = 300;
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("module_results_ms")
      .select("memberstack_id, module_id, passed")
      .in("memberstack_id", chunk)
      .eq("passed", true);
    if (error) throw error;
    tallyExamPassCountsFromRows(data || []).forEach((counts, memberId) => {
      map.set(memberId, counts);
    });
  }
  return map;
}

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

function computeGateStatsFromRaw(raw, examsPassed, compositionExamsPassed) {
  const openedSet = buildOpenedSet(raw);
  const foundationPassed = examsPassed || 0;
  const compositionPassed = compositionExamsPassed || 0;
  return {
    foundationModulesOpened: openedSet.size,
    cameraOpened: countOpenedInList(openedSet, CAMERA_MODULE_PATHS),
    compositionOpened: countOpenedInList(openedSet, COMPOSITION_MODULE_PATHS),
    pdfAssignmentsOpened: countOpenedInList(openedSet, PDF_ASSIGNMENT_PATHS),
    totalModulesOpened: openedSet.size,
    examsPassed: foundationPassed,
    compositionExamsPassed: compositionPassed,
    module01Opened: openedSet.has(normalizePath(FOUNDATION_REQUIRED_MODULE_PATH)),
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

function evaluateTableBadge(raw, examsPassed, hasConverted, lastSeen, compositionExamsPassed) {
  const stats = computeGateStatsFromRaw(raw, examsPassed, compositionExamsPassed);
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

  const foundationMet = isFoundationGateEarned(stats, activeDays, engagementDegraded);
  const practitionerMet = isPractitionerGateEarned(stats);
  const certifiedMet = isCertifiedGateEarned(stats, hasConverted);
  const graduateMet = isGraduateGateEarned(stats, hasConverted, engagementDegraded);
  const masterMet = isMasterGateEarned(stats, hasConverted, graduateEarned, engagementDegraded);

  return {
    foundation: {
      met: foundationMet,
      module01Opened: stats.module01Opened === true,
      modulesOpened: stats.foundationModulesOpened,
      modulesTarget: FOUNDATION_GATE.minModules,
      activeDaysFirst14: activeDays,
      activeDaysTarget: FOUNDATION_GATE.minActiveDays,
      activeDaysDegraded: engagementDegraded,
    },
    practitioner: {
      met: practitionerMet,
      cameraOpened: stats.cameraOpened,
      cameraTarget: PRACTITIONER_GATE.minCameraModules,
      compositionOpened: stats.compositionOpened,
      compositionTarget: PRACTITIONER_GATE.minCompositionModules,
      pdfAssignmentsOpened: stats.pdfAssignmentsOpened,
      pdfAssignmentsTarget: PRACTITIONER_GATE.minPdfAssignments,
      examsPassed: stats.examsPassed,
      examsPassedTarget: PRACTITIONER_GATE.minFoundationExamsPassed,
      compositionExamsPassed: stats.compositionExamsPassed,
      compositionExamsPassedTarget: PRACTITIONER_GATE.minCompositionExamsPassed,
    },
    certified: {
      met: certifiedMet,
      examsPassed: stats.examsPassed,
      examsPassedTarget: CERTIFIED_GATE.minFoundationExamsPassed,
      compositionExamsPassed: stats.compositionExamsPassed,
      compositionExamsPassedTarget: CERTIFIED_GATE.minCompositionExamsPassed,
      cameraOpened: stats.cameraOpened,
      cameraTarget: CAMERA_MODULE_PATHS.length,
      compositionOpened: stats.compositionOpened,
      compositionTarget: COMPOSITION_MODULE_PATHS.length,
      assignmentsAndPacksPool: assignmentsAndPacksPoolCount(stats),
      assignmentsAndPacksPoolTarget: CERTIFIED_GATE.minAssignmentsAndPacksPool,
      appliedLearningOpened: stats.appliedLearningOpened,
      appliedLearningTarget: CERTIFIED_GATE.minAppliedLearning,
      requiresConversion: !hasConverted,
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

function attachTableBadgeFields(target, raw, examsPassed, hasConverted, lastSeen, compositionExamsPassed) {
  const badge = evaluateTableBadge(raw, examsPassed, hasConverted, lastSeen, compositionExamsPassed);
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
  tallyExamPassCountsFromRows,
  fetchExamPassCountsForMember,
  fetchExamPassCountsMap,
  countsFromPassedRows,
};
