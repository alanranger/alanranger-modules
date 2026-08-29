import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  classifyWatchdogRow,
  bannerForRows,
  formatWatchdogEmail,
  latestUsefulCronRun,
} = require("../lib/emailHealthWatchdog.js");
const { countFoundFor, collectEnvelopeEmails } = require("../lib/gmailSentVerify.js");

const now = Date.parse("2026-08-29T12:30:00Z");
const freshRun = { run_at: "2026-08-29T08:00:00Z", auth_ok: true, members_evaluated: 0 };

test("verified when events and Gmail agree and sends > 0", () => {
  const row = classifyWatchdogRow({
    eligible: 2,
    loggedSent: 2,
    gmailFound: 2,
    gmailOk: true,
    lastRun: { ...freshRun, members_evaluated: 2 },
    nowMs: now,
  });
  assert.equal(row.state, "verified");
});

test("healthy idle when cron ok and nobody qualified", () => {
  const row = classifyWatchdogRow({
    eligible: 0,
    loggedSent: 0,
    gmailFound: 0,
    gmailOk: true,
    lastRun: freshRun,
    nowMs: now,
  });
  assert.equal(row.state, "healthy_idle");
});

test("NOT FIRING when last cron auth_ok is false", () => {
  const row = classifyWatchdogRow({
    eligible: 0,
    loggedSent: 0,
    gmailFound: 0,
    gmailOk: true,
    lastRun: { run_at: "2026-08-29T11:52:00Z", auth_ok: false, error: "seeded-auth-fail-demo" },
    nowMs: now,
  });
  assert.equal(row.state, "not_firing");
  assert.match(row.detail, /auth_ok=false/);
});

test("NOT FIRING when Gmail count disagrees with logged sends", () => {
  const row = classifyWatchdogRow({
    eligible: 4,
    loggedSent: 4,
    gmailFound: 2,
    gmailOk: true,
    lastRun: freshRun,
    nowMs: now,
  });
  assert.equal(row.state, "not_firing");
  assert.match(row.detail, /logged 4 sent, only 2 found in Gmail Sent/);
});

test("unverified when Gmail lookup fails — never all-clear", () => {
  const row = classifyWatchdogRow({
    eligible: 0,
    loggedSent: 0,
    gmailFound: 0,
    gmailOk: false,
    lastRun: freshRun,
    nowMs: now,
  });
  assert.equal(row.state, "unverified");
  assert.match(row.detail, /Gmail Sent/);
});

test("rewind candidate pool on a batch dry-run is idle, not a missed send", () => {
  const row = classifyWatchdogRow({
    eligible: 42,
    loggedSent: 0,
    gmailFound: 0,
    gmailOk: true,
    lastRun: {
      run_at: "2026-08-29T12:40:00Z",
      auth_ok: true,
      members_evaluated: 42,
      trigger_source: "batch",
      webhook: "lapsed-trial-reengagement-webhook",
    },
    nowMs: now,
  });
  assert.equal(row.state, "healthy_idle");
});

test("banner lists stages that need attention", () => {
  const banner = bannerForRows([
    { key: "paid-quiet", state: "verified" },
    { key: "paid-renewal-soon", state: "not_firing" },
  ]);
  assert.match(banner, /1 stages need attention: paid-renewal-soon/);
});

test("formatWatchdogEmail subject flags attention", () => {
  const { subject, text } = formatWatchdogEmail({
    generatedAt: "2026-08-29T12:30:00Z",
    gmailNote: "Gmail Sent lookup: ok",
    rows: [
      {
        key: "paid-renewal-soon",
        label: "Paid · renewal 14d",
        eligible: 0,
        loggedSent: 0,
        gmailFound: 0,
        gmailOk: true,
        state: "not_firing",
        firingLabel: "🔴 NOT FIRING",
        detail: "last cron auth_ok=false",
      },
    ],
  });
  assert.match(subject, /need attention/);
  assert.match(text, /auth_ok=false/);
});

test("latestUsefulCronRun skips London-hour gate rows", () => {
  const picked = latestUsefulCronRun([
    { run_at: "10:00", auth_ok: true, error: "gate:outside London 09:00" },
    { run_at: "09:00", auth_ok: true, error: null, members_evaluated: 2 },
  ]);
  assert.equal(picked.members_evaluated, 2);
});

test("countFoundFor counts unique recipients present in Sent", () => {
  const n = countFoundFor(["a@x.com", "a@x.com", "b@x.com"], { "a@x.com": 3, "b@x.com": 0 });
  assert.equal(n, 1);
});

test("collectEnvelopeEmails reads to and bcc", () => {
  const emails = collectEnvelopeEmails({
    to: [{ mailbox: "mem", host: "ex.com" }],
    bcc: [{ mailbox: "info", host: "alanranger.com" }],
  });
  assert.deepEqual(emails, ["mem@ex.com", "info@alanranger.com"]);
});
