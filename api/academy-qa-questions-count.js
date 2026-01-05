// api/academy-qa-questions-count.js
// Q&A Questions Count API endpoint (for dashboard tile)
// Returns counts of questions by status for authenticated member
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
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
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
 * Returns { memberId } or null if not authenticated
 */
async function getAuthenticatedMember(req) {
  if (!process.env.MEMBERSTACK_SECRET_KEY) {
    console.error("[qa-count-api] MEMBERSTACK_SECRET_KEY not configured");
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
          return { memberId: data.id };
        }
      } catch (e) {
        console.error("[qa-count-api] Token verification failed:", e.message);
      }
    }

    // Fallback: Try member ID header
    const memberIdHeader = req.headers["x-memberstack-id"] || req.headers["x-memberstackid"];
    if (memberIdHeader) {
      try {
        const { data } = await memberstack.members.retrieve({ id: memberIdHeader });
        if (data?.id) {
          return { memberId: data.id };
        }
      } catch (e) {
        console.error("[qa-count-api] Member ID retrieval failed:", e.message);
      }
    }

    return null;
  } catch (e) {
    console.error("[qa-count-api] Authentication error:", e);
    return null;
  }
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    // Require authentication
    const auth = await getAuthenticatedMember(req);
    if (!auth || !auth.memberId) {
      // Return zeros for unauthenticated (dashboard will show placeholders)
      return res.status(200).json({
        asked: 0,
        answered: 0,
        outstanding: 0
      });
    }

    try {
      // Get total questions asked (all statuses)
      const { count: askedCount, error: askedError } = await supabase
        .from("academy_qa_questions")
        .select("*", { count: "exact", head: true })
        .eq("member_id", auth.memberId);

      if (askedError) {
        console.error("[qa-count-api] Error counting asked:", askedError);
      }

      // Get answered count (status = 'closed')
      const { count: answeredCount, error: answeredError } = await supabase
        .from("academy_qa_questions")
        .select("*", { count: "exact", head: true })
        .eq("member_id", auth.memberId)
        .eq("status", "closed");

      if (answeredError) {
        console.error("[qa-count-api] Error counting answered:", answeredError);
      }

      // Get outstanding count (status = 'ai_suggested' or 'queued')
      const { count: outstandingCount, error: outstandingError } = await supabase
        .from("academy_qa_questions")
        .select("*", { count: "exact", head: true })
        .eq("member_id", auth.memberId)
        .in("status", ["ai_suggested", "queued"]);

      if (outstandingError) {
        console.error("[qa-count-api] Error counting outstanding:", outstandingError);
      }

      return res.status(200).json({
        asked: askedCount || 0,
        answered: answeredCount || 0,
        outstanding: outstandingCount || 0
      });
    } catch (error) {
      console.error("[qa-count-api] Unexpected error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
