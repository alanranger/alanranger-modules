// api/academy-qa-questions.js
// Q&A Questions API endpoint (Vercel serverless function)
// Member-scoped: Only returns questions for authenticated member
//
// Requires env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - MEMBERSTACK_SECRET_KEY

const { createClient } = require('@supabase/supabase-js');
const memberstackAdmin = require("@memberstack/admin");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set([
  "https://alanranger.com",
  "https://www.alanranger.com",
]);

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.alanranger.com";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true"); // REQUIRED for credentials: "include"
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Memberstack-Id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/**
 * Get Memberstack token from request (cookie or Authorization header)
 */
function getMemberstackToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }
  const cookieHeader = req.headers.cookie || "";
  const parts = cookieHeader.split(";").map(v => v.trim());
  const found = parts.find(p => p.startsWith("_ms-mid="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

/**
 * Get authenticated member ID from Memberstack
 * Returns { memberId, memberName } or null if not authenticated
 */
async function getAuthenticatedMember(req) {
  if (!process.env.MEMBERSTACK_SECRET_KEY) {
    console.error("[qa-api] MEMBERSTACK_SECRET_KEY not configured");
    return null;
  }

  try {
    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    
    // Try token-based auth first
    const token = getMemberstackToken(req);
    if (token) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        const { data } = await memberstack.members.retrieve({ id });
        if (data?.id) {
          // Extract first name only
          let memberName = null;
          if (data.customFields && (data.customFields.firstName || data.customFields["first-name"])) {
            memberName = (data.customFields.firstName || data.customFields["first-name"]).trim();
          } else if (data.name && !data.name.includes('@')) {
            const nameParts = data.name.trim().split(/\s+/);
            memberName = nameParts[0] || null;
          }
          // Get email for storage
          const memberEmail = data.auth?.email || data.email || null;
          return { memberId: data.id, memberName, memberEmail };
        }
      } catch (e) {
        console.error("[qa-api] Token verification failed:", e.message);
      }
    }

    // Fallback: Try member ID header (when token is missing but client provided member ID)
    const memberIdHeader = req.headers["x-memberstack-id"] || req.headers["x-memberstackid"];
    if (memberIdHeader) {
      try {
        const { data } = await memberstack.members.retrieve({ id: memberIdHeader });
        if (data?.id) {
          let memberName = null;
          if (data.customFields && (data.customFields.firstName || data.customFields["first-name"])) {
            memberName = (data.customFields.firstName || data.customFields["first-name"]).trim();
          } else if (data.name && !data.name.includes('@')) {
            const nameParts = data.name.trim().split(/\s+/);
            memberName = nameParts[0] || null;
          }
          // Get email for storage
          const memberEmail = data.auth?.email || data.email || null;
          return { memberId: data.id, memberName, memberEmail };
        }
      } catch (e) {
        console.error("[qa-api] Member ID retrieval failed:", e.message);
      }
    }

    return null;
  } catch (e) {
    console.error("[qa-api] Authentication error:", e);
    return null;
  }
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    // Require authentication - member-scoped queries only
    const auth = await getAuthenticatedMember(req);
    if (!auth || !auth.memberId) {
      console.log("[qa-api] GET: Unauthenticated request - returning 401");
      console.log("[qa-api] GET: Headers received:", JSON.stringify(req.headers, null, 2));
      return res.status(401).json({ error: "Authentication required" });
    }

    const limitRaw = req.query.limit || "25";
    const limit = Math.max(1, Math.min(50, parseInt(limitRaw, 10) || 25));

    // Only return questions for the authenticated member
    // Include answer fields so members can see admin and AI answers
    // Phase 3: Use consolidated 'answer' field (falls back to admin_answer or ai_answer)
    const { data, error } = await supabase
      .from("academy_qa_questions")
      .select("id, question, member_id, member_name, page_url, status, created_at, answer, answered_at, admin_answer, admin_answered_at, ai_answer, ai_answered_at, answer_source, updated_at")
      .eq("member_id", auth.memberId) // CRITICAL: Filter by authenticated member only
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[qa-api] GET: Database error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`[qa-api] GET: Returning ${data?.length || 0} questions for member ${auth.memberId}`);
    return res.status(200).json({ data: data || [] });
  }

  if (req.method === "POST") {
    // Require authentication - never trust client-supplied member_id
    const auth = await getAuthenticatedMember(req);
    if (!auth || !auth.memberId) {
      console.log("[qa-api] POST: Unauthenticated request - returning 401");
      return res.status(401).json({ error: "Authentication required" });
    }

    const page_url = req.body?.page_url;
    const question = (req.body?.question || "").trim();

    // Validation
    if (!page_url) return res.status(400).json({ error: "page_url is required" });
    if (!question) return res.status(400).json({ error: "question is required" });
    if (question.length < 10) return res.status(400).json({ error: "question must be at least 10 characters" });
    if (question.length > 2000) return res.status(400).json({ error: "question must be <= 2000 chars" });

    // CRITICAL: Use authenticated member_id, never trust client input
    const insertData = {
      page_url,
      question,
      member_id: auth.memberId, // From verified auth, not client
      member_name: auth.memberName, // First name only, extracted from Memberstack
      member_email: auth.memberEmail || null, // Email from Memberstack
      status: 'queued' // Default status - queued for admin until AI service is connected
    };

    const { data, error } = await supabase
      .from("academy_qa_questions")
      .insert([insertData])
      .select("id, question, member_id, member_name, page_url, status, created_at")
      .single();

    if (error) {
      console.error("[qa-api] POST: Database error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`[qa-api] POST: Created question ${data.id} for member ${auth.memberId}`);
    return res.status(200).json({ data });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
