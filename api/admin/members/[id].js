// /api/admin/members/[id].js
// Returns detailed member information for member detail page

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { id } = req.query; // Next.js dynamic route param
    const memberId = id;

    if (!memberId) {
      return res.status(400).json({ error: "Member ID required" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get member from cache
    const { data: member, error: memberError } = await supabase
      .from('ms_members_cache')
      .select('*')
      .eq('member_id', memberId)
      .single();

    if (memberError || !member) {
      return res.status(404).json({ error: "Member not found" });
    }

    const plan = member.plan_summary || {};

    // Get last activity
    const { data: lastActivity } = await supabase
      .from('academy_events')
      .select('created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get module opens (unique and total)
    const { data: moduleOpens } = await supabase
      .from('academy_events')
      .select('path, title, category, created_at')
      .eq('member_id', memberId)
      .eq('event_type', 'module_open')
      .order('created_at', { ascending: false });

    const uniqueModules = new Set(moduleOpens?.map(m => m.path) || []);
    const moduleCounts = {};
    moduleOpens?.forEach(open => {
      const path = open.path;
      moduleCounts[path] = {
        title: open.title || path,
        category: open.category || null,
        count: (moduleCounts[path]?.count || 0) + 1,
        last_opened: open.created_at
      };
    });

    const mostOpenedModules = Object.entries(moduleCounts)
      .map(([path, data]) => ({ path, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get exam stats
    const { data: exams } = await supabase
      .from('exam_member_links')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    const examStats = {
      attempts: exams?.length || 0,
      passed: exams?.filter(e => e.passed).length || 0,
      failed: exams?.filter(e => !e.passed).length || 0,
      pass_rate: exams?.length > 0 
        ? Math.round((exams.filter(e => e.passed).length / exams.length) * 100) 
        : 0
    };

    // Get bookmarks
    const { data: bookmarks } = await supabase
      .from('academy_events')
      .select('path, title, created_at')
      .eq('member_id', memberId)
      .eq('event_type', 'bookmark_add')
      .order('created_at', { ascending: false });

    // Get recent activity (paginated)
    const activityPage = parseInt(req.query.activity_page) || 1;
    const activityLimit = parseInt(req.query.activity_limit) || 20;
    const activityOffset = (activityPage - 1) * activityLimit;

    const { data: recentActivity, count: activityCount } = await supabase
      .from('academy_events')
      .select('*', { count: 'exact' })
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .range(activityOffset, activityOffset + activityLimit - 1);

    return res.status(200).json({
      // Header info
      member_id: member.member_id,
      email: member.email,
      name: member.name,
      plan_name: plan.plan_name || 'No Plan',
      plan_type: plan.plan_type || null,
      status: plan.status || 'unknown',
      is_trial: plan.is_trial || false,
      is_paid: plan.is_paid || false,
      signed_up: member.created_at,
      last_seen: lastActivity?.created_at || null,
      
      // Engagement stats
      engagement: {
        modules_opened_unique: uniqueModules.size,
        modules_opened_total: moduleOpens?.length || 0,
        most_opened_modules: mostOpenedModules,
        exams: examStats,
        bookmarks_count: bookmarks?.length || 0,
        bookmarks: bookmarks || []
      },
      
      // Recent activity
      recent_activity: recentActivity || [],
      activity_pagination: {
        page: activityPage,
        limit: activityLimit,
        total: activityCount || 0,
        totalPages: Math.ceil((activityCount || 0) / activityLimit)
      },
      
      // Raw data (for debugging)
      raw: member.raw || {}
    });

  } catch (error) {
    console.error('[members/:id] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
