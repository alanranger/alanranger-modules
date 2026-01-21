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

    // Get exam stats - use same approach as members list API
    // Check module_results_ms by memberstack_id first, then by email for legacy data
    const { data: examStatsById } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, email, passed')
      .eq('memberstack_id', memberId);
    
    // Also get exams by email for legacy data
    const { data: examStatsByEmail } = member.email ? await supabase
      .from('module_results_ms')
      .select('memberstack_id, email, passed')
      .eq('email', member.email) : { data: [] };
    
    // Combine both results
    const examStats = [...(examStatsById || []), ...(examStatsByEmail || [])];
    
    const examStatsResult = {
      attempts: examStats.length,
      passed: examStats.filter(e => e.passed).length,
      failed: examStats.filter(e => !e.passed).length,
      pass_rate: examStats.length > 0 
        ? Math.round((examStats.filter(e => e.passed).length / examStats.length) * 100) 
        : 0
    };

    // Get bookmarks - check both academy_events and Memberstack JSON data
    const { data: bookmarksFromEvents } = await supabase
      .from('academy_events')
      .select('path, title, created_at')
      .eq('member_id', memberId)
      .eq('event_type', 'bookmark_add')
      .order('created_at', { ascending: false });
    
    // Also check Memberstack JSON data for bookmarks (same as members list API)
    const raw = member.raw || {};
    const json = raw?.json || raw?.data?.json || raw;
    const bookmarksFromJson = json?.bookmarks || [];
    
    // Use Memberstack JSON data if available, otherwise fall back to events
    const bookmarks = Array.isArray(bookmarksFromJson) && bookmarksFromJson.length > 0 
      ? bookmarksFromJson.map((path, idx) => ({
          path: typeof path === 'string' ? path : path?.path || path,
          title: path?.title || null,
          created_at: path?.created_at || null
        }))
      : (bookmarksFromEvents || []);

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
      
      // Photography Style Quiz results
      photography_style: member.photography_style || null,
      photography_style_percentage: member.photography_style_percentage || null,
      photography_style_other_interests: member.photography_style_other_interests || null,
      photography_style_quiz_completed_at: member.photography_style_quiz_completed_at || null,
      
      // Engagement stats
      engagement: {
        modules_opened_unique: uniqueModules.size,
        modules_opened_total: moduleOpens?.length || 0,
        most_opened_modules: mostOpenedModules,
        exams: examStatsResult,
        bookmarks_count: bookmarks.length,
        bookmarks: bookmarks
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
