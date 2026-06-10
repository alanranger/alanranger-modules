// /api/academy-track-event.js
// Records an event to academy_events table (for dashboard access, etc.)

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");

const ALLOWED_ORIGINS = new Set([
  "https://www.alanranger.com",
  "https://alanranger.com",
  "http://localhost:3000",
  "http://localhost:8080"
]);

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.alanranger.com";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Memberstack-Id");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function getAuthenticatedMember(req) {
  try {
    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    
    // Try to get member ID from cookie
    const cookies = req.headers.cookie || "";
    const msMidMatch = cookies.match(/_ms-mid=([^;]+)/);
    const memberIdFromCookie = msMidMatch ? msMidMatch[1] : null;
    
    // Also check X-Memberstack-Id header (fallback)
    const memberIdFromHeader = req.headers["x-memberstack-id"] || null;
    const memberId = memberIdFromCookie || memberIdFromHeader;
    
    if (!memberId) {
      return null;
    }
    
    // Verify member exists
    const { data: member, error } = await memberstack.members.retrieve({ id: memberId });
    if (error || !member) {
      return null;
    }
    
    const email = member?.auth?.email || member?.email || null;
    const firstName = member?.customFields?.["first-name"] || 
                     member?.customFields?.firstName || 
                     member?.customFields?.first_name || null;
    const lastName = member?.customFields?.["last-name"] || 
                    member?.customFields?.lastName || 
                    member?.customFields?.last_name || null;
    const name = [firstName, lastName].filter(Boolean).join(" ").trim() || email?.split("@")[0] || null;
    
    return {
      memberId,
      email,
      name
    };
  } catch (err) {
    console.error("[track-event] Auth error:", err);
    return null;
  }
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth || !auth.memberId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const { event_type, path, title, category, meta } = req.body;
    
    if (!event_type) {
      return res.status(400).json({ error: "event_type is required" });
    }
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // For login events, include date in path to allow multiple logins per distinct date
    // This works around the unique constraint (member_id, event_type, path)
    // Each day will have a unique path: /academy/dashboard?date=2026-01-11
    let eventPath = path || null;
    if (event_type === "member_login") {
      const today = new Date();
      const dateStr = today.getFullYear() + "-" + 
                     String(today.getMonth() + 1).padStart(2, "0") + "-" + 
                     String(today.getDate()).padStart(2, "0");
      eventPath = (path || "/academy/dashboard") + "?date=" + dateStr;
    }
    
    const { error: insertError } = await supabase
      .from("academy_events")
      .insert([
        {
          event_type,
          member_id: auth.memberId,
          email: auth.email,
          path: eventPath,
          title: title || null,
          category: category || null,
          meta: meta || {}, // Default to empty object instead of null (required by DB constraint)
          created_at: new Date().toISOString()
        }
      ]);
    
    if (insertError) {
      // For non-login events, if it's a duplicate key error, that's expected
      // (the unique constraint prevents duplicate events for same member/type/path)
      if (insertError.message && insertError.message.includes('duplicate key') && event_type !== "member_login") {
        // For non-login events, duplicate is expected - return success silently
        return res.status(200).json({ success: true, message: "Event already exists" });
      }
      console.error("[track-event] Insert error:", insertError);
      return res.status(500).json({ error: insertError.message });
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[track-event] Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
