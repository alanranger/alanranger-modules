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

    // Log all headers for debugging (Vercel serverless functions)
    // Note: Vercel lowercases all header names
    console.log("[migrate] === REQUEST DEBUG ===");
    console.log("[migrate] Method:", req.method);
    console.log("[migrate] All header keys:", Object.keys(req.headers || {}));
    console.log("[migrate] Authorization header:", req.headers.authorization ? "FOUND (length: " + req.headers.authorization.length + ")" : "NOT FOUND");
    console.log("[migrate] x-memberstack-id (lowercase, Vercel standard):", req.headers["x-memberstack-id"] || "NOT FOUND");
    
    // Try multiple header name variations (Vercel might handle differently)
    const memberIdFromHeader = req.headers["x-memberstack-id"] 
      || req.headers["X-Memberstack-Id"] 
      || req.headers["x-memberstackid"]
      || req.headers["X-MemberstackId"]
      || null;
    console.log("[migrate] Member ID from header (all variations checked):", memberIdFromHeader || "NOT FOUND");
    
    // Log all headers that start with 'x-' to see what's available
    const xHeaders = Object.keys(req.headers || {}).filter(k => k.toLowerCase().startsWith('x-'));
    console.log("[migrate] All X- headers:", xHeaders);

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    
    // Try token-based auth first
    let memberId = null;
    let member = null;
    
    const token = getMemberstackToken(req);
    console.log("[migrate] Token from getMemberstackToken:", token ? "FOUND (length: " + token.length + ")" : "NOT FOUND");
    if (token) {
      try {
        const verifyResult = await memberstack.verifyToken({ token });
        console.log("[migrate] Token verification result:", JSON.stringify(verifyResult, null, 2));
        memberId = verifyResult.id;
        
        const { data } = await memberstack.members.retrieve({ id: memberId });
        if (data && (data.id || data.auth)) {
          member = data;
          console.log("[migrate] Token auth successful, member ID:", memberId, "email:", member?.auth?.email);
        } else {
          console.error("[migrate] Member retrieve returned no data (token path)");
        }
      } catch (e) {
        console.error("[migrate] Token verification failed:", e.message);
        console.error("[migrate] Token error stack:", e.stack);
        // Fall through to member ID fallback
      }
    }
    
    // Fallback: Use member ID header
    if (!memberId) {
      // Try getMemberstackMemberId helper first
      memberId = getMemberstackMemberId(req);
      console.log("[migrate] Member ID from getMemberstackMemberId():", memberId || "NOT FOUND");
      
      // If helper didn't find it, try direct header access (Vercel lowercases headers)
      if (!memberId) {
        memberId = req.headers["x-memberstack-id"] || null;
        console.log("[migrate] Member ID from direct header access:", memberId || "NOT FOUND");
      }
      
      if (memberId) {
        try {
          console.log("[migrate] Attempting to retrieve member with ID:", memberId);
          console.log("[migrate] Memberstack secret key exists:", !!process.env.MEMBERSTACK_SECRET_KEY);
          console.log("[migrate] Memberstack secret key length:", process.env.MEMBERSTACK_SECRET_KEY?.length);
          
          // Use same pattern as whoami.js and save.js
          const result = await memberstack.members.retrieve({ id: memberId });
          console.log("[migrate] Full API response:", JSON.stringify(result, null, 2));
          
          // Handle response - could be { data: {...} } or direct member object
          const data = result?.data !== undefined ? result.data : result;
          console.log("[migrate] Extracted data:", data ? "EXISTS" : "NULL/UNDEFINED");
          console.log("[migrate] Data type:", typeof data);
          console.log("[migrate] Data keys:", data ? Object.keys(data) : "N/A");
          
          if (data && (data.id || data.auth)) {
            member = data;
            console.log("[migrate] ✅ Member retrieved successfully:", member?.auth?.email);
          } else if (data === null) {
            // If data is explicitly null, log warning but continue - we'll use email from request body
            console.warn("[migrate] ⚠️ Member data is null, but continuing with email from request body");
            console.warn("[migrate] ⚠️ This may indicate API key issue, but migration can proceed with email");
            // Don't return error - continue to email fallback logic below
            member = null; // Explicitly set to null so fallback logic triggers
          } else {
            console.error("[migrate] ❌ Member data is invalid:", data);
            return res.status(401).json({ error: "Member not found in Memberstack", debug: { memberId, dataType: typeof data, dataValue: data } });
          }
        } catch (e) {
          console.error("[migrate] ❌ Member ID retrieval failed:", e.message);
          console.error("[migrate] ❌ Error stack:", e.stack);
          console.error("[migrate] ❌ Error name:", e.name);
          return res.status(401).json({ error: "Invalid member ID", details: e.message });
        }
      } else {
        console.error("[migrate] ❌ No token and no member ID header found");
        console.error("[migrate] All headers:", JSON.stringify(req.headers, null, 2));
        return res.status(401).json({ error: "Not logged in - no token or member ID" });
      }
    }
    
    // Parse request body first (needed for email fallback)
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    console.log("[migrate] Request body:", JSON.stringify(body, null, 2));
    
    // Get email from member object OR request body (fallback)
    let email = null;
    if (member && member.auth && member.auth.email) {
      email = member.auth.email;
      console.log("[migrate] ✅ Using email from member object:", email);
    } else if (body && body.email) {
      email = body.email;
      console.log("[migrate] ✅ Using email from request body (fallback):", email);
    } else if (memberId) {
      // Last resort: try whoami endpoint pattern to get email
      console.log("[migrate] ⚠️ Trying whoami pattern as last resort...");
      try {
        const whoamiResult = await memberstack.members.retrieve({ id: memberId });
        const whoamiData = whoamiResult?.data !== undefined ? whoamiResult.data : whoamiResult;
        if (whoamiData && whoamiData.auth && whoamiData.auth.email) {
          email = whoamiData.auth.email;
          member = whoamiData; // Set member for consistency
          console.log("[migrate] ✅ Got email from whoami pattern:", email);
        } else {
          console.error("[migrate] ❌ Whoami pattern also returned null data");
        }
      } catch (whoamiErr) {
        console.error("[migrate] ❌ Whoami fallback also failed:", whoamiErr.message);
      }
    }

    if (!memberId) {
      console.error("[migrate] ❌ No memberId available");
      return res.status(401).json({ error: "Not logged in - no member ID" });
    }

    if (!email) {
      console.error("[migrate] ❌ No email found for member. memberId:", memberId);
      return res.status(400).json({ 
        error: "No email found for member",
        debug: { memberId, hasMember: !!member, memberKeys: member ? Object.keys(member) : [] }
      });
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
