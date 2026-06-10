// Script to clean up orphaned records in Supabase for a deleted member
// Usage: node scripts/cleanup-orphaned-records.js <member_id> [email]
// Example: node scripts/cleanup-orphaned-records.js mem_cmkdxxb8f0h4y0sso0cn582mx oladapoblessing205@gmail.com

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanupOrphanedRecords(memberId, email) {
  console.log(`\n🧹 Cleaning up orphaned records for:`);
  console.log(`   Member ID: ${memberId}`);
  if (email) console.log(`   Email: ${email}\n`);

  try {
    let totalDeleted = 0;

    // 1. Check and delete from academy_events
    const { count: eventsCount } = await supabase
      .from("academy_events")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);

    if (eventsCount > 0) {
      const { error: eventsError } = await supabase
        .from("academy_events")
        .delete()
        .eq("member_id", memberId);
      
      if (eventsError) {
        console.error(`❌ Error deleting academy_events:`, eventsError);
      } else {
        console.log(`✅ Deleted ${eventsCount} academy_events records`);
        totalDeleted += eventsCount;
      }
    } else {
      console.log(`ℹ️  No academy_events records found`);
    }

    // 2. Check and delete from module_results_ms by member_id
    const { count: moduleResultsCount } = await supabase
      .from("module_results_ms")
      .select("*", { count: "exact", head: true })
      .eq("memberstack_id", memberId);

    if (moduleResultsCount > 0) {
      const { error: moduleResultsError } = await supabase
        .from("module_results_ms")
        .delete()
        .eq("memberstack_id", memberId);
      
      if (moduleResultsError) {
        console.error(`❌ Error deleting module_results_ms:`, moduleResultsError);
      } else {
        console.log(`✅ Deleted ${moduleResultsCount} module_results_ms records (by member_id)`);
        totalDeleted += moduleResultsCount;
      }
    } else {
      console.log(`ℹ️  No module_results_ms records found (by member_id)`);
    }

    // 3. Check and delete from module_results_ms by email (if email provided)
    if (email) {
      const { count: moduleResultsByEmailCount } = await supabase
        .from("module_results_ms")
        .select("*", { count: "exact", head: true })
        .eq("email", email.toLowerCase());

      if (moduleResultsByEmailCount > 0) {
        const { error: moduleResultsByEmailError } = await supabase
          .from("module_results_ms")
          .delete()
          .eq("email", email.toLowerCase());
        
        if (moduleResultsByEmailError) {
          console.error(`❌ Error deleting module_results_ms (by email):`, moduleResultsByEmailError);
        } else {
          console.log(`✅ Deleted ${moduleResultsByEmailCount} module_results_ms records (by email)`);
          totalDeleted += moduleResultsByEmailCount;
        }
      } else {
        console.log(`ℹ️  No module_results_ms records found (by email)`);
      }
    }

    // 4. Check and delete from academy_plan_events
    const { count: planEventsCount } = await supabase
      .from("academy_plan_events")
      .select("*", { count: "exact", head: true })
      .eq("ms_member_id", memberId);

    if (planEventsCount > 0) {
      const { error: planEventsError } = await supabase
        .from("academy_plan_events")
        .delete()
        .eq("ms_member_id", memberId);
      
      if (planEventsError) {
        console.error(`❌ Error deleting academy_plan_events:`, planEventsError);
      } else {
        console.log(`✅ Deleted ${planEventsCount} academy_plan_events records`);
        totalDeleted += planEventsCount;
      }
    } else {
      console.log(`ℹ️  No academy_plan_events records found`);
    }

    // 5. Check and delete from exam_member_links
    const { count: examLinksCount } = await supabase
      .from("exam_member_links")
      .select("*", { count: "exact", head: true })
      .eq("memberstack_id", memberId);

    if (examLinksCount > 0) {
      const { error: examLinksError } = await supabase
        .from("exam_member_links")
        .delete()
        .eq("memberstack_id", memberId);
      
      if (examLinksError) {
        console.error(`❌ Error deleting exam_member_links:`, examLinksError);
      } else {
        console.log(`✅ Deleted ${examLinksCount} exam_member_links records`);
        totalDeleted += examLinksCount;
      }
    } else {
      console.log(`ℹ️  No exam_member_links records found`);
    }

    // 6. Check and delete from ms_members_cache (shouldn't exist, but check anyway)
    const { count: cacheCount } = await supabase
      .from("ms_members_cache")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);

    if (cacheCount > 0) {
      const { error: cacheError } = await supabase
        .from("ms_members_cache")
        .delete()
        .eq("member_id", memberId);
      
      if (cacheError) {
        console.error(`❌ Error deleting ms_members_cache:`, cacheError);
      } else {
        console.log(`✅ Deleted ${cacheCount} ms_members_cache record`);
        totalDeleted += cacheCount;
      }
    } else {
      console.log(`ℹ️  No ms_members_cache record found`);
    }

    // 7. Check and delete from academy_qa_questions (if exists)
    const { count: qaCount } = await supabase
      .from("academy_qa_questions")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);

    if (qaCount > 0) {
      const { error: qaError } = await supabase
        .from("academy_qa_questions")
        .delete()
        .eq("member_id", memberId);
      
      if (qaError) {
        console.error(`❌ Error deleting academy_qa_questions:`, qaError);
      } else {
        console.log(`✅ Deleted ${qaCount} academy_qa_questions records`);
        totalDeleted += qaCount;
      }
    } else {
      console.log(`ℹ️  No academy_qa_questions records found`);
    }

    console.log(`\n✨ Cleanup complete!`);
    console.log(`   Total records deleted: ${totalDeleted}\n`);

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

// Get arguments from command line
const memberId = process.argv[2];
const email = process.argv[3];

if (!memberId) {
  console.error("Usage: node scripts/cleanup-orphaned-records.js <member_id> [email]");
  console.error("Example: node scripts/cleanup-orphaned-records.js mem_cmkdxxb8f0h4y0sso0cn582mx oladapoblessing205@gmail.com");
  process.exit(1);
}

// Run the cleanup
cleanupOrphanedRecords(memberId, email)
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
