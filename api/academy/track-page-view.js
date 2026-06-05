// /api/academy/track-page-view.js
// Client-safe page_view intake (no AR_ANALYTICS_KEY in browser)

const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight } = require("../exams/_cors");

const ALLOWED_ORIGINS = [
  "https://www.alanranger.com",
  "https://alanranger.com",
];
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 100;
const rateLimitStore = new Map();

function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "unknown"
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `pv_${ip}`;
  const record = rateLimitStore.get(key);
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(key, { firstRequest: now, count: 1 });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

function checkOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const originOk = ALLOWED_ORIGINS.some(
    (o) => origin === o || origin.startsWith(o + "/")
  );
  const refererOk = ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  return originOk || refererOk;
}

function parseBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

function sanitiseMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return meta;
}

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    if (!checkOrigin(req)) {
      console.warn(
        "[track-page-view] Rejected origin:",
        req.headers.origin,
        req.headers.referer
      );
      return res.status(403).json({ error: "Forbidden" });
    }

    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const body = parseBody(req);
    const member_id = body.member_id;
    const path = body.path;
    if (!member_id || typeof member_id !== "string") {
      return res.status(400).json({ error: "member_id is required" });
    }
    if (!path || typeof path !== "string") {
      return res.status(400).json({ error: "path is required" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase.from("academy_events").insert([
      {
        event_type: "page_view",
        member_id,
        email: body.email || null,
        path,
        title: body.title || null,
        category: body.category || null,
        session_id: null,
        meta: {
          ...sanitiseMeta(body.meta),
          user_agent: req.headers["user-agent"] || null,
          origin: req.headers.origin || req.headers.referer || null,
        },
      },
    ]);

    if (error) {
      console.error("[track-page-view] Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[track-page-view] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
