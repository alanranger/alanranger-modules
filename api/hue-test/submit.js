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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = req.url ? new URL(req.url, "http://localhost") : null;
  const pathname = url?.pathname || "";
  const isLatestPath = pathname.endsWith("/latest");

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  if (isLatestPath) {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const memberId =
      url?.searchParams.get("member_id") || (req.query && req.query.member_id);

    if (!memberId) {
      return res.status(400).json({ error: "member_id is required" });
    }

    const { data, error } = await supabase
      .from("academy_hue_test_results")
      .select("id, created_at, total_score, row_scores, band_errors, source")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[hue-test] Latest fetch error", error);
      return res.status(500).json({ error: "Failed to fetch result" });
    }

    res.setHeader("Cache-Control", "no-store");
    const latest = data?.length ? data[0] : null;
    return res.status(200).json({ data: latest });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getIp(req);
  if (shouldRateLimit(`ip:${ip}`, 10, 60 * 1000)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const {
    member_id: memberId,
    source,
    total_score: totalScore,
    row_scores: rowScores,
    band_errors: bandErrors,
    row_orders: rowOrders
  } = body || {};

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
};
