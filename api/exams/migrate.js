// /api/exams/migrate.js
// Backfills module_results with memberId based on email match

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
        console.error("[migrate] Token verification failed:", e.message);
        // Fall through to member ID fallback
      }
    }
    
    // Fallback: Use member ID header
    if (!memberId) {
      memberId = getMemberstackMemberId(req);
      console.log("[migrate] Member ID from header:", memberId);
      console.log("[migrate] Request headers:", JSON.stringify(req.headers, null, 2));
      if (memberId) {
        try {
          const { data } = await memberstack.members.retrieve({ id: memberId });
          member = data;
          console.log("[migrate] Member retrieved successfully:", member?.auth?.email);
        } catch (e) {
          console.error("[migrate] Member ID retrieval failed:", e.message);
          return res.status(401).json({ error: "Invalid member ID" });
        }
      } else {
        console.error("[migrate] No token and no member ID header found");
      }
    }
    
    if (!memberId || !member) {
      console.error("[migrate] Authentication failed - no memberId or member");
      return res.status(401).json({ error: "Not logged in" });
    }

    const email = member?.auth?.email;
    if (!email) {
      return res.status(400).json({ error: "No email found for member" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Find existing module_results rows for this email that don't have memberId
    // Note: module_results doesn't have memberId column, so we need to:
    // 1. Find rows by email
    // 2. Copy them to module_results_ms with memberId
    // 3. Or update module_results to add memberId (if we add that column)
    
    // For now, we'll copy to module_results_ms (which is the new table)
    const { data: legacyResults, error: fetchError } = await supabase
      .from("module_results")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("[migrate] Fetch error:", fetchError);
      return res.status(500).json({ error: "Failed to fetch legacy results" });
    }

    if (!legacyResults || legacyResults.length === 0) {
      return res.status(200).json({ 
        ok: true, 
        count: 0,
        message: "No legacy results found to migrate" 
      });
    }

    // Check which results already exist in module_results_ms
    const { data: existingResults } = await supabase
      .from("module_results_ms")
      .select("module_id, attempt")
      .eq("memberstack_id", memberId);

    const existingKeys = new Set(
      (existingResults || []).map(r => `${r.module_id}:${r.attempt}`)
    );

    // Copy only new results (not already migrated)
    const toInsert = legacyResults
      .filter(r => {
        const key = `${r.module_id}:${r.attempt}`;
        return !existingKeys.has(key);
      })
      .map(r => ({
        memberstack_id: memberId,
        email: email,
        module_id: r.module_id,
        score_percent: r.score_percent,
        passed: r.passed,
        attempt: r.attempt,
        details: r.details || null,
        created_at: r.created_at || new Date().toISOString()
      }));

    if (toInsert.length === 0) {
      return res.status(200).json({ 
        ok: true, 
        count: 0,
        message: "All results already migrated" 
      });
    }

    // Insert the new results
    const { error: insertError } = await supabase
      .from("module_results_ms")
      .insert(toInsert);

    if (insertError) {
      console.error("[migrate] Insert error:", insertError);
      return res.status(500).json({ error: "Failed to copy results" });
    }

    return res.status(200).json({ 
      ok: true, 
      count: toInsert.length,
      total: legacyResults.length,
      message: `Migrated ${toInsert.length} of ${legacyResults.length} legacy results` 
    });
  } catch (e) {
    console.error("[migrate] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
