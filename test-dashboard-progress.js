// Test script to diagnose dashboard progress API issue
// Run with: node test-dashboard-progress.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.EXAMS_API_BASE || "https://alanranger-modules.vercel.app";
const TEST_EMAIL = "algenon@hotmail.com";

async function testDiagnosis() {
  console.log("=".repeat(80));
  console.log("DASHBOARD PROGRESS API DIAGNOSIS TEST");
  console.log("=".repeat(80));
  console.log(`Testing for: ${TEST_EMAIL}\n`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing environment variables!");
    console.error("   SUPABASE_URL:", SUPABASE_URL ? "✅" : "❌");
    console.error("   SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "✅" : "❌");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Step 1: Check what data exists in Supabase for this email
  console.log("STEP 1: Checking Supabase data for", TEST_EMAIL);
  console.log("-".repeat(80));

  // Check module_results_ms by email
  const { data: examsByEmail, error: emailError } = await supabase
    .from('module_results_ms')
    .select('*')
    .eq('email', TEST_EMAIL)
    .order('created_at', { ascending: false });

  if (emailError) {
    console.error("❌ Error querying by email:", emailError);
  } else {
    console.log(`✅ Found ${examsByEmail?.length || 0} exam records by email`);
    if (examsByEmail && examsByEmail.length > 0) {
      console.log("   Sample record:", {
        module_id: examsByEmail[0].module_id,
        score_percent: examsByEmail[0].score_percent,
        passed: examsByEmail[0].passed,
        memberstack_id: examsByEmail[0].memberstack_id,
        email: examsByEmail[0].email,
        created_at: examsByEmail[0].created_at
      });
      
      // Check if all records have the same memberstack_id
      const memberstackIds = [...new Set(examsByEmail.map(r => r.memberstack_id).filter(Boolean))];
      console.log(`   Unique memberstack_ids found: ${memberstackIds.length}`);
      memberstackIds.forEach((id, idx) => {
        const count = examsByEmail.filter(r => r.memberstack_id === id).length;
        console.log(`     ${idx + 1}. ${id} (${count} records)`);
      });
    }
  }

  // Check ms_members_cache for this email
  const { data: memberCache, error: cacheError } = await supabase
    .from('ms_members_cache')
    .select('*')
    .eq('email', TEST_EMAIL)
    .single();

  if (cacheError && cacheError.code !== 'PGRST116') {
    console.error("❌ Error querying member cache:", cacheError);
  } else if (memberCache) {
    console.log(`✅ Found member cache record:`);
    console.log("   member_id:", memberCache.member_id);
    console.log("   email:", memberCache.email);
    console.log("   name:", memberCache.name);
  } else {
    console.log("⚠️  No member cache record found for this email");
  }

  // Step 2: If we found a memberstack_id, check what exams exist for that ID
  const memberstackId = examsByEmail?.[0]?.memberstack_id || memberCache?.member_id;
  
  if (memberstackId) {
    console.log("\nSTEP 2: Checking exams by memberstack_id:", memberstackId);
    console.log("-".repeat(80));

    const { data: examsById, error: idError } = await supabase
      .from('module_results_ms')
      .select('*')
      .eq('memberstack_id', memberstackId)
      .order('created_at', { ascending: false });

    if (idError) {
      console.error("❌ Error querying by memberstack_id:", idError);
    } else {
      console.log(`✅ Found ${examsById?.length || 0} exam records by memberstack_id`);
      if (examsById && examsById.length > 0) {
        console.log("   Modules attempted:", [...new Set(examsById.map(r => r.module_id))]);
      }
    }
  } else {
    console.log("\n⚠️  STEP 2: No memberstack_id found - cannot test by ID");
  }

  // Step 3: Test the actual API endpoint (if we have a memberstack_id)
  if (memberstackId) {
    console.log("\nSTEP 3: Testing API endpoint");
    console.log("-".repeat(80));
    console.log(`   URL: ${API_BASE}/api/exams/progress`);
    console.log(`   Method: GET`);
    console.log(`   Header: X-Memberstack-Id: ${memberstackId}`);

    try {
      const response = await fetch(`${API_BASE}/api/exams/progress`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Memberstack-Id': memberstackId
        }
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`   ❌ API Error Response:`, errorText);
      } else {
        const data = await response.json();
        console.log(`   ✅ API Success!`);
        console.log(`   Summary:`, {
          passedCount: data.summary?.passedCount,
          failedCount: data.summary?.failedCount,
          totalAttempts: data.summary?.totalAttempts
        });
        console.log(`   Modules with data:`, data.modules?.filter(m => m.status !== 'not_taken').length || 0);
      }
    } catch (error) {
      console.error(`   ❌ Fetch Error:`, error.message);
      console.error(`   Error type:`, error.name);
      if (error.cause) {
        console.error(`   Error cause:`, error.cause);
      }
    }
  } else {
    console.log("\n⚠️  STEP 3: Cannot test API - no memberstack_id available");
  }

  // Step 4: Check what the dashboard code is actually sending
  console.log("\nSTEP 4: Dashboard code analysis");
  console.log("-".repeat(80));
  console.log("   The dashboard calls: loadExamProgress(member)");
  console.log("   It extracts memberId from: member.id || member.data.id");
  console.log("   It sends header: X-Memberstack-Id: <memberId>");
  console.log("   API endpoint only queries by: memberstack_id (NO EMAIL FALLBACK)");
  console.log("\n   ⚠️  ISSUE IDENTIFIED:");
  console.log("      - API endpoint (/api/exams/progress) only queries by memberstack_id");
  console.log("      - If memberstack_id doesn't match, no results are returned");
  console.log("      - No email fallback exists in this endpoint");
  console.log("      - Admin dashboard works because it uses /api/admin/progress which has email fallback");

  // Step 5: Compare with admin progress endpoint behavior
  console.log("\nSTEP 5: Comparison with admin endpoint");
  console.log("-".repeat(80));
  console.log("   Admin endpoint (/api/admin/progress) has email fallback:");
  console.log("     1. Query by memberstack_id first");
  console.log("     2. If no results, get email from ms_members_cache");
  console.log("     3. Query by email as fallback");
  console.log("\n   User endpoint (/api/exams/progress) does NOT have email fallback:");
  console.log("     1. Query by memberstack_id only");
  console.log("     2. If no results, return empty array");
  console.log("     3. No email fallback");

  console.log("\n" + "=".repeat(80));
  console.log("DIAGNOSIS COMPLETE");
  console.log("=".repeat(80));
}

testDiagnosis().catch(console.error);
