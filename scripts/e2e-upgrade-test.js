/* scripts/e2e-upgrade-test.js
 *
 * Ongoing end-to-end test harness for the expired-trial → SAVE20 → Stripe
 * → Memberstack → Supabase upgrade flow, pinned to the reusable test
 * account marketing@alanranger.com.
 *
 * ┌─ Usage ──────────────────────────────────────────────────────────────┐
 * │  node scripts/e2e-upgrade-test.js           show status + instructions│
 * │  node scripts/e2e-upgrade-test.js status    show state of all 3 systems│
 * │  node scripts/e2e-upgrade-test.js reset     refund any live sub,       │
 * │                                             cancel it, reset Supabase │
 * │                                             to 1-day-expired + grace  │
 * │  node scripts/e2e-upgrade-test.js verify    verify latest checkout    │
 * │                                             session end-to-end        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Typical cycle:
 *   1) `node scripts/e2e-upgrade-test.js reset`
 *      → Account is now 1 day into the 7-day grace window, no active
 *        subscription, coupon eligible.
 *   2) Log in as marketing@alanranger.com on www.alanranger.com
 *      → Locked dashboard + upgrade modal shows SAVE20 pill, click
 *        "Upgrade to Academy Annual", pay £59 with SAVE20 auto-applied.
 *   3) `node scripts/e2e-upgrade-test.js verify`
 *      → Confirms Stripe charge, Supabase converted_at, Memberstack plan.
 *   4) `node scripts/e2e-upgrade-test.js reset`
 *      → Refunds + cancels + returns the account to step-1 state so the
 *        next person can run the same test.
 *
 * Required env (from .env.local):
 *   STRIPE_SECRET_KEY, MEMBERSTACK_SECRET_KEY, SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY.
 *
 * Test account is hard-coded at the top. Override with --member and
 * --email flags for ad-hoc runs against a different account.
 */
"use strict";
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env.local"), override: true });

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const DAY_MS = 86400000;
const DEFAULT_MEMBER_ID = "mem_cmnmycye827od0so41xvx4bdf";
const DEFAULT_EMAIL = "marketing@alanranger.com";
const ANNUAL_PLAN_ID = "pln_academy-annual-membership-h57x0h8g";
const API_BASE = "https://alanranger-modules.vercel.app";
const DASHBOARD_URL = "https://www.alanranger.com/academy/dashboard";

function line(ch) { console.log((ch || "-").repeat(64)); }
function header(t) { console.log("\n" + t); line(); }

function parseArgs(argv) {
  const args = { cmd: argv[2] || "help", memberId: DEFAULT_MEMBER_ID, email: DEFAULT_EMAIL };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--member=")) args.memberId = a.slice("--member=".length);
    else if (a.startsWith("--email=")) args.email = a.slice("--email=".length);
  }
  return args;
}

function getStripe() { return Stripe(process.env.STRIPE_SECRET_KEY); }
function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function ensureEnv() {
  const missing = ["STRIPE_SECRET_KEY", "MEMBERSTACK_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error("Missing env in .env.local:", missing.join(", "));
    process.exit(1);
  }
}

/* ───────────── Memberstack helpers ───────────── */

async function fetchMemberstackMember(memberId) {
  const res = await fetch(`https://admin.memberstack.com/members/${memberId}`, {
    headers: { "X-API-KEY": process.env.MEMBERSTACK_SECRET_KEY },
  });
  if (!res.ok) return { httpStatus: res.status, error: await res.text() };
  const body = await res.json();
  return body.data || body;
}

function planConnectionsOf(member) {
  return Array.isArray(member?.planConnections) ? member.planConnections : [];
}

function pickAnnualConnection(member) {
  return planConnectionsOf(member).find(pc => pc.planId === ANNUAL_PLAN_ID) || null;
}

/* ───────────── Stripe helpers ───────────── */

async function findActiveSubscription(stripe, memberId, email) {
  const byMember = await stripe.subscriptions.search({
    query: `status:"active" AND metadata["msMemberId"]:"${memberId}"`,
    limit: 3,
  });
  if (byMember.data.length) return byMember.data[0];
  const customers = await stripe.customers.list({ email, limit: 5 });
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "active", limit: 3 });
    if (subs.data.length) return subs.data[0];
  }
  return null;
}

async function findLatestCheckoutSession(stripe, memberId) {
  const list = await stripe.checkout.sessions.list({ limit: 25 });
  return list.data.find(s => s.metadata && s.metadata.msMemberId === memberId) || null;
}

