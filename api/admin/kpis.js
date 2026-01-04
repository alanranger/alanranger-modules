// /api/admin/kpis.js
// Returns KPI metrics for admin dashboard overview

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  // Security: Add admin authentication check here
  // For now, this is a placeholder - add proper auth in production
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const now = new Date();
    const day24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const day7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const day30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Active members (distinct member_id with any event)
    // Note: This counts members who have events in Supabase, not total Memberstack members
    const { data: active24hData } = await supabase
      .from('academy_events')
      .select('member_id')
      .not('member_id', 'is', null)
      .gte('created_at', day24h.toISOString());

    const { data: active7dData } = await supabase
      .from('academy_events')
      .select('member_id')
      .not('member_id', 'is', null)
      .gte('created_at', day7d.toISOString());

    const { data: active30dData } = await supabase
      .from('academy_events')
      .select('member_id')
      .not('member_id', 'is', null)
      .gte('created_at', day30d.toISOString());

    const activeMembers24h = new Set(active24hData?.map(e => e.member_id) || []).size;
    const activeMembers7d = new Set(active7dData?.map(e => e.member_id) || []).size;
    const activeMembers30d = new Set(active30dData?.map(e => e.member_id) || []).size;

    // Module opens
    const { count: moduleOpens24h } = await supabase
      .from('academy_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'module_open')
      .gte('created_at', day24h.toISOString());

    const { count: moduleOpens7d } = await supabase
      .from('academy_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'module_open')
      .gte('created_at', day7d.toISOString());

    const { count: moduleOpens30d } = await supabase
      .from('academy_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'module_open')
      .gte('created_at', day30d.toISOString());

    // Unique modules opened (distinct member_id + path)
    const { data: uniqueModulesData } = await supabase
      .from('academy_events')
      .select('member_id, path')
      .eq('event_type', 'module_open')
      .not('member_id', 'is', null)
      .not('path', 'is', null)
      .gte('created_at', day30d.toISOString());

    const uniqueModules30d = new Set(
      (uniqueModulesData || []).map(e => `${e.member_id}:${e.path}`)
    ).size;

    // Bookmarks added
    const { count: bookmarks30d } = await supabase
      .from('academy_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'bookmark_add')
      .gte('created_at', day30d.toISOString());

    // Exam attempts (from module_results_ms)
    const { count: examAttempts30d } = await supabase
      .from('module_results_ms')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', day30d.toISOString());

    // Pass rate (from module_results_ms)
    const { data: examResults } = await supabase
      .from('module_results_ms')
      .select('passed')
      .gte('created_at', day30d.toISOString());

    const totalExams = examResults?.length || 0;
    const passedExams = examResults?.filter(r => r.passed).length || 0;
    const passRate30d = totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0;

    return res.status(200).json({
      activeMembers24h,
      activeMembers7d,
      activeMembers30d,
      moduleOpens24h: moduleOpens24h || 0,
      moduleOpens7d: moduleOpens7d || 0,
      moduleOpens30d: moduleOpens30d || 0,
      uniqueModules30d,
      bookmarks30d: bookmarks30d || 0,
      examAttempts30d: examAttempts30d || 0,
      passRate30d
    });
  } catch (error) {
    console.error('[kpis] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
