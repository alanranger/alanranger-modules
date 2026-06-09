/**
 * Shared Stripe Checkout session builder for expired-trial upgrades.
 * Used by dashboard POST /api/stripe/create-upgrade-checkout and email GET
 * /api/academy/reengage-checkout (direct REWIND20 link).
 */

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { ACADEMY_ANNUAL_PRICE_IDS } = require("./academyStripeConfig");

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
const MEMBERSTACK_ANNUAL_PLAN_ID = "pln_academy-annual-membership-h57x0h8g";
const MEMBERSTACK_ANNUAL_PRICE_ID = "prc_annual-membership-jj7y0h89";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

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
  return { daysLeft: Math.ceil((expMs - Date.now()) / DAY_MS) };
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

async function resolveStripeDiscount(stripe, code, couponIds) {
  try {
    const promo = await lookupPromotionCode(stripe, code);
    if (promo?.id) return { type: "promotion_code", id: promo.id, code: promo.code };
    const coupon = await lookupCouponFallback(stripe, couponIds);
    if (coupon?.id) return { type: "coupon", id: coupon.id };
  } catch (err) {
    console.warn(`[upgrade-checkout] ${code} lookup failed:`, err.message);
  }
  return null;
}

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

async function findExistingCustomerId(stripe, memberId, email) {
  try {
    const byMeta = await stripe.customers.search({
      query: `metadata['msMemberId']:'${memberId}'`,
      limit: 3,
    });
    if (byMeta?.data?.[0]?.id) return byMeta.data[0].id;
  } catch (err) {
    console.warn("[upgrade-checkout] customer search by metadata failed:", err.message);
  }
  if (!email) return null;
  try {
    const byEmail = await stripe.customers.list({ email, limit: 3 });
    if (byEmail?.data?.[0]?.id) return byEmail.data[0].id;
  } catch (err) {
    console.warn("[upgrade-checkout] customer list by email failed:", err.message);
  }
  return null;
}

function buildSubscriptionMetadata(memberId, name) {
  const meta = {
    msAppId: ACADEMY_APP_ID,
    msMemberId: memberId,
    msPlanId: MEMBERSTACK_ANNUAL_PLAN_ID,
    msPriceId: MEMBERSTACK_ANNUAL_PRICE_ID,
    msViaClient: "true",
    trigger: "expired_trial_upgrade",
  };
  if (name) meta.memberName = name;
  return meta;
}

function buildCheckoutParams({ priceId, email, memberId, name, customerId, successUrl, cancelUrl, discount, metadataSource }) {
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
      source: metadataSource || "dashboard_upgrade_modal",
    },
    subscription_data: { metadata: buildSubscriptionMetadata(memberId, name) },
  };
  if (customerId) {
    params.customer = customerId;
    params.customer_update = { name: "auto", address: "auto" };
  } else {
    params.customer_email = email;
  }
  if (discountEntry) params.discounts = [discountEntry];
  return params;
}

async function resolveForcedDiscount(stripe, forceDiscountCode) {
  if (forceDiscountCode === REWIND20_CODE) {
    const discount = await resolveStripeDiscount(stripe, REWIND20_CODE, [REWIND20_COUPON_ID, ...REWIND20_LEGACY_IDS]);
    if (discount) return { code: REWIND20_CODE, source: "rewind20_email_link", discount };
  }
  if (forceDiscountCode === SAVE20_CODE) {
    const discount = await resolveStripeDiscount(stripe, SAVE20_CODE, [SAVE20_COUPON_ID, ...SAVE20_LEGACY_IDS]);
    if (discount) return { code: SAVE20_CODE, source: "save20_email_link", discount };
  }
  return null;
}

async function createUpgradeCheckoutSession({
  memberId,
  email,
  name = null,
  returnUrl = null,
  cancelUrl = null,
  forceDiscountCode = null,
  metadataSource = "dashboard_upgrade_modal",
}) {
  const priceId = ACADEMY_ANNUAL_PRICE_IDS[0];
  if (!priceId) throw new Error("Academy annual price ID is not configured");
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = getSupabase();
  const [save20Window, rewindWindow, customerId] = await Promise.all([
    resolveSave20Window(supabase, memberId),
    resolveRewindWindow(supabase, memberId),
    findExistingCustomerId(stripe, memberId, email),
  ]);

  let active = forceDiscountCode
    ? await resolveForcedDiscount(stripe, forceDiscountCode)
    : await resolveActiveDiscount(stripe, { save20Window, rewindWindow });
  const discount = active?.discount || null;

  const session = await stripe.checkout.sessions.create(
    buildCheckoutParams({
      priceId,
      email,
      memberId,
      name,
      customerId,
      successUrl: returnUrl || SUCCESS_PATH_DEFAULT,
      cancelUrl: cancelUrl || CANCEL_PATH_DEFAULT,
      discount,
      metadataSource,
    })
  );

  return {
    url: session.url,
    sessionId: session.id,
    couponApplied: Boolean(discount),
    couponCode: active?.code || null,
    couponSource: active?.source || null,
    reusedExistingCustomer: Boolean(customerId),
  };
}

module.exports = {
  createUpgradeCheckoutSession,
  REWIND20_CODE,
  SUCCESS_PATH_DEFAULT,
  CANCEL_PATH_DEFAULT,
};
