// Verify photography quiz migration columns exist
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifyMigration() {
  try {
    console.log("Verifying photography quiz migration...\n");

    // Try to query one of the new columns to see if it exists
    const testColumns = [
      'photography_style',
      'photography_style_percentage',
      'photography_style_description',
      'photography_style_other_interests',
      'photography_style_quiz_completed_at'
    ];

    console.log("Testing columns:\n");
    let allExist = true;

    for (const column of testColumns) {
      try {
        // Try to select the column (will fail if it doesn't exist)
        const { data, error } = await supabase
          .from('ms_members_cache')
          .select(column)
          .limit(1);

        if (error) {
          if (error.message.includes('column') && error.message.includes('does not exist')) {
            console.log(`❌ ${column}: DOES NOT EXIST`);
            allExist = false;
          } else {
            console.log(`⚠️  ${column}: Error - ${error.message}`);
          }
        } else {
          console.log(`✅ ${column}: EXISTS`);
        }
      } catch (err) {
        console.log(`❌ ${column}: Error checking - ${err.message}`);
        allExist = false;
      }
    }

    console.log("\n" + "=".repeat(60));
    if (allExist) {
      console.log("✅ All columns exist! Migration successful.");
      console.log("\nReady for testing with user accounts.");
    } else {
      console.log("❌ Some columns are missing. Please check the migration.");
    }

  } catch (error) {
    console.error("Fatal error:", error);
  }
}

verifyMigration();
