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

    // Fetch recent login events from academy_events.
    // Pull 6 so we can safely drop a "current login" event and still return 5 items.
    const { data: loginEvents, error: loginError } = await supabase
      .from("academy_events")
      .select("created_at")
      .eq("member_id", memberId)
      .eq("event_type", "login")
      .order("created_at", { ascending: false })
      .limit(6);

    // Add login metadata to response
    // Priority for last_login:
    // 1) Previous login event (if current login is within 2 minutes and we have older events)
    // 2) Most recent login event
    // 3) updated_at from cache
    const response = { ...data };
    if (loginError) {
      console.error("[member-data] Error fetching last login:", loginError);
    }

    const loginTimestamps = Array.isArray(loginEvents)
      ? loginEvents
          .map((event) => event?.created_at)
          .filter(Boolean)
      : [];

    if (loginTimestamps.length > 0) {
      const now = new Date();
      const mostRecent = new Date(loginEvents?.[0]?.created_at || loginTimestamps[0]);
      const timeSinceMostRecent = now.getTime() - mostRecent.getTime();
      const twoMinutesAgo = 2 * 60 * 1000;

      // If most recent looks like "current login", drop it from list and use previous as last_login.
      let cleanedLogins = loginTimestamps.slice();
      if (cleanedLogins.length >= 2 && timeSinceMostRecent < twoMinutesAgo) {
        response.last_login = cleanedLogins[1];
        cleanedLogins = cleanedLogins.slice(1);
      } else {
        response.last_login = cleanedLogins[0];
      }

      response.last_logins = cleanedLogins.slice(0, 5);
    } else if (data.updated_at) {
      // Fallback to updated_at as proxy for last login (gets updated on member sync/login)
      response.last_login = data.updated_at;
      response.last_logins = [data.updated_at];
    } else {
      response.last_logins = [];
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
