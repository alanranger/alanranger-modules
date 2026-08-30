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

test("a stage that has never logged a run says so, not 'cron did not run'", () => {
  const row = classifyWatchdogRow({
    eligible: null,
    loggedSent: 0,
    gmailFound: 0,
    gmailOk: true,
    lastRun: null,
    nowMs: now,
  });
  assert.equal(row.state, "not_firing");
  assert.match(row.detail, /no heartbeat yet/);
  assert.doesNotMatch(row.detail, /auth_ok=false/, "must not echo a deleted seed's reason");
});

test("a stale run row still reports the cron as not having run recently", () => {
  const row = classifyWatchdogRow({
    eligible: 0,
    loggedSent: 0,
    gmailFound: 0,
    gmailOk: true,
    lastRun: { run_at: "2026-08-20T08:00:00Z", auth_ok: true, members_evaluated: 0 },
    nowMs: now,
  });
  assert.equal(row.state, "not_firing");
  assert.match(row.detail, /no fresh auth_ok heartbeat/);
  assert.doesNotMatch(row.detail, /never logged/, "stale is not the same as never ran");
});

test("formatWatchdogEmail renders an HTML table with a row per stage", () => {
  const { html, text } = formatWatchdogEmail({
    generatedAt: "2026-08-30T05:30:00Z",
    gmailNote: "Gmail Sent lookup: ok (0 logged recipient(s) checked)",
    rows: [
      {
        key: "paid-quiet",
        label: "Paid · quiet 30–44d",
        eligible: 2,
        loggedSent: 0,
        gmailFound: 0,
        gmailOk: true,
        state: "healthy_idle",
        firingLabel: "⚪ Healthy idle",
        detail: "cron ran (auth_ok=true), nobody qualified",
      },
      {
        key: "paid-renewal-soon",
        label: "Paid · renewal 14d",
        eligible: null,
        loggedSent: 0,
        gmailFound: 0,
        gmailOk: true,
        state: "not_firing",
        firingLabel: "🔴 NOT FIRING",
        detail: "no heartbeat yet — this stage has never logged a cron run",
      },
    ],
  });
  assert.match(html, /<table/, "must be a real table for Outlook");
  assert.equal((html.match(/<tr>/g) || []).length, 3, "header + 2 stage rows");
  assert.match(html, /Eligible today/);
  assert.match(html, /Gmail-verified/);
  assert.match(html, /Paid · renewal 14d/);
  assert.match(html, /no heartbeat yet/);
  assert.match(html, /#fdecea/, "NOT FIRING cell is colour-coded");
  assert.match(html, /Generated: 2026-08-30T05:30:00Z/);
  assert.ok(text.includes("Paid · renewal 14d"), "plain-text fallback retained");
});

test("formatWatchdogEmail shows n/a rather than a fake zero when Gmail lookup failed", () => {
  const { html } = formatWatchdogEmail({
    generatedAt: "2026-08-30T05:30:00Z",
    gmailNote: "⚠ monitor could NOT verify source Gmail Sent",
    rows: [
      {
        key: "paid-quiet",
        label: "Paid · quiet 30–44d",
        eligible: null,
        loggedSent: 3,
        gmailFound: 0,
        gmailOk: false,
        state: "unverified",
        firingLabel: "⚠ monitor could NOT verify",
        detail: "⚠ monitor could NOT verify source Gmail Sent",
      },
    ],
  });
  assert.match(html, /⚠ n\/a/);
  assert.match(html, /#fff8e1/, "unverified is amber, never green");
});

test("formatWatchdogEmail escapes HTML in stage detail text", () => {
  const { html } = formatWatchdogEmail({
    generatedAt: "2026-08-30T05:30:00Z",
    gmailNote: "ok",
    rows: [
      {
        key: "x",
        label: "Stage <script>alert(1)</script>",
        eligible: 0,
        loggedSent: 0,
        gmailFound: 0,
        gmailOk: true,
        state: "healthy_idle",
        firingLabel: "⚪ Healthy idle",
        detail: 'detail & "quoted"',
      },
    ],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /detail &amp; &quot;quoted&quot;/);
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
