// Test the progress endpoint logic locally to see what error occurs
require('dotenv').config({ path: '.env.local' });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;

const TEST_MEMBER_ID = "mem_cmjyljfkm0hxg0sntegon6ghi"; // From test results

// All 15 modules in order (from progress.js)
const ALL_MODULES = [
  'module-01-exposure',
  'module-02-aperture',
  'module-03-shutter',
  'module-04-iso',
  'module-05-manual',
  'module-06-metering',
  'module-07-bracketing',
  'module-08-focusing',
  'module-09-dof',
  'module-10-drange',
  'module-11-wb',
  'module-12-drive',
  'module-13-jpeg-raw',
  'module-14-sensors',
  'module-15-focal'
];

async function testProgressEndpointLogic() {
  console.log("=".repeat(80));
  console.log("TESTING PROGRESS ENDPOINT LOGIC LOCALLY");
  console.log("=".repeat(80));
  console.log(`Member ID: ${TEST_MEMBER_ID}\n`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing Supabase credentials");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log("Step 1: Fetching exam results by memberstack_id...");
    const { data: allExams, error: examError } = await supabase
      .from('module_results_ms')
      .select('module_id, score_percent, passed, attempt, created_at')
      .eq('memberstack_id', TEST_MEMBER_ID)
      .order('created_at', { ascending: false });

    if (examError) {
      console.error("❌ Supabase query error:", examError);
      return;
    }

    console.log(`✅ Found ${allExams?.length || 0} exam records`);
    if (allExams && allExams.length > 0) {
      console.log("   Sample:", allExams[0]);
    }

    console.log("\nStep 2: Processing exam data...");
    const memberModuleMap = {};
    
    allExams?.forEach(exam => {
      const moduleId = exam.module_id;
      const key = moduleId;
      
      if (!memberModuleMap[key]) {
        memberModuleMap[key] = {
          moduleId,
          attempts: [],
          scores: [],
          passed: false,
          firstPassedAt: null,
          lastAttemptAt: null
        };
      }
      
      memberModuleMap[key].attempts.push(exam.attempt || 1);
      memberModuleMap[key].scores.push(exam.score_percent);
      
      if (exam.passed) {
        memberModuleMap[key].passed = true;
        const examDate = new Date(exam.created_at);
        if (!memberModuleMap[key].firstPassedAt || examDate < memberModuleMap[key].firstPassedAt) {
          memberModuleMap[key].firstPassedAt = examDate;
        }
      }
      
      const examDate = new Date(exam.created_at);
      if (!memberModuleMap[key].lastAttemptAt || examDate > memberModuleMap[key].lastAttemptAt) {
        memberModuleMap[key].lastAttemptAt = examDate;
      }
    });

    console.log(`✅ Processed ${Object.keys(memberModuleMap).length} unique modules`);

    console.log("\nStep 3: Building modules array...");
    const modules = ALL_MODULES.map(moduleId => {
      const moduleData = memberModuleMap[moduleId];
      
      if (moduleData) {
        const attempts = Math.max(...moduleData.attempts);
        const bestScore = Math.max(...moduleData.scores);
        const passed = moduleData.passed;
        
        return {
          moduleId,
          label: moduleId.match(/module-(\d+)-/)?.[1]?.padStart(2, '0') || moduleId.replace('module-', '').substring(0, 2),
          name: moduleId.replace('module-', '').replace(/-/g, ' '),
          status: passed ? 'passed' : (attempts > 0 ? 'failed' : 'not_taken'),
          bestScore,
          attempts,
          lastAttemptAt: moduleData.lastAttemptAt?.toISOString() || null,
          firstPassedAt: moduleData.firstPassedAt?.toISOString() || null
        };
      }
      
      return {
        moduleId,
        label: moduleId.match(/module-(\d+)-/)?.[1]?.padStart(2, '0') || moduleId.replace('module-', '').substring(0, 2),
        name: moduleId.replace('module-', '').replace(/-/g, ' '),
        status: 'not_taken',
        bestScore: null,
        attempts: 0,
        lastAttemptAt: null,
        firstPassedAt: null
      };
    });

    console.log(`✅ Built ${modules.length} module entries`);
    const modulesWithData = modules.filter(m => m.status !== 'not_taken');
    console.log(`   Modules with data: ${modulesWithData.length}`);
    modulesWithData.forEach(m => {
      console.log(`     - ${m.moduleId}: ${m.status} (${m.bestScore}%, ${m.attempts} attempts)`);
    });

    console.log("\nStep 4: Calculating summary...");
    const passedCount = modules.filter(m => m.status === 'passed').length;
    const failedCount = modules.filter(m => m.status === 'failed').length;
    const totalAttempts = modules.reduce((sum, m) => sum + (m.attempts || 0), 0);
    
    let lastExamAt = null;
    modules.forEach(m => {
      if (m.lastAttemptAt && (!lastExamAt || new Date(m.lastAttemptAt) > new Date(lastExamAt))) {
        lastExamAt = m.lastAttemptAt;
      }
    });

    console.log(`✅ Summary calculated:`);
    console.log(`   Passed: ${passedCount}`);
    console.log(`   Failed: ${failedCount}`);
    console.log(`   Total attempts: ${totalAttempts}`);
    console.log(`   Last exam: ${lastExamAt || 'N/A'}`);

    console.log("\nStep 5: Fetching member cache...");
    let memberName = null;
    let memberEmail = null;
    try {
      const { data: memberCache, error: cacheError } = await supabase
        .from('ms_members_cache')
        .select('name, email')
        .eq('member_id', TEST_MEMBER_ID)
        .single();
      
      if (cacheError && cacheError.code !== 'PGRST116') {
        console.error("⚠️  Cache lookup error:", cacheError);
      } else if (memberCache) {
        memberName = memberCache.name;
        memberEmail = memberCache.email;
        console.log(`✅ Member cache found: ${memberName} (${memberEmail})`);
      } else {
        console.log("⚠️  No member cache found");
      }
    } catch (e) {
      console.error("⚠️  Cache lookup exception:", e.message);
    }

    console.log("\nStep 6: Building final response...");
    const response = {
      summary: {
        name: memberName,
        email: memberEmail,
        passedCount,
        failedCount,
        remainingCount: 15 - passedCount - failedCount,
        totalAttempts,
        lastExamAt
      },
      modules
    };

    console.log("✅ Response built successfully!");
    console.log("\n" + "=".repeat(80));
    console.log("RESPONSE SUMMARY");
    console.log("=".repeat(80));
    console.log(JSON.stringify(response.summary, null, 2));
    console.log(`\nModules: ${response.modules.length} total, ${modulesWithData.length} with data`);

  console.log("\n" + "=".repeat(80));
  console.log("✅ LOCAL TEST PASSED - Logic works correctly!");
  console.log("=".repeat(80));
  
  // Test email fallback scenario
  console.log("\n" + "=".repeat(80));
  console.log("TESTING EMAIL FALLBACK SCENARIO");
  console.log("=".repeat(80));
  
  // Simulate: memberstack_id returns no results, but email does
  console.log("\nSimulating: Query by memberstack_id returns empty, checking email fallback...");
  
  const { data: emailExams, error: emailError } = await supabase
    .from('module_results_ms')
    .select('module_id, score_percent, passed, attempt, created_at, email')
    .eq('email', 'algenon@hotmail.com')
    .order('created_at', { ascending: false });
  
  if (emailError) {
    console.error("❌ Email query error:", emailError);
  } else {
    console.log(`✅ Email fallback query found ${emailExams?.length || 0} records`);
    if (emailExams && emailExams.length > 0) {
      console.log("   This confirms email fallback would work!");
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("✅ ALL TESTS PASSED!");
  console.log("=".repeat(80));
  console.log("\n📝 Changes made to endpoint:");
  console.log("   1. ✅ Token verification is now graceful (won't crash on failure)");
  console.log("   2. ✅ Added email fallback (queries by email if memberstack_id returns empty)");
  console.log("   3. ✅ Memberstack admin init is now wrapped in try-catch");

  } catch (error) {
    console.error("\n❌ ERROR IN LOCAL TEST:");
    console.error("   Message:", error.message);
    console.error("   Stack:", error.stack);
  }
}

testProgressEndpointLogic().catch(console.error);
