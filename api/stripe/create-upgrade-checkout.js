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

/**
 * Look up the Stripe promotion_code id for SAVE20 (so Checkout can hard-apply
 * the discount rather than relying on the user to type it).
 */
async function resolveStripePromoCodeId(stripe) {
  try {
    const { data } = await stripe.promotionCodes.list({
      code: UPGRADE_COUPON_CODE,
      active: true,
      limit: 1,
    });
    return data?.[0]?.id || null;
  } catch (err) {
    console.warn("[create-upgrade-checkout] promo lookup failed:", err.message);
    return null;
  }
}

function buildCheckoutParams({ priceId, email, memberId, name, successUrl, cancelUrl, promoCodeId }) {
  const params = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    client_reference_id: memberId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: promoCodeId ? undefined : true,
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
  if (promoCodeId) {
    params.discounts = [{ promotion_code: promoCodeId }];
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
    const promoCodeId = couponWindow ? await resolveStripePromoCodeId(stripe) : null;

    const successUrl = returnUrl || SUCCESS_PATH_DEFAULT;
    const session = await stripe.checkout.sessions.create(
      buildCheckoutParams({
        priceId,
        email,
        memberId,
        name,
        successUrl,
        cancelUrl: CANCEL_PATH_DEFAULT,
        promoCodeId,
      })
    );

    return res.status(200).json({
      url: session.url,
      couponApplied: Boolean(promoCodeId),
      couponCode: promoCodeId ? UPGRADE_COUPON_CODE : null,
      daysSinceExpiry: couponWindow?.daysSinceExpiry ?? null,
    });
  } catch (err) {
    console.error("[create-upgrade-checkout] error:", err);
    return res.status(500).json({ error: "Failed to create checkout session", details: err.message });
  }
};