async function refundChargeForSubscription(stripe, subscription) {
  const invoiceId = subscription.latest_invoice?.id || subscription.latest_invoice;
  const paymentIntent = invoiceId
    ? (await stripe.invoices.retrieve(invoiceId)).payment_intent
    : null;
  if (paymentIntent) {
    return stripe.refunds.create({ payment_intent: paymentIntent, reason: "requested_by_customer" });
  }
  const charges = await stripe.charges.list({ customer: subscription.customer, limit: 10 });
  const target = charges.data.find(c => c.status === "succeeded" && !c.refunded);
  return target
    ? stripe.refunds.create({ charge: target.id, reason: "requested_by_customer" })
    : null;
}

async function refundAndCancelSub(stripe, sub) {
  console.log(`  active sub found: ${sub.id}`);
  const refund = await refundChargeForSubscription(stripe, sub)
    .catch(e => { console.warn("  refund failed:", e.message); return null; });
  if (refund) console.log(`  refund: ${refund.id}  £${(refund.amount / 100).toFixed(2)}  ${refund.status}`);
  else console.log("  refund: (nothing to refund)");
  const cancelled = await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
  console.log(`  subscription canceled: ${cancelled.id} → ${cancelled.status}`);
}

async function waitForMemberstackDetach(memberId) {
  console.log("  waiting for Memberstack to detach annual plan (if present)...");
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const ac = pickAnnualConnection(await fetchMemberstackMember(memberId));
    if (!ac?.active) { console.log(`  Memberstack: annual plan is ${ac ? ac.status : "absent"}`); return; }
  }
  console.log("  Memberstack: still showing active annual plan (may process shortly)");
}

async function expireOpenSessions(stripe, memberId) {
  const list = await stripe.checkout.sessions.list({ limit: 25 });
  const expired = [];
  for (const s of list.data) {
    if (s.status !== "open") continue;
    if (!s.metadata || s.metadata.msMemberId !== memberId) continue;
    await stripe.checkout.sessions.expire(s.id).catch(() => {});
    expired.push(s.id);
  }
  return expired;
}

/* ───────────── Supabase helpers ───────────── */

