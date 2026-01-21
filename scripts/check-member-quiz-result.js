// Script to check quiz results for a specific member
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkMemberQuizResult(email) {
  try {
    console.log(`\nChecking quiz results for member: ${email}\n`);
    
    // Query by email
    const { data, error } = await supabase
      .from("ms_members_cache")
      .select("*")
      .eq("email", email)
      .single();

    if (error) {
      console.error("Error querying Supabase:", error);
      return;
    }

    if (!data) {
      console.log("Member not found in database");
      return;
    }

    console.log("Member found:");
    console.log("  Member ID:", data.member_id);
    console.log("  Name:", data.full_name || "N/A");
    console.log("  Email:", data.email);
    console.log("\nPhotography Quiz Results:");
    console.log("  Photography Style:", data.photography_style || "Not completed");
    console.log("  Style Percentage:", data.photography_style_percentage || "N/A");
    console.log("  Style Description:", data.photography_style_description || "N/A");
    console.log("  Other Interests:", data.photography_style_other_interests || "N/A");
    console.log("  Quiz Completed At:", data.photography_style_quiz_completed_at || "N/A");
    
    if (data.photography_style) {
      console.log("\n✅ Quiz results are saved!");
    } else {
      console.log("\n❌ No quiz results found");
    }

  } catch (error) {
    console.error("Fatal error:", error);
  }
}

// Get email from command line argument
const email = process.argv[2] || "info@alanranger.com";

checkMemberQuizResult(email)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
