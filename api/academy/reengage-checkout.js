// api/academy/reengage-checkout.js
// Email-link handler: verify signed ?t= token → create Stripe Checkout with
// REWIND20/SAVE20 applied → 302 to checkout.stripe.com (email pre-filled).
// Stateless — no Memberstack/session check; login cookies cannot change this route.

const {
  createUpgradeCheckoutSession,
  REWIND20_CODE,
  SAVE20_CODE,
  SUCCESS_PATH_DEFAULT,
  CANCEL_PATH_DEFAULT,
} = require("../../lib/upgradeCheckoutSession");
const { verifyReengageToken } = require("../../lib/reengage-link");

function sendCheckoutError(res, status, message) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:32em;margin:2em auto">` +
      `<h1>Checkout link problem</h1><p>${message}</p>` +
      `<p>Reply to your Academy email if this keeps happening.</p></body></html>`
  );
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = String(req.query?.t || req.query?.token || "");
  const result = verifyReengageToken(token);

  if (!result.ok || !result.payload?.mid || !result.payload?.em) {
    const reason = result.reason || "missing_fields";
    console.warn(`[reengage-checkout] token rejected: ${reason}`);
    const message =
      reason === "bad_signature"
        ? "This upgrade link is invalid. Please use the link from your latest email."
        : "This upgrade link is invalid. Please use the link from your latest email.";
    return sendCheckoutError(res, 400, message);
  }

  try {
    const rawCoupon = result.payload?.c ? String(result.payload.c) : null;
    const forceDiscountCode =
      rawCoupon === SAVE20_CODE ? SAVE20_CODE : rawCoupon === REWIND20_CODE ? REWIND20_CODE : null;
    const checkout = await createUpgradeCheckoutSession({
      memberId: String(result.payload.mid),
      email: String(result.payload.em),
      forceDiscountCode,
      metadataSource:
        forceDiscountCode === SAVE20_CODE ? "save20_email_link" : "rewind20_email_link",
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
    if (req.method === "HEAD") {
      res.setHeader("Location", checkout.url);
      return res.status(302).end();
    }
    return res.redirect(302, checkout.url);
  } catch (err) {
    console.error("[reengage-checkout] failed:", err.message);
    return sendCheckoutError(
      res,
      502,
      "We could not start Stripe checkout just now. Please try the link again in a minute."
    );
  }
};
