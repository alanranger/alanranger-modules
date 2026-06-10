// Quick script to check members who signed up before Jan 6, 2026
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkEarlySignups() {
  try {
    // Query members who signed up before January 6, 2026
    const cutoffDate = "2026-01-06T00:00:00.000Z";
    
    const { data: members, error } = await supabase
      .from('ms_members_cache')
      .select('member_id, email, name, created_at')
      .lt('created_at', cutoffDate)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error querying Supabase:", error);
      return;
    }

    console.log(`\n=== Members who signed up before January 6, 2026 ===\n`);
    console.log(`Total count: ${members?.length || 0}\n`);

    if (members && members.length > 0) {
      console.log("Members:");
      members.forEach((member, index) => {
        const signupDate = new Date(member.created_at).toLocaleDateString('en-GB');
        console.log(`${index + 1}. ${member.email || 'No email'} - Signed up: ${signupDate} (${member.created_at})`);
      });
    } else {
      console.log("No members found who signed up before January 6, 2026.");
    }

  } catch (error) {
    console.error("Fatal error:", error);
  }
}

checkEarlySignups();
