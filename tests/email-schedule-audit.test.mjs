/**
 * Fail CI if any cronEnabled stage lacks a matching vercel.json cron path.
 * Run: node --test tests/email-schedule-audit.test.mjs
 */
import { createRequire } from "module";
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { auditAllStages, unscheduledCronEnabledStages } = require(
  path.join(root, "lib/emailScheduleAudit.js")
);
const rootVercel = require(path.join(root, "vercel.json"));
const modulesVercel = require(path.join(root, "alanranger-modules/vercel.json"));

function assertFullyScheduled(label, vercelJson) {
  const gaps = unscheduledCronEnabledStages(vercelJson);
  assert.equal(
    gaps.length,
    0,
    `${label}: cronEnabled stages missing vercel cron:\n${gaps.map((g) => `  - ${g.key} (${g.sentBy}) missing ${(g.missing || []).join(", ")}`).join("\n")}`
  );
}

test("root vercel.json schedules every cronEnabled email stage", () => {
  assertFullyScheduled("root", rootVercel);
});

test("alanranger-modules vercel.json schedules every cronEnabled email stage", () => {
  assertFullyScheduled("alanranger-modules", modulesVercel);
});

test("auditAllStages covers all 18 defined stages", () => {
  const rows = auditAllStages(rootVercel);
  assert.equal(rows.length, 18);
  const scheduled = rows.filter((r) => r.scheduled);
  assert.equal(scheduled.length, 16, "16 enabled cron stages should be scheduled");
});
