// /api/admin/members.js
// Returns paginated member directory with filters
// Combines ms_members_cache with engagement stats from academy_events

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse query params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const planFilter = req.query.plan; // 'trial', 'paid', 'annual', 'monthly'
    const statusFilter = req.query.status; // 'active', 'trialing', 'canceled'
    const search = req.query.search; // name or email search
    const lastSeenFilter = req.query.last_seen; // '24h', '7d', '30d', 'never'

    // Build query
    let query = supabase.from('ms_members_cache').select('*', { count: 'exact' });

    // Apply filters
    if (planFilter) {
      if (planFilter === 'trial') {
        query = query.contains('plan_summary', { is_trial: true });
      } else if (planFilter === 'paid') {
        query = query.contains('plan_summary', { is_paid: true });
      } else if (planFilter === 'annual') {
        query = query.contains('plan_summary', { plan_type: 'annual' });
      } else if (planFilter === 'monthly') {
        query = query.contains('plan_summary', { plan_type: 'monthly' });
      }
    }

    if (statusFilter) {
      query = query.contains('plan_summary', { status: statusFilter });
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    // Get total count first
    const { count } = await query;

    // Apply pagination
    query = query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: members, error } = await query;

    if (error) {
      throw error;
    }

    // Enrich with engagement stats (last seen, modules opened, exams, bookmarks)
    const memberIds = members?.map(m => m.member_id) || [];
    
    // Get last activity per member
    const { data: lastActivities } = await supabase
      .from('academy_events')
      .select('member_id, created_at')
      .in('member_id', memberIds)
      .order('created_at', { ascending: false });

    // Get module opens count per member
    const { data: moduleOpens } = await supabase
      .from('academy_events')
      .select('member_id, path')
      .eq('event_type', 'module_open')
      .in('member_id', memberIds);

    // Get exam stats per member from module_results_ms (uses memberstack_id)
    const { data: examStats } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, passed')
      .in('memberstack_id', memberIds);

    // Get bookmark count per member
    const { data: bookmarks } = await supabase
      .from('academy_events')
      .select('member_id')
      .eq('event_type', 'bookmark_add')
      .in('member_id', memberIds);

    // Build lookup maps
    const lastSeenMap = {};
    lastActivities?.forEach(activity => {
      const memberId = activity.member_id;
      if (!lastSeenMap[memberId] || new Date(activity.created_at) > new Date(lastSeenMap[memberId])) {
        lastSeenMap[memberId] = activity.created_at;
      }
    });

    const moduleOpensMap = {};
    const uniqueModulesMap = {};
    moduleOpens?.forEach(open => {
      const memberId = open.member_id;
      moduleOpensMap[memberId] = (moduleOpensMap[memberId] || 0) + 1;
      if (!uniqueModulesMap[memberId]) uniqueModulesMap[memberId] = new Set();
      uniqueModulesMap[memberId].add(open.path);
    });

    const examStatsMap = {};
    examStats?.forEach(exam => {
      const memberId = exam.memberstack_id; // Use memberstack_id from module_results_ms
      if (!examStatsMap[memberId]) {
        examStatsMap[memberId] = { attempts: 0, passed: 0 };
      }
      examStatsMap[memberId].attempts++;
      if (exam.passed) examStatsMap[memberId].passed++;
    });

    const bookmarksMap = {};
    bookmarks?.forEach(bookmark => {
      const memberId = bookmark.member_id;
      bookmarksMap[memberId] = (bookmarksMap[memberId] || 0) + 1;
    });

    // Enrich members with stats from both Supabase events AND Memberstack JSON
    const enrichedMembers = members?.map(member => {
      const memberId = member.member_id;
      const plan = member.plan_summary || {};
      
      // Get modules and bookmarks from Memberstack JSON (raw field)
      const raw = member.raw || {};
      const json = raw?.json || raw?.data?.json || raw;
      const arAcademy = json?.arAcademy || {};
      const modules = arAcademy?.modules || {};
      const opened = modules?.opened || {};
      const bookmarks = arAcademy?.bookmarks || [];
      
      // Count unique modules from Memberstack JSON
      const modulesFromJson = Object.keys(opened).filter(Boolean).length;
      const totalOpensFromJson = Object.values(opened).reduce((sum, m) => sum + (m.count || 1), 0);
      
      // Use Memberstack JSON data if available, otherwise fall back to events
      const modulesOpenedUnique = modulesFromJson > 0 ? modulesFromJson : (uniqueModulesMap[memberId]?.size || 0);
      const modulesOpenedTotal = totalOpensFromJson > 0 ? totalOpensFromJson : (moduleOpensMap[memberId] || 0);
      const bookmarksCount = Array.isArray(bookmarks) ? bookmarks.length : (bookmarksMap[memberId] || 0);
      
      // Get expiry date: for trials use expiry_date, for annual use current_period_end
      const expiryDate = plan.is_trial ? plan.expiry_date : (plan.current_period_end || plan.expiry_date);
      
      return {
        member_id: memberId,
        email: member.email,
        name: member.name,
        plan_name: plan.plan_name || 'No Plan',
        plan_type: plan.plan_type || null,
        status: plan.status || 'unknown',
        is_trial: plan.is_trial || false,
        is_paid: plan.is_paid || false,
        signed_up: member.created_at,
        last_seen: lastSeenMap[memberId] || null,
        plan_expiry_date: expiryDate,
        modules_opened_unique: modulesOpenedUnique,
        modules_opened_total: modulesOpenedTotal,
        exams_attempted: examStatsMap[memberId]?.attempts || 0,
        exams_passed: examStatsMap[memberId]?.passed || 0,
        bookmarks_count: bookmarksCount
      };
    }) || [];

    // Apply last_seen filter if specified
    let filteredMembers = enrichedMembers;
    if (lastSeenFilter) {
      const now = new Date();
      let cutoffDate;
      if (lastSeenFilter === '24h') {
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (lastSeenFilter === '7d') {
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (lastSeenFilter === '30d') {
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      if (cutoffDate) {
        if (lastSeenFilter === 'never') {
          filteredMembers = enrichedMembers.filter(m => !m.last_seen);
        } else {
          filteredMembers = enrichedMembers.filter(m => 
            m.last_seen && new Date(m.last_seen) >= cutoffDate
          );
        }
      }
    }

    return res.status(200).json({
      members: filteredMembers,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('[members] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
