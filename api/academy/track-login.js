// /api/academy/track-login.js
// Client-safe login event tracking endpoint
// Only accepts login events and verifies origin

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
    const origin = req.headers.origin || req.headers.referer;
    const allowedOrigins = [
      'https://www.alanranger.com',
      'https://alanranger.com'
    ];
    
    if (!origin || !allowedOrigins.some(allowed => origin.includes(allowed))) {
      console.warn("[track-login] Invalid origin:", origin);
      return res.status(403).json({ error: "Forbidden: Invalid origin" });
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

    // Insert login event
    const { error } = await supabase.from("academy_events").insert([{
      event_type: 'login',
      member_id: member_id,
      email: email || null,
      path: req.headers.referer || null,
      title: 'Academy Login',
      category: 'authentication',
      session_id: null,
      meta: {
        user_agent: req.headers['user-agent'] || null,
        origin: origin
      }
    }]);

    if (error) {
      console.error("[track-login] Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, message: "Login event recorded" });
  } catch (e) {
    console.error("[track-login] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
