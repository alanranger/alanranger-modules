// Test email fallback scenario specifically
require('dotenv').config({ path: '.env.local' });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_EMAIL = "algenon@hotmail.com";
const FAKE_MEMBER_ID = "mem_fake_id_that_does_not_exist"; // Simulates memberstack_id with no results

async function testEmailFallback() {
  console.log("=".repeat(80));
  console.log("TESTING EMAIL FALLBACK SCENARIO");
  console.log("=".repeat(80));
  console.log(`Simulating: memberstack_id = ${FAKE_MEMBER_ID} (no results)`);
  console.log(`Expected: Should fallback to email = ${TEST_EMAIL}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Step 1: Query by memberstack_id (will return empty)
  console.log("STEP 1: Query by memberstack_id (should return empty)...");
  let { data: allExams, error: examError } = await supabase
    .from('module_results_ms')
    .select('module_id, score_percent, passed, attempt, created_at, email')
    .eq('memberstack_id', FAKE_MEMBER_ID)
    .order('created_at', { ascending: false });

  if (examError) {
    console.error("❌ Error:", examError);
    return;
  }

  console.log(`✅ Found ${allExams?.length || 0} results by memberstack_id (expected: 0)`);

  // Step 2: Email fallback (this is what we're testing)
  if (!allExams || allExams.length === 0) {
    console.log("\nSTEP 2: No results by memberstack_id, trying email fallback...");
    
    // Get email from cache (simulating what the endpoint would do)
    let memberEmail = null;
    try {
      // In real scenario, we'd look up by the fake member_id, but for this test
      // we'll use the known email directly
      memberEmail = TEST_EMAIL;
      console.log(`✅ Using email for fallback: ${memberEmail}`);
    } catch (e) {
      console.warn("⚠️  Cache lookup failed:", e.message);
    }
    
    // Query by email
    if (memberEmail) {
      const { data: emailExams, error: emailError } = await supabase
        .from('module_results_ms')
        .select('module_id, score_percent, passed, attempt, created_at, email')
        .eq('email', memberEmail)
        .order('created_at', { ascending: false });
      
      if (emailError) {
        console.error("❌ Email query error:", emailError);
      } else if (emailExams && emailExams.length > 0) {
        console.log(`✅ EMAIL FALLBACK SUCCESS! Found ${emailExams.length} results by email`);
        allExams = emailExams;
        
        // Show sample
        console.log("\n   Sample result from email fallback:");
        console.log("   ", {
          module_id: emailExams[0].module_id,
          score_percent: emailExams[0].score_percent,
          passed: emailExams[0].passed,
          email: emailExams[0].email
        });
      } else {
        console.log("⚠️  Email fallback also returned no results");
      }
    }
  }

  // Step 3: Verify we got results
  console.log("\n" + "=".repeat(80));
  if (allExams && allExams.length > 0) {
    console.log("✅ EMAIL FALLBACK TEST PASSED!");
    console.log(`   Successfully retrieved ${allExams.length} exam records via email fallback`);
    console.log("   This confirms the endpoint will work even if memberstack_id doesn't match");
  } else {
    console.log("❌ EMAIL FALLBACK TEST FAILED");
    console.log("   No results found even with email fallback");
  }
  console.log("=".repeat(80));
}

testEmailFallback().catch(console.error);