async function readTrialRow(supabase, memberId) {
  const { data } = await supabase
    .from("academy_trial_history")
    .select("member_id, trial_start_at, trial_end_at, converted_at, source, trial_length_days")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function resetTrialRow(supabase, memberId) {
  const endAt = new Date(Date.now() - 1 * DAY_MS).toISOString();
  const startAt = new Date(Date.now() - 15 * DAY_MS).toISOString();
  await supabase.from("academy_trial_history").delete().eq("member_id", memberId);
  const { error } = await supabase.from("academy_trial_history").insert({
    member_id: memberId,
    trial_start_at: startAt,
    trial_end_at: endAt,
    trial_length_days: 14,
    source: "e2e_test_harness",
    converted_at: null,
  });
  if (error) throw error;
  return { startAt, endAt };
}

async function fetchTrialStatus(memberId) {
  const res = await fetch(`${API_BASE}/api/academy/trial-status?memberId=${encodeURIComponent(memberId)}`);
  if (!res.ok) return null;
  return res.json();
}

/* ───────────── Commands ───────────── */

async function cmdStatus(args) {
  const stripe = getStripe();
  const supabase = getSupabase();

  header(`Test account: ${args.email}  (${args.memberId})`);

  const status = await fetchTrialStatus(args.memberId);
  header("[1] Live trial-status endpoint");
  console.log(JSON.stringify(status, null, 2));

  const row = await readTrialRow(supabase, args.memberId);
  header("[2] Supabase academy_trial_history (latest row)");
  console.log(row ? JSON.stringify(row, null, 2) : "(no row)");

  const sub = await findActiveSubscription(stripe, args.memberId, args.email);
  header("[3] Stripe — active subscription");
  if (sub) console.log(`${sub.id}  status=${sub.status}  customer=${sub.customer}  price=${sub.items.data[0]?.price?.id}`);
  else console.log("(none)");

  const member = await fetchMemberstackMember(args.memberId);
  header("[4] Memberstack — plan connections");
  const pcs = planConnectionsOf(member);
  if (!pcs.length) console.log("(none)");
  pcs.forEach((pc, i) => console.log(`  [${i}] ${pc.planId}  status=${pc.status}  active=${pc.active}  type=${pc.type}`));

  const eligible = status?.isExpiredTrial && status.couponEligible && !status.hasConverted;
  const noAnnual = !pickAnnualConnection(member)?.active;
  const noActiveSub = !sub;
  header("Ready for SAVE20 test?");
  console.log(`  expired & grace eligible: ${eligible ? "YES" : "NO"}`);
  console.log(`  no active annual plan:    ${noAnnual ? "YES" : "NO"}`);
  console.log(`  no active Stripe sub:     ${noActiveSub ? "YES" : "NO"}`);
  const ready = eligible && noAnnual && noActiveSub;
  console.log(`  → ${ready ? "READY" : "NOT READY — run `node scripts/e2e-upgrade-test.js reset`"}`);
}

async function cmdReset(args) {
  const stripe = getStripe();
  const supabase = getSupabase();

  header(`Reset test account: ${args.email}  (${args.memberId})`);

  const sub = await findActiveSubscription(stripe, args.memberId, args.email);
  if (sub) await refundAndCancelSub(stripe, sub);
  else console.log("  no active subscription to cancel");

  const expired = await expireOpenSessions(stripe, args.memberId);
  console.log(`  expired ${expired.length} stale checkout session(s)`);

  const reset = await resetTrialRow(supabase, args.memberId);
  console.log(`  Supabase reset → trial_end_at=${reset.endAt}  converted_at=null`);

  await waitForMemberstackDetach(args.memberId);

  await new Promise(r => setTimeout(r, 800));
  const status = await fetchTrialStatus(args.memberId);
  header("Post-reset state");
  console.log(JSON.stringify(status, null, 2));
  const ok = status?.isExpiredTrial && status.couponEligible && !status.hasConverted;
  console.log("\n" + (ok ? "READY" : "NOT READY") + ` — ${ok ? "upgrade at " + DASHBOARD_URL : "inspect state above"}`);
}

async function cmdVerify(args) {
  const stripe = getStripe();
  const supabase = getSupabase();

  header(`Verify latest end-to-end upgrade for ${args.email}`);
  const session = await findLatestCheckoutSession(stripe, args.memberId);
  if (!session) { console.log("no recent checkout session found — have you run the upgrade?"); return; }
  const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ["subscription", "customer"] });

  header("[1] Stripe checkout session");
  console.log(`id: ${full.id}`);
  console.log(`status: ${full.status}  payment_status: ${full.payment_status}`);
  console.log(`amount_total: £${(full.amount_total / 100).toFixed(2)}`);
  console.log(`discount: £${((full.total_details?.amount_discount || 0) / 100).toFixed(2)}`);
  console.log(`customer: ${full.customer?.id}  email: ${full.customer?.email}`);
  console.log(`subscription: ${full.subscription?.id}  status: ${full.subscription?.status}`);
  console.log(`sub metadata → msPlanId=${full.subscription?.metadata?.msPlanId}  msPriceId=${full.subscription?.metadata?.msPriceId}  msViaClient=${full.subscription?.metadata?.msViaClient}`);

  header("[2] Supabase academy_trial_history");
  const row = await readTrialRow(supabase, args.memberId);
  console.log(row ? JSON.stringify(row, null, 2) : "(no row)");

  header("[3] Memberstack plan connections");
  const m = await fetchMemberstackMember(args.memberId);
  const pcs = planConnectionsOf(m);
  pcs.forEach((pc, i) => console.log(`  [${i}] ${pc.planId}  status=${pc.status}  active=${pc.active}`));

  header("Result");
  const paid = full.payment_status === "paid" && full.amount_total === 5900;
  const converted = Boolean(row?.converted_at);
  const ac = pickAnnualConnection(m);
  const annual = ac?.status === "ACTIVE" || ac?.active === true;
  console.log(`  ${paid ? "PASS" : "FAIL"}  Stripe charged £59 with SAVE20`);
  console.log(`  ${converted ? "PASS" : "FAIL"}  Supabase converted_at set`);
  console.log(`  ${annual ? "PASS" : "FAIL"}  Memberstack annual plan active`);
  const allPass = paid && converted && annual;
  console.log("\n" + (allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"));
}

function cmdHelp(args) {
  console.log("\nE2E upgrade-flow test harness");
  line();
  console.log(`Default test account:  ${args.email}  (${args.memberId})`);
  console.log("");
  console.log("Commands:");
  console.log("  status   Show current state of trial-status, Supabase, Stripe, Memberstack");
  console.log("  reset    Refund + cancel any active sub, reset Supabase to grace-active");
  console.log("  verify   Verify the latest checkout session end-to-end across all 3 systems");
  console.log("");
  console.log("Flags (optional, for ad-hoc runs):");
  console.log("  --member=mem_...   override member id");
  console.log("  --email=...        override email (used for Stripe customer fallback lookup)");
  console.log("");
  console.log("Typical cycle:");
  console.log("  1)  node scripts/e2e-upgrade-test.js reset");
  console.log("  2)  log in as " + args.email + " and click Upgrade (pays £59 with SAVE20)");
  console.log("  3)  node scripts/e2e-upgrade-test.js verify");
  console.log("  4)  node scripts/e2e-upgrade-test.js reset    (returns account for next run)");
}

async function main() {
  ensureEnv();
  const args = parseArgs(process.argv);
  if (args.cmd === "status") return cmdStatus(args);
  if (args.cmd === "reset") return cmdReset(args);
  if (args.cmd === "verify") return cmdVerify(args);
  return cmdHelp(args);
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
