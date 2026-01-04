// /api/admin/top-members.js
// Returns most active members

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    const { limit = 20, period = '30d' } = req.query;
    
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
    } else {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get all events in period
    const { data: events, error } = await supabase
      .from('academy_events')
      .select('member_id, email, event_type')
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
          module_opens: 0
        };
      }
      memberMap[key].event_count++;
      if (event.event_type === 'module_open') {
        memberMap[key].module_opens++;
      }
    });

    // Convert to array
    const members = Object.values(memberMap);

    // Sort by event_count descending
    members.sort((a, b) => b.event_count - a.event_count);

    // Return top N
    return res.status(200).json(members.slice(0, parseInt(limit)));
  } catch (error) {
    console.error('[top-members] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
