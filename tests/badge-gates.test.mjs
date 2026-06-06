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

const {
  CAMERA_MODULE_PATHS,
  COMPOSITION_MODULE_PATHS,
  GRADUATE_TARGETS,
  MASTER_TARGETS,
  KEEPALIVE_DECAY_DAYS,
  JOURNEY_STAGES,
  evaluateBadges,
  computeLongevityPoints,
  getCurrentStage,
} = gates;

const DAY_MS = 86400000;

function fixtureStats(overrides) {
  return {
    foundationModulesOpened: 0,
    cameraOpened: 0,
    compositionOpened: 0,
    pdfAssignmentsOpened: 0,
    totalModulesOpened: 0,
    examsPassed: 0,
    appliedLearningOpened: null,
    practicePacksOpened: null,
    distinctActiveMonthsAllTime: null,
    ...overrides,
  };
}

function certifiedFloorStats(overrides) {
  return fixtureStats({
    foundationModulesOpened: 30,
    cameraOpened: CAMERA_MODULE_PATHS.length,
    compositionOpened: COMPOSITION_MODULE_PATHS.length,
    pdfAssignmentsOpened: 3,
    totalModulesOpened: 30,
    examsPassed: 15,
    ...overrides,
  });
}

function graduateCountsStats(overrides) {
  return certifiedFloorStats({
    pdfAssignmentsOpened: GRADUATE_TARGETS.pdfAssignments,
    appliedLearningOpened: GRADUATE_TARGETS.appliedLearning,
    practicePacksOpened: GRADUATE_TARGETS.practicePacks,
    distinctActiveMonthsAllTime: GRADUATE_TARGETS.activeMonths,
    ...overrides,
  });
}

function masterCountsStats(overrides) {
  return certifiedFloorStats({
    pdfAssignmentsOpened: MASTER_TARGETS.pdfAssignments,
    appliedLearningOpened: MASTER_TARGETS.appliedLearning,
    practicePacksOpened: MASTER_TARGETS.practicePacks,
    distinctActiveMonthsAllTime: MASTER_TARGETS.activeMonths,
    ...overrides,
  });
}

function paidContext(lastActivityAt) {
  return { hasConverted: true, lastActivityAt: lastActivityAt || new Date().toISOString() };
}

test("1. brand new: Enrolled only, target Foundation", () => {
  const result = evaluateBadges(fixtureStats(), 0, false);
  assert.equal(result.earned.enrolled, true);
  assert.equal(result.earned.foundation, false);
  assert.equal(result.highestConsecutive, "enrolled");
  assert.equal(result.target, "foundation");
  assert.equal(result.earnedCount, 1);
});

test("2. Foundation gate met: Foundation earned, target Practitioner", () => {
  const result = evaluateBadges(fixtureStats({ foundationModulesOpened: 3 }), 3, false);
  assert.equal(result.earned.foundation, true);
  assert.equal(result.earned.practitioner, false);
  assert.equal(result.highestConsecutive, "foundation");
  assert.equal(result.target, "practitioner");
});

test("3. 15 camera only: Practitioner proximity 1 of 4", () => {
  const result = evaluateBadges(
    fixtureStats({
      foundationModulesOpened: 15,
      cameraOpened: CAMERA_MODULE_PATHS.length,
      examsPassed: 3,
    }),
    5,
    false
  );
  assert.equal(result.earned.foundation, true);
  assert.equal(result.earned.practitioner, false);
  assert.deepEqual(result.practitionerProximity, { met: 1, total: 4 });
  assert.equal(result.target, "practitioner");
});

test("4. full Practitioner gate: Practitioner earned", () => {
  const result = evaluateBadges(
    fixtureStats({
      foundationModulesOpened: 20,
      cameraOpened: CAMERA_MODULE_PATHS.length,
      compositionOpened: COMPOSITION_MODULE_PATHS.length,
      pdfAssignmentsOpened: 3,
      examsPassed: 8,
    }),
    10,
    false
  );
  assert.equal(result.earned.foundation, true);
  assert.equal(result.earned.practitioner, true);
  assert.equal(result.highestConsecutive, "practitioner");
});

test("5. Certified floor with prerequisites: Certified earned", () => {
  const result = evaluateBadges(certifiedFloorStats(), 10, false);
  assert.equal(result.earned.practitioner, true);
  assert.equal(result.earned.certified, true);
  assert.equal(result.highestConsecutive, "certified");
});

test("6. prerequisite order: high modules/exams but 1 active day -> Enrolled only", () => {
  const result = evaluateBadges(
    fixtureStats({
      foundationModulesOpened: 60,
      cameraOpened: CAMERA_MODULE_PATHS.length,
      compositionOpened: COMPOSITION_MODULE_PATHS.length,
      pdfAssignmentsOpened: 3,
      totalModulesOpened: 60,
      examsPassed: 15,
    }),
    1,
    false
  );
  assert.equal(result.earned.enrolled, true);
  assert.equal(result.earned.foundation, false);
  assert.equal(result.earned.practitioner, false);
  assert.equal(result.earned.certified, false);
  assert.equal(result.earned.graduate, false);
  assert.equal(result.earned.master, false);
  assert.equal(result.highestConsecutive, "enrolled");
  assert.equal(result.earnedCount, 1);
  assert.equal(result.target, "foundation");
});

