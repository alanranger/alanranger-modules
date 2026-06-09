/**
 * Quick renewal-date availability check for paid-renewal-soon.
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { parseRenewalContext } = require("../lib/paid-lifecycle-email");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, plan_summary")
    .not("email", "is", null);
  let annualRecurring = 0;
  let withPeriodEnd = 0;
  let at14Days = 0;
  for (const row of data || []) {
    const plan = row.plan_summary || {};
    if (plan.plan_type !== "annual") continue;
    if (plan.payment_mode && plan.payment_mode !== "RECURRING") continue;
    annualRecurring += 1;
    if (plan.current_period_end || plan.expiry_date) withPeriodEnd += 1;
    const renewal = parseRenewalContext(plan);
    if (renewal && renewal.daysUntilRenewal === 14) at14Days += 1;
  }
  console.log(
    JSON.stringify(
      {
        totalMembers: (data || []).length,
        annualRecurring,
        withPeriodEnd,
        at14DaysToday: at14Days,
        periodEndCoveragePct: annualRecurring
          ? Math.round((withPeriodEnd / annualRecurring) * 100)
          : null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
