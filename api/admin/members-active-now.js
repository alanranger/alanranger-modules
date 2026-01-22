// /api/admin/members-active-now.js
// Returns count of members who are currently logged in
// A member is "logged in" if their most recent login is after their most recent logout (or they have no logout)

const { createClient } = require("@supabase/supabase-js");

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
        last_updated: now.toISOString()
      });
    }

    // Get all login and logout events for valid members
    const { data: loginLogoutEvents, error: eventsError } = await supabase
      .from('academy_events')
      .select('member_id, event_type, created_at')
      .in('member_id', validMemberIds)
      .in('event_type', ['login', 'member_login', 'logout'])
      .order('created_at', { ascending: false });

    if (eventsError) {
      throw eventsError;
    }

    // Group events by member_id to find most recent login and logout
    const memberLoginLogout = {};
    (loginLogoutEvents || []).forEach(event => {
      if (!memberLoginLogout[event.member_id]) {
        memberLoginLogout[event.member_id] = {
          lastLogin: null,
          lastLogout: null
        };
      }
      
      const isLogin = event.event_type === 'login' || event.event_type === 'member_login';
      const isLogout = event.event_type === 'logout';
      const eventDate = new Date(event.created_at);
      
      // Since events are ordered DESC, the first login we encounter is the most recent
      if (isLogin && !memberLoginLogout[event.member_id].lastLogin) {
        memberLoginLogout[event.member_id].lastLogin = eventDate;
      }
      // Since events are ordered DESC, the first logout we encounter is the most recent
      if (isLogout && !memberLoginLogout[event.member_id].lastLogout) {
        memberLoginLogout[event.member_id].lastLogout = eventDate;
      }
    });

    // Count members who are currently logged in
    // A member is logged in if: 
    // 1. They logged in recently (within last 2 hours)
    // 2. No logout exists OR last login is after last logout
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    let activeCount = 0;
    Object.keys(memberLoginLogout).forEach(memberId => {
      const { lastLogin, lastLogout } = memberLoginLogout[memberId];
      // Only count if logged in within last 2 hours and haven't logged out since
      if (lastLogin && 
          lastLogin >= twoHoursAgo && 
          (!lastLogout || lastLogin > lastLogout)) {
        activeCount++;
      }
    });

    // Debug logging
    console.log('[active-now-vercel-api] Query results:', {
      validMemberIdsCount: validMemberIds.length,
      loginLogoutEventsCount: loginLogoutEvents?.length || 0,
      activeCount: activeCount,
      twoHoursAgo: twoHoursAgo.toISOString(),
      now: now.toISOString()
    });

    return res.status(200).json({
      count: activeCount,
      last_updated: now.toISOString()
    });

  } catch (error) {
    console.error('[active-now-vercel-api] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
