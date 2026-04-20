// api/admin/diagnose-save20.js
// One-shot diagnostic / ensure-exists endpoint for the SAVE20 upgrade coupon.
//
// Reuses the same auth token pattern as cleanup-cron (CRON_SECRET).
//
// Usage:
//   GET  /api/admin/diagnose-save20?secret=XXX
//     -> reports what exists in Stripe for SAVE20 (coupon + promotion_code)
//   GET/POST /api/admin/diagnose-save20?secret=XXX&mode=ensure
//     -> creates a £20-off (duration: once) coupon + SAVE20 promotion_code
//        if either is missing. Idempotent: re-running is safe. GET is allowed
//        because the action is idempotent and CRON_SECRET-protected — makes it
//        trivially clickable from the browser.
//
// Why both? Stripe Checkout can only auto-apply a discount via a
// `promotion_code` id (the customer-facing code string lives on the
// promotion_code object, not on the raw coupon). If only the coupon
// exists, the upgrade checkout will fall back to the manual-entry box.

const Stripe = require("stripe");

const CODE = "SAVE20";
const COUPON_ID = "save20-expired-trial-grace";
const AMOUNT_OFF_MINOR_UNITS = 2000;
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

async function findLegacyCoupon(stripe) {
  const candidates = [CODE, CODE.toLowerCase()];
  for (const id of candidates) {
    try {
      const existing = await stripe.coupons.retrieve(id);
      if (existing) return existing;
    } catch {
      // keep trying other ids
    }
  }
  return null;
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
    duration_in_months: c.duration_in_months,
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
  const legacy = await findLegacyCoupon(stripe);
  if (legacy && legacy.amount_off === AMOUNT_OFF_MINOR_UNITS && legacy.currency === CURRENCY && legacy.valid) {
    return { coupon: legacy, created: false, reusedLegacyId: legacy.id };
  }
  const created = await stripe.coupons.create({
    id: COUPON_ID,
    name: "SAVE20 — Expired Trial Grace (Year 1)",
    amount_off: AMOUNT_OFF_MINOR_UNITS,
    currency: CURRENCY,
    duration: "once",
  });
  return { coupon: created, created: true };
}

async function ensurePromotionCode(stripe, couponId) {
  const existing = await findPromotionCode(stripe);
  if (existing && existing.active && existing.coupon?.id === couponId) {
    return { promo: existing, created: false };
  }
  if (existing && !existing.active) {
    return { promo: existing, created: false, warning: "Existing SAVE20 promotion_code is inactive" };
  }
  if (existing && existing.coupon?.id !== couponId) {
    return { promo: existing, created: false, warning: `Existing SAVE20 promotion_code points at coupon '${existing.coupon?.id}', not '${couponId}'` };
  }
  const created = await stripe.promotionCodes.create({
    code: CODE,
    coupon: couponId,
    active: true,
  });
  return { promo: created, created: true };
}

async function runDiagnose(stripe) {
  const [promo, coupon, legacy] = await Promise.all([
    findPromotionCode(stripe),
    findCoupon(stripe),
    findLegacyCoupon(stripe),
  ]);
  return {
    expectedCode: CODE,
    expectedCouponId: COUPON_ID,
    expectedAmount: { amount_off: AMOUNT_OFF_MINOR_UNITS, currency: CURRENCY, duration: "once" },
    promotionCode: describePromoCode(promo),
    coupon: describeCoupon(coupon),
    legacyCoupon: describeCoupon(legacy),
    readyForAutoApply: Boolean(promo?.active && promo?.coupon?.valid),
  };
}

async function runEnsure(stripe) {
  const couponResult = await ensureCoupon(stripe);
  const promoResult = await ensurePromotionCode(stripe, couponResult.coupon.id);
  return {
    coupon: { ...describeCoupon(couponResult.coupon), created: couponResult.created, reusedLegacyId: couponResult.reusedLegacyId || null },
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
    console.error("[diagnose-save20] error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
