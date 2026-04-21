// /api/admin/engagement.js
// Returns aggregated engagement metrics for the Academy admin engagement tab.
// Sourced from academy_events, module_results_ms and ms_members_cache.

const { createClient } = require("@supabase/supabase-js");

const SESSION_GAP_SECONDS = 1800; // 30 minutes

const DAY_MS = 86_400_000;

function parsePeriod(period) {
  const now = new Date();
  if (period === '7d') return new Date(now.getTime() - 7 * DAY_MS);
  if (period === '30d') return new Date(now.getTime() - 30 * DAY_MS);
  if (period === '90d') return new Date(now.getTime() - 90 * DAY_MS);
  return null; // all-time
}

async function fetchEvents(supabase, since) {
  let query = supabase
    .from('academy_events')
    .select('event_type, member_id, path, category, title, created_at')
    .in('event_type', ['login', 'module_open'])
    .order('created_at', { ascending: true });
  if (since) query = query.gte('created_at', since.toISOString());

  const pageSize = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function initMemberAgg() {
  return {
    logins: 0,
    module_opens: 0,
    unique_paths: new Set(),
    unique_days: new Set(),
    sessions: 0,
    last_login_ts: null,
    first_login_ts: null,
    last_seen_ts: null,
  };
}

function getOrCreate(map, key, factory) {
  let v = map.get(key);
  if (!v) { v = factory(); map.set(key, v); }
  return v;
}

function handleLoginRow(row, agg, weekAgg, createdMs) {
  agg.logins++;
  agg.unique_days.add(row.created_at.slice(0, 10));
  if (agg.first_login_ts == null) agg.first_login_ts = createdMs;
  const gapSec = agg.last_login_ts == null ? Infinity : (createdMs - agg.last_login_ts) / 1000;
  if (gapSec > SESSION_GAP_SECONDS) { agg.sessions++; weekAgg.sessions++; }
  agg.last_login_ts = createdMs;
  weekAgg.logins++;
  weekAgg.active_members.add(row.member_id);
}

function handleModuleOpenRow(row, agg, weekAgg, categories, pathCounts) {
  agg.module_opens++;
  if (row.path) agg.unique_paths.add(row.path);
  weekAgg.module_opens++;
  if (row.category) categories.set(row.category, (categories.get(row.category) || 0) + 1);
  if (!row.path) return;
  const existing = getOrCreate(pathCounts, row.path, () => ({ path: row.path, title: row.title || '', opens: 0, members: new Set() }));
  existing.opens++;
  existing.members.add(row.member_id);
  if (!existing.title && row.title) existing.title = row.title;
}

function newWeekAgg(weekKey) {
  return { week: weekKey, logins: 0, sessions: 0, module_opens: 0, active_members: new Set() };
}

function aggregateEvents(rows) {
  const perMember = new Map();
  const categories = new Map();
  const pathCounts = new Map();
  const weekly = new Map();

  rows.forEach(row => {
    if (!row.member_id) return;
    const agg = getOrCreate(perMember, row.member_id, initMemberAgg);
    const createdMs = new Date(row.created_at).getTime();
    if (agg.last_seen_ts == null || createdMs > agg.last_seen_ts) agg.last_seen_ts = createdMs;

    const weekAgg = getOrCreate(weekly, weekStart(row.created_at), () => newWeekAgg(weekStart(row.created_at)));
    if (row.event_type === 'login') handleLoginRow(row, agg, weekAgg, createdMs);
    else handleModuleOpenRow(row, agg, weekAgg, categories, pathCounts);
  });

  return { perMember, categories, pathCounts, weekly };
}

function weekStart(isoDate) {
  const d = new Date(isoDate);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // week starts Monday
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function computeMemberDistribution(perMember) {
  const dist = { none: 0, light: 0, medium: 0, heavy: 0, super: 0 };
  const activeDaysDist = { one: 0, two_to_five: 0, more_than_five: 0 };
  let totalSessions = 0;
  let totalActiveDays = 0;
  perMember.forEach(m => {
    const modules = m.unique_paths.size;
    if (modules === 0) dist.none++;
    else if (modules <= 5) dist.light++;
    else if (modules <= 20) dist.medium++;
    else if (modules <= 50) dist.heavy++;
    else dist.super++;

    const days = m.unique_days.size;
    if (days === 1) activeDaysDist.one++;
    else if (days >= 2 && days <= 5) activeDaysDist.two_to_five++;
    else if (days > 5) activeDaysDist.more_than_five++;

    totalSessions += m.sessions;
    totalActiveDays += days;
  });
  const count = perMember.size || 1;
  return {
    distribution: dist,
    activeDaysDist,
    avgSessionsPerMember: Math.round((totalSessions / count) * 10) / 10,
    avgActiveDaysPerMember: Math.round((totalActiveDays / count) * 10) / 10,
    totalSessions,
  };
}

function buildTopMembers(perMember, memberMeta) {
  const arr = [];
  perMember.forEach((m, id) => {
    const meta = memberMeta.get(id) || {};
    arr.push({
      member_id: id,
      email: meta.email || null,
      name: meta.name || null,
      plan_name: meta.plan_name || null,
      logins: m.logins,
      sessions: m.sessions,
      active_days: m.unique_days.size,
      modules_opened: m.unique_paths.size,
      total_opens: m.module_opens,
      last_seen: m.last_seen_ts ? new Date(m.last_seen_ts).toISOString() : null,
    });
  });
  arr.sort((a, b) => b.modules_opened - a.modules_opened || b.sessions - a.sessions);
  return arr.slice(0, 25);
}

async function fetchMemberMeta(supabase) {
  const meta = new Map();
  const pageSize = 500;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ms_members_cache')
      .select('member_id, email, name, plan_summary, raw, updated_at')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(row => {
      const plan = row.plan_summary || {};
      const arAcademy = row?.raw?.json?.arAcademy || {};
      const applied = arAcademy?.appliedLearning?.opened || {};
      const rps = arAcademy?.rps?.opened || {};
      meta.set(row.member_id, {
        email: row.email,
        name: row.name,
        plan_name: plan.plan_name || null,
        is_trial: !!plan.is_trial,
        is_paid: !!plan.is_paid,
        applied_count: Object.keys(applied).length,
        rps_count: Object.keys(rps).length,
        modules_json_count: Object.keys(arAcademy?.modules?.opened || {}).length,
        updated_at: row.updated_at,
      });
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return meta;
}

async function fetchExamStats(supabase) {
  const { data, error } = await supabase
    .from('module_results_ms')
    .select('module_id, memberstack_id, passed, score_percent');
  if (error) throw error;
  const byModule = new Map();
  const byMember = new Map();
  let totalAttempts = 0;
  let totalPassed = 0;
  let totalScore = 0;
  (data || []).forEach(row => {
    totalAttempts++;
    if (row.passed) totalPassed++;
    if (row.score_percent != null) totalScore += row.score_percent;
    const m = byModule.get(row.module_id) || { module_id: row.module_id, attempts: 0, passed: 0, members: new Set(), score_sum: 0, score_count: 0 };
    m.attempts++;
    if (row.passed) m.passed++;
    if (row.memberstack_id) m.members.add(row.memberstack_id);
    if (row.score_percent != null) { m.score_sum += row.score_percent; m.score_count++; }
    byModule.set(row.module_id, m);
    if (row.memberstack_id) byMember.set(row.memberstack_id, (byMember.get(row.memberstack_id) || 0) + 1);
  });
  const topModules = Array.from(byModule.values())
    .map(m => ({
      module_id: m.module_id,
      attempts: m.attempts,
      passed: m.passed,
      unique_members: m.members.size,
      avg_score: m.score_count ? Math.round((m.score_sum / m.score_count) * 10) / 10 : null,
    }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 15);
  return {
    totalAttempts,
    totalPassed,
    uniqueMembers: byMember.size,
    avgScore: totalAttempts ? Math.round((totalScore / totalAttempts) * 10) / 10 : null,
    topModules,
  };
}

function summariseTracking(memberMeta) {
  let withModulesJson = 0;
  let withApplied = 0;
  let withRps = 0;
  memberMeta.forEach(meta => {
    if (meta.modules_json_count > 0) withModulesJson++;
    if (meta.applied_count > 0) withApplied++;
    if (meta.rps_count > 0) withRps++;
  });
  return {
    total_members: memberMeta.size,
    with_modules_json: withModulesJson,
    with_applied_tiles: withApplied,
    with_rps_tiles: withRps,
  };
}

// ---------------------------------------------------------------------------
// Rolling 12-week trend series for the sparkline row at the top of the tab.
// Intentionally independent of the period filter so admins always see the
// rolling trend regardless of which "window" they are drilling into below.
// ---------------------------------------------------------------------------

const SPARKLINE_WEEKS = 12;

function buildWeekKeys(weeks) {
  // Anchor to the Monday of the MOST RECENTLY COMPLETED week. Using the
  // current (in-progress) week as the last bucket makes every sparkline
  // dive toward zero on the right edge because the bucket is partial,
  // which fakes a catastrophic downtrend across all metrics.
  const keys = [];
  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);
  const day = anchor.getUTCDay();
  const diffToThisMonday = (day + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - diffToThisMonday - 7);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(anchor.getUTCDate() - i * 7);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function bucketCountByWeek(rows, isoField) {
  const counts = new Map();
  (rows || []).forEach(row => {
    const value = row?.[isoField];
    if (!value) return;
    const key = weekStart(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

async function fetchTrialsSince(supabase, sinceIso) {
  const { data, error } = await supabase
    .from('academy_trial_history')
    .select('trial_start_at, converted_at')
    .or(`trial_start_at.gte.${sinceIso},converted_at.gte.${sinceIso}`);
  if (error) throw error;
  return data || [];
}

async function fetchExamAttemptsSince(supabase, sinceIso) {
  const { data, error } = await supabase
    .from('module_results_ms')
    .select('created_at')
    .gte('created_at', sinceIso);
  if (error) throw error;
  return data || [];
}

function buildEventWeeklyBuckets(rows) {
  const logins = new Map();
  const opens = new Map();
  const active = new Map();
  (rows || []).forEach(row => {
    if (!row.created_at || !row.member_id) return;
    const key = weekStart(row.created_at);
    if (row.event_type === 'login') logins.set(key, (logins.get(key) || 0) + 1);
    else if (row.event_type === 'module_open') opens.set(key, (opens.get(key) || 0) + 1);
    const members = active.get(key) || new Set();
    members.add(row.member_id);
    active.set(key, members);
  });
  return { logins, opens, active };
}

function mapWeeklyValues(weekKeys, map, transform) {
  return weekKeys.map(k => {
    const v = map.get(k);
    if (v == null) return 0;
    return transform ? transform(v) : v;
  });
}

async function buildWeeklySeries(supabase) {
  const weekKeys = buildWeekKeys(SPARKLINE_WEEKS);
  const since = new Date(`${weekKeys[0]}T00:00:00Z`);
  const sinceIso = since.toISOString();

  const [events, trials, exams] = await Promise.all([
    fetchEvents(supabase, since),
    fetchTrialsSince(supabase, sinceIso),
    fetchExamAttemptsSince(supabase, sinceIso),
  ]);

  const trialSignups = bucketCountByWeek(trials, 'trial_start_at');
  const conversions = bucketCountByWeek(trials, 'converted_at');
  const examCounts = bucketCountByWeek(exams, 'created_at');
  const eventBuckets = buildEventWeeklyBuckets(events);

  return {
    weeks: weekKeys,
    trial_signups:   mapWeeklyValues(weekKeys, trialSignups),
    conversions:     mapWeeklyValues(weekKeys, conversions),
    module_opens:    mapWeeklyValues(weekKeys, eventBuckets.opens),
    exam_attempts:   mapWeeklyValues(weekKeys, examCounts),
    logins:          mapWeeklyValues(weekKeys, eventBuckets.logins),
    active_members:  mapWeeklyValues(weekKeys, eventBuckets.active, set => set.size),
  };
}

async function handleEngagement(req, res) {
  try {
    const period = req.query?.period || 'all';
    const since = parsePeriod(period);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const [rows, memberMeta, examStats, weeklySeries] = await Promise.all([
      fetchEvents(supabase, since),
      fetchMemberMeta(supabase),
      fetchExamStats(supabase),
      buildWeeklySeries(supabase),
    ]);

    const agg = aggregateEvents(rows);
    const memberStats = computeMemberDistribution(agg.perMember);
    const topMembers = buildTopMembers(agg.perMember, memberMeta);

    const categories = Array.from(agg.categories.entries())
      .map(([category, opens]) => ({ category, opens }))
      .sort((a, b) => b.opens - a.opens);

    const topPaths = Array.from(agg.pathCounts.values())
      .map(p => ({ path: p.path, title: p.title, opens: p.opens, unique_members: p.members.size }))
      .sort((a, b) => b.opens - a.opens)
      .slice(0, 15);

    const weekly = Array.from(agg.weekly.values())
      .map(w => ({ week: w.week, logins: w.logins, sessions: w.sessions, module_opens: w.module_opens, active_members: w.active_members.size }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const totals = {
      total_members_in_cache: memberMeta.size,
      members_with_events: agg.perMember.size,
      total_logins: rows.filter(r => r.event_type === 'login').length,
      total_sessions: memberStats.totalSessions,
      total_module_opens: rows.filter(r => r.event_type === 'module_open').length,
      unique_modules_opened: topPaths.length > 0 ? new Set(rows.filter(r => r.event_type === 'module_open' && r.path).map(r => r.path)).size : 0,
      avg_sessions_per_member: memberStats.avgSessionsPerMember,
      avg_active_days_per_member: memberStats.avgActiveDaysPerMember,
    };

    return res.status(200).json({
      period,
      since: since ? since.toISOString() : null,
      totals,
      member_engagement: memberStats,
      categories,
      top_paths: topPaths,
      top_members: topMembers,
      weekly,
      weekly_series: weeklySeries,
      exams: examStats,
      tracking: summariseTracking(memberMeta),
    });
  } catch (error) {
    console.error('[engagement] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = handleEngagement;
