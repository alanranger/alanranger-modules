// Test script for /api/academy/event endpoint
// Run with: node test-event-endpoint.js

const { createClient } = require("@supabase/supabase-js");

// Use the exams/modules Supabase credentials
const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testEventInsert() {
  console.log("🧪 Testing Academy Events API endpoint logic...\n");

  // Test event payload (simulating what the API would receive)
  const testEvent = {
    event_type: 'module_open',
    member_id: 'ms_test_api_67890',
    email: 'api-test@example.com',
    path: '/blog-on-photography/what-is-aperture-in-photography',
    title: 'What is Aperture in Photography',
    category: 'camera',
    session_id: 'test_session_123',
    meta: {
      source: 'api_test',
      test_timestamp: new Date().toISOString()
    }
  };

  console.log("📤 Inserting test event:", JSON.stringify(testEvent, null, 2));
  console.log("");

  try {
    // Simulate the API endpoint logic
    const { data, error } = await supabase
      .from("academy_events")
      .insert([{
        event_type: testEvent.event_type,
        member_id: testEvent.member_id || null,
        email: testEvent.email || null,
        path: testEvent.path || null,
        title: testEvent.title || null,
        category: testEvent.category || null,
        session_id: testEvent.session_id || null,
        meta: testEvent.meta || {}
      }])
      .select();

    if (error) {
      console.error("❌ Error inserting event:", error);
      return false;
    }

    console.log("✅ Event inserted successfully!");
    console.log("📊 Inserted event:", JSON.stringify(data[0], null, 2));
    console.log("");

    // Verify the event was created
    const { data: verifyData, error: verifyError } = await supabase
      .from("academy_events")
      .select("*")
      .eq("id", data[0].id)
      .single();

    if (verifyError) {
      console.error("❌ Error verifying event:", verifyError);
      return false;
    }

    console.log("✅ Event verified in database!");
    console.log("📋 Full event record:", JSON.stringify(verifyData, null, 2));
    console.log("");

    // Test querying events (like the admin dashboard would)
    const { data: recentEvents, error: queryError } = await supabase
      .from("academy_events")
      .select("*")
      .eq("event_type", "module_open")
      .order("created_at", { ascending: false })
      .limit(5);

    if (queryError) {
      console.error("❌ Error querying events:", queryError);
      return false;
    }

    console.log("✅ Query test successful!");
    console.log(`📊 Found ${recentEvents.length} recent module_open events`);
    console.log("");

    // Test aggregation (like KPI queries)
    const { count, error: countError } = await supabase
      .from("academy_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "module_open");

    if (countError) {
      console.error("❌ Error counting events:", countError);
      return false;
    }

    console.log("✅ Count query successful!");
    console.log(`📊 Total module_open events: ${count}`);
    console.log("");

    console.log("🎉 All tests passed! The API endpoint logic is working correctly.");
    return true;

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return false;
  }
}

// Run the test
testEventInsert()
  .then(success => {
    if (success) {
      console.log("\n✨ Test completed successfully!");
      process.exit(0);
    } else {
      console.log("\n⚠️  Test completed with errors");
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("\n💥 Test failed with exception:", error);
    process.exit(1);
  });
