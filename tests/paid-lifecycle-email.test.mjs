/**
 * Paid lifecycle email copy + admin exam tally helpers.
 * Run: node --test tests/paid-lifecycle-email.test.mjs
 */
import { createRequire } from "module";
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const paidEmail = require(path.join(root, "lib/paid-lifecycle-email.js"));
const adminStats = require(path.join(root, "lib/admin-gate-stats.js"));
const gateView = require(path.join(root, "lib/academy-client-gate-view.js"));
const {
  PRACTITIONER_GATE,
  CERTIFIED_GATE,
  FOUNDATION_GATE,
} = require(path.join(root, "lib/academy-badge-gates.js"));

test("countsFromPassedRows splits foundation vs composition exams", () => {
  const counts = adminStats.countsFromPassedRows([
    { module_id: "module-01-exposure", passed: true },
    { module_id: "module-02-aperture", passed: true },
    { module_id: "c2-01-composition-rules", passed: true },
  ]);
  assert.equal(counts.foundationExamsPassed, 2);
  assert.equal(counts.compositionExamsPassed, 1);
});

test("buildRemainingActionsList: foundation mentions module 01", () => {
  const breakdown = {
    foundation: {
      module01Opened: false,
      modulesOpened: 0,
      modulesTarget: FOUNDATION_GATE.minModules,
      activeDaysFirst14: 0,
      activeDaysTarget: FOUNDATION_GATE.minActiveDays,
      activeDaysDegraded: false,
    },
  };
  const text = paidEmail.buildRemainingActionsList(breakdown, "foundation");
  assert.match(text, /Module 01/i);
});

test("buildRemainingActionsList: practitioner includes composition exams", () => {
  const breakdown = {
    practitioner: {
      cameraOpened: PRACTITIONER_GATE.minCameraModules,
      cameraTarget: PRACTITIONER_GATE.minCameraModules,
      compositionOpened: PRACTITIONER_GATE.minCompositionModules,
      compositionTarget: PRACTITIONER_GATE.minCompositionModules,
      pdfAssignmentsOpened: PRACTITIONER_GATE.minPdfAssignments,
      pdfAssignmentsTarget: PRACTITIONER_GATE.minPdfAssignments,
      examsPassed: PRACTITIONER_GATE.minFoundationExamsPassed,
      examsPassedTarget: PRACTITIONER_GATE.minFoundationExamsPassed,
      compositionExamsPassed: 0,
      compositionExamsPassedTarget: PRACTITIONER_GATE.minCompositionExamsPassed,
    },
  };
  const text = paidEmail.buildRemainingActionsList(breakdown, "practitioner");
  assert.match(text, /composition exam/i);
});

test("buildRemainingActionsList: certified uses gate targets not hardcoded 15-only", () => {
  const breakdown = {
    certified: {
      requiresConversion: true,
      examsPassed: 10,
      examsPassedTarget: CERTIFIED_GATE.minFoundationExamsPassed,
      compositionExamsPassed: 2,
      compositionExamsPassedTarget: CERTIFIED_GATE.minCompositionExamsPassed,
      cameraOpened: 5,
      cameraTarget: 15,
      compositionOpened: 3,
      compositionTarget: 10,
      assignmentsAndPacksPool: 1,
      assignmentsAndPacksPoolTarget: CERTIFIED_GATE.minAssignmentsAndPacksPool,
      appliedLearningOpened: 0,
      appliedLearningTarget: CERTIFIED_GATE.minAppliedLearning,
    },
  };
  const text = paidEmail.buildRemainingActionsList(breakdown, "certified");
  assert.match(text, /paid membership conversion/i);
  assert.match(text, /foundation exam/i);
  assert.match(text, /composition exam/i);
  assert.doesNotMatch(text, /of 15 done\)$/);
});

test("countAppliedLearningOpenedFromJson caps at 40", () => {
  const opened = {};
  for (let i = 0; i < 45; i += 1) opened[`/path/${i}`] = {};
  const count = gateView.buildAcademyBadgeView(
    { arAcademy: { appliedLearning: { opened }, modules: { opened: {} } } },
    null,
    null
  );
  assert.ok(count.stats.appliedLearningOpened <= 40);
});
