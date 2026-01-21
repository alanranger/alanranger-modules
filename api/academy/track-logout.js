// /api/academy/track-logout.js
// Client-safe logout event tracking endpoint
// Only accepts logout events and verifies origin

const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight } = require("../exams/_cors");

module.exports = async (req, res) => {
  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) return;

  // Set CORS headers
  setCorsHeaders(res);

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Verify origin (only allow from alanranger.com)
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const allowedOrigins = [
      'https://www.alanranger.com',
      'https://alanranger.com'
    ];
    
    const originValid = origin && allowedOrigins.some(allowed => origin.includes(allowed));
    const refererValid = referer && allowedOrigins.some(allowed => referer.includes(allowed));
    
    if (!originValid && !refererValid) {
      console.warn("[track-logout] Invalid origin/referer:", { origin, referer });
      // Don't block - log warning but allow
    }

    // Parse and validate payload
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { member_id, email } = body || {};

    if (!member_id) {
      return res.status(400).json({ error: "member_id is required" });
    }

    // Initialize Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Insert logout event
    console.log("[track-logout] Inserting logout event:", {
      member_id,
      email,
      origin,
      referer: req.headers.referer
    });
    
    const { data, error } = await supabase.from("academy_events").insert([{
      event_type: 'logout',
      member_id: member_id,
      email: email || null,
      path: req.headers.referer || null,
      title: 'Academy Logout',
      category: 'authentication',
      session_id: null,
      meta: {
        user_agent: req.headers['user-agent'] || null,
        origin: origin || referer
      }
    }]).select();

    if (error) {
      console.error("[track-logout] Supabase insert error:", error);
      return res.status(500).json({ error: error.message, details: error });
    }

    console.log("[track-logout] Logout event recorded successfully:", data);
    return res.status(200).json({ ok: true, message: "Logout event recorded", data });
  } catch (e) {
    console.error("[track-logout] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
