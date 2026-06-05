// Weekly activation metric snapshot cron.
// Schedule: Monday 04:00 UTC (0 4 * * 1) — see vercel.json.

const { createClient } = require("@supabase/supabase-js");
const { writeActivationSnapshots } = require("../../lib/activationMetricSnapshots");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.query.secret || req.headers["x-cron-secret"];
  if (cronSecret && providedSecret !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const result = await writeActivationSnapshots(supabase);
    return res.status(200).json({
      success: true,
      snapshot_date: result.snapshotDate,
      snapshot_at: result.snapshotAt,
      upserted: result.upserted,
      row_count: result.rows.length,
    });
  } catch (error) {
    console.error("[activation-snapshot-cron] Failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};
