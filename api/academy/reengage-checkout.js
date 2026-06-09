// api/academy/reengage-checkout.js
// Email-link handler: verify signed ?t= token → create Stripe Checkout with
// REWIND20 applied → 302 to checkout.stripe.com (email pre-filled).
// Win-back REWIND emails point {{upgradeUrl}} here — NOT the dashboard modal.

const {
  createUpgradeCheckoutSession,
  REWIND20_CODE,
  SUCCESS_PATH_DEFAULT,
  CANCEL_PATH_DEFAULT,
} = require("../../lib/upgradeCheckoutSession");
const { verifyReengageToken, DASHBOARD_URL } = require("../../lib/reengage-link");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = String(req.query?.t || req.query?.token || "");
  const result = verifyReengageToken(token);

  if (!result.ok || !result.payload?.mid || !result.payload?.em) {
    console.warn(`[reengage-checkout] token rejected: ${result.reason || "missing_fields"}`);
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, DASHBOARD_URL);
  }

  try {
    const checkout = await createUpgradeCheckoutSession({
      memberId: String(result.payload.mid),
      email: String(result.payload.em),
      forceDiscountCode: REWIND20_CODE,
      metadataSource: "rewind20_email_link",
      returnUrl: SUCCESS_PATH_DEFAULT,
      cancelUrl: CANCEL_PATH_DEFAULT,
    });

    if (!checkout.url) {
      throw new Error("Stripe session missing url");
    }

    console.log(
      `[reengage-checkout] session ${checkout.sessionId} for ${result.payload.mid} coupon=${checkout.couponCode || "none"}`
    );
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, checkout.url);
  } catch (err) {
    console.error("[reengage-checkout] failed:", err.message);
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, DASHBOARD_URL);
  }
};
