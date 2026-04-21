// api/academy/reengage-redirect.js
// Server-side redirect handler for Academy re-engagement email links. Accepts
// a signed ar_rewind token as ?t=<token>, validates the HMAC, extracts the
// member's email, and 302s them to the Squarespace login page with the email
// already attached as ?ar_rewind_email=... — which the login-prefill snippet
// consumes to pre-fill the Memberstack form.
//
// Why this exists:
//   When an email links directly to /academy/dashboard?ar_rewind=..., the
//   dashboard's Memberstack gating can intercept and redirect to
//   /academy/login while stripping our query params. Our client-side
//   dashboard snippet never gets a chance to pass the email through. Routing
//   via this server-side hop guarantees the email always survives the bounce.
//
// The endpoint is idempotent, stateless, and safe to hit any number of times
// within the token's expiry window; past expiry it still redirects but
// without the email prefill (member can still reach the Academy manually).

const crypto = require("node:crypto");

const REENGAGE_LINK_SECRET =
  process.env.REENGAGE_LINK_SECRET || process.env.ORPHANED_WEBHOOK_SECRET || "";
const LOGIN_URL = "https://www.alanranger.com/academy/login";

function base64UrlDecode(input) {
  const pad = 4 - (input.length % 4);
  const padded = input + (pad < 4 ? "=".repeat(pad) : "");
  const norm = padded.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(norm, "base64").toString("utf8");
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyToken(token) {
  if (!REENGAGE_LINK_SECRET) return { ok: false, reason: "no_secret" };
  if (!token || typeof token !== "string") return { ok: false, reason: "no_token" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", REENGAGE_LINK_SECRET)
    .update(payloadB64)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (!safeEqual(sig, expectedSig)) return { ok: false, reason: "bad_signature" };
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (err) {
    return { ok: false, reason: "bad_payload" };
  }
  if (payload?.exp && Date.now() > payload.exp) {
    return { ok: false, reason: "expired", payload };
  }
  return { ok: true, payload };
}

function buildLoginRedirect(token, result) {
  const params = new URLSearchParams();
  if (result.ok && result.payload?.em) {
    params.set("ar_rewind_email", String(result.payload.em));
  }
  // Always pass the original token through so the dashboard snippet can
  // re-open the upgrade modal after login succeeds.
  if (token) params.set("ar_rewind", String(token));
  params.set("redirect_to", "dashboard");
  return `${LOGIN_URL}?${params.toString()}`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = String(req.query?.t || req.query?.token || "");
  const result = verifyToken(token);

  if (!result.ok) {
    console.warn(
      `[reengage-redirect] token validation failed: ${result.reason}`
    );
  }

  const target = buildLoginRedirect(token, result);
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(302, { Location: target });
  return res.end();
};
