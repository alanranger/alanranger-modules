// /api/admin/overview.js
// Returns aggregated KPIs for admin dashboard overview
// Combines data from ms_members_cache, academy_events, and exam tables

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

    const now = new Date();
    const periods = {
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    };

    // 1. Total members (all-time from cache)
    const { count: totalMembers } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true });

    // 2. Plan breakdowns
    const { data: allMembers } = await supabase
      .from('ms_members_cache')
      .select('plan_summary, created_at');

    let trials = 0;
    let paid = 0;
    let annual = 0;
    let monthly = 0;
    let canceled = 0;

    if (allMembers) {
      allMembers.forEach(m => {
        const plan = m.plan_summary || {};
        if (plan.is_trial) trials++;
        if (plan.is_paid) paid++;
        if (plan.plan_type === 'annual') annual++;
        if (plan.plan_type === 'monthly') monthly++;
        if (plan.status === 'canceled' || plan.status === 'cancelled') canceled++;
      });
    }

    // 3. New signups (from cache created_at)
    const { count: signups24h } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods['24h'].toISOString());

    const { count: signups7d } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods['7d'].toISOString());

    const { count: signups30d } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods['30d'].toISOString());

    // 4. Active members (based on last activity in academy_events)
    const { data: active24h } = await supabase
      .from('academy_events')
      .select('member_id')
      .gte('created_at', periods['24h'].toISOString())
      .not('member_id', 'is', null);

    const { data: active7d } = await supabase
      .from('academy_events')
      .select('member_id')
      .gte('created_at', periods['7d'].toISOString())
      .not('member_id', 'is', null);

    const { data: active30d } = await supabase
      .from('academy_events')
      .select('member_id')
      .gte('created_at', periods['30d'].toISOString())
      .not('member_id', 'is', null);

    const activeMembers24h = new Set(active24h?.map(e => e.member_id) || []).size;
    const activeMembers7d = new Set(active7d?.map(e => e.member_id) || []).size;
    const activeMembers30d = new Set(active30d?.map(e => e.member_id) || []).size;

    // 5. Engagement metrics (30d)
    const { data: moduleOpens30d } = await supabase
      .from('academy_events')
      .select('member_id')
      .eq('event_type', 'module_open')
      .gte('created_at', periods['30d'].toISOString());

    const uniqueModulesOpened = new Set(moduleOpens30d?.map(e => e.member_id) || []).size;
    const totalModuleOpens = moduleOpens30d?.length || 0;
    const avgModulesOpened = uniqueModulesOpened > 0 ? (totalModuleOpens / uniqueModulesOpened).toFixed(1) : 0;

    // 6. Exam metrics (30d)
    const { data: examAttempts } = await supabase
      .from('exam_member_links')
      .select('member_id, passed')
      .gte('created_at', periods['30d'].toISOString());

    const examAttempts30d = examAttempts?.length || 0;
    const examPassed30d = examAttempts?.filter(e => e.passed).length || 0;
    const passRate30d = examAttempts30d > 0 ? Math.round((examPassed30d / examAttempts30d) * 100) : 0;
    const avgExamAttempts = uniqueModulesOpened > 0 ? (examAttempts30d / uniqueModulesOpened).toFixed(1) : 0;

    // 7. Bookmarks (30d)
    const { count: bookmarks30d } = await supabase
      .from('academy_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'bookmark_add')
      .gte('created_at', periods['30d'].toISOString());

    return res.status(200).json({
      // Member counts
      totalMembers: totalMembers || 0,
      trials: trials,
      paid: paid,
      annual: annual,
      monthly: monthly,
      canceled: canceled,
      
      // Signups
      signups24h: signups24h || 0,
      signups7d: signups7d || 0,
      signups30d: signups30d || 0,
      
      // Active members
      activeMembers24h: activeMembers24h,
      activeMembers7d: activeMembers7d,
      activeMembers30d: activeMembers30d,
      
      // Engagement (30d)
      uniqueModulesOpened30d: uniqueModulesOpened,
      totalModuleOpens30d: totalModuleOpens,
      avgModulesOpened30d: parseFloat(avgModulesOpened),
      examAttempts30d: examAttempts30d,
      examPassed30d: examPassed30d,
      passRate30d: passRate30d,
      avgExamAttempts30d: parseFloat(avgExamAttempts),
      bookmarks30d: bookmarks30d || 0
    });

  } catch (error) {
    console.error('[overview] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
