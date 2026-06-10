// Phase 3 Q&A Test Script
// Tests the complete Q&A workflow including AI integration

const API_BASE = process.env.API_BASE_URL || "https://alanranger-modules.vercel.app";
const TEST_MEMBER_ID = process.env.TEST_MEMBER_ID || "mem_cmjxgsmdr055s0snt99ed8uxy"; // info@alanranger.com
const TEST_MEMBER_EMAIL = "info@alanranger.com";

async function testPhase3() {
  console.log("🧪 Phase 3 Q&A Testing\n");
  console.log(`API Base: ${API_BASE}\n`);

  let testQuestionId = null;

  try {
    // Test 1: Member posts question (should store email/name)
    console.log("1️⃣ Testing Member POST (should store email/name)");
    const postRes = await fetch(`${API_BASE}/api/academy-qa-questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Memberstack-Id': TEST_MEMBER_ID
      },
      body: JSON.stringify({
        page_url: 'https://www.alanranger.com/academy/photography-questions-answers',
        question: `Phase 3 test question created at ${new Date().toISOString()}`
      })
    });

    if (!postRes.ok) {
      throw new Error(`POST failed: ${postRes.status} ${postRes.statusText}`);
    }

    const postData = await postRes.json();
    testQuestionId = postData.data?.id;
    console.log("✅ Question created:");
    console.log(`   - ID: ${testQuestionId}`);
    console.log(`   - Member Email: ${postData.data?.member_email || 'MISSING'}`);
    console.log(`   - Member Name: ${postData.data?.member_name || 'MISSING'}`);
    console.log(`   - Status: ${postData.data?.status}\n`);

    if (!postData.data?.member_email) {
      console.warn("⚠️  WARNING: member_email not stored!\n");
    }

    // Test 2: Admin generates AI draft
    console.log("2️⃣ Testing Admin AI Draft Generation");
    const aiRes = await fetch(`${API_BASE}/api/academy/qa/admin/ai-suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Memberstack-Id': TEST_MEMBER_ID // Using admin email for auth
      },
      body: JSON.stringify({
        question_id: testQuestionId,
        question: postData.data.question,
        page_url: postData.data.page_url
      })
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.warn(`⚠️  AI generation failed (may need Chat Bot API configured): ${aiRes.status}`);
      console.warn(`   Error: ${errorText.substring(0, 200)}\n`);
    } else {
      const aiData = await aiRes.json();
      console.log("✅ AI draft generated:");
      console.log(`   - AI Answer: ${aiData.ai_answer?.substring(0, 100)}...`);
      console.log(`   - AI Model: ${aiData.ai_model || 'N/A'}\n`);
    }

    // Test 3: Admin saves manual answer
    console.log("3️⃣ Testing Admin Save Answer");
    const answerRes = await fetch(`${API_BASE}/api/academy/qa/admin/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Memberstack-Id': TEST_MEMBER_ID
      },
      body: JSON.stringify({
        question_id: testQuestionId,
        answer: "This is a test answer from Phase 3 testing script.",
        answered_by: "Test Script",
        notify_member: false // Don't send email in test
      })
    });

    if (!answerRes.ok) {
      const errorText = await answerRes.text();
      throw new Error(`Answer save failed: ${answerRes.status}\n${errorText}`);
    }

    const answerData = await answerRes.json();
    console.log("✅ Answer saved:");
    console.log(`   - Status: ${answerData.question?.status}`);
    console.log(`   - Answer Source: ${answerData.question?.answer_source}`);
    console.log(`   - Answered By: ${answerData.question?.answered_by}`);
    console.log(`   - Has Answer: ${!!answerData.question?.answer}\n`);

    // Test 4: Member GET (should see answer)
    console.log("4️⃣ Testing Member GET (should see answer)");
    const memberGetRes = await fetch(`${API_BASE}/api/academy-qa-questions?limit=10`, {
      headers: {
        'X-Memberstack-Id': TEST_MEMBER_ID
      }
    });

    if (!memberGetRes.ok) {
      throw new Error(`Member GET failed: ${memberGetRes.status}`);
    }

    const memberData = await memberGetRes.json();
    const testQuestion = memberData.data?.find(q => q.id === testQuestionId);
    
    if (testQuestion) {
      console.log("✅ Member can see answered question:");
      console.log(`   - Has Answer: ${!!testQuestion.answer}`);
      console.log(`   - Answer Source: ${testQuestion.answer_source || 'N/A'}`);
      console.log(`   - Status: ${testQuestion.status}\n`);
    } else {
      console.warn("⚠️  Test question not found in member's question list\n");
    }

    // Test 5: Admin security (normal member should be blocked)
    console.log("5️⃣ Testing Admin Security (normal member access)");
    const securityRes = await fetch(`${API_BASE}/api/academy/qa/admin/questions?limit=5`, {
      headers: {
        'X-Memberstack-Id': 'mem_test_non_admin' // Non-admin member ID
      }
    });

    if (securityRes.status === 403) {
      console.log("✅ Admin security working: Non-admin blocked (403)\n");
    } else {
      console.warn(`⚠️  Security check: Got ${securityRes.status} (expected 403)\n`);
    }

    // Test 6: Admin stats
    console.log("6️⃣ Testing Admin Stats");
    const statsRes = await fetch(`${API_BASE}/api/academy/qa/admin/stats?range=30d`, {
      headers: {
        'X-Memberstack-Id': TEST_MEMBER_ID
      }
    });

    if (statsRes.ok) {
      const stats = await statsRes.json();
      console.log("✅ Stats endpoint working:");
      console.log(`   - Questions Posted: ${stats.questionsPosted}`);
      console.log(`   - Answered: ${stats.answered}`);
      console.log(`   - Outstanding: ${stats.outstanding}`);
      console.log(`   - Avg Response Time: ${stats.avgResponseTimeHours || 'N/A'}h\n`);
    } else {
      console.warn(`⚠️  Stats failed: ${statsRes.status}\n`);
    }

    // Cleanup: Delete test question
    console.log("7️⃣ Cleaning up test question...");
    // Note: No delete endpoint yet, so test question will remain
    console.log("   (Test question left in database for verification)\n");

    console.log("✅ Phase 3 testing complete!\n");
    console.log("📋 Next steps:");
    console.log("   1. Test AI draft generation in admin UI");
    console.log("   2. Configure email provider and test notifications");
    console.log("   3. Verify member sees answers correctly");
    console.log("   4. Test admin security with different member accounts");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  }
}

testPhase3();
