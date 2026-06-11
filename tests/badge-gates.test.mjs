/**
 * Badge gate fixture tests (pure logic, no live accounts).
 * Run: npm run test:gates
 */
import { createRequire } from "module";
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const gates = require(path.join(root, "lib/academy-badge-gates.js"));
const modulePaths = require(path.join(root, "lib/academy-module-paths.js"));
const longevity = require(path.join(root, "lib/academy-longevity-stats.js"));
const gateView = require(path.join(root, "lib/academy-client-gate-view.js"));

const {
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  PDF_ASSIGNMENT_PATHS,
  PRACTICE_PACK_URLS,
  FOUNDATION_MODULE_PATHS,
} = modulePaths;

const {
  FOUNDATION_GATE,
  PRACTITIONER_GATE,
  CERTIFIED_GATE,
  GRADUATE_GATE,
  MASTER_GATE,
  GRADUATE_TARGETS,
  MASTER_TARGETS,
  KEEPALIVE_DECAY_DAYS,
  FOUNDATION_REQUIRED_MODULE_PATH,
  JOURNEY_STAGES,
  BADGE_SECTION_TOTALS,
  evaluateBadges,
  computeLongevityPoints,
  computeFoundationProgressPct,
  getCurrentStage,
  getNextUnearnedBadge,
  graduateRequirementsMet,
  masterRequirementsMet,
  computeBadgeProgressForKey,
  computeNextBadgeProgress,
  computeTrackFillPct,
  normaliseStats,
  isFoundationGateEarned,
} = gates;

const APPLIED_LEARNING_TOTAL = longevity.APPLIED_LEARNING_TOTAL;
const DAY_MS = 86400000;

function fixtureStats(overrides) {
  return {
    foundationModulesOpened: 0,
    cameraOpened: 0,
    compositionOpened: 0,
    pdfAssignmentsOpened: 0,
    totalModulesOpened: 0,
    examsPassed: 0,
    compositionExamsPassed: 0,
    module01Opened: false,
    appliedLearningOpened: null,
    practicePacksOpened: null,
    distinctActiveMonthsAllTime: null,
    ...overrides,
  };
}

function foundationEarnedStats(overrides) {
  return fixtureStats({
    module01Opened: true,
    foundationModulesOpened: 3,
    ...overrides,
  });
}

function practitionerEarnedStats(overrides) {
  return foundationEarnedStats({
    cameraOpened: PRACTITIONER_GATE.minCameraModules,
    compositionOpened: PRACTITIONER_GATE.minCompositionModules,
    pdfAssignmentsOpened: PRACTITIONER_GATE.minPdfAssignments,
    examsPassed: PRACTITIONER_GATE.minFoundationExamsPassed,
    compositionExamsPassed: PRACTITIONER_GATE.minCompositionExamsPassed,
    ...overrides,
  });
}

function certifiedFloorStats(overrides) {
  return practitionerEarnedStats({
    cameraOpened: CAMERA_MODULE_PATHS.length,
    compositionOpened: COMPOSITION_MODULE_PATHS.length,
    pdfAssignmentsOpened: 5,
    practicePacksOpened: 0,
    appliedLearningOpened: CERTIFIED_GATE.minAppliedLearning,
    examsPassed: CERTIFIED_GATE.minFoundationExamsPassed,
    compositionExamsPassed: CERTIFIED_GATE.minCompositionExamsPassed,
    foundationModulesOpened: 25,
    totalModulesOpened: 25,
    ...overrides,
  });
}

function graduateCountsStats(overrides) {
  return certifiedFloorStats({
    examsPassed: 15,
    compositionExamsPassed: 15,
    pdfAssignmentsOpened: GRADUATE_TARGETS.pdfAssignments,
    appliedLearningOpened: GRADUATE_TARGETS.appliedLearning,
    practicePacksOpened: GRADUATE_TARGETS.practicePacks,
    distinctActiveMonthsAllTime: 10,
    ...overrides,
  });
}

function masterCountsStats(overrides) {
  return graduateCountsStats({
    pdfAssignmentsOpened: MASTER_TARGETS.pdfAssignments,
    appliedLearningOpened: MASTER_TARGETS.appliedLearning,
    practicePacksOpened: MASTER_TARGETS.practicePacks,
    distinctActiveMonthsAllTime: 16,
    ...overrides,
  });
}

function paidContext(lastActivityAt) {
  return { hasConverted: true, lastActivityAt: lastActivityAt || new Date().toISOString() };
}

test("constants: Master minPoints > Graduate minPoints", () => {
  assert.ok(MASTER_GATE.minPoints > GRADUATE_GATE.minPoints);
  assert.equal(GRADUATE_GATE.minPoints, 190);
  assert.equal(MASTER_GATE.minPoints, 270);
});

test("constants: module 01 path matches camera module 1", () => {
  assert.equal(FOUNDATION_REQUIRED_MODULE_PATH, CAMERA_MODULE_PATHS[0]);
});

