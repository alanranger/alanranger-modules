// /api/academy/event.js
// Event ingestion endpoint for Academy analytics
// Inserts events into academy_events table using service role

const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight } = require("../exams/_cors");

// Allowed event types (prevent spam/injection)
const ALLOWED_EVENT_TYPES = [
  'module_open',
  'bookmark_add',
  'bookmark_remove',
  'exam_start',
  'exam_submit',
  'login',
  'logout',
  'page_view'
];

// Rate limiting (simple in-memory store - for production, use Redis)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `rate_limit_${ip}`;
  const record = rateLimitStore.get(key);
  
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(key, { firstRequest: now, count: 1 });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.firstRequest > RATE_LIMIT_WINDOW) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // every 5 minutes

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         'unknown';
}

module.exports = async (req, res) => {
  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) return;

  // Set CORS headers
  setCorsHeaders(res);

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Check authentication header (shared secret)
    const authKey = req.headers['x-ar-analytics-key'];
    const expectedKey = process.env.AR_ANALYTICS_KEY;
    
    if (!expectedKey) {
      console.error("[event] AR_ANALYTICS_KEY not configured");
      return res.status(500).json({ error: "Server configuration error" });
    }
    
    if (authKey !== expectedKey) {
      console.warn("[event] Invalid auth key from IP:", getClientIP(req));
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    // Parse and validate payload
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { 
      event_type, 
      member_id, 
      email, 
      path, 
      title, 
      category, 
      session_id, 
      meta = {} 
    } = body || {};

    // Validate event_type
    if (!event_type || typeof event_type !== 'string') {
      return res.status(400).json({ error: "event_type is required and must be a string" });
    }

    if (!ALLOWED_EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ 
        error: `Invalid event_type. Allowed: ${ALLOWED_EVENT_TYPES.join(', ')}` 
      });
    }

    // Validate meta is an object
    if (typeof meta !== 'object' || Array.isArray(meta)) {
      return res.status(400).json({ error: "meta must be an object" });
    }

    // Initialize Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Insert event
    const { error } = await supabase.from("academy_events").insert([{
      event_type,
      member_id: member_id || null,
      email: email || null,
      path: path || null,
      title: title || null,
      category: category || null,
      session_id: session_id || null,
      meta: meta || {}
    }]);

    if (error) {
      console.error("[event] Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[event] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
