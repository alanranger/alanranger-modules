const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const memberId = req.query.member_id;
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
