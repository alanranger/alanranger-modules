// Temporary API endpoint to check login/logout events
const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight } = require("../exams/_cors");

module.exports = async function handler(req, res) {
  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) return;

  // Set CORS headers
  setCorsHeaders(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Allow memberId as query parameter, or default to algenon@hotmail.com for testing
  const memberId = req.query.memberId || 'mem_cmjyljfkm0hxg0sntegon6ghi'; // algenon@hotmail.com
  
  // Get all login and logout events
  const { data: events, error } = await supabase
    .from("academy_events")
    .select("*")
    .eq("member_id", memberId)
    .in("event_type", ["login", "logout"])
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Group by type
  const logins = (events || []).filter(e => e.event_type === 'login');
  const logouts = (events || []).filter(e => e.event_type === 'logout');

  return res.status(200).json({
    member_id: memberId,
    email: 'algenon@hotmail.com',
    total_logins: logins.length,
    total_logouts: logouts.length,
    last_login: logins.length > 0 ? logins[0].created_at : null,
    last_logout: logouts.length > 0 ? logouts[0].created_at : null,
    login_events: logins.map(e => ({
      id: e.id,
      created_at: e.created_at,
      email: e.email,
      path: e.path
    })),
    logout_events: logouts.map(e => ({
      id: e.id,
      created_at: e.created_at,
      email: e.email,
      path: e.path
    }))
  });
};
