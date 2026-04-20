// api/stripe/create-upgrade-checkout.js
// Creates a Stripe Checkout Session so an expired-trial member can upgrade
// straight from the locked dashboard. Two coupons can be auto-applied
// depending on which window the member currently sits in:
//
//   SAVE20   — Applied if the member is within 7 days of their trial end.
//              This is the "grace period" offer shown on the dashboard
//              upgrade modal to freshly-expired trial members.
//   REWIND20 — Applied if the member is OUTSIDE the SAVE20 window but has a
//              live win-back (re-engagement) offer open (i.e. they received a
//              REWIND20 email and are within the 7-day personal window
//              stamped on academy_trial_history.reengagement_expires_at).
//
// SAVE20 takes precedence if both are somehow eligible — it's the better deal
// trigger from a recency perspective. Both coupons are the same value (£20 off
// first year), so the customer never pays more than £59 regardless of which
// one fires.
//
// Request (POST, JSON body):
//   { memberId: string, email: string, name?: string, returnUrl?: string }
//
// Response:
//   { url: string, couponApplied: boolean, couponCode: string | null }
//
// The Stripe webhook (api/stripe/webhook.js) picks up the resulting
// customer.subscription.created / invoice.paid events and writes
// academy_annual_history. Memberstack's own Stripe integration attaches the
// annual plan via subscription_data.metadata.msMemberId.

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { ACADEMY_ANNUAL_PRICE_IDS } = require("../../lib/academyStripeConfig");

const ACADEMY_APP_ID = "app_cmjlwl7re00440stg3ri2dud8";
const SAVE20_CODE = "SAVE20";
const SAVE20_COUPON_ID = "save20-expired-trial-grace";
const SAVE20_LEGACY_IDS = ["SAVE20", "save20"];
const SAVE20_WINDOW_DAYS = 7;
const REWIND20_CODE = "REWIND20";
const REWIND20_COUPON_ID = "rewind20-lapsed-trial-winback";
const REWIND20_LEGACY_IDS = ["REWIND20", "rewind20"];
const DAY_MS = 86400000;
const SUCCESS_PATH_DEFAULT = "https://www.alanranger.com/academy/dashboard?upgraded=1";
const CANCEL_PATH_DEFAULT = "https://www.alanranger.com/academy/dashboard?upgrade=cancelled";

// Memberstack plan + price identifiers that Memberstack's own webhook
// matches against when Stripe fires subscription.created / invoice.paid.
// Without these on the subscription metadata, Memberstack sees the
// subscription but has no idea which plan to attach to the member, so
// the upgrade silently fails to flip the member from trial → annual.
const MEMBERSTACK_ANNUAL_PLAN_ID = "pln_academy-annual-membership-h57x0h8g";
const MEMBERSTACK_ANNUAL_PRICE_ID = "prc_annual-membership-jj7y0h89";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.alanranger.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Memberstack-Id");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

/**
 * Check the member's latest trial row and decide if the SAVE20 grace-period
 * coupon should be auto-applied. Returns null when ineligible.
 */
async function resolveSave20Window(supabase, memberId) {
  const { data } = await supabase
    .from("academy_trial_history")
    .select("trial_end_at, converted_at")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.converted_at || !data.trial_end_at) return null;
  const endMs = new Date(data.trial_end_at).getTime();
  if (Number.isNaN(endMs)) return null;
  const daysSinceExpiry = Math.floor((Date.now() - endMs) / DAY_MS);
  if (daysSinceExpiry < 0 || daysSinceExpiry > SAVE20_WINDOW_DAYS) return null;
  return { daysSinceExpiry };
}

/**
 * Check the member's latest trial row and decide if the REWIND20 win-back
 * coupon should be auto-applied. Eligible when the lapsed-trial reengagement
 * webhook has sent this member an email and the personal 7-day window has
 * not yet closed (and the member hasn't opted out / hasn't converted).
 */
async function resolveRewindWindow(supabase, memberId) {
  const { data } = await supabase
    .from("academy_trial_history")
    .select("converted_at, reengagement_expires_at, reengagement_opted_out")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.converted_at || data.reengagement_opted_out) return null;
  if (!data.reengagement_expires_at) return null;
  const expMs = new Date(data.reengagement_expires_at).getTime();
  if (Number.isNaN(expMs) || expMs <= Date.now()) return null;
  const daysLeft = Math.ceil((expMs - Date.now()) / DAY_MS);
  return { daysLeft };
}

async function lookupPromotionCode(stripe, code) {
  const { data } = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
  return data?.[0] || null;
}

async function lookupCouponById(stripe, id) {
  try {
    const c = await stripe.coupons.retrieve(id);
    return c?.valid ? c : null;
  } catch {
    return null;
  }
}

async function lookupCouponFallback(stripe, candidates) {
  for (const id of candidates) {
    const c = await lookupCouponById(stripe, id);
    if (c) return c;
  }
  return null;
}

/**
 * Resolve a discount by promo code name. Prefers the active promotion_code
 * in Stripe (so the customer sees the familiar code on the receipt). Falls
 * back to the underlying coupon id if the promo code isn't configured.
 */
async function resolveStripeDiscount(stripe, code, couponIds) {
  try {
    const promo = await lookupPromotionCode(stripe, code);
    if (promo?.id) {
      return { type: "promotion_code", id: promo.id, code: promo.code };
    }
    const coupon = await lookupCouponFallback(stripe, couponIds);
    if (coupon?.id) {
      console.warn(`[create-upgrade-checkout] No active ${code} promotion_code in Stripe; falling back to coupon '${coupon.id}'.`);
      return { type: "coupon", id: coupon.id };
    }
  } catch (err) {
    console.warn(`[create-upgrade-checkout] ${code} lookup failed:`, err.message);
  }
  return null;
}

