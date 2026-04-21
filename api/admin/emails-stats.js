// api/admin/emails-stats.js
//
// Per-stage statistics for the /academy/admin/emails dashboard tiles.
// Returns, for each of the 6 stages:
//   - eligible_today: members who currently qualify for that stage
//   - sent_last_24h:  successful sends in academy_email_events within 24h
//   - sent_last_7d:   successful sends within the last 7 days
//   - next_send_at:   ISO timestamp of the next scheduled run (trial
//                     reminders only — Day +20/+30/+60 is Zapier)
//
// Approximations (documented for honesty, not hidden):
//   - Day -7 / -1 / +7 eligibility is computed from academy_trial_history,
//     which is the same table the production webhook uses as its source of
//     truth. Memberstack-only trials that haven't synced yet won't appear.
//   - REWIND20 eligibility mirrors passesResendGate() in the lapsed webhook:
//     send_count < 3, opted_out = false, converted_at is null, window + gap
//     rules applied per-attempt.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// Stage definitions mirror pages/academy/admin/emails.js STAGES array.
// Keep in sync if you add or rename a stage.
const TRIAL_STAGES = [
  { key: "day-minus-7", daysAhead: 7 },
  { key: "day-minus-1", daysAhead: 1 },
  { key: "day-plus-7", daysAhead: -7 },
];

const REWIND_STAGES = [
  { key: "day-plus-20", attempt: 1, minDays: 20, gapDays: null },
  { key: "day-plus-30", attempt: 2, minDays: 30, gapDays: 10 },
  { key: "day-plus-60", attempt: 3, minDays: 60, gapDays: 30 },
];

const REACH_BACK_DAYS = 180;

// Compute the next 09:00 Europe/London instant as an ISO UTC string.
// Uses the Intl API for DST-safe London hour resolution without an external
// tz library. Complexity kept low by splitting into two helpers.
function londonHour(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return parseInt(hourPart ? hourPart.value : "0", 10);
}

function nextLondon9AMIso(nowMs) {
  // Walk forward one hour at a time until we find a moment whose London hour
  // is 09 and which is strictly after `nowMs`. At most 24 iterations.
  let candidate = nowMs + HOUR_MS;
  for (let i = 0; i < 48; i++) {
    const d = new Date(candidate);
    if (londonHour(d) === 9 && d.getUTCMinutes() < 15) {
      return d.toISOString();
    }
    candidate += HOUR_MS;
  }
  return null;
}

async function countTrialReminderEligible(daysAhead, nowMs) {
  if (!supabase) return 0;
  // Target a ±12h window around now + daysAhead. This matches how the cron
  // job fires once per day at 09:00 London and processes everyone whose
  // trial_end_at lands on "today".
  const targetMs = nowMs + daysAhead * DAY_MS;
  const low = new Date(targetMs - 12 * HOUR_MS).toISOString();
  const high = new Date(targetMs + 12 * HOUR_MS).toISOString();
  const { count, error } = await supabase
    .from("academy_trial_history")
    .select("member_id", { count: "exact", head: true })
    .is("converted_at", null)
    .gte("trial_end_at", low)
    .lte("trial_end_at", high);
  if (error) {
    console.warn(`[emails-stats] trial count ${daysAhead}d failed:`, error.message);
    return 0;
  }
  return count || 0;
}

async function countRewindEligible(stage, nowMs) {
  if (!supabase) return 0;
  const maxEndIso = new Date(nowMs - stage.minDays * DAY_MS).toISOString();
  const minEndIso = new Date(nowMs - REACH_BACK_DAYS * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("academy_trial_history")
    .select("member_id, reengagement_last_sent_at")
    .is("converted_at", null)
    .eq("reengagement_opted_out", false)
    .eq("reengagement_send_count", stage.attempt - 1)
    .gte("trial_end_at", minEndIso)
    .lte("trial_end_at", maxEndIso);
  if (error) {
    console.warn(`[emails-stats] rewind count ${stage.key} failed:`, error.message);
    return 0;
  }
  const rows = data || [];
  if (!stage.gapDays) return rows.length;
  // Attempts 2 and 3 must ALSO have gone `gapDays` since the last send.
  const gapCutoffMs = nowMs - stage.gapDays * DAY_MS;
  return rows.filter((r) => {
    if (!r.reengagement_last_sent_at) return false;
    return new Date(r.reengagement_last_sent_at).getTime() <= gapCutoffMs;
  }).length;
}

async function countSentInWindow(stageKey, windowMs, nowMs) {
  if (!supabase) return 0;
  const fromIso = new Date(nowMs - windowMs).toISOString();
  const { count, error } = await supabase
    .from("academy_email_events")
    .select("id", { count: "exact", head: true })
    .eq("stage_key", stageKey)
    .eq("status", "sent")
    .eq("dry_run", false)
    .gte("sent_at", fromIso);
  if (error) {
    console.warn(`[emails-stats] sent count ${stageKey} failed:`, error.message);
    return 0;
  }
  return count || 0;
}

async function statsForTrialStage(stage, nowMs) {
  const [eligible, last24h, last7d] = await Promise.all([
    countTrialReminderEligible(stage.daysAhead, nowMs),
    countSentInWindow(stage.key, DAY_MS, nowMs),
    countSentInWindow(stage.key, 7 * DAY_MS, nowMs),
  ]);
  return {
    key: stage.key,
    eligible_today: eligible,
    sent_last_24h: last24h,
    sent_last_7d: last7d,
    next_send_at: nextLondon9AMIso(nowMs),
    schedule_source: "Vercel Cron (daily 09:00 Europe/London)",
  };
}

async function statsForRewindStage(stage, nowMs) {
  const [eligible, last24h, last7d] = await Promise.all([
    countRewindEligible(stage, nowMs),
    countSentInWindow(stage.key, DAY_MS, nowMs),
    countSentInWindow(stage.key, 7 * DAY_MS, nowMs),
  ]);
  return {
    key: stage.key,
    eligible_today: eligible,
    sent_last_24h: last24h,
    sent_last_7d: last7d,
    next_send_at: null,
    schedule_source: "Zapier weekly trigger",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!supabase) {
    return res
      .status(500)
      .json({ error: "Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)" });
  }

  try {
    const nowMs = Date.now();
    const trialResults = await Promise.all(
      TRIAL_STAGES.map((s) => statsForTrialStage(s, nowMs))
    );
    const rewindResults = await Promise.all(
      REWIND_STAGES.map((s) => statsForRewindStage(s, nowMs))
    );
    return res.status(200).json({
      success: true,
      generated_at: new Date(nowMs).toISOString(),
      stages: [...trialResults, ...rewindResults],
    });
  } catch (err) {
    console.error("[emails-stats] unexpected failure:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
