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
    const { data: lastLoginEvent, error: loginError } = await supabase
      .from("academy_events")
      .select("created_at")
      .eq("member_id", memberId)
      .eq("event_type", "login")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Add last_login to response (don't fail if login event not found)
    const response = { ...data };
    if (lastLoginEvent && lastLoginEvent.created_at) {
      response.last_login = lastLoginEvent.created_at;
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