test("7. Certified met without longevity: Graduate/Master stay unearned", () => {
  const result = evaluateBadges(certifiedFloorStats(), 5, false, paidContext());
  assert.equal(result.earned.certified, true);
  assert.equal(result.earned.graduate, false);
  assert.equal(result.earned.master, false);
  assert.equal(result.target, "graduate");
});

test("8. null/missing stats: safe fallback", () => {
  assert.doesNotThrow(() => evaluateBadges(null, undefined, undefined));
  const result = evaluateBadges(null, undefined, undefined);
  assert.equal(result.earned.enrolled, true);
  assert.equal(result.earned.foundation, false);
  assert.equal(result.earnedCount, 1);
});

test("9. Graduate counts + paid: Graduate earned, Master not", () => {
  const stats = graduateCountsStats();
  assert.equal(computeLongevityPoints(stats), 98);
  const result = evaluateBadges(stats, 10, false, paidContext());
  assert.equal(result.earned.certified, true);
  assert.equal(result.earned.graduate, true);
  assert.equal(result.earned.master, false);
  assert.equal(result.target, "master");
});

test("10. Master counts + paid: Master earned", () => {
  const stats = masterCountsStats();
  assert.equal(computeLongevityPoints(stats), 163);
  const result = evaluateBadges(stats, 10, false, paidContext());
  assert.equal(result.earned.graduate, true);
  assert.equal(result.earned.master, true);
  assert.equal(result.highestConsecutive, "master");
});

test("11. counts met but NOT paid: neither Graduate nor Master", () => {
  const result = evaluateBadges(masterCountsStats(), 10, false, { hasConverted: false });
  assert.equal(result.earned.certified, true);
  assert.equal(result.earned.graduate, false);
  assert.equal(result.earned.master, false);
});

test("12. counts met but Certified NOT earned: neither Graduate nor Master", () => {
  const stats = masterCountsStats({
    totalModulesOpened: 20,
    examsPassed: 10,
    pdfAssignmentsOpened: 3,
  });
  const result = evaluateBadges(stats, 10, false, paidContext());
  assert.equal(result.earned.certified, false);
  assert.equal(result.earned.graduate, false);
  assert.equal(result.earned.master, false);
});

test("13. Graduate earned then 60+ days idle: PAUSED not downgraded", () => {
  const stale = new Date(Date.now() - (KEEPALIVE_DECAY_DAYS + 2) * DAY_MS).toISOString();
  const result = evaluateBadges(graduateCountsStats(), 10, false, paidContext(stale));
  assert.equal(result.earned.graduate, true);
  assert.equal(result.paused.graduate, true);
  assert.equal(result.longevityPoints, 98);
});

test("14. null longevity fields: Graduate/Master unearned, longevityDegraded flagged", () => {
  const result = evaluateBadges(certifiedFloorStats(), 10, false, paidContext());
  assert.equal(result.longevityDegraded, true);
  assert.equal(result.earned.graduate, false);
  assert.equal(result.earned.master, false);
  assert.equal(result.longevityPoints, null);
});

test("15. badge objects carry display fields (colour/stars/iconClass) for rail + banner", () => {
  const result = evaluateBadges(masterCountsStats(), 10, false, paidContext());
  result.badges.forEach((badge) => {
    const stage = JOURNEY_STAGES.filter((s) => s.key === badge.key)[0];
    assert.equal(badge.colour, stage.colour);
    assert.equal(badge.stars, stage.stars);
    assert.equal(badge.iconClass, stage.iconClass);
    assert.equal(badge.sublabel, stage.sublabel);
  });
  const master = result.badges.filter((b) => b.key === "master")[0];
  assert.equal(master.colour, "gold");
  assert.equal(master.stars, 5);
  assert.equal(master.iconClass, "ti-trophy");
  const expectedStars = { enrolled: 0, foundation: 1, practitioner: 2, certified: 3, graduate: 4, master: 5 };
  result.badges.forEach((badge) => {
    assert.equal(badge.stars, expectedStars[badge.key]);
  });
});

test("16. getCurrentStage carries display fields for banner current-stage badge", () => {
  const result = evaluateBadges(masterCountsStats(), 10, false, paidContext());
  const current = getCurrentStage(result.badges);
  assert.equal(current.key, "master");
  assert.equal(current.colour, "gold");
  assert.equal(current.stars, 5);
  assert.equal(current.iconClass, "ti-trophy");
  assert.equal(current.levelIndex, 6);
  assert.equal(current.paused, false);
});

test("17. getCurrentStage carries paused when summit badge is idle 60+ days", () => {
  const stale = new Date(Date.now() - (KEEPALIVE_DECAY_DAYS + 2) * DAY_MS).toISOString();
  const result = evaluateBadges(masterCountsStats(), 10, false, paidContext(stale));
  const current = getCurrentStage(result.badges);
  assert.equal(current.key, "master");
  assert.equal(current.colour, "gold");
  assert.equal(current.paused, true);
});
