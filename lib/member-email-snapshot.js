/**
 * Single source of truth for per-member state used by triggered email stages.
 * Composes existing badge / module libs — do not duplicate gate logic here.
 */

const {
  FOUNDATION_MODULE_PATHS,
  buildOpenedSet,
  computeGateStatsFromRaw,
  evaluateFullBadge,
} = require("./admin-gate-stats");
const { londonTrialDayNumber } = require("./london-trial-days");

function isPaidPlan(plan = {}) {
  if (plan.is_paid) return true;
  const type = plan.plan_type;
  return type === "annual" || type === "monthly";
}

const DAY_MS = 86400000;
const ACTIVITY_TYPES = ["login", "module_open", "exam_attempt", "practice_pack_open"];
const UPGRADE_URL =
  process.env.ACADEMY_UPGRADE_URL || "https://www.alanranger.com/academy/dashboard";
const SITE_BASE = "https://www.alanranger.com";

const BADGE_ORDER = [
  { key: "enrolled", label: "Enrolled" },
  { key: "foundation", label: "Foundation" },
  { key: "practitioner", label: "Practitioner" },
  { key: "certified", label: "Certified" },
  { key: "graduate", label: "Graduate" },
  { key: "master", label: "Master" },
];

function pathToTitle(path) {
  if (!path) return "your next module";
  const slug = String(path).split("/").pop() || path;
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function findNextUnopenedModule(openedSet) {
  for (const path of FOUNDATION_MODULE_PATHS) {
    if (!openedSet.has(path)) {
      return { nextModuleUrl: `${SITE_BASE}${path}`, nextModuleTitle: pathToTitle(path) };
    }
  }
  return { nextModuleUrl: `${SITE_BASE}${FOUNDATION_MODULE_PATHS[0]}`, nextModuleTitle: "What Is Exposure In Photography" };
}

function progressToNextBadge(badgeKey, breakdown) {
  if (!breakdown) return { modulesToNextBadge: 0, examsToNextBadge: 0, percentToNextBadge: 0, nextBadge: "" };
  const idx = BADGE_ORDER.findIndex((b) => b.key === badgeKey);
  const next = BADGE_ORDER[idx + 1] || null;
  if (!next) {
    return { modulesToNextBadge: 0, examsToNextBadge: 0, percentToNextBadge: 100, nextBadge: "" };
  }
  const gate = breakdown[next.key];
  if (!gate) {
    return { modulesToNextBadge: 0, examsToNextBadge: 0, percentToNextBadge: 0, nextBadge: next.label };
  }
  const modulesNeed = Math.max(0, (gate.totalModulesTarget || gate.modulesTarget || 0) - (gate.totalModulesOpened || gate.modulesOpened || 0));
  const examsNeed = Math.max(0, (gate.examsPassedTarget || 0) - (gate.examsPassed || 0));
  const modPct = gate.totalModulesTarget
    ? Math.min(100, Math.round(((gate.totalModulesOpened || 0) / gate.totalModulesTarget) * 100))
    : 0;
  return {
    modulesToNextBadge: modulesNeed,
    examsToNextBadge: examsNeed,
    percentToNextBadge: modPct,
    nextBadge: next.label,
  };
}

function formatActivityBlock(activity) {
  if (!activity) return "";
  const lines = [];
  if (activity.daysSinceLastLogin != null) {
    lines.push(`- **Last logged in** ${activity.daysSinceLastLogin} day(s) ago`);
  }
  if (activity.loginSessions) {
    lines.push(`- You've logged in **${activity.loginSessions}** time(s) during your trial`);
  }
  if (activity.modulesOpened != null) {
    lines.push(`- **${activity.modulesOpened} module(s)** opened`);
  }
  if (!lines.length) return "";
  return `\n**Your Academy activity so far**\n\n${lines.join("\n")}\n`;
}

async function fetchTrialContext(supabase, memberId) {
  const [trialRes, memberRes, convertedRes] = await Promise.all([
    supabase
      .from("academy_trial_history")
      .select("trial_start_at, trial_end_at, converted_at, reengagement_opted_out, reengagement_send_count")
      .eq("member_id", memberId)
      .order("trial_start_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ms_members_cache")
      .select("email, name, raw, created_at, plan_summary")
      .eq("member_id", memberId)
      .maybeSingle(),
    supabase
      .from("academy_trial_history")
      .select("converted_at")
      .eq("member_id", memberId)
      .not("converted_at", "is", null)
      .limit(1),
  ]);
  const trial = trialRes.data;
  const plan = memberRes.data?.plan_summary || {};
  const member = memberRes.data || {};
  const everConverted = !!(convertedRes.data && convertedRes.data.length);
  const trialStartAt = trial?.trial_start_at || plan.trial_start_at || member.created_at || null;
  const trialEndAt = trial?.trial_end_at || plan.expiry_date || null;
  const hasConverted =
    Boolean(trial?.converted_at) || Boolean(plan.converted_at) || everConverted || isPaidPlan(plan);
  const isActiveTrial =
    !hasConverted && trialEndAt && new Date(trialEndAt).getTime() > Date.now();
  return {
    email: member.email || "",
    name: member.name || "",
    raw: member.raw,
    trialStartAt,
    trialEndAt,
    hasConverted,
    isActiveTrial,
    isPaid: isPaidPlan(plan),
    reengagementOptedOut: Boolean(trial?.reengagement_opted_out),
    reengagementSendCount: trial?.reengagement_send_count || 0,
  };
}

async function fetchExamsPassed(supabase, memberId, email) {
  const { data, error } = await supabase
    .from("module_results_ms")
    .select("passed")
    .eq("memberstack_id", memberId);
  if (error) return 0;
  let passed = (data || []).filter((r) => r.passed).length;
  if (passed === 0 && email) {
    const legacy = await supabase.from("module_results_ms").select("passed").eq("email", email);
    if (!legacy.error) passed = (legacy.data || []).filter((r) => r.passed).length;
  }
  return passed;
}

async function fetchLastLoginAt(supabase, memberId) {
  const { data } = await supabase
    .from("academy_events")
    .select("created_at")
    .eq("member_id", memberId)
    .eq("event_type", "login")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at || null;
}

async function countLoginSessions(supabase, memberId, sinceIso) {
  const { data } = await supabase
    .from("academy_events")
    .select("created_at")
    .eq("member_id", memberId)
    .eq("event_type", "login")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(500);
  const events = data || [];
  if (!events.length) return 0;
  const WINDOW_MS = 30 * 60 * 1000;
  let sessions = 0;
  let lastTs = 0;
  events.forEach((ev) => {
    const ts = new Date(ev.created_at).getTime();
    if (!lastTs || ts - lastTs > WINDOW_MS) sessions += 1;
    lastTs = ts;
  });
  return sessions;
}

async function buildMemberEmailSnapshot(supabase, memberId, nowMs = Date.now()) {
  if (!supabase || !memberId) return null;
  const ctx = await fetchTrialContext(supabase, memberId);
  const examsPassed = await fetchExamsPassed(supabase, memberId, ctx.email);
  const openedSet = buildOpenedSet(ctx.raw);
  const stats = computeGateStatsFromRaw(ctx.raw, examsPassed);
  const badge = evaluateFullBadge(stats, 0, false, {
    hasConverted: ctx.hasConverted,
    lastActivityAt: null,
    nowMs,
  });
  const progress = progressToNextBadge(badge.badge_key, badge.breakdown);
  const nextMod = findNextUnopenedModule(openedSet);
  const lastLoginAt = await fetchLastLoginAt(supabase, memberId);
  const daysSinceLastLogin = lastLoginAt
    ? Math.max(0, Math.floor((nowMs - new Date(lastLoginAt).getTime()) / DAY_MS))
    : null;
  const trialDayNumber = ctx.trialStartAt ? londonTrialDayNumber(ctx.trialStartAt, nowMs) : null;
  const trialDaysRemaining =
    ctx.trialEndAt && ctx.isActiveTrial
      ? Math.max(0, Math.ceil((new Date(ctx.trialEndAt).getTime() - nowMs) / DAY_MS))
      : null;
  const sinceTrial = ctx.trialStartAt || new Date(nowMs - 90 * DAY_MS).toISOString();
  const loginSessions = await countLoginSessions(supabase, memberId, sinceTrial);
  const firstName = (ctx.name || "").split(/\s+/)[0] || "there";

  return {
    memberId,
    email: ctx.email,
    firstName,
    fullName: ctx.name || "there",
    currentBadge: badge.badge_key,
    currentBadgeLabel: badge.badge_label,
    modulesOpened: stats.totalModulesOpened,
    modulesToNextBadge: progress.modulesToNextBadge,
    examsToNextBadge: progress.examsToNextBadge,
    percentToNextBadge: progress.percentToNextBadge,
    nextBadge: progress.nextBadge,
    nextModuleTitle: nextMod.nextModuleTitle,
    nextModuleUrl: nextMod.nextModuleUrl,
    trialDayNumber,
    trialDaysRemaining,
    trialStartAt: ctx.trialStartAt,
    trialEndAt: ctx.trialEndAt,
    daysSinceLastLogin,
    lastLoginAt,
    loginSessions,
    upgradeUrl: UPGRADE_URL,
    activityBlock: formatActivityBlock({
      daysSinceLastLogin,
      loginSessions,
      modulesOpened: stats.totalModulesOpened,
    }),
    hasConverted: ctx.hasConverted,
    isActiveTrial: ctx.isActiveTrial,
    isPaid: ctx.isPaid,
    reengagementOptedOut: ctx.reengagementOptedOut,
    reengagementSendCount: ctx.reengagementSendCount,
    openedSetSize: openedSet.size,
  };
}

module.exports = {
  buildMemberEmailSnapshot,
  pathToTitle,
  findNextUnopenedModule,
  progressToNextBadge,
  formatActivityBlock,
};
