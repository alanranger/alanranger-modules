// /api/admin/modules.js
// Returns module analytics aggregated by path

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    const { period = '30d', category } = req.query;
    
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
      .select('path, title, category, member_id, created_at')
      .eq('event_type', 'module_open')
      .not('path', 'is', null)
      .gte('created_at', startDate.toISOString());

    if (category) {
      query = query.eq('category', category);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    // Aggregate by path
    const moduleMap = {};
    events.forEach(event => {
      const key = event.path;
      if (!moduleMap[key]) {
        moduleMap[key] = {
          path: key,
          title: event.title || null,
          category: event.category || null,
          opens: 0,
          unique_openers: new Set(),
          last_opened_at: null
        };
      }
      moduleMap[key].opens++;
      if (event.member_id) {
        moduleMap[key].unique_openers.add(event.member_id);
      }
      const eventDate = new Date(event.created_at);
      if (!moduleMap[key].last_opened_at || eventDate > new Date(moduleMap[key].last_opened_at)) {
        moduleMap[key].last_opened_at = event.created_at;
      }
    });

    // Convert to array
    const modules = Object.values(moduleMap).map(m => ({
      ...m,
      unique_openers: m.unique_openers.size
    }));

    // Sort by opens descending
    modules.sort((a, b) => b.opens - a.opens);

    return res.status(200).json(modules);
  } catch (error) {
    console.error('[modules] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
