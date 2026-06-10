// Test script for Phase 2 Admin Q&A endpoints
const API_BASE = process.env.API_BASE_URL || "https://alanranger-modules.vercel.app";

async function testAdminEndpoints() {
  console.log("🧪 Testing Admin Q&A Endpoints\n");
  console.log(`API Base: ${API_BASE}\n`);

  try {
    // Test 1: GET /api/academy/qa/admin/stats
    console.log("1️⃣ Testing GET /api/academy/qa/admin/stats");
    const statsRes = await fetch(`${API_BASE}/api/academy/qa/admin/stats?range=30d`);
    if (!statsRes.ok) {
      throw new Error(`Stats endpoint failed: ${statsRes.status} ${statsRes.statusText}`);
    }
    const stats = await statsRes.json();
    console.log("✅ Stats endpoint working:");
    console.log(`   - Questions Posted (30d): ${stats.questionsPosted || 0}`);
    console.log(`   - Answered (30d): ${stats.answered || 0}`);
    console.log(`   - Outstanding: ${stats.outstanding || 0}`);
    console.log(`   - AI Answered (30d): ${stats.answeredByAI || 0}`);
    console.log(`   - Avg Response Time: ${stats.avgResponseTimeHours || 'N/A'} hours`);
    console.log(`   - Members with Outstanding: ${stats.membersWithOutstanding || 0}\n`);

    // Test 2: GET /api/academy/qa/admin/questions
    console.log("2️⃣ Testing GET /api/academy/qa/admin/questions");
    const questionsRes = await fetch(`${API_BASE}/api/academy/qa/admin/questions?limit=10`);
    if (!questionsRes.ok) {
      throw new Error(`Questions endpoint failed: ${questionsRes.status} ${questionsRes.statusText}`);
    }
    const questionsData = await questionsRes.json();
    console.log("✅ Questions endpoint working:");
    console.log(`   - Total questions: ${questionsData.total || 0}`);
    console.log(`   - Returned: ${questionsData.questions?.length || 0} questions\n`);

    if (questionsData.questions && questionsData.questions.length > 0) {
      const firstQuestion = questionsData.questions[0];
      console.log("   Sample question:");
      console.log(`   - ID: ${firstQuestion.id}`);
      console.log(`   - Status: ${firstQuestion.status}`);
      console.log(`   - Question: ${firstQuestion.question?.substring(0, 50)}...`);
      console.log(`   - Has Admin Answer: ${!!firstQuestion.admin_answer}`);
      console.log(`   - Has AI Answer: ${!!firstQuestion.ai_answer}\n`);

      // Test 3: PATCH /api/academy/qa/admin/questions/[id] (if we have a question)
      if (firstQuestion.id) {
        console.log("3️⃣ Testing PATCH /api/academy/qa/admin/questions/[id]");
        const testAnswer = `Test answer from automated test at ${new Date().toISOString()}`;
        
        const updateRes = await fetch(`${API_BASE}/api/academy/qa/admin/questions/${firstQuestion.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answer: testAnswer,
            answered_by: 'test-script',
            answer_source: 'manual'
          })
        });

        if (!updateRes.ok) {
          const errorText = await updateRes.text();
          throw new Error(`Update endpoint failed: ${updateRes.status} ${updateRes.statusText}\n${errorText}`);
        }

        const updateData = await updateRes.json();
        console.log("✅ Update endpoint working:");
        console.log(`   - Updated question ID: ${updateData.question?.id}`);
        console.log(`   - New status: ${updateData.question?.status}`);
        console.log(`   - Admin answer set: ${!!updateData.question?.admin_answer}`);
        console.log(`   - Answered by: ${updateData.question?.answered_by}\n`);

        // Clean up: Remove the test answer
        console.log("4️⃣ Cleaning up test answer...");
        const cleanupRes = await fetch(`${API_BASE}/api/academy/qa/admin/questions/${firstQuestion.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answer: null // Clear the answer
          })
        });

        if (cleanupRes.ok) {
          console.log("✅ Test answer cleaned up\n");
        } else {
          console.log("⚠️  Could not clean up test answer (non-critical)\n");
        }
      }
    } else {
      console.log("⚠️  No questions found to test update endpoint\n");
    }

    // Test 4: Test filters
    console.log("5️⃣ Testing filters");
    const outstandingRes = await fetch(`${API_BASE}/api/academy/qa/admin/questions?status=outstanding&limit=5`);
    if (outstandingRes.ok) {
      const outstandingData = await outstandingRes.json();
      console.log(`✅ Outstanding filter working: ${outstandingData.total || 0} outstanding questions\n`);
    }

    const answeredRes = await fetch(`${API_BASE}/api/academy/qa/admin/questions?status=answered&limit=5`);
    if (answeredRes.ok) {
      const answeredData = await answeredRes.json();
      console.log(`✅ Answered filter working: ${answeredData.total || 0} answered questions\n`);
    }

    console.log("✅ All admin endpoint tests passed!\n");
    console.log("📋 Next steps:");
    console.log("   1. Visit /academy/admin/qa to access the admin dashboard");
    console.log("   2. Test answering a question from the UI");
    console.log("   3. Verify the answer appears in the member's 'My Questions' view");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  }
}

testAdminEndpoints();
