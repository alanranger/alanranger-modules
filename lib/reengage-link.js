/**
 * Signed REWIND20 dashboard deep links + unsubscribe URLs (shared by win-back webhooks).
 */

const crypto = require("crypto");

const DASHBOARD_URL =
  process.env.ACADEMY_UPGRADE_URL || "https://www.alanranger.com/academy/dashboard";
const API_BASE_URL =
  process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const REENGAGE_LINK_SECRET =
  process.env.REENGAGE_LINK_SECRET || process.env.ORPHANED_WEBHOOK_SECRET || "";
const REENGAGE_TOKEN_VERSION = 1;
const WINDOW_DAYS = 7;

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

function signReengageToken(memberId, email, expiresAtMs) {
  if (!REENGAGE_LINK_SECRET) return null;
  const payload = { v: REENGAGE_TOKEN_VERSION, mid: memberId, em: email || null, exp: expiresAtMs };
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

function buildPersonalUpgradeUrl(memberId, email, windowExpiresAtMs) {
  const token = signReengageToken(memberId, email, windowExpiresAtMs);
  if (!token) return DASHBOARD_URL;
  const sep = DASHBOARD_URL.includes("?") ? "&" : "?";
  return `${DASHBOARD_URL}${sep}ar_rewind=${encodeURIComponent(token)}`;
}

function formatCouponExpiryDate(sendMs, windowDays = WINDOW_DAYS) {
  const expiryMs = sendMs + windowDays * 86400000;
  return new Date(expiryMs).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

module.exports = {
  DASHBOARD_URL,
  WINDOW_DAYS,
  generateUnsubToken,
  buildUnsubUrl,
  buildPersonalUpgradeUrl,
  formatCouponExpiryDate,
};
