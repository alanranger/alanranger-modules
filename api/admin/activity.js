// /api/admin/activity.js
// Returns activity stream events with filters

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    const { period = '30d', event_type, category, member_id, path, limit = 1000 } = req.query;
    
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

    let query = supabase
      .from('academy_events')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (event_type) {
      query = query.eq('event_type', event_type);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (member_id) {
      query = query.eq('member_id', member_id);
    }

    if (path) {
      query = query.ilike('path', `%${path}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[activity] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
