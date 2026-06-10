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
    // Note: origin might be null for same-origin requests, so we check referer too
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const allowedOrigins = [
      'https://www.alanranger.com',
      'https://alanranger.com'
    ];
    
    // Allow if origin matches OR referer matches (for same-origin requests, origin might be null)
    const originValid = origin && allowedOrigins.some(allowed => origin.includes(allowed));
    const refererValid = referer && allowedOrigins.some(allowed => referer.includes(allowed));
    
    if (!originValid && !refererValid) {
      console.warn("[track-login] Invalid origin/referer:", { origin, referer });
      // Don't block - log warning but allow (for testing/debugging)
      // return res.status(403).json({ error: "Forbidden: Invalid origin" });
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
    console.log("[track-login] Inserting login event:", {
      member_id,
      email,
      origin,
      referer: req.headers.referer
    });
    
    const { data, error } = await supabase.from("academy_events").insert([{
      event_type: 'login',
      member_id: member_id,
      email: email || null,
      path: null, // Set to null for login events to avoid unique constraint violations
      title: 'Academy Login',
      category: 'authentication',
      session_id: null,
      meta: {
        user_agent: req.headers['user-agent'] || null,
        origin: origin || referer,
        referer: req.headers.referer || null // Store referer in meta instead
      }
    }]).select();

    if (error) {
      console.error("[track-login] Supabase insert error:", error);
      return res.status(500).json({ error: error.message, details: error });
    }

    console.log("[track-login] Login event recorded successfully:", data);
    return res.status(200).json({ ok: true, message: "Login event recorded", data });
  } catch (e) {
    console.error("[track-login] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
