// /api/academy/qa/admin/questions/[id].js
// Delete a question (admin-only)
// Permanently deletes the question from the database

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const { checkAdminAccess } = require(path.resolve(__dirname, "../../../../admin/_auth.js"));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  // Check admin access
  const { isAdmin, error } = await checkAdminAccess(req);
  if (!isAdmin) {
    return res.status(403).json({ error: error || "Admin access required" });
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const questionId = req.query.id || req.query.question_id;
  if (!questionId) {
    return res.status(400).json({ error: "Question ID is required" });
  }

  try {
    // Verify question exists
    const { data: question, error: fetchError } = await supabase
      .from("academy_qa_questions")
      .select("id, question, member_id")
      .eq("id", questionId)
      .single();

    if (fetchError || !question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Delete the question
    const { error: deleteError } = await supabase
      .from("academy_qa_questions")
      .delete()
      .eq("id", questionId);

    if (deleteError) {
      console.error("[qa-admin-delete] Delete error:", deleteError);
      return res.status(500).json({ error: deleteError.message });
    }

    console.log(`[qa-admin-delete] Deleted question ${questionId}`);
    return res.status(200).json({ 
      success: true,
      message: "Question deleted permanently"
    });
  } catch (error) {
    console.error("[qa-admin-delete] Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
