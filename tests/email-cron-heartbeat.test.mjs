import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { firingStateForStage } = require("../lib/emailCronHeartbeat.js");

const now = Date.parse("2026-08-29T12:00:00Z");

test("not_firing when no heartbeat", () => {
  assert.equal(firingStateForStage({ sentLast7d: 0, lastRun: null, nowMs: now }), "not_firing");
});

test("not_firing when auth failed", () => {
  assert.equal(
    firingStateForStage({
      sentLast7d: 5,
      lastRun: { run_at: "2026-08-29T08:00:00Z", auth_ok: false },
      nowMs: now,
    }),
    "not_firing"
  );
});

test("healthy idle when cron ran and nobody eligible", () => {
  assert.equal(
    firingStateForStage({
      sentLast7d: 0,
      lastRun: { run_at: "2026-08-29T08:00:00Z", auth_ok: true },
      nowMs: now,
    }),
    "healthy_idle"
  );
});

test("verified sending when heartbeat ok and real sends", () => {
  assert.equal(
    firingStateForStage({
      sentLast7d: 2,
      lastRun: { run_at: "2026-08-29T08:00:00Z", auth_ok: true },
      nowMs: now,
    }),
    "verified_sending"
  );
});
