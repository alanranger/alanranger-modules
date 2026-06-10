// api/academy/verify-reengage-token.js
// Verifies an HMAC-signed re-engagement deep-link token, used when a lapsed
// trial member clicks through the REWIND20 win-back email.
//
// The webhook (api/admin/lapsed-trial-reengagement-webhook.js) builds a URL
// like:
//   https://www.alanranger.com/academy/dashboard?ar_rewind=<payloadB64url>.<sigB64url>
//
// The dashboard snippet POSTs / GETs this token here to learn the member's
// email (so it can pre-fill the login form) and ID (so we can force-open the
// upgrade modal when a session is already live). The token is short-lived
// (expires in lockstep with the REWIND20 coupon window, 7 days by default)
// and signed with REENGAGE_LINK_SECRET (falls back to ORPHANED_WEBHOOK_SECRET
// so the webhook and this endpoint always agree without a separate env var).
//
// Response shape:
//   { valid: true,  memberId, email, expiresAt }
//   { valid: false, reason: "expired"|"bad_signature"|"malformed"|"no_secret" }

const crypto = require("crypto");

const TOKEN_VERSION = 1;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.alanranger.com");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function getSigningSecret() {
  return (
    process.env.REENGAGE_LINK_SECRET ||
    process.env.ORPHANED_WEBHOOK_SECRET ||
    ""
  );
}

function base64UrlDecode(input) {
  if (typeof input !== "string" || !input) return null;
  const pad = 4 - (input.length % 4 || 4);
  const padded = input + (pad < 4 ? "=".repeat(pad) : "");
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyToken(token, secret) {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (!safeEqual(sigB64, expectedSig)) {
    return { valid: false, reason: "bad_signature" };
  }

  const json = base64UrlDecode(payloadB64);
  if (!json) return { valid: false, reason: "malformed" };
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (payload.v !== TOKEN_VERSION || !payload.mid || !payload.exp) {
    return { valid: false, reason: "malformed" };
  }
  if (Date.now() > payload.exp) {
    return { valid: false, reason: "expired" };
  }

  return {
    valid: true,
    memberId: String(payload.mid),
    email: payload.em ? String(payload.em) : null,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const secret = getSigningSecret();
  if (!secret) {
    return res.status(500).json({ valid: false, reason: "no_secret" });
  }
  const token = req.query?.token;
  const result = verifyToken(token, secret);
  const status = result.valid ? 200 : 400;
  return res.status(status).json(result);
};
