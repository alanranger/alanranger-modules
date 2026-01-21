// API endpoint to fetch member data including photography style
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  // CORS headers for Squarespace
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alanranger.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Memberstack-Id');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { memberId } = req.query;

    if (!memberId) {
      return res.status(400).json({ error: "memberId is required" });
    }

    // Fetch member data from Supabase
    const { data, error } = await supabase
      .from("ms_members_cache")
      .select("*")
      .eq("member_id", memberId)
      .single();

    if (error) {
      console.error("[member-data] Supabase error:", error);
      return res.status(500).json({
        error: "Failed to fetch member data",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({ error: "Member not found" });
    }

    // Fetch last login from academy_events
    const { data: lastLoginEvents, error: loginError } = await supabase
      .from("academy_events")
      .select("created_at")
      .eq("member_id", memberId)
      .eq("event_type", "login")
      .order("created_at", { ascending: false })
      .limit(1);

    // Add last_login to response
    // Priority: 1) academy_events login event, 2) updated_at from cache (proxy for last sync/login), 3) null
    const response = { ...data };
    if (loginError) {
      console.error("[member-data] Error fetching last login:", loginError);
    }
    
    if (lastLoginEvents && lastLoginEvents.length > 0 && lastLoginEvents[0].created_at) {
      // Use actual login event if available
      response.last_login = lastLoginEvents[0].created_at;
    } else if (data.updated_at) {
      // Fallback to updated_at as proxy for last login (gets updated on member sync/login)
      response.last_login = data.updated_at;
    }
    
    // Also check raw JSONB for lastLogin if present
    if (!response.last_login && data.raw && typeof data.raw === 'object') {
      if (data.raw.lastLogin) {
        response.last_login = data.raw.lastLogin;
      } else if (data.raw.data && data.raw.data.lastLogin) {
        response.last_login = data.raw.data.lastLogin;
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error("[member-data] Fatal error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}
