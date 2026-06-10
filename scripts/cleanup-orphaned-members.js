// Script to identify and clean up orphaned member records
// Orphaned = members in Supabase ms_members_cache but not in Memberstack
// Usage: node scripts/cleanup-orphaned-members.js [--dry-run] [--delete]

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
const DELETE = process.argv.includes("--delete");

async function cleanupOrphanedMembers() {
  console.log("\n🔍 Finding orphaned member records...\n");
  
  if (DRY_RUN) {
    console.log("⚠️  DRY RUN MODE - No changes will be made\n");
  } else if (DELETE) {
    console.log("🗑️  DELETE MODE - Orphaned records will be deleted\n");
  } else {
    console.log("ℹ️  IDENTIFY MODE - Use --delete to remove orphaned records\n");
  }

  // Step 1: Get all members from Memberstack
  console.log("📥 Fetching members from Memberstack...");
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
        break;
      }

      if (!members || members.length === 0) {
        break;
      }

      memberstackMembers.push(...members);
      totalFetched += members.length;
      console.log(`   Fetched ${totalFetched} members...`);

      // Check if there are more pages
      if (members.length < limit) {
        break;
      }

      after = members[members.length - 1]?.id || null;
      if (!after) break;
    } catch (error) {
      console.error("❌ Error fetching from Memberstack:", error.message);
      break;
    }
  }
  
  const memberstackEmails = new Set(
    memberstackMembers.map(m => {
      const email = m.auth?.email || m.email || "";
      return email.toLowerCase().trim();
    }).filter(Boolean)
  );
  const memberstackIds = new Set(
    memberstackMembers.map(m => m.id).filter(Boolean)
  );
  
  console.log(`✅ Found ${memberstackMembers.length} members in Memberstack\n`);

  // Step 2: Get all members from Supabase cache
  console.log("📥 Fetching members from Supabase cache...");
  const { data: supabaseMembers, error } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name, plan_summary, created_at")
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("❌ Error fetching from Supabase:", error);
    return;
  }
  
  console.log(`✅ Found ${supabaseMembers.length} members in Supabase cache\n`);

  // Step 3: Identify orphaned records
  // A member is orphaned if BOTH email AND member_id are not found in Memberstack
  const orphaned = supabaseMembers.filter(m => {
    const email = (m.email || "").toLowerCase().trim();
    const memberId = m.member_id;
    
    // Check if email exists in Memberstack
    const emailExists = email && memberstackEmails.has(email);
    // Check if member_id exists in Memberstack
    const idExists = memberId && memberstackIds.has(memberId);
    
    // Orphaned if NEITHER email NOR member_id exists in Memberstack
    // Also orphaned if both are missing/empty
    return !emailExists && !idExists;
  });

  console.log(`\n🔍 Found ${orphaned.length} orphaned member records:\n`);

  if (orphaned.length === 0) {
    console.log("✨ No orphaned records found! Everything is in sync.\n");
    return;
  }

  // Display orphaned records
  orphaned.forEach((m, idx) => {
    const plan = m.plan_summary || {};
    const planType = plan.plan_type || "none";
    const status = (plan.status || "").toUpperCase();
    
    console.log(`${idx + 1}. ${m.email || "NO EMAIL"}`);
    console.log(`   Member ID: ${m.member_id || "NO ID"}`);
    console.log(`   Name: ${m.name || "N/A"}`);
    console.log(`   Plan Type: ${planType}`);
    console.log(`   Status: ${status}`);
    console.log(`   Created: ${m.created_at}`);
    console.log("");
  });

  // Step 4: Clean up orphaned records if requested
  if (DELETE && !DRY_RUN) {
    console.log(`\n🗑️  Deleting ${orphaned.length} orphaned records from Supabase...\n`);
    
    let deletedCount = 0;
    let errorCount = 0;

    for (const member of orphaned) {
      try {
        // Delete from ms_members_cache
        const { error: cacheError } = await supabase
          .from("ms_members_cache")
          .delete()
          .eq("member_id", member.member_id);
        
        if (cacheError) {
          console.error(`   ❌ Error deleting ${member.email}:`, cacheError.message);
          errorCount++;
          continue;
        }

        // Clean up related records using the cleanup script logic
        const memberId = member.member_id;
        const email = member.email;

        let relatedDeleted = 0;

        // Delete academy_events (by member_id)
        if (memberId) {
          const { count: eventsCount } = await supabase
            .from("academy_events")
            .select("*", { count: "exact", head: true })
            .eq("member_id", memberId);
          
          if (eventsCount > 0) {
            const { error: eventsError } = await supabase
              .from("academy_events")
              .delete()
              .eq("member_id", memberId);
            if (!eventsError) relatedDeleted += eventsCount;
          }
        }

        // Delete module_results_ms (by member_id and email)
        if (memberId) {
          const { count: resultsCount } = await supabase
            .from("module_results_ms")
            .select("*", { count: "exact", head: true })
            .eq("memberstack_id", memberId);
          
          if (resultsCount > 0) {
            const { error: resultsError } = await supabase
              .from("module_results_ms")
              .delete()
              .eq("memberstack_id", memberId);
            if (!resultsError) relatedDeleted += resultsCount;
          }
        }
        
        if (email) {
          const { count: resultsByEmailCount } = await supabase
            .from("module_results_ms")
            .select("*", { count: "exact", head: true })
            .eq("email", email);
          
          if (resultsByEmailCount > 0) {
            const { error: emailResultsError } = await supabase
              .from("module_results_ms")
              .delete()
              .eq("email", email);
            if (!emailResultsError) relatedDeleted += resultsByEmailCount;
          }
        }

        // Delete academy_plan_events (affects revenue calculations)
        if (memberId) {
          const { count: planEventsCount } = await supabase
            .from("academy_plan_events")
            .select("*", { count: "exact", head: true })
            .eq("ms_member_id", memberId);
          
          if (planEventsCount > 0) {
            const { error: planEventsError } = await supabase
              .from("academy_plan_events")
              .delete()
              .eq("ms_member_id", memberId);
            if (!planEventsError) relatedDeleted += planEventsCount;
          }
        }

        // Delete exam_member_links
        if (memberId) {
          const { count: examLinksCount } = await supabase
            .from("exam_member_links")
            .select("*", { count: "exact", head: true })
            .eq("memberstack_id", memberId);
          
          if (examLinksCount > 0) {
            const { error: examLinksError } = await supabase
              .from("exam_member_links")
              .delete()
              .eq("memberstack_id", memberId);
            if (!examLinksError) relatedDeleted += examLinksCount;
          }
        }

        // Delete academy_qa_questions
        if (memberId) {
          const { count: qaCount } = await supabase
            .from("academy_qa_questions")
            .select("*", { count: "exact", head: true })
            .eq("member_id", memberId);
          
          if (qaCount > 0) {
            const { error: qaError } = await supabase
              .from("academy_qa_questions")
              .delete()
              .eq("member_id", memberId);
            if (!qaError) relatedDeleted += qaCount;
          }
        }

        deletedCount++;
        console.log(`   ✅ Deleted: ${member.email || member.member_id} (${relatedDeleted} related records)`);
      } catch (err) {
        console.error(`   ❌ Error cleaning up ${member.email}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\n✨ Cleanup complete!`);
    console.log(`   Deleted: ${deletedCount}`);
    console.log(`   Errors: ${errorCount}\n`);
  } else if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN - Would delete ${orphaned.length} orphaned records`);
    console.log(`   Run with --delete to actually remove them\n`);
  } else {
    console.log(`\nℹ️  To delete these orphaned records, run:`);
    console.log(`   node scripts/cleanup-orphaned-members.js --delete\n`);
  }
}

cleanupOrphanedMembers().catch(console.error);
