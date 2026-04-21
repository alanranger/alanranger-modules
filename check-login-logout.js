// Temporary script to check login/logout events for algenon@hotmail.com
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkLoginLogout() {
  const memberId = 'mem_cmjyljfkm0hxg0sntegon6ghi'; // algenon@hotmail.com
  
  // Get all login and logout events
  const { data: events, error } = await supabase
    .from("academy_events")
    .select("*")
    .eq("member_id", memberId)
    .in("event_type", ["login", "logout"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("\n=== Login and Logout Events for algenon@hotmail.com ===\n");
  
  if (!events || events.length === 0) {
    console.log("No login or logout events found.");
    return;
  }

  // Group by type
  const logins = events.filter(e => e.event_type === 'login');
  const logouts = events.filter(e => e.event_type === 'logout');

  console.log(`Total Login Events: ${logins.length}`);
  console.log(`Total Logout Events: ${logouts.length}\n`);

  if (logins.length > 0) {
    console.log("=== LOGIN EVENTS ===");
    logins.forEach((event, idx) => {
      const date = new Date(event.created_at);
      console.log(`${idx + 1}. ${date.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`);
      console.log(`   ID: ${event.id}`);
      console.log(`   Email: ${event.email || 'null'}`);
      console.log(`   Path: ${event.path || 'null'}`);
      console.log("");
    });
  }

  if (logouts.length > 0) {
    console.log("=== LOGOUT EVENTS ===");
    logouts.forEach((event, idx) => {
      const date = new Date(event.created_at);
      console.log(`${idx + 1}. ${date.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`);
      console.log(`   ID: ${event.id}`);
      console.log(`   Email: ${event.email || 'null'}`);
      console.log(`   Path: ${event.path || 'null'}`);
      console.log("");
    });
  }

  // Summary
  if (logins.length > 0) {
    const lastLogin = new Date(logins[0].created_at);
    console.log(`\nLAST LOGIN: ${lastLogin.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`);
  }

  if (logouts.length > 0) {
    const lastLogout = new Date(logouts[0].created_at);
    console.log(`LAST LOGOUT: ${lastLogout.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`);
  }
}

checkLoginLogout().catch(console.error);
