// api/admin/diagnose-rewind20.js
// One-shot diagnostic / ensure-exists endpoint for the REWIND20 win-back coupon.
//
// REWIND20 is the coupon attached to the lapsed-trial re-engagement email
// (api/admin/lapsed-trial-reengagement-webhook.js). Members who never converted
// from a trial and are 8–180 days past their trial end receive an email with a
// personal 7-day window to upgrade for £20 off (£79 → £59). Server-side we
// enforce the per-member window via academy_trial_history.reengagement_expires_at;
// Stripe just needs a standing coupon + promotion_code so the dashboard modal
// can auto-apply it at Checkout.
//
// Reuses the CRON_SECRET auth token pattern from diagnose-save20.
//
// Usage:
//   GET  /api/admin/diagnose-rewind20?secret=XXX
//     -> reports what exists in Stripe for REWIND20 (coupon + promotion_code)
//   GET/POST /api/admin/diagnose-rewind20?secret=XXX&mode=ensure
//     -> creates a £20-off (duration: once) coupon + REWIND20 promotion_code
//        if either is missing. Idempotent.

const Stripe = require("stripe");

const CODE = "REWIND20";
const COUPON_ID = "rewind20-lapsed-trial-winback";
const COUPON_NAME = "REWIND20 — Lapsed Trial Win-Back (Year 1)";
const AMOUNT_OFF_MINOR_UNITS = 2000; // £20.00
const CURRENCY = "gbp";

function authorize(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return { ok: false, status: 500, error: "CRON_SECRET is not configured on the server" };
  const provided = req.query?.secret || req.headers["x-cron-secret"];
  if (provided !== cronSecret) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

async function findPromotionCode(stripe) {
  const { data } = await stripe.promotionCodes.list({ code: CODE, limit: 10 });
  return data?.[0] || null;
}

async function findCoupon(stripe) {
  try {
    return await stripe.coupons.retrieve(COUPON_ID);
  } catch {
    return null;
  }
}

function describeCoupon(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name || null,
    amount_off: c.amount_off,
    percent_off: c.percent_off,
    currency: c.currency,
    duration: c.duration,
    valid: c.valid,
  };
}

function describePromoCode(p) {
  if (!p) return null;
  return {
    id: p.id,
    code: p.code,
    active: p.active,
    coupon: describeCoupon(p.coupon),
    expires_at: p.expires_at,
    max_redemptions: p.max_redemptions,
    times_redeemed: p.times_redeemed,
  };
}

async function ensureCoupon(stripe) {
  const existing = await findCoupon(stripe);
  if (existing) return { coupon: existing, created: false };
  const created = await stripe.coupons.create({
    id: COUPON_ID,
    name: COUPON_NAME,
    amount_off: AMOUNT_OFF_MINOR_UNITS,
    currency: CURRENCY,
    duration: "once",
  });
  return { coupon: created, created: true };
}

function describeExistingPromoState(existing, couponId) {
  if (!existing) return null;
  if (existing.active && existing.coupon?.id === couponId) {
    return { promo: existing, created: false };
  }
  if (!existing.active) {
    return { promo: existing, created: false, warning: "Existing REWIND20 promotion_code is inactive" };
  }
  if (existing.coupon?.id !== couponId) {
    return { promo: existing, created: false, warning: `Existing REWIND20 promotion_code points at coupon '${existing.coupon?.id}', not '${couponId}'` };
  }
  return null;
}

async function ensurePromotionCode(stripe, couponId) {
  const existing = await findPromotionCode(stripe);
  const existingState = describeExistingPromoState(existing, couponId);
  if (existingState) return existingState;
  const created = await stripe.promotionCodes.create({
    code: CODE,
    active: true,
    promotion: { type: "coupon", coupon: couponId },
  });
  return { promo: created, created: true };
}

async function runDiagnose(stripe) {
  const [promo, coupon] = await Promise.all([findPromotionCode(stripe), findCoupon(stripe)]);
  return {
    expectedCode: CODE,
    expectedCouponId: COUPON_ID,
    expectedAmount: { amount_off: AMOUNT_OFF_MINOR_UNITS, currency: CURRENCY, duration: "once" },
    promotionCode: describePromoCode(promo),
    coupon: describeCoupon(coupon),
    readyForAutoApply: Boolean(promo?.active && promo?.coupon?.valid),
  };
}

async function runEnsure(stripe) {
  const couponResult = await ensureCoupon(stripe);
  const promoResult = await ensurePromotionCode(stripe, couponResult.coupon.id);
  return {
    coupon: { ...describeCoupon(couponResult.coupon), created: couponResult.created },
    promotionCode: { ...describePromoCode(promoResult.promo), created: promoResult.created, warning: promoResult.warning || null },
    readyForAutoApply: Boolean(promoResult.promo?.active && couponResult.coupon?.valid),
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const auth = authorize(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY is not configured" });
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const shouldEnsure = req.query?.mode === "ensure";
    const payload = shouldEnsure ? await runEnsure(stripe) : await runDiagnose(stripe);
    return res.status(200).json({
      success: true,
      mode: shouldEnsure ? "ensure" : "diagnose",
      timestamp: new Date().toISOString(),
      ...payload,
    });
  } catch (err) {
    console.error("[diagnose-rewind20] error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
