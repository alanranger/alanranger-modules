// /api/admin/members/detail.js
// Returns detailed analytics for a specific member
// Usage: /api/admin/members/detail?memberId=ms_...&period=30d

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    const { memberId, period = '30d' } = req.query;
    
    if (!memberId) {
      return res.status(400).json({ error: 'memberId parameter is required' });
    }

    const decodedMemberId = decodeURIComponent(memberId);
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const now = new Date();
    let startDate;
    if (period === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get recent events
    const { data: recentEvents, error: eventsError } = await supabase
      .from('academy_events')
      .select('id, event_type, title, path, created_at')
      .eq('member_id', decodedMemberId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (eventsError) throw eventsError;

    // Get module opens
    const { data: moduleEvents } = await supabase
      .from('academy_events')
      .select('path, title, created_at')
      .eq('member_id', decodedMemberId)
      .eq('event_type', 'module_open')
      .not('path', 'is', null)
      .gte('created_at', startDate.toISOString());

    // Aggregate modules
    const moduleMap = {};
    moduleEvents.forEach(event => {
      const key = event.path;
      if (!moduleMap[key]) {
        moduleMap[key] = {
          path: key,
          title: event.title || key,
          opens: 0,
          last_at: null
        };
      }
      moduleMap[key].opens++;
      const eventDate = new Date(event.created_at);
      if (!moduleMap[key].last_at || eventDate > new Date(moduleMap[key].last_at)) {
        moduleMap[key].last_at = event.created_at;
      }
    });

    const modulesOpened = Object.values(moduleMap).sort((a, b) => 
      new Date(b.last_at) - new Date(a.last_at)
    );

    // Get exam results
    const { data: exams, error: examsError } = await supabase
      .from('module_results_ms')
      .select('id, module_id, score_percent, passed, attempt, created_at')
      .eq('memberstack_id', decodedMemberId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (examsError) throw examsError;

    // Get email from first event or exam
    const email = recentEvents[0]?.email || exams[0]?.email || null;

    return res.status(200).json({
      member_id: decodedMemberId,
      email,
      recent_events: recentEvents || [],
      modules_opened: modulesOpened,
      exams: exams || []
    });
  } catch (error) {
    console.error('[members-memberId] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