/**
 * Pick which active campaign (if any) applies to this member and resolve the
 * matching Stripe discount. SAVE20 always wins a tie because it's the fresher,
 * higher-intent window.
 */
async function resolveActiveDiscount(stripe, { save20Window, rewindWindow }) {
  if (save20Window) {
    const discount = await resolveStripeDiscount(stripe, SAVE20_CODE, [SAVE20_COUPON_ID, ...SAVE20_LEGACY_IDS]);
    if (discount) return { code: SAVE20_CODE, source: "save20_grace", discount };
  }
  if (rewindWindow) {
    const discount = await resolveStripeDiscount(stripe, REWIND20_CODE, [REWIND20_COUPON_ID, ...REWIND20_LEGACY_IDS]);
    if (discount) return { code: REWIND20_CODE, source: "rewind20_winback", discount };
  }
  return null;
}

function buildDiscountEntry(discount) {
  if (!discount) return null;
  if (discount.type === "promotion_code") return { promotion_code: discount.id };
  if (discount.type === "coupon") return { coupon: discount.id };
  return null;
}

/**
 * Find the member's existing Stripe customer so the upgrade charges/subscribes
 * on the SAME Stripe customer that Memberstack already links to the member.
 * Without this, Stripe Checkout creates a brand-new customer and Memberstack's
 * auto-attach never fires (even with correct metadata), because Memberstack
 * keys its member ↔ customer link off the Stripe customer id.
 *
 * Strategy (in order):
 *   1) Stripe customers with metadata.msMemberId == memberId  (preferred)
 *   2) Stripe customers with matching email
 * Returns the customer id, or null if none found (Checkout will then fall
 * back to creating a new customer keyed by email — legacy behaviour).
 */
async function findExistingCustomerId(stripe, memberId, email) {
  try {
    const byMeta = await stripe.customers.search({
      query: `metadata['msMemberId']:'${memberId}'`,
      limit: 3,
    });
    if (byMeta?.data?.[0]?.id) return byMeta.data[0].id;
  } catch (err) {
    console.warn("[create-upgrade-checkout] customer search by metadata failed:", err.message);
  }
  if (!email) return null;
  try {
    const byEmail = await stripe.customers.list({ email, limit: 3 });
    if (byEmail?.data?.[0]?.id) return byEmail.data[0].id;
  } catch (err) {
    console.warn("[create-upgrade-checkout] customer list by email failed:", err.message);
  }
  return null;
}

function buildSubscriptionMetadata(memberId, name) {
  const meta = {
    msAppId: ACADEMY_APP_ID,
    msMemberId: memberId,
    // These two are the magic pair Memberstack's webhook matcher needs.
    msPlanId: MEMBERSTACK_ANNUAL_PLAN_ID,
    msPriceId: MEMBERSTACK_ANNUAL_PRICE_ID,
    // Signals to Memberstack that this was initiated from a client-side /
    // checkout-hosted flow (same semantics as their native upgrade path).
    msViaClient: "true",
    trigger: "expired_trial_upgrade",
  };
  if (name) meta.memberName = name;
  return meta;
}

function buildCheckoutParams({ priceId, email, memberId, name, customerId, successUrl, cancelUrl, discount }) {
  const discountEntry = buildDiscountEntry(discount);
  const params = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: memberId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: discountEntry ? undefined : true,
    metadata: {
      msAppId: ACADEMY_APP_ID,
      msMemberId: memberId,
      trigger: "expired_trial_upgrade",
      source: "dashboard_upgrade_modal",
    },
    subscription_data: {
      metadata: buildSubscriptionMetadata(memberId, name),
    },
  };
  if (customerId) {
    // Re-use existing customer so the subscription lands on the record
    // Memberstack already tracks for this member.
    params.customer = customerId;
    params.customer_update = { name: "auto", address: "auto" };
  } else {
    params.customer_email = email;
  }
  if (discountEntry) {
    params.discounts = [discountEntry];
  }
  return params;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { memberId, email, name, returnUrl } = parseJsonBody(req);
  if (!memberId || !email) {
    return res.status(400).json({ error: "memberId and email are required" });
  }

  const priceId = ACADEMY_ANNUAL_PRICE_IDS[0];
  if (!priceId) {
    return res.status(500).json({ error: "Academy annual price ID is not configured" });
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = getSupabase();

    const [save20Window, rewindWindow, customerId] = await Promise.all([
      resolveSave20Window(supabase, memberId),
      resolveRewindWindow(supabase, memberId),
      findExistingCustomerId(stripe, memberId, email),
    ]);
    const active = await resolveActiveDiscount(stripe, { save20Window, rewindWindow });
    const discount = active?.discount || null;

    const successUrl = returnUrl || SUCCESS_PATH_DEFAULT;
    const session = await stripe.checkout.sessions.create(
      buildCheckoutParams({
        priceId,
        email,
        memberId,
        name,
        customerId,
        successUrl,
        cancelUrl: CANCEL_PATH_DEFAULT,
        discount,
      })
    );

    return res.status(200).json({
      url: session.url,
      couponApplied: Boolean(discount),
      couponCode: active?.code || null,
      couponSource: active?.source || null,
      couponType: discount?.type || null,
      daysSinceExpiry: save20Window?.daysSinceExpiry ?? null,
      rewindDaysLeft: rewindWindow?.daysLeft ?? null,
      reusedExistingCustomer: Boolean(customerId),
    });
  } catch (err) {
    console.error("[create-upgrade-checkout] error:", err);
    return res.status(500).json({ error: "Failed to create checkout session", details: err.message });
  }
};
