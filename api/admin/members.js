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
    const activeNowFilter = req.query.active_now === 'true'; // filter to members with recent activity (last 30 min)
    const sortField = req.query.sort || 'updated_at'; // field to sort by
    const sortOrder = req.query.order || 'desc'; // 'asc' or 'desc'

    // Build query - by default, only show members with trial or annual plans
    // This excludes test accounts and members without valid plans
    let query = supabase.from('ms_members_cache').select('*', { count: 'exact' });
    
    // Default filter: only show members with trial or annual plans that are ACTIVE or TRIALING
    // This can be overridden by explicit planFilter if provided
    if (!planFilter) {
      // Filter to only show members with valid plans (trial or annual, active/trialing status)
      // We'll do this in JavaScript after fetching, as Supabase JSONB filtering is complex
    }

    // Apply explicit filters
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

    // Status filter is applied in JS below to handle case differences and expired logic

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    // For server-side sorting, we need to fetch ALL members first, then sort and paginate
    // This is because some sort fields are computed (like modules_opened_unique, exams_attempted)
    // So we'll fetch all, enrich, sort, then paginate
    
    // Get total count first (before pagination)
    const { count } = await query;

    // Fetch ALL members (no pagination yet) - we'll sort and paginate after enrichment
    // Use a reasonable limit to prevent memory issues (e.g., 1000 members max)
    const { data: members, error } = await query.order('updated_at', { ascending: false }).limit(1000);

    if (error) {
      throw error;
    }

    const now = new Date();
    const isExpiredPlan = (plan) => {
      const endDate = plan.current_period_end || plan.expiry_date;
      if (!endDate) return false;
      const expiry = new Date(endDate);
      return !isNaN(expiry.getTime()) && expiry < now;
    };

    // Filter out test accounts and members without valid plans (trial or annual)
    // Default to ACTIVE/TRIALING unless status filter requests otherwise
    const validMembers = (members || []).filter(member => {
      const plan = member.plan_summary || {};
      const planType = plan.plan_type || '';
      const status = (plan.status || '').toUpperCase();
      
      const hasPlan = planType === 'trial' || planType === 'annual';
      if (!hasPlan) return false;

      if (statusFilter === 'expired') {
        return isExpiredPlan(plan);
      }

      if (statusFilter) {
        return status === statusFilter.toUpperCase();
      }

      // Default: only include ACTIVE/TRIALING
      return status === 'ACTIVE' || status === 'TRIALING';
    });

    // Enrich with engagement stats (last seen, modules opened, exams, bookmarks)
    let memberIds = validMembers?.map(m => m.member_id) || [];
    let filteredValidMembers = validMembers; // Start with all valid members
    
    // If active_now filter is enabled, filter to only members with activity in last 30 minutes
    if (activeNowFilter && memberIds.length > 0) {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentActivities, error: activitiesError } = await supabase
        .from('academy_events')
        .select('member_id')
        .in('member_id', memberIds)
        .gte('created_at', thirtyMinutesAgo);
      
      if (activitiesError) {
        throw activitiesError;
      }
      
      const activeMemberIds = new Set((recentActivities || []).map(a => a.member_id));
      memberIds = memberIds.filter(id => activeMemberIds.has(id));
      
      // Filter validMembers to only include active members
      filteredValidMembers = validMembers.filter(m => memberIds.includes(m.member_id));
    }
    
    // If no member IDs after filtering, return empty result
    if (memberIds.length === 0) {
      return res.status(200).json({
        members: [],
        pagination: {
          page: 1,
          limit: limit,
          total: 0,
          totalPages: 0
        }
      });
    }
    
    // Get last activity per member - use a more efficient query
    // Get the most recent event per member by using a subquery approach
    async function fetchAllEvents({ eventType }) {
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;
      const all = [];
      while (hasMore) {
        let query = supabase
          .from('academy_events')
          .select('member_id, created_at')
          .in('member_id', memberIds)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (eventType) {
          query = query.eq('event_type', eventType);
        }
        const { data: page, error: pageError } = await query;
        if (pageError) {
          throw pageError;
        }
        const rows = page || [];
        all.push(...rows);
        hasMore = rows.length === pageSize;
        from += pageSize;
      }
      return all;
    }

    const activities = await fetchAllEvents({ eventType: null });
    const logins = await fetchAllEvents({ eventType: 'login' });

    // Get module opens count per member
    const { data: moduleOpens } = await supabase
      .from('academy_events')
      .select('member_id, path')
      .eq('event_type', 'module_open')
      .in('member_id', memberIds);

    // Get exam stats per member from module_results_ms
    // First try by memberstack_id, then also check by email for legacy data
    const { data: examStatsById } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, email, passed')
      .in('memberstack_id', memberIds);
    
    // Also get exams by email for legacy data (members who haven't migrated yet)
    const memberEmails = members?.map(m => m.email).filter(Boolean) || [];
    const { data: examStatsByEmail } = memberEmails.length > 0 ? await supabase
      .from('module_results_ms')
      .select('memberstack_id, email, passed')
      .in('email', memberEmails) : { data: [] };
    
    // Combine both results
    const examStats = [...(examStatsById || []), ...(examStatsByEmail || [])];

    // Get bookmark count per member
    const { data: bookmarks } = await supabase
      .from('academy_events')
      .select('member_id')
      .eq('event_type', 'bookmark_add')
      .in('member_id', memberIds);

  // Get latest Hue Test total score per member
  const { data: hueResults, error: hueError } = await supabase
    .from('academy_hue_test_results')
    .select('member_id, total_score, created_at')
    .in('member_id', memberIds)
    .order('created_at', { ascending: false });

  if (hueError) {
    console.error('[members] Hue test fetch error:', hueError);
  }

    // Build lookup maps
    const lastSeenMap = {};
    activities?.forEach(activity => {
      const memberId = activity.member_id;
      if (!lastSeenMap[memberId] || new Date(activity.created_at) > new Date(lastSeenMap[memberId])) {
        lastSeenMap[memberId] = activity.created_at;
      }
    });
    
    // Build last login map (get 2nd most recent login as "last login", or most recent if only one)
    const lastLoginMap = {};
    const loginEventsByMember = {};
    logins?.forEach(login => {
      const memberId = login.member_id;
      if (!loginEventsByMember[memberId]) {
        loginEventsByMember[memberId] = [];
      }
      loginEventsByMember[memberId].push(login.created_at);
    });
    
    // For each member, get the 2nd most recent login (previous login) or most recent if only one
    Object.keys(loginEventsByMember).forEach(memberId => {
      const loginTimes = loginEventsByMember[memberId].sort((a, b) => new Date(b) - new Date(a));
      const now = new Date();
      const mostRecent = new Date(loginTimes[0]);
      const twoMinutesAgo = 2 * 60 * 1000;
      
      // If most recent login is very recent (within 2 min), use 2nd one as "last login"
      // Otherwise use most recent
      if (loginTimes.length >= 2 && (now.getTime() - mostRecent.getTime()) < twoMinutesAgo) {
        lastLoginMap[memberId] = loginTimes[1]; // Previous login
      } else {
        lastLoginMap[memberId] = loginTimes[0]; // Most recent login
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

    // Build map by member_id first, then by email for legacy data
    const examStatsMap = {};
    const examStatsByEmailMap = {};
    
    examStats?.forEach(exam => {
      // Try to match by memberstack_id first
      const memberId = exam.memberstack_id;
      if (memberIds.includes(memberId)) {
        if (!examStatsMap[memberId]) {
          examStatsMap[memberId] = { attempts: 0, passed: 0 };
        }
        examStatsMap[memberId].attempts++;
        if (exam.passed) examStatsMap[memberId].passed++;
      } else if (exam.email) {
        // For legacy data, match by email
        if (!examStatsByEmailMap[exam.email]) {
          examStatsByEmailMap[exam.email] = { attempts: 0, passed: 0 };
        }
        examStatsByEmailMap[exam.email].attempts++;
        if (exam.passed) examStatsByEmailMap[exam.email].passed++;
      }
    });

    const bookmarksMap = {};
    bookmarks?.forEach(bookmark => {
      const memberId = bookmark.member_id;
      bookmarksMap[memberId] = (bookmarksMap[memberId] || 0) + 1;
    });

  const hueScoreMap = {};
  hueResults?.forEach(result => {
    if (hueScoreMap[result.member_id] == null) {
      hueScoreMap[result.member_id] = result.total_score;
    }
  });

    // Enrich members with stats from both Supabase events AND Memberstack JSON
    const enrichedMembers = filteredValidMembers?.map(member => {
      const memberId = member.member_id;
      const plan = member.plan_summary || {};
      
      // Get modules and bookmarks from Memberstack JSON (raw field)
      const raw = member.raw || {};
      const json = raw?.json || raw?.data?.json || raw;
      const arAcademy = json?.arAcademy || {};
      const modules = arAcademy?.modules || {};
      const opened = modules?.opened || {};
      // Bookmarks are at root level: json.bookmarks, not json.arAcademy.bookmarks
      const bookmarks = json?.bookmarks || [];
      
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
        last_login: lastLoginMap[memberId] || null,
        plan_expiry_date: expiryDate,
        modules_opened_unique: modulesOpenedUnique,
        modules_opened_total: modulesOpenedTotal,
        // Combine exam stats by member_id and by email (for legacy data)
        exams_attempted: (examStatsMap[memberId]?.attempts || 0) + (examStatsByEmailMap[member.email]?.attempts || 0),
        exams_passed: (examStatsMap[memberId]?.passed || 0) + (examStatsByEmailMap[member.email]?.passed || 0),
        bookmarks_count: bookmarksCount,
      photography_style: member.photography_style || null,
      hue_test_score: hueScoreMap[memberId] ?? null
      };
    }) || [];

    // Apply last_seen filter if specified
    let filteredMembers = enrichedMembers;
    if (lastSeenFilter) {
      const now = new Date();
      if (lastSeenFilter === 'never') {
        filteredMembers = enrichedMembers.filter(m => !m.last_seen);
      } else {
        let cutoffDate;
        if (lastSeenFilter === '24h') {
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        } else if (lastSeenFilter === '7d') {
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (lastSeenFilter === '30d') {
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (cutoffDate) {
          filteredMembers = enrichedMembers.filter(m => 
            m.last_seen && new Date(m.last_seen) >= cutoffDate
          );
        }
      }
    }

    // Apply server-side sorting
    if (sortField) {
      filteredMembers.sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];
        
        // Handle null/undefined values - put them at the end
        const aIsNull = aVal == null || aVal === '';
        const bIsNull = bVal == null || bVal === '';
        
        if (aIsNull && bIsNull) return 0;
        if (aIsNull) return 1; // null values go to end
        if (bIsNull) return -1; // null values go to end
        
        // Handle dates
        if (sortField === 'signed_up' || sortField === 'last_seen' || sortField === 'plan_expiry_date') {
          aVal = aVal ? new Date(aVal).getTime() : 0;
          bVal = bVal ? new Date(bVal).getTime() : 0;
        }
        
        // Handle numbers (including modules_opened_unique, exams_attempted, exams_passed, bookmarks_count)
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          if (sortOrder === 'asc') {
            return aVal - bVal;
          } else {
            return bVal - aVal;
          }
        }
        
        // Handle strings (name, email, plan_name, status, photography_style)
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
          if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
          }
        }
        
        // Handle boolean values
        if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
          if (sortOrder === 'asc') {
            return aVal === bVal ? 0 : aVal ? 1 : -1;
          } else {
            return aVal === bVal ? 0 : aVal ? -1 : 1;
          }
        }
        
        // Fallback for mixed types
        if (sortOrder === 'asc') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
      });
    }

    // Apply pagination AFTER sorting
    const totalFiltered = filteredMembers.length;
    const paginatedMembers = filteredMembers.slice(offset, offset + limit);

    return res.status(200).json({
      members: paginatedMembers,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit)
      }
    });

  } catch (error) {
    console.error('[members] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
