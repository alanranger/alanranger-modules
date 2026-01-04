// /api/admin/top-modules.js
// Returns top modules by opens

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

    // Get all module_open events in period
    const { data: events, error } = await supabase
      .from('academy_events')
      .select('path, title, member_id')
      .eq('event_type', 'module_open')
      .not('path', 'is', null)
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Aggregate by path
    const moduleMap = {};
    events.forEach(event => {
      const key = event.path;
      if (!moduleMap[key]) {
        moduleMap[key] = {
          path: key,
          title: event.title || key,
          opens: 0,
          unique_openers: new Set()
        };
      }
      moduleMap[key].opens++;
      if (event.member_id) {
        moduleMap[key].unique_openers.add(event.member_id);
      }
    });

    // Convert to array and calculate unique openers
    const modules = Object.values(moduleMap).map(m => ({
      ...m,
      unique_openers: m.unique_openers.size
    }));

    // Sort by opens descending
    modules.sort((a, b) => b.opens - a.opens);

    // Return top N
    return res.status(200).json(modules.slice(0, parseInt(limit)));
  } catch (error) {
    console.error('[top-modules] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
