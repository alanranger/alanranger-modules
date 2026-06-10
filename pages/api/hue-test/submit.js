const { createClient } = require("@supabase/supabase-js");

const rateBuckets = new Map();

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function shouldRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (entry.count >= limit) return true;
  entry.count += 1;
  return false;
}

function isValidArray(value) {
  return Array.isArray(value) && value.length > 0;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = req.url ? new URL(req.url, "http://localhost") : null;
  const pathname = url?.pathname || "";
  if (pathname.includes("/admin/refresh")) {
    const refreshModule = require("../admin/refresh");
    const refreshHandler = refreshModule.default || refreshModule;
    return refreshHandler(req, res);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const ip = getIp(req);
  if (shouldRateLimit(`ip:${ip}`, 10, 60 * 1000)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const {
    member_id: memberId,
    source,
    total_score: totalScore,
    row_scores: rowScores,
    band_errors: bandErrors,
    row_orders: rowOrders
  } = req.body || {};

  if (!Number.isFinite(totalScore) || !isValidArray(rowScores)) {
    return res.status(400).json({ error: "Invalid score payload" });
  }
  if (!isValidArray(bandErrors) || !isValidArray(rowOrders)) {
    return res.status(400).json({ error: "Invalid band or row data" });
  }
  if (source && source !== "public" && source !== "academy") {
    return res.status(400).json({ error: "Invalid source" });
  }
  if (memberId && shouldRateLimit(`member:${memberId}`, 10, 60 * 1000)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const insertPayload = {
    member_id: memberId || null,
    source: source || "public",
    total_score: Math.round(totalScore),
    row_scores: rowScores,
    band_errors: bandErrors,
    row_orders: rowOrders,
    user_agent: req.headers["user-agent"] || null
  };

  const { error } = await supabase
    .from("academy_hue_test_results")
    .insert([insertPayload]);

  if (error) {
    console.error("[hue-test] Insert error", error);
    return res.status(500).json({ error: "Failed to save result" });
  }

  return res.status(200).json({ success: true });
}
