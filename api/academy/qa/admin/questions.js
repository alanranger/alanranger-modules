// /api/academy/qa/admin/questions.js
// Returns all Q&A questions with filters for admin dashboard

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
    const { 
      status, 
      answer_source, 
      page_url,
      member_id,
      q, // Search query
      from, // Date range start
      to, // Date range end
      limit = 50,
      offset = 0,
      sort = 'created_at',
      order = 'desc'
    } = req.query;
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let query = supabase
      .from('academy_qa_questions')
      .select('*', { count: 'exact' })
      .eq('is_example', false); // Exclude example questions from admin view

    // Apply filters
    if (status) {
      if (status === 'outstanding') {
        query = query.in('status', ['open', 'ai_suggested', 'queued']);
      } else if (status === 'answered') {
        query = query.in('status', ['answered', 'closed']);
      } else {
        query = query.eq('status', status);
      }
    }

    if (answer_source) {
      query = query.eq('answer_source', answer_source);
    }

    if (page_url) {
      query = query.eq('page_url', page_url);
    }

    if (member_id) {
      query = query.eq('member_id', member_id);
    }

    // Date range filters
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    // Search query (question text, member name, member email)
    if (q) {
      query = query.or(`question.ilike.%${q}%,member_name.ilike.%${q}%,member_email.ilike.%${q}%`);
    }

    // Apply sorting
    const sortOrder = order === 'asc' ? { ascending: true } : { ascending: false };
    query = query.order(sort, sortOrder);

    // Apply pagination
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const offsetNum = parseInt(offset, 10) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      questions: data || [],
      total: count || 0,
      limit: limitNum,
      offset: offsetNum
    });
  } catch (error) {
    console.error('[qa-admin-questions] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
