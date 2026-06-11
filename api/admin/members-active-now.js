// /api/admin/members-active-now.js
// Returns members with recent academy_events within the sliding window plus
// a resolved name/email row from ms_members_cache for dashboard display.
// A member is "logged in" if their most recent login is after their most recent logout (or they have no logout)

const { createClient } = require("@supabase/supabase-js");
const { attachTableBadgeFields, tallyExamPassCountsFromRows } = require("../../lib/admin-gate-stats");

module.exports = async (req, res) => {
  // Log incoming request for debugging
  console.log('[active-now-vercel-api] Request received:', {
    method: req.method,
    url: req.url,
    endpoint: 'api/admin/members-active-now'
  });

  try {
    if (req.method !== "GET") {
      console.error('[active-now-vercel-api] Method not allowed:', req.method);
      return res.status(405).json({ 
        error: "Method Not Allowed",
        received: req.method,
        expected: "GET",
        endpoint: 'api/admin/members-active-now'
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const now = new Date();

    // Get all valid members (trial or annual, active/trialing)
    const { data: allMembers, error: membersError } = await supabase
      .from('ms_members_cache')
      .select('member_id, plan_summary')
      .limit(1000);

    if (membersError) {
      throw membersError;
    }

    // Filter to only valid members (trial or annual, active/trialing)
    // Note: plan_summary from Supabase is already a parsed object, not a string
    const validMemberIds = (allMembers || [])
      .filter(member => {
        // Handle both string (if not parsed) and object (if parsed) cases
        let plan = member.plan_summary;
        if (typeof plan === 'string') {
          try {
            plan = JSON.parse(plan);
          } catch (e) {
            plan = {};
          }
        }
        plan = plan || {};
        
        const planType = plan.plan_type || '';
        const status = (plan.status || '').toUpperCase();
        
        const isValid = (
          (planType === 'trial' || planType === 'annual') &&
          (status === 'ACTIVE' || status === 'TRIALING')
        );
        
        return isValid;
      })
      .map(m => m.member_id);

    if (validMemberIds.length === 0) {
      return res.status(200).json({
        count: 0,
        members: [],
        activity_window_minutes: 30,
        last_updated: now.toISOString()
      });
    }

    // Count members with recent activity (any event type) within last 30 minutes
    // This accounts for automatic session timeouts - if they're active, they're logged in
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    
    // Get most recent activity (any event) for each valid member
    const { data: recentActivities, error: eventsError } = await supabase
      .from('academy_events')
      .select('member_id, created_at')
      .in('member_id', validMemberIds)
      .gte('created_at', thirtyMinutesAgo.toISOString())
      .order('created_at', { ascending: false });

    if (eventsError) {
      throw eventsError;
    }

    const activeMemberIds = new Set(
      (recentActivities || []).map(e => e.member_id).filter(Boolean)
    );

    const activeCount = activeMemberIds.size;

    const ids = Array.from(activeMemberIds);
    const latestActivityByMember = new Map();
    for (const row of recentActivities || []) {
      if (!row?.member_id || latestActivityByMember.has(row.member_id)) continue;
      latestActivityByMember.set(row.member_id, row.created_at);
    }

    let memberRows = [];
    if (ids.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('ms_members_cache')
        .select('member_id, email, name, raw, plan_summary')
        .in('member_id', ids);
      if (profileError) throw profileError;

      const passCountsByMember = {};
      const { data: examRows } = await supabase
        .from('module_results_ms')
        .select('memberstack_id, module_id, passed')
        .in('memberstack_id', ids);
      tallyExamPassCountsFromRows((examRows || []).filter((row) => row.passed)).forEach((counts, memberId) => {
        passCountsByMember[memberId] = counts;
      });

      const byId = new Map((profiles || []).map((r) => [r.member_id, r]));
      memberRows = ids
        .map((id) => {
          const profile = byId.get(id);
          const plan = profile?.plan_summary || {};
          const row = {
            member_id: id,
            email: profile?.email || null,
            name: profile?.name || null,
            last_activity_at: latestActivityByMember.get(id) || null,
          };
          if (profile) {
            const examCounts = passCountsByMember[id] || {
              foundationExamsPassed: 0,
              compositionExamsPassed: 0,
            };
            attachTableBadgeFields(
              row,
              profile.raw,
              examCounts.foundationExamsPassed,
              !!plan.is_paid,
              row.last_activity_at,
              examCounts.compositionExamsPassed
            );
          }
          return row;
        })
        .sort((a, b) => {
          const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return tb - ta;
        });
    }

    // Debug logging
    console.log('[active-now-vercel-api] Query results:', {
      validMemberIdsCount: validMemberIds.length,
      recentActivitiesCount: recentActivities?.length || 0,
      activeCount: activeCount,
      thirtyMinutesAgo: thirtyMinutesAgo.toISOString(),
      now: now.toISOString()
    });

    return res.status(200).json({
      count: activeCount,
      members: memberRows,
      activity_window_minutes: 30,
      last_updated: now.toISOString()
    });

  } catch (error) {
    console.error('[active-now-vercel-api] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
