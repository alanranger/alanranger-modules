// /api/academy/qa/questions/[id]/archive.js
// Archive a question (member-scoped: only the question owner can archive)
// Sets archived=true, hides from member views but keeps in DB and dashboard counts

const { createClient } = require("@supabase/supabase-js");
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
  res.setHeader("Access-Control-Allow-Methods", "PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Memberstack-Id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function getAuthenticatedMember(req) {
  if (!process.env.MEMBERSTACK_SECRET_KEY) {
    return null;
  }

  try {
    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    const token = req.headers.authorization?.replace("Bearer ", "") || 
                  req.headers.cookie?.match(/_ms-mid=([^;]+)/)?.[1] ||
                  req.headers["x-memberstack-id"];
    
    if (token) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        const { data } = await memberstack.members.retrieve({ id });
        if (data?.id) {
          return { memberId: data.id };
        }
      } catch (e) {
        // Try direct member ID lookup
        const { data } = await memberstack.members.retrieve({ id: token });
        if (data?.id) {
          return { memberId: data.id };
        }
      }
    }
  } catch (e) {
    console.error("[qa-archive] Auth error:", e.message);
  }
  return null;
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require authentication
  const auth = await getAuthenticatedMember(req);
  if (!auth || !auth.memberId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const questionId = req.query.id || req.query.question_id;
  if (!questionId) {
    return res.status(400).json({ error: "Question ID is required" });
  }

  try {
    // First, verify the question belongs to this member
    const { data: question, error: fetchError } = await supabase
      .from("academy_qa_questions")
      .select("id, member_id, archived")
      .eq("id", questionId)
      .single();

    if (fetchError || !question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Verify ownership
    if (question.member_id !== auth.memberId) {
      return res.status(403).json({ error: "You can only archive your own questions" });
    }

    // Toggle archive status
    const newArchivedStatus = !question.archived;

    const { data: updated, error: updateError } = await supabase
      .from("academy_qa_questions")
      .update({ 
        archived: newArchivedStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", questionId)
      .eq("member_id", auth.memberId) // Double-check ownership
      .select("id, archived")
      .single();

    if (updateError) {
      console.error("[qa-archive] Update error:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ 
      data: updated,
      message: newArchivedStatus ? "Question archived" : "Question unarchived"
    });
  } catch (error) {
    console.error("[qa-archive] Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
