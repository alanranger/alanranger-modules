// /api/academy/qa/admin/stats.js
// Returns Q&A statistics for admin dashboard tiles

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const { checkAdminAccess } = require(path.resolve(__dirname, "../../../admin/_auth.js"));

module.exports = async (req, res) => {
  // Check admin access - Phase 3: Security enforcement
  const { isAdmin, error } = await checkAdminAccess(req);
  if (!isAdmin) {
    return res.status(403).json({ error: error || "Admin access required" });
  }

  try {
    const { range = '30d' } = req.query;
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Calculate date range
    const now = new Date();
    let startDate;
    if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(0); // All time
    }

    // Questions posted (last 30 days)
    const { count: questionsPosted } = await supabase
      .from('academy_qa_questions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString());

    // Answered (last 30 days) - status = 'answered' or 'closed'
    const { count: answered } = await supabase
      .from('academy_qa_questions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['answered', 'closed'])
      .gte('created_at', startDate.toISOString());

    // Outstanding (no answer yet) - status = 'open', 'ai_suggested', or 'queued' without published answer
    const { count: outstanding } = await supabase
      .from('academy_qa_questions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'ai_suggested', 'queued'])
      .is('answer', null);

    // Answered by Robo-Ranger (AI answers, last 30 days)
    const { count: answeredByAI } = await supabase
      .from('academy_qa_questions')
      .select('*', { count: 'exact', head: true })
      .eq('answer_source', 'ai')
      .not('ai_answer', 'is', null)
      .gte('created_at', startDate.toISOString());

    // Avg response time (answered_at - created_at) for answered questions only
    // Only include questions that have been answered (have admin_answered_at or ai_answered_at)
    const { data: answeredQuestions } = await supabase
      .from('academy_qa_questions')
      .select('created_at, admin_answered_at, ai_answered_at')
      .or('admin_answered_at.not.is.null,ai_answered_at.not.is.null')
      .gte('created_at', startDate.toISOString());

    let avgResponseTime = null;
    if (answeredQuestions && answeredQuestions.length > 0) {
      const responseTimes = answeredQuestions
        .map(q => {
          const answeredAt = q.admin_answered_at || q.ai_answered_at;
          if (!answeredAt) return null;
          return new Date(answeredAt) - new Date(q.created_at);
        })
        .filter(Boolean);
      
      if (responseTimes.length > 0) {
        const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        avgResponseTime = Math.round(avgMs / (1000 * 60 * 60)); // Convert to hours
      }
    }

    // Members with outstanding (count of unique members with open questions)
    const { data: outstandingQuestions } = await supabase
      .from('academy_qa_questions')
      .select('member_id')
      .in('status', ['open', 'ai_suggested', 'queued'])
      .is('answer', null)
      .not('member_id', 'is', null);

    const uniqueMembersWithOutstanding = outstandingQuestions
      ? new Set(outstandingQuestions.map(q => q.member_id).filter(Boolean)).size
      : 0;

    return res.status(200).json({
      questionsPosted: questionsPosted || 0,
      answered: answered || 0,
      outstanding: outstanding || 0,
      answeredByAI: answeredByAI || 0,
      avgResponseTimeHours: avgResponseTime,
      membersWithOutstanding: uniqueMembersWithOutstanding
    });
  } catch (error) {
    console.error('[qa-admin-stats] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
