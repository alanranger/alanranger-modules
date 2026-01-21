// API endpoint to save photography style quiz results to Supabase
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  // CORS headers for Squarespace
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alanranger.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Memberstack-Id');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { memberId, quizResult } = req.body;

    if (!memberId) {
      return res.status(400).json({ error: "memberId is required" });
    }

    if (!quizResult || !quizResult.title) {
      return res.status(400).json({ error: "quizResult with title is required" });
    }

    // Prepare the quiz result data to save
    const quizData = {
      photography_style: quizResult.title, // e.g., "Landscape Photographer"
      photography_style_percentage: quizResult.percentage || null,
      photography_style_description: quizResult.description || null,
      photography_style_other_interests: quizResult.otherStyles || null,
      photography_style_quiz_completed_at: new Date().toISOString(),
    };

    // Update the member record in Supabase
    const { data, error } = await supabase
      .from("ms_members_cache")
      .update(quizData)
      .eq("member_id", memberId)
      .select();

    if (error) {
      console.error("[save-quiz-result] Supabase error:", error);
      return res.status(500).json({ 
        error: "Failed to save quiz result",
        details: error.message 
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }

    console.log(`[save-quiz-result] Quiz result saved for member ${memberId}: ${quizResult.title}`);

    return res.status(200).json({
      success: true,
      message: "Quiz result saved successfully",
      data: data[0],
    });

  } catch (error) {
    console.error("[save-quiz-result] Fatal error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}
