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

    // Get all events in period with created_at for login tracking
    const { data: events, error } = await supabase
      .from('academy_events')
      .select('member_id, email, event_type, created_at')
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
          login_dates: new Set(), // Track distinct dates
          last_login: null // Track most recent event date
        };
      }
      memberMap[key].event_count++;
      if (event.event_type === 'module_open') {
        memberMap[key].module_opens++;
      }
      
      // Track login dates (distinct days with activity)
      if (event.created_at) {
        const eventDate = new Date(event.created_at);
        const dateOnly = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
        memberMap[key].login_dates.add(dateOnly);
        
        // Update last login if this event is more recent
        if (!memberMap[key].last_login || new Date(event.created_at) > new Date(memberMap[key].last_login)) {
          memberMap[key].last_login = event.created_at;
        }
      }
    });
    
    // Convert Sets to counts and format dates
    Object.keys(memberMap).forEach(key => {
      memberMap[key].login_days = memberMap[key].login_dates.size;
      delete memberMap[key].login_dates; // Remove Set, keep count
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
