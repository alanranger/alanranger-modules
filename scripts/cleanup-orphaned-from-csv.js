// Script to clean up orphaned members using Memberstack CSV export
// This is a workaround when API key issues prevent direct Memberstack API access
// Usage: node scripts/cleanup-orphaned-from-csv.js <csv-file> [--delete]
// Example: node scripts/cleanup-orphaned-from-csv.js csv/member-export-2026-01-19T12-28-20-919Z.csv --delete

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Hardcode credentials to avoid .env.local truncation issues
const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DELETE = process.argv.includes("--delete");
const csvFile = process.argv.find(arg => arg.endsWith('.csv'));

if (!csvFile) {
  console.error("❌ Error: Please provide a CSV file path");
  console.log("Usage: node scripts/cleanup-orphaned-from-csv.js <csv-file> [--delete]");
  process.exit(1);
}

async function cleanupFromCSV() {
  console.log("\n🔍 Finding orphaned member records using CSV...\n");
  
  if (DELETE) {
    console.log("🗑️  DELETE MODE - Orphaned records will be deleted\n");
  } else {
    console.log("ℹ️  IDENTIFY MODE - Use --delete to remove orphaned records\n");
  }

  // Step 1: Read CSV file
  const csvPath = path.join(__dirname, "..", csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n");
  
  // Extract member IDs and emails from CSV (skip header)
  const csvMemberIds = new Set();
  const csvEmails = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length > 1) {
      const memberId = parts[0]?.trim();
      const email = parts[1]?.toLowerCase().trim();
      if (memberId) csvMemberIds.add(memberId);
      if (email) csvEmails.add(email);
    }
  }
  
  console.log(`✅ Found ${csvMemberIds.size} members in CSV (${csvEmails.size} emails)\n`);

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
  const orphaned = supabaseMembers.filter(m => {
    const email = (m.email || "").toLowerCase().trim();
    const memberId = m.member_id;
    
    // Orphaned if BOTH email AND member_id are not in CSV
    const emailExists = email && csvEmails.has(email);
    const idExists = memberId && csvMemberIds.has(memberId);
    
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
  if (DELETE) {
    console.log(`\n🗑️  Deleting ${orphaned.length} orphaned records from Supabase...\n`);
    
    let deletedCount = 0;
    let errorCount = 0;
    let totalRelatedDeleted = 0;

    for (const member of orphaned) {
      try {
        const memberId = member.member_id;
        const email = member.email;
        let relatedDeleted = 0;

        // Delete academy_events
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

        // Delete module_results_ms
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

        // Finally, delete from ms_members_cache
        const { error: cacheError } = await supabase
          .from("ms_members_cache")
          .delete()
          .eq("member_id", memberId);
        
        if (cacheError) {
          console.error(`   ❌ Error deleting ${member.email}:`, cacheError.message);
          errorCount++;
          continue;
        }

        deletedCount++;
        totalRelatedDeleted += relatedDeleted;
        console.log(`   ✅ Deleted: ${member.email || member.member_id} (${relatedDeleted} related records)`);
      } catch (err) {
        console.error(`   ❌ Error cleaning up ${member.email}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\n✨ Cleanup complete!`);
    console.log(`   Members deleted: ${deletedCount}`);
    console.log(`   Related records deleted: ${totalRelatedDeleted}`);
    console.log(`   Errors: ${errorCount}\n`);
  } else {
    console.log(`\nℹ️  To delete these orphaned records, run:`);
    console.log(`   node scripts/cleanup-orphaned-from-csv.js ${csvFile} --delete\n`);
  }
}

cleanupFromCSV().catch(console.error);
