// Run supabase-activation-snapshots-migration.sql against Academy Supabase.
// Usage: npx supabase link --project-ref dqrtcsvqsfgbqmnonkpt --yes
//        node scripts/run-activation-snapshots-migration.js

const { execSync } = require("child_process");
const path = require("path");

const sqlPath = path.join(__dirname, "..", "supabase-activation-snapshots-migration.sql");

try {
  execSync(`npx supabase db query -f "${sqlPath}" --linked`, {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  console.log("Migration applied: activation_metric_snapshots + activation_change_log");
} catch (err) {
  console.error("Migration failed. Ensure the project is linked: npx supabase link --project-ref dqrtcsvqsfgbqmnonkpt --yes");
  process.exit(1);
}
