import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { firingStateForStage, shouldSendTriggeredEmail } = require("../lib/emailCronHeartbeat.js");
const { LOGIN_EVENT_TYPES } = require("../lib/member-email-snapshot.js");

const now = Date.parse("2026-08-29T12:00:00Z");

test("not_firing when no heartbeat", () => {
  assert.equal(firingStateForStage({ sentLast7d: 0, lastRun: null, nowMs: now }), "not_firing");
});

test("not_firing when auth failed even if old sends exist", () => {
  assert.equal(
    firingStateForStage({
      sentLast7d: 5,
      lastRun: { run_at: "2026-08-29T08:00:00Z", auth_ok: false },
      nowMs: now,
    }),
    "not_firing"
  );
});

test("verified sending from real events even before first heartbeat", () => {
  assert.equal(
    firingStateForStage({ sentLast7d: 3, lastRun: null, nowMs: now }),
    "verified_sending"
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

test("login snapshot treats member_login as a login", () => {
  assert.deepEqual(LOGIN_EVENT_TYPES, ["login", "member_login"]);
});

test("forceSend with secret auth bypasses the London hour gate", () => {
  assert.equal(
    shouldSendTriggeredEmail({
      testEmail: null,
      sendEmail: true,
      forceSend: true,
      authOk: true,
      londonHour: 13,
    }),
    true
  );
});

test("forceSend without secret auth does not bypass the gate", () => {
  assert.equal(
    shouldSendTriggeredEmail({
      testEmail: null,
      sendEmail: true,
      forceSend: true,
      authOk: false,
      londonHour: 13,
    }),
    false
  );
});

test("bulk sendEmail stays gated to London 09:00", () => {
  assert.equal(
    shouldSendTriggeredEmail({
      testEmail: null,
      sendEmail: true,
      forceSend: false,
      authOk: true,
      londonHour: 13,
    }),
    false
  );
  assert.equal(
    shouldSendTriggeredEmail({
      testEmail: null,
      sendEmail: true,
      forceSend: false,
      authOk: true,
      londonHour: 9,
    }),
    true
  );
});
