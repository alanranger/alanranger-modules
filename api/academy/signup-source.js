// /api/academy/signup-source.js
// Client flush of first-touch ?src= attribution onto the member's trial row.
// Fail-safe: bad payloads return 200 with ok:false so signup never breaks.

const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight } = require("../exams/_cors");
const { storeSignupAttribution, normalizeSignupSource } = require("../../lib/signupSource");

const ALLOWED_ORIGINS = [
  "https://www.alanranger.com",
  "https://alanranger.com",
];

function checkOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  return (
    ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(`${o}/`)) ||
    ALLOWED_ORIGINS.some((o) => referer.startsWith(o))
  );
}

function parseBody(req) {
  try {
    if (!req.body) return {};
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!checkOrigin(req)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const body = parseBody(req);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) {
    return res.status(200).json({ ok: false, reason: "misconfigured" });
  }

  try {
    const supabase = createClient(supabaseUrl, key);
    const result = await storeSignupAttribution(supabase, {
      member_id: body.member_id,
      signup_source: body.signup_source || body.src,
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      landing_path: body.landing_path,
    });
    return res.status(200).json({
      ...result,
      normalized: normalizeSignupSource(body.signup_source || body.src),
    });
  } catch (err) {
    console.warn("[signup-source]", err.message);
    return res.status(200).json({ ok: false, reason: err.message });
  }
};
