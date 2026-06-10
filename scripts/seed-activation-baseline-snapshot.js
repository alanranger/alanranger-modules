// Freeze pre-intervention activation baseline (default: 2026-06-05).
// Usage: node scripts/seed-activation-baseline-snapshot.js

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const {
  writeActivationSnapshots,
  seedBaselineChangeLog,
} = require("../lib/activationMetricSnapshots");

const BASELINE_DATE = process.env.BASELINE_DATE || "2026-06-05";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const snapshotAt = new Date().toISOString();
  const snapshot = await writeActivationSnapshots(supabase, {
    snapshotDate: BASELINE_DATE,
    snapshotAt,
  });
  const changeLog = await seedBaselineChangeLog(supabase, BASELINE_DATE);

  console.log(JSON.stringify({
    baseline_date: BASELINE_DATE,
    snapshot_at: snapshotAt,
    upserted: snapshot.upserted,
    change_log_seeded: changeLog.seeded,
    rows: snapshot.rows.map((r) => ({
      period: r.period,
      metric_key: r.metric_key,
      numerator: r.numerator,
      denominator: r.denominator,
      pct: r.pct,
      target_pct: r.target_pct,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
