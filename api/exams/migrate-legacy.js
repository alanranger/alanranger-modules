// /api/exams/migrate-legacy.js
// Links Memberstack member to legacy Supabase user and copies exam results

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight, getMemberstackToken } = require("./_cors");

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
    const token = getMemberstackToken(req);
    if (!token) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const { id: memberId } = await memberstack.verifyToken({ token });
    const { data: member } = await memberstack.members.retrieve({ id: memberId });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { supabase_user_id, legacy_email } = body || {};

    if (!supabase_user_id) {
      return res.status(400).json({ error: "Missing supabase_user_id" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Upsert the link record
    const { error: linkError } = await supabase
      .from("exam_member_links")
      .upsert([{
        memberstack_id: memberId,
        supabase_user_id: supabase_user_id,
        legacy_email: legacy_email || member?.auth?.email || null,
        linked_at: new Date().toISOString()
      }], {
        onConflict: "memberstack_id"
      });

    if (linkError) {
      console.error("[migrate-legacy] Link error:", linkError);
      return res.status(500).json({ error: "Failed to create link" });
    }

    // 2. Fetch legacy results for this Supabase user
    const { data: legacyResults, error: fetchError } = await supabase
      .from("module_results")
      .select("*")
      .eq("user_id", supabase_user_id)
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("[migrate-legacy] Fetch error:", fetchError);
      return res.status(500).json({ error: "Failed to fetch legacy results" });
    }

    if (!legacyResults || legacyResults.length === 0) {
      return res.status(200).json({ 
        ok: true, 
        copied: 0,
        message: "No legacy results found to migrate" 
      });
    }

    // 3. Check which results already exist (idempotent copy)
    const { data: existingResults } = await supabase
      .from("module_results_ms")
      .select("module_id, attempt")
      .eq("memberstack_id", memberId);

    const existingKeys = new Set(
      (existingResults || []).map(r => `${r.module_id}:${r.attempt}`)
    );

    // 4. Copy only new results (not already migrated)
    const toInsert = legacyResults
      .filter(r => {
        const key = `${r.module_id}:${r.attempt}`;
        return !existingKeys.has(key);
      })
      .map(r => ({
        memberstack_id: memberId,
        email: member?.auth?.email || r.email || null,
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
        copied: 0,
        message: "All results already migrated" 
      });
    }

    // 5. Insert the new results
    const { error: insertError } = await supabase
      .from("module_results_ms")
      .insert(toInsert);

    if (insertError) {
      console.error("[migrate-legacy] Insert error:", insertError);
      return res.status(500).json({ error: "Failed to copy results" });
    }

    return res.status(200).json({ 
      ok: true, 
      copied: toInsert.length,
      total: legacyResults.length,
      message: `Migrated ${toInsert.length} of ${legacyResults.length} legacy results` 
    });
  } catch (e) {
    console.error("[migrate-legacy] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
