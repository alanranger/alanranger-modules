// /api/admin/exams/stats.js
// Returns exam statistics

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

    const { data, error } = await supabase
      .from('module_results_ms')
      .select('score_percent, passed')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    const total_attempts = data?.length || 0;
    const passed = data?.filter(r => r.passed).length || 0;
    const failed = total_attempts - passed;
    const pass_rate = total_attempts > 0 ? Math.round((passed / total_attempts) * 100) : 0;
    const avg_score = data?.length > 0 
      ? Math.round(data.reduce((sum, r) => sum + r.score_percent, 0) / data.length)
      : 0;

    return res.status(200).json({
      total_attempts,
      passed,
      failed,
      pass_rate,
      avg_score
    });
  } catch (error) {
    console.error('[exams-stats] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
