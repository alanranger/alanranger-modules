/**
 * Signed REWIND20 email links + unsubscribe URLs (shared by win-back webhooks).
 */

const crypto = require("crypto");

const DASHBOARD_URL =
  process.env.ACADEMY_UPGRADE_URL || "https://www.alanranger.com/academy/dashboard";
const API_BASE_URL =
  process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const REENGAGE_LINK_SECRET =
  process.env.REENGAGE_LINK_SECRET || process.env.ORPHANED_WEBHOOK_SECRET || "";
const REENGAGE_REDIRECT_URL = `${API_BASE_URL}/api/academy/reengage-redirect`;
const REENGAGE_CHECKOUT_URL = `${API_BASE_URL}/api/academy/reengage-checkout`;
const REENGAGE_TOKEN_VERSION = 1;
const WINDOW_DAYS = 7;
// Coupon copy promises a 7-day window; token must outlive it for late openers.
const TOKEN_GRACE_DAYS = 14;
const DAY_MS = 86400000;

/** Token `exp` = send time + offer window + grace (default 7 + 14 = 21 days). */
function computeTokenExpiryMs(sendAtMs = Date.now(), offerWindowDays = WINDOW_DAYS) {
  return sendAtMs + (offerWindowDays + TOKEN_GRACE_DAYS) * DAY_MS;
}

function decodeReengageTokenPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    return null;
  }
}

function generateUnsubToken() {
  return crypto.randomBytes(24).toString("hex");
}

function buildUnsubUrl(token) {
  return `${API_BASE_URL}/api/academy/reengagement-unsubscribe?token=${encodeURIComponent(token)}`;
}

function base64UrlEncode(input) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input) {
  const pad = 4 - (input.length % 4 || 4);
  const padded = input + (pad < 4 ? "=".repeat(pad) : "");
  const norm = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(norm, "base64").toString("utf8");
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function signReengageToken(memberId, email, expiresAtMs, couponCode = null) {
  if (!REENGAGE_LINK_SECRET) return null;
  const payload = { v: REENGAGE_TOKEN_VERSION, mid: memberId, em: email || null, exp: expiresAtMs };
  if (couponCode) payload.c = String(couponCode);
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", REENGAGE_LINK_SECRET)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${payloadB64}.${sig}`;
}

function verifyReengageToken(token) {
  if (!REENGAGE_LINK_SECRET) return { ok: false, reason: "no_secret" };
  if (!token || typeof token !== "string") return { ok: false, reason: "no_token" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", REENGAGE_LINK_SECRET)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (!safeEqual(sig, expectedSig)) return { ok: false, reason: "bad_signature" };
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (payload?.exp && Date.now() > payload.exp) {
    return { ok: false, reason: "expired", payload };
  }
  return { ok: true, payload };
}

function buildPersonalUpgradeUrl(memberId, email, windowExpiresAtMs, couponCode = null) {
  const token = signReengageToken(memberId, email, windowExpiresAtMs, couponCode);
  if (!token) return DASHBOARD_URL;
  // Direct Stripe Checkout: signed token → server creates session → checkout.stripe.com
  return `${REENGAGE_CHECKOUT_URL}?t=${encodeURIComponent(token)}`;
}

function formatCouponExpiryDate(sendMs, windowDays = WINDOW_DAYS) {
  const expiryMs = sendMs + windowDays * DAY_MS;
  return new Date(expiryMs).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

module.exports = {
  DASHBOARD_URL,
  WINDOW_DAYS,
  TOKEN_GRACE_DAYS,
  DAY_MS,
  computeTokenExpiryMs,
  decodeReengageTokenPayload,
  REENGAGE_REDIRECT_URL,
  REENGAGE_CHECKOUT_URL,
  generateUnsubToken,
  buildUnsubUrl,
  signReengageToken,
  verifyReengageToken,
  buildPersonalUpgradeUrl,
  formatCouponExpiryDate,
};
