// /api/admin/members.js
// Returns member analytics aggregated by member_id

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
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

    // Get all events in period
    const { data: events, error } = await supabase
      .from('academy_events')
      .select('member_id, email, event_type, path, created_at')
      .not('member_id', 'is', null)
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Aggregate by member
    const memberMap = {};
    events.forEach(event => {
      const key = event.member_id;
      if (!memberMap[key]) {
        memberMap[key] = {
          member_id: key,
          email: event.email || null,
          event_count: 0,
          module_opens: 0,
          unique_modules_opened: new Set(),
          last_seen_at: null
        };
      }
      memberMap[key].event_count++;
      if (event.event_type === 'module_open') {
        memberMap[key].module_opens++;
        if (event.path) {
          memberMap[key].unique_modules_opened.add(event.path);
        }
      }
      const eventDate = new Date(event.created_at);
      if (!memberMap[key].last_seen_at || eventDate > new Date(memberMap[key].last_seen_at)) {
        memberMap[key].last_seen_at = event.created_at;
      }
    });

    // Convert to array
    const members = Object.values(memberMap).map(m => ({
      ...m,
      unique_modules_opened: m.unique_modules_opened.size
    }));

    // Sort by event_count descending
    members.sort((a, b) => b.event_count - a.event_count);

    return res.status(200).json(members);
  } catch (error) {
    console.error('[members] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
