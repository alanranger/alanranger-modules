// Seed Fix B + Fix C rows in activation_change_log (idempotent).
// Usage: node scripts/seed-activation-intervention-log.js

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { seedInterventionChangeLog } = require("../lib/activationMetricSnapshots");

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const results = await seedInterventionChangeLog(supabase);
  console.log(JSON.stringify({
    rows: results.map((r) => ({
      title: r.row.title || r.row.id,
      inserted: r.inserted,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
