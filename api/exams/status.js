// /api/exams/status.js
// Returns latest attempt + pass/fail for a module (Memberstack identity)

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight, getMemberstackToken, getMemberstackMemberId } = require("./_cors");

module.exports = async (req, res) => {
  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) return;

  // Set CORS headers for all responses
  setCorsHeaders(res);

  try {
    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    
    // Try token-based auth first
    let memberId = null;
    
    const token = getMemberstackToken(req);
    if (token) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        memberId = id;
      } catch (e) {
        console.error("[status] Token verification failed:", e.message);
        // Fall through to member ID fallback
      }
    }
    
    // Fallback: Use member ID header
    if (!memberId) {
      memberId = getMemberstackMemberId(req);
      // Don't verify member exists - just use the memberId to query results
      // If memberId is invalid, the query will just return empty results
    }
    
    if (!memberId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const moduleId = req.query.moduleId;
    if (!moduleId) {
      return res.status(400).json({ error: "Missing moduleId" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from("module_results_ms")
      .select("score_percent,passed,attempt,created_at")
      .eq("memberstack_id", memberId)
      .eq("module_id", moduleId)
      .order("attempt", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[status] Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ latest: data?.[0] || null });
  } catch (e) {
    console.error("[status] Error:", e);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
