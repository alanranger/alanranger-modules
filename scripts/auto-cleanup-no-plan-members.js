// Automated cleanup script for members without plans
// This script:
// 1. Finds all members in Memberstack without active plans
// 2. Deletes them from Memberstack
// 3. Deletes them from Supabase (including all related records)
// 4. Cleans up any orphaned records
// 
// Designed to be run via cron job every 8 hours
// Can also be run manually: node scripts/auto-cleanup-no-plan-members.js

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");

// Hardcode credentials to avoid .env.local truncation issues
const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Get Memberstack key from environment
require("dotenv").config({ path: ".env.local" });
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;

if (!MEMBERSTACK_SECRET_KEY) {
  console.error("Error: MEMBERSTACK_SECRET_KEY must be set in .env.local");
  process.exit(1);
}

const memberstack = memberstackAdmin.init(MEMBERSTACK_SECRET_KEY);

async function cleanupMembersWithoutPlans() {
  console.log("\n🔄 Starting automated cleanup of members without plans...\n");
  console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

  const results = {
    membersChecked: 0,
    membersWithoutPlans: [],
    deletedFromMemberstack: 0,
    deletedFromSupabase: 0,
    orphanedRecordsCleaned: 0,
    errors: []
  };

  try {
    // Step 1: Get all members from Memberstack
    console.log("📥 Fetching all members from Memberstack...");
    const memberstackMembers = [];
    let after = null;
    const limit = 100;
    let totalFetched = 0;

    while (true) {
      try {
        const params = { limit };
        if (after) params.after = after;

        const { data: members, error: listError } = await memberstack.members.list(params);

        if (listError) {
          console.error("❌ Error listing members:", listError);
          results.errors.push({ step: "fetch_memberstack", error: listError.message });
          break;
        }

        if (!members || members.length === 0) {
          break;
        }

        memberstackMembers.push(...members);
        totalFetched += members.length;
        console.log(`   Fetched ${totalFetched} members...`);

        if (members.length < limit) {
          break;
        }

        after = members[members.length - 1]?.id || null;
        if (!after) break;
      } catch (error) {
        console.error("❌ Error fetching from Memberstack:", error.message);
        results.errors.push({ step: "fetch_memberstack", error: error.message });
        break;
      }
    }

    results.membersChecked = memberstackMembers.length;
    console.log(`✅ Found ${memberstackMembers.length} total members in Memberstack\n`);

    // Step 2: Identify members without plans
    console.log("🔍 Identifying members without plans...");
    for (const member of memberstackMembers) {
      const email = member.auth?.email || member.email || "";
      const memberId = member.id;
      
      // Check if member has any active plans
      const hasActivePlan = member.planConnections && 
        Array.isArray(member.planConnections) && 
        member.planConnections.length > 0 &&
        member.planConnections.some(plan => {
          const status = (plan.status || "").toUpperCase();
          return status === "ACTIVE" || status === "TRIALING";
        });

      if (!hasActivePlan) {
        results.membersWithoutPlans.push({
          member_id: memberId,
          email: email,
          name: member.name || "N/A"
        });
      }
    }

    console.log(`✅ Found ${results.membersWithoutPlans.length} members without active plans\n`);

    if (results.membersWithoutPlans.length === 0) {
      console.log("✨ No members without plans found. Cleanup complete!\n");
      return results;
    }

    // Step 3: Delete from Memberstack and Supabase
    console.log(`🗑️  Deleting ${results.membersWithoutPlans.length} members without plans...\n`);

    for (const member of results.membersWithoutPlans) {
      try {
        // Delete from Memberstack
        console.log(`   Deleting ${member.email || member.member_id} from Memberstack...`);
        const { error: deleteError } = await memberstack.members.delete({ id: member.member_id });
        
        if (deleteError) {
          console.error(`   ❌ Error deleting from Memberstack:`, deleteError.message);
          results.errors.push({ 
            step: "delete_memberstack", 
            member: member.email, 
            error: deleteError.message 
          });
          continue;
        }

        results.deletedFromMemberstack++;
        console.log(`   ✅ Deleted from Memberstack`);

        // Delete from Supabase (including all related records)
        await deleteMemberFromSupabase(member.member_id, member.email);
        results.deletedFromSupabase++;

      } catch (error) {
        console.error(`   ❌ Error processing ${member.email}:`, error.message);
        results.errors.push({ 
          step: "process_member", 
          member: member.email, 
          error: error.message 
        });
      }
    }

    // Step 4: Clean up orphaned records
    console.log("\n🧹 Cleaning up orphaned records...");
    const orphanedCount = await cleanupOrphanedRecords(memberstackMembers);
    results.orphanedRecordsCleaned = orphanedCount;

    console.log("\n✨ Cleanup complete!\n");
    console.log("📊 Summary:");
    console.log(`   Members checked: ${results.membersChecked}`);
    console.log(`   Members without plans: ${results.membersWithoutPlans.length}`);
    console.log(`   Deleted from Memberstack: ${results.deletedFromMemberstack}`);
    console.log(`   Deleted from Supabase: ${results.deletedFromSupabase}`);
    console.log(`   Orphaned records cleaned: ${results.orphanedRecordsCleaned}`);
    console.log(`   Errors: ${results.errors.length}\n`);

    return results;

  } catch (error) {
    console.error("❌ Fatal error during cleanup:", error);
    results.errors.push({ step: "fatal", error: error.message });
    throw error;
  }
}