test("1. brand new: Enrolled only, target Foundation", () => {
  const result = evaluateBadges(fixtureStats(), 0, false);
  assert.equal(result.earned.enrolled, true);
  assert.equal(result.earned.foundation, false);
  assert.equal(result.target, "foundation");
});

test("2. Foundation requires module 01 even with 3 other modules", () => {
  const result = evaluateBadges(
    fixtureStats({ foundationModulesOpened: 3, module01Opened: false }),
    3,
    false
  );
  assert.equal(result.earned.foundation, false);
});

test("2b. Foundation gate met with module 01 + 3 modules + 3 days", () => {
  const result = evaluateBadges(foundationEarnedStats(), 3, false);
  assert.equal(result.earned.foundation, true);
  assert.equal(result.target, "practitioner");
});

test("3. partial Practitioner: 10 camera only -> 1 of 5 proximity", () => {
  const result = evaluateBadges(
    foundationEarnedStats({
      cameraOpened: PRACTITIONER_GATE.minCameraModules,
      examsPassed: 2,
    }),
    5,
    false
  );
  assert.equal(result.earned.practitioner, false);
  assert.deepEqual(result.practitionerProximity, { met: 1, total: 5 });
});

test("4. full Practitioner gate earned", () => {
  const result = evaluateBadges(practitionerEarnedStats(), 10, false);
  assert.equal(result.earned.practitioner, true);
  assert.equal(result.highestConsecutive, "practitioner");
});

test("5. Certified floor earned", () => {
  const result = evaluateBadges(certifiedFloorStats(), 10, false, paidContext());
  assert.equal(result.earned.certified, true);
});

test("5b. Certified content without paid conversion stays Practitioner", () => {
  const result = evaluateBadges(certifiedFloorStats(), 10, false, { hasConverted: false });
  assert.equal(result.earned.practitioner, true);
  assert.equal(result.earned.certified, false);
  assert.equal(result.highestConsecutive, "practitioner");
});

test("5c. Certified content with paid conversion earns Certified", () => {
  const result = evaluateBadges(certifiedFloorStats(), 10, false, paidContext());
  assert.equal(result.earned.certified, true);
  assert.equal(result.highestConsecutive, "certified");
});

test("6. prerequisite order: high stats but no module 01 -> Enrolled only", () => {
  const result = evaluateBadges(
    fixtureStats({
      foundationModulesOpened: 60,
      cameraOpened: CAMERA_MODULE_PATHS.length,
      compositionOpened: COMPOSITION_MODULE_PATHS.length,
      pdfAssignmentsOpened: 5,
      examsPassed: 15,
      compositionExamsPassed: 15,
      module01Opened: false,
    }),
    5,
    false
  );
  assert.equal(result.highestConsecutive, "enrolled");
});

test("7. Certified without longevity: Graduate blocked", () => {
  const result = evaluateBadges(certifiedFloorStats(), 5, false, paidContext());
  assert.equal(result.earned.certified, true);
  assert.equal(result.earned.graduate, false);
});

test("8. null stats safe fallback", () => {
  const result = evaluateBadges(null, undefined, undefined);
  assert.equal(result.earned.enrolled, true);
  assert.equal(result.earned.foundation, false);
});

test("9. Graduate counts + paid + all 30 exams + points >= 190", () => {
  const stats = graduateCountsStats();
  assert.ok(computeLongevityPoints(stats) >= GRADUATE_GATE.minPoints);
  const result = evaluateBadges(stats, 10, false, paidContext());
  assert.equal(result.earned.graduate, true);
  assert.equal(result.earned.master, false);
});

test("10. Master counts + paid: Master earned", () => {
  const stats = masterCountsStats();
  assert.ok(computeLongevityPoints(stats) >= MASTER_GATE.minPoints);
  const result = evaluateBadges(stats, 10, false, paidContext());
  assert.equal(result.earned.master, true);
});

test("11. counts met but NOT paid: no Graduate/Master", () => {
  const result = evaluateBadges(masterCountsStats(), 10, false, { hasConverted: false });
  assert.equal(result.earned.graduate, false);
  assert.equal(result.earned.master, false);
});

test("12. Graduate requires all 30 exams", () => {
  const stats = graduateCountsStats({ compositionExamsPassed: 10 });
  const result = evaluateBadges(stats, 10, false, paidContext());
  assert.equal(result.earned.graduate, false);
});

test("Foundation progress: module 01 alone -> 60%", () => {
  const safe = normaliseStats(foundationEarnedStats({ foundationModulesOpened: 1 }));
  assert.equal(computeFoundationProgressPct(safe, 0, false), 60);
});

test("Foundation progress: module 01 + 2 others + 3 days -> 100%", () => {
  const safe = normaliseStats(foundationEarnedStats());
  assert.equal(computeFoundationProgressPct(safe, 3, false), 100);
});

test("Foundation progress label: opening 01 jumps to ~60%", () => {
  const stats = foundationEarnedStats({ foundationModulesOpened: 1 });
  const result = evaluateBadges(stats, 0, false);
  const progress = computeNextBadgeProgress(result.badges, stats, 0, false, 1, 60);
  assert.equal(progress.pct, 60);
});

