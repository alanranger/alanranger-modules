// Script to delete a member from Supabase by email (Academy project cache + related rows)
// Usage: node scripts/delete-member-by-email.js <email>
// Loads .env.local then .env — requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL

require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL). Set them in .env.local."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function deleteMemberByEmail(email) {
  console.log(`\n🔍 Searching for member with email: ${email}\n`);

  try {
    // Step 1: Find the member in ms_members_cache (case-insensitive search)
    const { data: members, error: memberError } = await supabase
      .from("ms_members_cache")
      .select("member_id, email, name")
      .ilike("email", email);

    if (memberError) {
      console.error(`❌ Error searching for member:`, memberError);
      return;
    }

    if (!members || members.length === 0) {
      console.warn(`❌ No row in ms_members_cache for: ${email}`);
      console.log(`\n🧹 Cleaning orphan rows by email only (events, module results, cache)...\n`);

      const { data: evDel } = await supabase
        .from("academy_events")
        .delete()
        .ilike("email", email)
        .select("id");
      const { data: modDel } = await supabase
        .from("module_results_ms")
        .delete()
        .ilike("email", email)
        .select("id");
      const { data: cacheDel } = await supabase
        .from("ms_members_cache")
        .delete()
        .ilike("email", email)
        .select("member_id");

      console.log(
        `   academy_events removed: ${evDel?.length || 0}, module_results_ms: ${modDel?.length || 0}, ms_members_cache: ${cacheDel?.length || 0}`
      );
      console.log(`\n💡 If trial_history / plan_events remain, they are keyed by old Memberstack ID — re-run after a cache row exists, or delete in SQL Editor by member_id.\n`);

      // Try partial match search for typos
      const searchTerm = email.split("@")[0];
      const { data: similarMembers } = await supabase
        .from("ms_members_cache")
        .select("member_id, email, name")
        .ilike("email", `%${searchTerm}%`)
        .limit(10);

      if (similarMembers && similarMembers.length > 0) {
        console.log(`Similar emails still in cache:`);
        similarMembers.forEach((m) => console.log(`   - ${m.email} (ID: ${m.member_id})`));
      }
      return;
    }

    // If multiple matches, use the first one (shouldn't happen with email, but just in case)
    const member = members[0];
    if (members.length > 1) {
      console.log(`⚠️  Warning: Found ${members.length} members with similar email. Using the first match.`);
    }

    const memberId = member.member_id;
    console.log(`✅ Found member:`);
    console.log(`   Member ID: ${memberId}`);
    console.log(`   Email: ${member.email}`);
    console.log(`   Name: ${member.name || "N/A"}\n`);

    // Step 2: Count related records before deletion
    console.log("📊 Counting related records...\n");

    const { count: eventsCount } = await supabase
      .from("academy_events")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);

    const { count: moduleResultsCount } = await supabase
      .from("module_results_ms")
      .select("*", { count: "exact", head: true })
      .eq("memberstack_id", memberId);

    const { count: planEventsCount } = await supabase
      .from("academy_plan_events")
      .select("*", { count: "exact", head: true })
      .eq("ms_member_id", memberId);

    const { count: examLinksCount } = await supabase
      .from("exam_member_links")
      .select("*", { count: "exact", head: true })
      .eq("memberstack_id", memberId);

    const { count: trialHistoryCount } = await supabase
      .from("academy_trial_history")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);

    const { count: annualHistoryCount } = await supabase
      .from("academy_annual_history")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);

    // Also check by email for legacy data
    const { count: moduleResultsByEmailCount } = await supabase
      .from("module_results_ms")
      .select("*", { count: "exact", head: true })
      .eq("email", email.toLowerCase());

    console.log(`   academy_events: ${eventsCount || 0} records`);
    console.log(`   module_results_ms (by member_id): ${moduleResultsCount || 0} records`);
    console.log(`   module_results_ms (by email): ${moduleResultsByEmailCount || 0} records`);
    console.log(`   academy_plan_events: ${planEventsCount || 0} records`);
    console.log(`   exam_member_links: ${examLinksCount || 0} records`);
    console.log(`   academy_trial_history: ${trialHistoryCount || 0} records`);
    console.log(`   academy_annual_history: ${annualHistoryCount || 0} records\n`);

    const totalRecords =
      (eventsCount || 0) +
      (moduleResultsCount || 0) +
      (moduleResultsByEmailCount || 0) +
      (planEventsCount || 0) +
      (examLinksCount || 0) +
      (trialHistoryCount || 0) +
      (annualHistoryCount || 0);

    if (totalRecords === 0) {
      console.log("ℹ️  No related records found.\n");
    }

    // Step 3: Confirm deletion
    console.log("⚠️  WARNING: This will permanently delete:");
    console.log(`   - Member record from ms_members_cache`);
    console.log(`   - All related records (${totalRecords} total)\n`);

    // For automated execution, we'll proceed (you can add a confirmation prompt if needed)
    console.log("🗑️  Proceeding with deletion...\n");

    // Step 4: Delete related records
    let deletedCount = 0;

    // Delete academy_events
    if (eventsCount > 0) {
      const { error: eventsError } = await supabase
        .from("academy_events")
        .delete()
        .eq("member_id", memberId);
      if (eventsError) {
        console.error(`❌ Error deleting academy_events:`, eventsError);
      } else {
        console.log(`✅ Deleted ${eventsCount} academy_events records`);
        deletedCount += eventsCount;
      }
    }

    // Delete module_results_ms by member_id
    if (moduleResultsCount > 0) {
      const { error: moduleResultsError } = await supabase
        .from("module_results_ms")
        .delete()
        .eq("memberstack_id", memberId);
      if (moduleResultsError) {
        console.error(`❌ Error deleting module_results_ms (by member_id):`, moduleResultsError);
      } else {
        console.log(`✅ Deleted ${moduleResultsCount} module_results_ms records (by member_id)`);
        deletedCount += moduleResultsCount;
      }
    }

    // Delete module_results_ms by email (legacy data)
    if (moduleResultsByEmailCount > 0) {
      const { error: moduleResultsByEmailError } = await supabase
        .from("module_results_ms")
        .delete()
        .eq("email", email.toLowerCase());
      if (moduleResultsByEmailError) {
        console.error(`❌ Error deleting module_results_ms (by email):`, moduleResultsByEmailError);
      } else {
        console.log(`✅ Deleted ${moduleResultsByEmailCount} module_results_ms records (by email)`);
        deletedCount += moduleResultsByEmailCount;
      }
    }

    // Delete academy_plan_events
    if (planEventsCount > 0) {
      const { error: planEventsError } = await supabase
        .from("academy_plan_events")
        .delete()
        .eq("ms_member_id", memberId);
      if (planEventsError) {
        console.error(`❌ Error deleting academy_plan_events:`, planEventsError);
      } else {
        console.log(`✅ Deleted ${planEventsCount} academy_plan_events records`);
        deletedCount += planEventsCount;
      }
    }

    // Delete exam_member_links
    if (examLinksCount > 0) {
      const { error: examLinksError } = await supabase
        .from("exam_member_links")
        .delete()
        .eq("memberstack_id", memberId);
      if (examLinksError) {
        console.error(`❌ Error deleting exam_member_links:`, examLinksError);
      } else {
        console.log(`✅ Deleted ${examLinksCount} exam_member_links records`);
        deletedCount += examLinksCount;
      }
    }

    if (trialHistoryCount > 0) {
      const { error: thErr } = await supabase
        .from("academy_trial_history")
        .delete()
        .eq("member_id", memberId);
      if (thErr) {
        console.error(`❌ Error deleting academy_trial_history:`, thErr);
      } else {
        console.log(`✅ Deleted ${trialHistoryCount} academy_trial_history records`);
        deletedCount += trialHistoryCount;
      }
    }

    if (annualHistoryCount > 0) {
      const { error: ahErr } = await supabase
        .from("academy_annual_history")
        .delete()
        .eq("member_id", memberId);
      if (ahErr) {
        console.error(`❌ Error deleting academy_annual_history:`, ahErr);
      } else {
        console.log(`✅ Deleted ${annualHistoryCount} academy_annual_history records`);
        deletedCount += annualHistoryCount;
      }
    }

    // Step 5: Delete the member record itself
    const { error: deleteError } = await supabase
      .from("ms_members_cache")
      .delete()
      .eq("member_id", memberId);

    if (deleteError) {
      console.error(`❌ Error deleting member record:`, deleteError);
      return;
    }

    console.log(`✅ Deleted member record from ms_members_cache\n`);

    // Step 6: Summary
    console.log("✨ Deletion complete!");
    console.log(`   Total records deleted: ${deletedCount + 1} (${deletedCount} related + 1 member record)\n`);

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/delete-member-by-email.js <email>");
  console.error("Example: node scripts/delete-member-by-email.js oladapoblessing205@gmail.com");
  process.exit(1);
}

// Run the deletion
deleteMemberByEmail(email)
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
