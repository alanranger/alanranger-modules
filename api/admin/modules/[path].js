// /api/admin/modules/detail.js
// Returns detailed analytics for a specific module path
// Usage: /api/admin/modules/detail?path=/blog-on-photography/...&period=30d

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    const { path, period = '30d' } = req.query;
    
    if (!path) {
      return res.status(400).json({ error: 'path parameter is required' });
    }

    const decodedPath = decodeURIComponent(path);
    
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

    // Get all opens for this module
    const { data: events, error } = await supabase
      .from('academy_events')
      .select('member_id, email, title, created_at')
      .eq('event_type', 'module_open')
      .eq('path', decodedPath)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Aggregate by user
    const userMap = {};
    events.forEach(event => {
      const key = event.member_id;
      if (!key) return;
      
      if (!userMap[key]) {
        userMap[key] = {
          member_id: key,
          email: event.email || null,
          opens: 0,
          last_at: null
        };
      }
      userMap[key].opens++;
      const eventDate = new Date(event.created_at);
      if (!userMap[key].last_at || eventDate > new Date(userMap[key].last_at)) {
        userMap[key].last_at = event.created_at;
      }
    });

    const users = Object.values(userMap).sort((a, b) => 
      new Date(b.last_at) - new Date(a.last_at)
    );

    return res.status(200).json({
      path: decodedPath,
      title: events[0]?.title || null,
      users
    });
  } catch (error) {
    console.error('[modules-path] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
