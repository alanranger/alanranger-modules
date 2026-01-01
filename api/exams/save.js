// /api/exams/save.js
// Writes exam results to module_results_ms using service role

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight, getMemberstackToken, getMemberstackMemberId } = require("./_cors");

module.exports = async (req, res) => {
  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) return;

  // Set CORS headers for all responses
  setCorsHeaders(res);

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    
    // Try token-based auth first
    let memberId = null;
    let member = null;
    
    const token = getMemberstackToken(req);
    if (token) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        memberId = id;
        const { data } = await memberstack.members.retrieve({ id });
        member = data;
      } catch (e) {
        console.error("[save] Token verification failed:", e.message);
        // Fall through to member ID fallback
      }
    }
    
    // Fallback: Use member ID header
    if (!memberId) {
      memberId = getMemberstackMemberId(req);
      if (memberId) {
        try {
          const { data } = await memberstack.members.retrieve({ id: memberId });
          member = data;
        } catch (e) {
          console.error("[save] Member ID retrieval failed:", e.message);
          return res.status(401).json({ error: "Invalid member ID" });
        }
      }
    }
    
    if (!memberId || !member) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { module_id, score_percent, passed, attempt, details } = body || {};

    if (!module_id || typeof score_percent !== "number" || typeof passed !== "boolean" || typeof attempt !== "number") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase.from("module_results_ms").insert([{
      memberstack_id: memberId,
      email: member?.auth?.email || null,
      module_id,
      score_percent,
      passed,
      attempt,
      details: details ?? null
    }]);

    if (error) {
      console.error("[save] Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[save] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
