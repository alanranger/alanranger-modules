// pages/api/admin/members/active-now.js
// Returns count of members who logged in within the last 5 minutes

const { createClient } = require("@supabase/supabase-js");

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Calculate 5 minutes ago
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

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

    // Get events from the last 5 minutes for valid members
    // We'll count distinct members who have ANY event in the last 5 minutes
    const { data: recentEvents, error: eventsError } = await supabase
      .from('academy_events')
      .select('member_id, created_at')
      .in('member_id', validMemberIds)
      .gte('created_at', fiveMinutesAgo.toISOString())
      .order('created_at', { ascending: false });

    if (eventsError) {
      throw eventsError;
    }

    // Count distinct members
    const activeMemberIds = new Set(
      (recentEvents || []).map(e => e.member_id).filter(Boolean)
    );

    // Debug logging
    console.log('[active-now] Query results:', {
      validMemberIdsCount: validMemberIds.length,
      recentEventsCount: recentEvents?.length || 0,
      activeCount: activeMemberIds.size,
      fiveMinutesAgo: fiveMinutesAgo.toISOString(),
      now: now.toISOString()
    });

    return res.status(200).json({
      count: activeMemberIds.size,
      last_updated: now.toISOString()
    });

  } catch (error) {
    console.error('[active-now] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
