/**
 * Badge gate fixture tests (pure logic, no live accounts).
 * Run: npm run test:gates
 *
 * Fixtures (update when gate thresholds change):
 * 1. Brand new member -> Enrolled only, target Foundation
 * 2. Foundation gate met -> Foundation earned, target Practitioner
 * 3. 15 camera only -> Practitioner proximity 1 of 4 (regression lock)
 * 4. Full Practitioner gate -> Practitioner earned
 * 5. Certified floor with prerequisites -> Certified earned
 * 6. Prerequisite order: 60 modules + 15 exams but 1 active day -> Enrolled only
 * 7. Certified met, Graduate/Master placeholders -> no crash, unearned
 * 8. Null/missing stats -> safe fallback, no throw
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
  evaluateBadges,
} = gates;

function fixtureStats(overrides) {
  return {
    foundationModulesOpened: 0,
    cameraOpened: 0,
    compositionOpened: 0,
    pdfAssignmentsOpened: 0,
    totalModulesOpened: 0,
    examsPassed: 0,
    ...overrides,
  };
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
  const result = evaluateBadges(
    fixtureStats({
      foundationModulesOpened: 30,
      cameraOpened: CAMERA_MODULE_PATHS.length,
      compositionOpened: COMPOSITION_MODULE_PATHS.length,
      pdfAssignmentsOpened: 3,
      totalModulesOpened: 30,
      examsPassed: 15,
    }),
    10,
    false
  );
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

test("7. Certified met: Graduate/Master placeholders stay unearned", () => {
  const result = evaluateBadges(
    fixtureStats({
      foundationModulesOpened: 30,
      cameraOpened: CAMERA_MODULE_PATHS.length,
      compositionOpened: COMPOSITION_MODULE_PATHS.length,
      pdfAssignmentsOpened: 3,
      totalModulesOpened: 30,
      examsPassed: 15,
    }),
    5,
    false
  );
  assert.equal(result.earned.certified, true);
  assert.equal(result.earned.graduate, false);
  assert.equal(result.earned.master, false);
});

test("8. null/missing stats: safe fallback", () => {
  assert.doesNotThrow(() => evaluateBadges(null, undefined, undefined));
  const result = evaluateBadges(null, undefined, undefined);
  assert.equal(result.earned.enrolled, true);
  assert.equal(result.earned.foundation, false);
  assert.equal(result.earnedCount, 1);
});
