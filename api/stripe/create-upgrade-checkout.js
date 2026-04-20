// api/stripe/create-upgrade-checkout.js
// Creates a Stripe Checkout Session so an expired-trial member can upgrade
// straight from the locked dashboard. The SAVE20 promotion code is auto-applied
// if the member is within UPGRADE_COUPON_WINDOW_DAYS of their trial end date.
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
const UPGRADE_COUPON_CODE = "SAVE20";
const UPGRADE_COUPON_ID = "save20-expired-trial-grace";
const UPGRADE_COUPON_LEGACY_IDS = ["SAVE20", "save20"];
const UPGRADE_COUPON_WINDOW_DAYS = 7;
const DAY_MS = 86400000;
const SUCCESS_PATH_DEFAULT = "https://www.alanranger.com/academy/dashboard?upgraded=1";
const CANCEL_PATH_DEFAULT = "https://www.alanranger.com/academy/dashboard?upgrade=cancelled";

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
 * Check the member's latest trial row and decide if the grace-period coupon
 * should be auto-applied. Returns null when ineligible.
 */
async function resolveCouponWindow(supabase, memberId) {
  const { data } = await supabase
    .from("academy_trial_history")
    .select("trial_end_at, converted_at")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.converted_at || !data.trial_end_at) return null;
  const endMs = new Date(data.trial_end_at).getTime();
  if (isNaN(endMs)) return null;
  const daysSinceExpiry = Math.floor((Date.now() - endMs) / DAY_MS);
  if (daysSinceExpiry < 0 || daysSinceExpiry > UPGRADE_COUPON_WINDOW_DAYS) return null;
  return { daysSinceExpiry };
}

async function lookupPromotionCode(stripe) {
  const { data } = await stripe.promotionCodes.list({
    code: UPGRADE_COUPON_CODE,
    active: true,
    limit: 1,
  });
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

async function lookupCouponFallback(stripe) {
  const candidates = [UPGRADE_COUPON_ID, ...UPGRADE_COUPON_LEGACY_IDS];
  for (const id of candidates) {
    const c = await lookupCouponById(stripe, id);
    if (c) return c;
  }
  return null;
}

/**
 * Resolve the discount to hard-apply at Checkout. Prefers a Stripe
 * promotion_code named SAVE20 (so the customer sees the familiar code on
 * the receipt). Falls back to the underlying coupon id if the promo code
 * isn't configured — this still pre-applies the discount in Checkout,
 * but the "Add promotion code" button won't show SAVE20 pre-filled.
 * Returns one of:
 *   { type: "promotion_code", id, code }   // preferred
 *   { type: "coupon",         id }          // fallback
 *   null                                     // nothing usable in Stripe
 */
async function resolveStripeDiscount(stripe) {
  try {
    const promo = await lookupPromotionCode(stripe);
    if (promo?.id) {
      return { type: "promotion_code", id: promo.id, code: promo.code };
    }
    const coupon = await lookupCouponFallback(stripe);
    if (coupon?.id) {
      console.warn("[create-upgrade-checkout] No active SAVE20 promotion_code in Stripe; falling back to coupon '" + coupon.id + "'. Create a promotion_code pointing at this coupon to allow customer-facing 'SAVE20' entry.");
      return { type: "coupon", id: coupon.id };
    }
  } catch (err) {
    console.warn("[create-upgrade-checkout] discount lookup failed:", err.message);
  }
  return null;
}

function buildDiscountEntry(discount) {
  if (!discount) return null;
  if (discount.type === "promotion_code") return { promotion_code: discount.id };
  if (discount.type === "coupon") return { coupon: discount.id };
  return null;
}

function buildCheckoutParams({ priceId, email, memberId, name, successUrl, cancelUrl, discount }) {
  const discountEntry = buildDiscountEntry(discount);
  const params = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
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
      metadata: {
        msAppId: ACADEMY_APP_ID,
        msMemberId: memberId,
        trigger: "expired_trial_upgrade",
      },
    },
  };
  if (name) params.subscription_data.metadata.memberName = name;
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

    const couponWindow = await resolveCouponWindow(supabase, memberId);
    const discount = couponWindow ? await resolveStripeDiscount(stripe) : null;

    const successUrl = returnUrl || SUCCESS_PATH_DEFAULT;
    const session = await stripe.checkout.sessions.create(
      buildCheckoutParams({
        priceId,
        email,
        memberId,
        name,
        successUrl,
        cancelUrl: CANCEL_PATH_DEFAULT,
        discount,
      })
    );

    return res.status(200).json({
      url: session.url,
      couponApplied: Boolean(discount),
      couponCode: discount ? UPGRADE_COUPON_CODE : null,
      couponType: discount?.type || null,
      daysSinceExpiry: couponWindow?.daysSinceExpiry ?? null,
    });
  } catch (err) {
    console.error("[create-upgrade-checkout] error:", err);
    return res.status(500).json({ error: "Failed to create checkout session", details: err.message });
  }
};
