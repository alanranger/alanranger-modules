// /api/academy/engagement-summary.js
// Read-only first-14-day engagement summary for dashboard badge gate + proximity messaging.

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");
const {
  setCorsHeaders,
  handlePreflight,
  getMemberstackToken,
  getMemberstackMemberId,
} = require("../exams/_cors");
const { isFoundationPath } = require("../../lib/foundation-module-paths");

const WINDOW_DAYS = 14;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;
const ALLOWED_ORIGINS = ["https://www.alanranger.com", "https://alanranger.com"];
const ACTIVITY_TYPES = ["login", "member_login", "module_open", "exam_start", "exam_submit"];
const LOGIN_TYPES = new Set(["login", "member_login"]);

const cache = new Map();

function checkOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const originOk = ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + "/"));
  const refererOk = ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  return originOk || refererOk;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getCached(memberId) {
  const row = cache.get(memberId);
  if (!row || Date.now() - row.at > CACHE_TTL_MS) return null;
  return row.payload;
}

function setCached(memberId, payload) {
  cache.set(memberId, { at: Date.now(), payload });
}

async function resolveMemberId(req) {
  let memberstack = null;
  if (process.env.MEMBERSTACK_SECRET_KEY) {
    try {
      memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    } catch (e) {
      console.warn("[engagement-summary] Memberstack init failed:", e.message);
    }
  }

  const token = getMemberstackToken(req);
  if (token && memberstack) {
    try {
      const { id } = await memberstack.verifyToken({ token });
      return id;
    } catch (e) {
      console.warn("[engagement-summary] Token verify failed:", e.message);
    }
  }

  return getMemberstackMemberId(req);
}

function deriveTrialStatus(trialEndAt, convertedAt) {
  const hasConverted = Boolean(convertedAt);
  if (hasConverted) return { isTrial: false, daysLeftInTrial: null, hasConverted: true };

  const end = parseDate(trialEndAt);
  if (!end) return { isTrial: false, daysLeftInTrial: null, hasConverted: false };

  const now = Date.now();
  if (end.getTime() <= now) return { isTrial: false, daysLeftInTrial: null, hasConverted: false };

  const daysLeft = Math.ceil((end.getTime() - now) / DAY_MS);
  return { isTrial: true, daysLeftInTrial: daysLeft, hasConverted: false };
}

async function fetchTrialWindow(supabase, memberId) {
  const { data: trial, error } = await supabase
    .from("academy_trial_history")
    .select("trial_start_at, trial_end_at, converted_at")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (trial && trial.trial_start_at) {
    return {
      trialStartAt: trial.trial_start_at,
      trialEndAt: trial.trial_end_at || null,
      convertedAt: trial.converted_at || null,
    };
  }

  const { data: member, error: memberError } = await supabase
    .from("ms_members_cache")
    .select("created_at, plan_summary")
    .eq("member_id", memberId)
    .maybeSingle();
  if (memberError) throw memberError;

  const plan = member?.plan_summary || {};
  const trialStartAt = plan.trial_start_at || member?.created_at || null;
  const trialEndAt = plan.expiry_date || null;
  return { trialStartAt, trialEndAt, convertedAt: plan.converted_at || null };
}

async function fetchWindowEvents(supabase, memberId, startIso, endIso) {
  const { data, error } = await supabase
    .from("academy_events")
    .select("event_type, path, created_at")
    .eq("member_id", memberId)
    .in("event_type", ACTIVITY_TYPES)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchLastActivityAt(supabase, memberId) {
  const { data, error } = await supabase
    .from("academy_events")
    .select("created_at")
    .eq("member_id", memberId)
    .in("event_type", ACTIVITY_TYPES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at || null;
}

async function fetchExamStats(supabase, memberId, startIso, endIso) {
  const { data, error } = await supabase
    .from("module_results_ms")
    .select("module_id, passed, created_at")
    .eq("memberstack_id", memberId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (error) throw error;

  const rows = data || [];
  const modules = new Set();
  let examsPassed = 0;
  rows.forEach((row) => {
    if (row.module_id) modules.add(row.module_id);
    if (row.passed) examsPassed++;
  });
  return { examsAttempted: modules.size, examsPassed };
}

function summariseEvents(events) {
  const activeDays = new Set();
  const foundationPaths = new Set();
  let loginsFirst14d = 0;
  let lastInWindow = null;

  events.forEach((row) => {
    if (!row.created_at) return;
    activeDays.add(row.created_at.slice(0, 10));
    lastInWindow = row.created_at;
    if (LOGIN_TYPES.has(row.event_type)) loginsFirst14d++;
    if (row.event_type === "module_open" && row.path && isFoundationPath(row.path)) {
      foundationPaths.add(row.path);
    }
  });

  return {
    modulesOpened: foundationPaths.size,
    loginsFirst14d,
    distinctActiveDaysFirst14d: activeDays.size,
    lastInWindow,
  };
}

async function buildSummary(supabase, memberId) {
  const { trialStartAt, trialEndAt, convertedAt } = await fetchTrialWindow(supabase, memberId);
  const trialStatus = deriveTrialStatus(trialEndAt, convertedAt);
  const start = parseDate(trialStartAt);
  const now = Date.now();
  const daysSinceSignup = start ? Math.floor((now - start.getTime()) / DAY_MS) : null;

  if (!start) {
    const lastActivityAt = await fetchLastActivityAt(supabase, memberId);
    return {
      trialStartAt: null,
      trialEndAt: trialEndAt || null,
      daysSinceSignup: null,
      windowDays: WINDOW_DAYS,
      modulesOpened: 0,
      examsAttempted: 0,
      examsPassed: 0,
      loginsFirst14d: 0,
      distinctActiveDaysFirst14d: 0,
      lastActivityAt,
      ...trialStatus,
    };
  }

  const windowEnd = new Date(start.getTime() + WINDOW_DAYS * DAY_MS);
  const startIso = start.toISOString();
  const endIso = windowEnd.toISOString();

  const [events, examStats, lastActivityAt] = await Promise.all([
    fetchWindowEvents(supabase, memberId, startIso, endIso),
    fetchExamStats(supabase, memberId, startIso, endIso),
    fetchLastActivityAt(supabase, memberId),
  ]);

  const eventStats = summariseEvents(events);
  return {
    trialStartAt: startIso,
    trialEndAt: trialEndAt || null,
    daysSinceSignup,
    windowDays: WINDOW_DAYS,
    modulesOpened: eventStats.modulesOpened,
    examsAttempted: examStats.examsAttempted,
    examsPassed: examStats.examsPassed,
    loginsFirst14d: eventStats.loginsFirst14d,
    distinctActiveDaysFirst14d: eventStats.distinctActiveDaysFirst14d,
    lastActivityAt: lastActivityAt || eventStats.lastInWindow,
    ...trialStatus,
  };
}

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    if (!checkOrigin(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const memberId = await resolveMemberId(req);
    if (!memberId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const cached = getCached(memberId);
    if (cached) {
      return res.status(200).json({ ...cached, cached: true });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const summary = await buildSummary(supabase, memberId);
    setCached(memberId, summary);
    return res.status(200).json({ ...summary, cached: false });
  } catch (e) {
    console.error("[engagement-summary] Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