async function deleteMemberFromSupabase(memberId, email) {
  let relatedDeleted = 0;

  // Delete academy_events
  if (memberId) {
    const { count: eventsCount } = await supabase
      .from("academy_events")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);
    
    if (eventsCount > 0) {
      await supabase.from("academy_events").delete().eq("member_id", memberId);
      relatedDeleted += eventsCount;
    }
  }

  // Delete module_results_ms
  if (memberId) {
    const { count: resultsCount } = await supabase
      .from("module_results_ms")
      .select("*", { count: "exact", head: true })
      .eq("memberstack_id", memberId);
    
    if (resultsCount > 0) {
      await supabase.from("module_results_ms").delete().eq("memberstack_id", memberId);
      relatedDeleted += resultsCount;
    }
  }
  
  if (email) {
    const { count: resultsByEmailCount } = await supabase
      .from("module_results_ms")
      .select("*", { count: "exact", head: true })
      .eq("email", email);
    
    if (resultsByEmailCount > 0) {
      await supabase.from("module_results_ms").delete().eq("email", email);
      relatedDeleted += resultsByEmailCount;
    }
  }

  // Delete academy_plan_events
  if (memberId) {
    const { count: planEventsCount } = await supabase
      .from("academy_plan_events")
      .select("*", { count: "exact", head: true })
      .eq("ms_member_id", memberId);
    
    if (planEventsCount > 0) {
      await supabase.from("academy_plan_events").delete().eq("ms_member_id", memberId);
      relatedDeleted += planEventsCount;
    }
  }

  // Delete exam_member_links
  if (memberId) {
    const { count: examLinksCount } = await supabase
      .from("exam_member_links")
      .select("*", { count: "exact", head: true })
      .eq("memberstack_id", memberId);
    
    if (examLinksCount > 0) {
      await supabase.from("exam_member_links").delete().eq("memberstack_id", memberId);
      relatedDeleted += examLinksCount;
    }
  }

  // Delete academy_qa_questions
  if (memberId) {
    const { count: qaCount } = await supabase
      .from("academy_qa_questions")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);
    
    if (qaCount > 0) {
      await supabase.from("academy_qa_questions").delete().eq("member_id", memberId);
      relatedDeleted += qaCount;
    }
  }

  // Finally, delete from ms_members_cache
  if (memberId) {
    await supabase.from("ms_members_cache").delete().eq("member_id", memberId);
  }

  return relatedDeleted;
}

async function cleanupOrphanedRecords(validMemberstackMembers) {
  // Create sets of valid emails and IDs
  const validEmails = new Set(
    validMemberstackMembers.map(m => {
      const email = m.auth?.email || m.email || "";
      return email.toLowerCase().trim();
    }).filter(Boolean)
  );
  
  const validIds = new Set(
    validMemberstackMembers.map(m => m.id).filter(Boolean)
  );

  // Get all Supabase cache entries
  const { data: supabaseMembers, error } = await supabase
    .from("ms_members_cache")
    .select("member_id, email")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("   ❌ Error fetching Supabase members:", error.message);
    return 0;
  }

  // Find orphaned records
  const orphaned = (supabaseMembers || []).filter(m => {
    const email = (m.email || "").toLowerCase().trim();
    const memberId = m.member_id;
    
    const emailExists = email && validEmails.has(email);
    const idExists = memberId && validIds.has(memberId);
    
    return !emailExists && !idExists;
  });

  if (orphaned.length === 0) {
    return 0;
  }

  // Delete orphaned records
  let deleted = 0;
  for (const member of orphaned) {
    try {
      await deleteMemberFromSupabase(member.member_id, member.email);
      deleted++;
    } catch (error) {
      console.error(`   ❌ Error deleting orphaned record ${member.email}:`, error.message);
    }
  }

  return deleted;
}

// Run if called directly
if (require.main === module) {
  cleanupMembersWithoutPlans()
    .then(results => {
      console.log("\n✅ Script completed successfully");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n❌ Script failed:", error);
      process.exit(1);
    });
}

module.exports = { cleanupMembersWithoutPlans };
