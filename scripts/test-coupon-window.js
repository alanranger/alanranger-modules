/* scripts/test-coupon-window.js
 *
 * Regression guard for the SAVE20 grace-period logic. For each scenario
 * we seed a scratch row in academy_trial_history (via the protected
 * /api/admin/qa-seed-trial endpoint so the test doesn't need local
 * Supabase creds), then verify:
 *
 *   1) GET  /api/academy/trial-status           → couponEligible matches
 *   2) POST /api/stripe/create-upgrade-checkout → couponApplied matches
 *   3) The resulting Stripe Checkout Session amount_total is £79 or £59
 *
 * Every test creates a Stripe session; we retrieve each one, assert on
 * amount_total, then expire it so nothing is left dangling. Any scratch
 * Stripe customer created by email is deleted at the end.
 *
 * Usage: node scripts/test-coupon-window.js
 *
 * Required env (from .env.local):
 *   STRIPE_SECRET_KEY, AR_ANALYTICS_KEY
 * Optional:
 *   QA_API_BASE (defaults to https://alanranger-modules.vercel.app)
 */
"use strict";
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env.local") });
const Stripe = require("stripe");

const API_BASE = process.env.QA_API_BASE || "https://alanranger-modules.vercel.app";
const SCRATCH_MEMBER_ID = "mem_qa_coupon_window_test";
const SCRATCH_EMAIL = "qa+coupon-window@alanranger.com";
const PRICE_FULL_MINOR = 7900;
const PRICE_DISCOUNTED_MINOR = 5900;

const SCENARIOS = [
  { label: "Active trial, 5 days to go",   offsetDays: 5,   expectCoupon: false, expectAmount: PRICE_FULL_MINOR },
  { label: "Just expired (day 0)",         offsetDays: 0,   expectCoupon: true,  expectAmount: PRICE_DISCOUNTED_MINOR },
  { label: "5 days expired",               offsetDays: -5,  expectCoupon: true,  expectAmount: PRICE_DISCOUNTED_MINOR },
  { label: "Boundary: 7 days expired",     offsetDays: -7,  expectCoupon: true,  expectAmount: PRICE_DISCOUNTED_MINOR },
  { label: "Just past window: 8 days",     offsetDays: -8,  expectCoupon: false, expectAmount: PRICE_FULL_MINOR },
  { label: "Long past: 30 days expired",   offsetDays: -30, expectCoupon: false, expectAmount: PRICE_FULL_MINOR },
  { label: "Already converted",            offsetDays: -3,  converted: true, expectCoupon: false, expectAmount: PRICE_FULL_MINOR },
];

function authHeaders() {
  return { "x-ar-analytics-key": process.env.AR_ANALYTICS_KEY, "Content-Type": "application/json" };
}

async function seedTrial(scenario) {
  const res = await fetch(`${API_BASE}/api/admin/qa-seed-trial`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      memberId: SCRATCH_MEMBER_ID,
      offsetDays: scenario.offsetDays,
      converted: Boolean(scenario.converted),
      trialLengthDays: 14,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`seed HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function wipeTrial() {
  await fetch(`${API_BASE}/api/admin/qa-seed-trial?memberId=${encodeURIComponent(SCRATCH_MEMBER_ID)}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).catch(() => {});
}

async function fetchTrialStatus() {
  const url = `${API_BASE}/api/academy/trial-status?memberId=${encodeURIComponent(SCRATCH_MEMBER_ID)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`trial-status HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function createCheckout() {
  const res = await fetch(`${API_BASE}/api/stripe/create-upgrade-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId: SCRATCH_MEMBER_ID, email: SCRATCH_EMAIL, name: "QA Scratch" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`checkout HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function extractSessionId(url) {
  if (!url) return null;
  const m = /\/(cs_(?:test|live)_[A-Za-z0-9]+)/.exec(url);
  return m ? m[1] : null;
}

async function verifyAndExpireSession(stripe, sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.status === "open") {
    await stripe.checkout.sessions.expire(sessionId).catch(() => {});
  }
  return session;
}

function fmtAssert(label, actual, expected) {
  const ok = actual === expected;
  const marker = ok ? "PASS" : "FAIL";
  console.log(`  [${marker}] ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  return ok;
}

async function runScenario(stripe, scenario) {
  console.log("");
  console.log("== " + scenario.label);
  const seeded = await seedTrial(scenario);
  console.log("  trial_end_at seeded:", seeded.endAt, scenario.converted ? "(converted_at set)" : "");

  const status = await fetchTrialStatus();
  const okStatus = fmtAssert("trial-status.couponEligible", !!status.couponEligible, scenario.expectCoupon);

  const checkout = await createCheckout();
  const sessionId = extractSessionId(checkout.url);
  const okApplied = fmtAssert("checkout.couponApplied", !!checkout.couponApplied, scenario.expectCoupon);

  let okAmount = false;
  if (sessionId) {
    const session = await verifyAndExpireSession(stripe, sessionId);
    okAmount = fmtAssert("stripe session.amount_total", session.amount_total, scenario.expectAmount);
  } else {
    console.log("  [FAIL] could not parse session id from", checkout.url);
  }
  return okStatus && okApplied && okAmount;
}

async function cleanupScratchCustomers(stripe) {
  const list = await stripe.customers.list({ email: SCRATCH_EMAIL, limit: 20 });
  for (const c of list.data) {
    await stripe.customers.del(c.id).catch(() => {});
    console.log("  deleted scratch customer", c.id);
  }
}

function ensureEnv() {
  const missing = ["STRIPE_SECRET_KEY", "AR_ANALYTICS_KEY"].filter(k => !process.env[k]);
  if (missing.length) {
    console.error("Missing env:", missing.join(", "));
    process.exit(1);
  }
}

(async () => {
  ensureEnv();
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  console.log("SAVE20 grace-window regression test");
  console.log("API base:        ", API_BASE);
  console.log("Scratch member:  ", SCRATCH_MEMBER_ID);
  console.log("Scratch email:   ", SCRATCH_EMAIL);

  const results = [];
  try {
    for (const s of SCENARIOS) {
      let ok = false;
      try { ok = await runScenario(stripe, s); }
      catch (e) { console.error("  EXCEPTION:", e.message); ok = false; }
      results.push({ label: s.label, ok });
    }
  } finally {
    console.log("");
    console.log("Cleanup:");
    await wipeTrial();
    console.log("  scratch trial row deleted");
    await cleanupScratchCustomers(stripe);
  }

  console.log("");
  console.log("Summary:");
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.label}`);
  const allOk = results.every(r => r.ok);
  console.log("");
  console.log(allOk ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
