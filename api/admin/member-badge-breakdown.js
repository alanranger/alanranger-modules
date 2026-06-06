// /api/admin/member-badge-breakdown.js
// Admin-only per-member badge gate breakdown (engagement-summary window=all + badge gates).

const { createClient } = require("@supabase/supabase-js");
const { checkAdminAccess } = require("./_auth");
const {
  computeGateStatsFromRaw,
  mergeEngagementIntoStats,
  evaluateFullBadge,
} = require("../../lib/admin-gate-stats");

const ACTIVITY_TYPES = ["login", "member_login", "module_open", "exam_start", "exam_submit"];
const LOGIN_TYPES = new Set(["login", "member_login"]);
const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPaidPlan(plan = {}) {
  if (plan.is_paid) return true;
  const type = plan.plan_type;
  return type === "annual" || type === "monthly";
}

async function fetchTrialWindow(supabase, memberId) {
  const [trialRes, memberRes, convertedRes] = await Promise.all([
    supabase
      .from("academy_trial_history")
      .select("trial_start_at, trial_end_at, converted_at, trial_length_days")
      .eq("member_id", memberId)
      .order("trial_start_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ms_members_cache")
      .select("created_at, plan_summary, raw")
      .eq("member_id", memberId)
      .maybeSingle(),
    supabase
      .from("academy_trial_history")
      .select("converted_at")
      .eq("member_id", memberId)
      .not("converted_at", "is", null)
      .limit(1),
  ]);

  if (trialRes.error) throw trialRes.error;
  if (memberRes.error) throw memberRes.error;
  if (convertedRes.error) throw convertedRes.error;

  const plan = memberRes.data?.plan_summary || {};
  const trial = trialRes.data;
  const everConverted = !!(convertedRes.data && convertedRes.data.length);

  let trialStartAt;
  let trialEndAt;
  if (trial?.trial_start_at) {
    trialStartAt = trial.trial_start_at;
    trialEndAt = trial.trial_end_at || null;
  } else {
    trialStartAt = plan.trial_start_at || memberRes.data?.created_at || null;
    trialEndAt = plan.expiry_date || null;
  }

  const hasConverted =
    Boolean(trial?.converted_at) || Boolean(plan.converted_at) || everConverted || isPaidPlan(plan);

  return {
    raw: memberRes.data?.raw || null,
    trialStartAt,
    trialEndAt,
    hasConverted,
  };
}

async function fetchAllExamsPassed(supabase, memberId, email) {
  const { data, error } = await supabase
    .from("module_results_ms")
    .select("passed")
    .eq("memberstack_id", memberId);
  if (error) throw error;
  let passed = (data || []).filter((row) => row.passed).length;
  if (passed === 0 && email) {
    const legacy = await supabase
      .from("module_results_ms")
      .select("passed")
      .eq("email", email);
    if (!legacy.error) {
      passed = (legacy.data || []).filter((row) => row.passed).length;
    }
  }
  return passed;
}

async function fetchLongevityFields(supabase, memberId) {
  const { countBreadthFromMemberJson, countDistinctActiveMonths } = require("../../lib/academy-longevity-stats");
  const pageSize = 1000;
  let from = 0;
  const events = [];
  while (true) {
    const { data, error } = await supabase
      .from("academy_events")
      .select("event_type, created_at")
      .eq("member_id", memberId)
      .in("event_type", ACTIVITY_TYPES)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    events.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const { data: memberRow } = await supabase
    .from("ms_members_cache")
    .select("raw")
    .eq("member_id", memberId)
    .maybeSingle();
  const rawJson = memberRow?.raw?.json || {};
  const breadth = countBreadthFromMemberJson(rawJson);
  return {
    distinctActiveMonthsAllTime: countDistinctActiveMonths(events),
    appliedLearningOpened: breadth.appliedLearningOpened,
    practicePacksOpened: breadth.practicePacksOpened,
    pdfAssignmentsOpened: breadth.pdfAssignmentsOpened,
    lastActivityAt: events.length ? events[events.length - 1].created_at : null,
  };
}

async function fetchFirst14ActiveDays(supabase, memberId, trialStartAt) {
  const start = parseDate(trialStartAt);
  if (!start) return { activeDays: 0, engagementDegraded: true };

  const windowEnd = new Date(start.getTime() + WINDOW_DAYS * DAY_MS);
  const { data, error } = await supabase
    .from("academy_events")
    .select("event_type, created_at")
    .eq("member_id", memberId)
    .in("event_type", ACTIVITY_TYPES)
    .gte("created_at", start.toISOString())
    .lt("created_at", windowEnd.toISOString());
  if (error) throw error;

  const days = new Set();
  (data || []).forEach((row) => {
    if (row.created_at) days.add(row.created_at.slice(0, 10));
  });
  return { activeDays: days.size, engagementDegraded: false };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { isAdmin, error: authError } = await checkAdminAccess(req);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required", details: authError });
    }

    const memberId = req.query.memberId;
    if (!memberId) {
      return res.status(400).json({ error: "memberId query parameter required" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const trialCtx = await fetchTrialWindow(supabase, memberId);
    const emailRow = await supabase
      .from("ms_members_cache")
      .select("email")
      .eq("member_id", memberId)
      .maybeSingle();
    const email = emailRow.data?.email || null;

    const [examsPassed, longevity, activeWindow] = await Promise.all([
      fetchAllExamsPassed(supabase, memberId, email),
      fetchLongevityFields(supabase, memberId),
      fetchFirst14ActiveDays(supabase, memberId, trialCtx.trialStartAt),
    ]);

    const baseStats = computeGateStatsFromRaw(trialCtx.raw, examsPassed);
    const stats = mergeEngagementIntoStats(baseStats, longevity);
    const gateContext = {
      hasConverted: trialCtx.hasConverted,
      lastActivityAt: longevity.lastActivityAt,
      nowMs: Date.now(),
    };

    const evaluation = evaluateFullBadge(
      stats,
      activeWindow.activeDays,
      activeWindow.engagementDegraded,
      gateContext
    );

    return res.status(200).json({
      memberId,
      badge: {
        key: evaluation.badge_key,
        label: evaluation.badge_label,
        paused: evaluation.badge_paused,
        isMaster: evaluation.badge_is_master,
        stars: evaluation.badge_stars,
      },
      engagement: {
        distinctActiveDaysFirst14d: activeWindow.activeDays,
        hasConverted: trialCtx.hasConverted,
        lastActivityAt: longevity.lastActivityAt,
        ...longevity,
      },
      gateStats: stats,
      breakdown: evaluation.breakdown,
      longevityPoints: evaluation.longevityPoints,
      longevityDegraded: evaluation.longevityDegraded,
      source: "engagement_summary_all_plus_badge_gates",
    });
  } catch (error) {
    console.error("[member-badge-breakdown] Error:", error);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
};
