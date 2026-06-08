/**
 * Smoke-test buildMemberEmailSnapshot against real member IDs (read-only).
 * Usage: node scripts/test-member-email-snapshot.cjs [memberId ...]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { buildMemberEmailSnapshot } = require("../lib/member-email-snapshot");
const { evaluateStageTrigger } = require("../lib/emailStageTriggers");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let memberIds = process.argv.slice(2);
  if (!memberIds.length) {
    const { data } = await supabase
      .from("academy_trial_history")
      .select("member_id")
      .is("converted_at", null)
      .order("trial_start_at", { ascending: false })
      .limit(3);
    memberIds = (data || []).map((r) => r.member_id);
  }
  if (!memberIds.length) {
    console.error("No member IDs to test");
    process.exit(1);
  }

  for (const memberId of memberIds) {
    const snapshot = await buildMemberEmailSnapshot(supabase, memberId);
    console.log("\n===", memberId, "===");
    if (!snapshot) {
      console.log("snapshot: null");
      continue;
    }
    console.log(
      JSON.stringify(
        {
          email: snapshot.email,
          modulesOpened: snapshot.modulesOpened,
          trialDayNumber: snapshot.trialDayNumber,
          daysSinceLastLogin: snapshot.daysSinceLastLogin,
          currentBadgeLabel: snapshot.currentBadgeLabel,
          nextModuleTitle: snapshot.nextModuleTitle,
          modulesToNextBadge: snapshot.modulesToNextBadge,
        },
        null,
        2
      )
    );
    console.log("triggers:", {
      welcome: evaluateStageTrigger(snapshot, "trial-welcome-nudge"),
      progress: evaluateStageTrigger(snapshot, "trial-progress-nudge"),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