test("Certified combined assignments+packs pool", () => {
  const stats = practitionerEarnedStats({
    cameraOpened: CAMERA_MODULE_PATHS.length,
    compositionOpened: COMPOSITION_MODULE_PATHS.length,
    examsPassed: 15,
    compositionExamsPassed: 7,
    pdfAssignmentsOpened: 3,
    practicePacksOpened: 2,
    appliedLearningOpened: 3,
  });
  const result = evaluateBadges(stats, 10, false, paidContext());
  assert.equal(result.earned.certified, true);
});

test("Sample member sanity (Claude spec)", () => {
  const stats = fixtureStats({
    module01Opened: true,
    foundationModulesOpened: 40,
    cameraOpened: 12,
    compositionOpened: 6,
    pdfAssignmentsOpened: 4,
    practicePacksOpened: 5,
    examsPassed: 7,
    compositionExamsPassed: 5,
    totalModulesOpened: 40,
    appliedLearningOpened: 12,
    distinctActiveMonthsAllTime: 6,
  });
  const result = evaluateBadges(stats, 3, false, paidContext());
  assert.equal(result.earned.foundation, true);
  assert.equal(result.earned.practitioner, true);
  assert.equal(result.earned.certified, false);
  assert.equal(result.highestConsecutive, "practitioner");
  const pCert = computeBadgeProgressForKey("certified", stats, 3, false, 40, 60);
  assert.ok(pCert.pct > 0);
});

test("BADGE_SECTION_TOTALS match path lengths", () => {
  assert.equal(BADGE_SECTION_TOTALS.cameraModules, CAMERA_MODULE_PATHS.length);
  assert.equal(BADGE_SECTION_TOTALS.compositionGuides, COMPOSITION_MODULE_PATHS.length);
  assert.equal(BADGE_SECTION_TOTALS.foundationModules, FOUNDATION_MODULE_PATHS.length);
  assert.equal(BADGE_SECTION_TOTALS.pdfAssignments, PDF_ASSIGNMENT_PATHS.length);
  assert.equal(BADGE_SECTION_TOTALS.appliedLearning, APPLIED_LEARNING_TOTAL);
  assert.equal(BADGE_SECTION_TOTALS.practicePacks, PRACTICE_PACK_URLS.length);
});

test("badge display fields unchanged (Phase 1)", () => {
  const result = evaluateBadges(masterCountsStats(), 10, false, paidContext());
  result.badges.forEach((badge) => {
    const stage = JOURNEY_STAGES.find((s) => s.key === badge.key);
    assert.equal(badge.sublabel, stage.sublabel);
  });
});

test("client longevity merge preserves module01Opened and compositionExamsPassed", () => {
  const base = fixtureStats({
    module01Opened: true,
    compositionExamsPassed: 4,
    foundationModulesOpened: 5,
    examsPassed: 6,
    cameraOpened: 9,
  });
  const merged = {
    foundationModulesOpened: base.foundationModulesOpened,
    cameraOpened: base.cameraOpened,
    compositionOpened: base.compositionOpened,
    pdfAssignmentsOpened: base.pdfAssignmentsOpened,
    totalModulesOpened: base.totalModulesOpened,
    examsPassed: base.examsPassed,
    compositionExamsPassed: base.compositionExamsPassed || 0,
    module01Opened: base.module01Opened === true,
    appliedLearningOpened: 1,
    practicePacksOpened: 2,
    distinctActiveMonthsAllTime: 3,
  };
  const safe = normaliseStats(merged);
  assert.equal(safe.module01Opened, true);
  assert.equal(safe.compositionExamsPassed, 4);
  assert.equal(isFoundationGateEarned(safe, 3, false), true);
});

test("buildAcademyBadgeView matches strip stats pipeline", () => {
  const normalized = {
    arAcademy: {
      modules: {
        opened: {
          "/blog-on-photography/what-is-exposure-in-photography": {},
          "/blog-on-photography/what-is-aperture-in-photography": {},
          "/blog-on-photography/what-is-shutter-speed": {},
        },
      },
    },
  };
  const engagement = {
    distinctActiveDaysFirst14d: 3,
    hasConverted: false,
    appliedLearningOpened: 2,
    practicePacksOpened: 1,
    distinctActiveMonthsAllTime: 1,
    pdfAssignmentsOpened: 1,
  };
  const examData = {
    tracks: {
      foundation: {
        modules: [
          { moduleId: "module-01-exposure", status: "passed" },
          { moduleId: "module-02-aperture", status: "passed" },
          { moduleId: "module-03-shutter", status: "passed" },
        ],
      },
      composition_creative: {
        modules: [{ moduleId: "c2-01-composition-rules", status: "passed" }],
      },
    },
  };
  const view = gateView.buildAcademyBadgeView(normalized, engagement, examData, { modulesTotal: 60 });
  assert.equal(view.stats.module01Opened, true);
  assert.equal(view.stats.compositionExamsPassed, 1);
  assert.equal(view.examInfo.examsPassed, 3);
  assert.equal(view.progress.nextKey, "practitioner");
  assert.ok(view.progress.pct > 0);
});
