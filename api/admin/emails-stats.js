// api/admin/emails-stats.js
//
// Per-stage statistics for the /academy/admin/emails dashboard tiles.
// Legacy trial/rewind stages: fast SQL eligibility counts.
// Trigger stages: sent counts only (eligibility deferred — snapshot scan is too slow for HTTP).

const { createClient } = require("@supabase/supabase-js");
const { EMAIL_STAGES } = require("../../lib/emailStages");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const REACH_BACK_DAYS = 180;
const PAGE_SIZE = 1000;

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
  const startMs = Math.ceil((nowMs + 1000) / HOUR_MS) * HOUR_MS;
  let candidate = startMs;
  for (let i = 0; i < 48; i++) {
    const d = new Date(candidate);
    if (londonHour(d) === 9) return d.toISOString();
    candidate += HOUR_MS;
  }
  return null;
}

function emptySentMaps() {
  const last24h = {};
  const last7d = {};
  EMAIL_STAGES.forEach((s) => {
    last24h[s.key] = 0;
    last7d[s.key] = 0;
  });
  return { last24h, last7d };
}

async function fetchAllSentCounts(nowMs) {
  const maps = emptySentMaps();
  if (!supabase) return maps;

  const from7dIso = new Date(nowMs - 7 * DAY_MS).toISOString();
  const from24hMs = nowMs - DAY_MS;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("academy_email_events")
      .select("stage_key, sent_at")
      .eq("status", "sent")
      .eq("dry_run", false)
      .gte("sent_at", from7dIso)
      .order("sent_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`academy_email_events sent counts: ${error.message}`);

    for (const row of data || []) {
      const key = row.stage_key;
      if (!key || maps.last7d[key] == null) continue;
      maps.last7d[key] += 1;
      const sentMs = new Date(row.sent_at).getTime();
      if (Number.isFinite(sentMs) && sentMs >= from24hMs) {
        maps.last24h[key] += 1;
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return maps;
}

async function fetchContactableMemberIds() {
  if (!supabase) return new Set();
  const ids = new Set();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("ms_members_cache")
      .select("member_id")
      .not("email", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.warn("[emails-stats] contactable set failed:", error.message);
      return ids;
    }
    (data || []).forEach((r) => ids.add(r.member_id));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return ids;
}

async function countTrialReminderEligible(daysAhead, nowMs, contactable) {
  if (!supabase) return 0;
  const target = new Date(nowMs + daysAhead * DAY_MS);
  const startOfDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 0, 0, 0, 0)
  );
  const endOfDay = new Date(startOfDay.getTime() + DAY_MS - 1);
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select("member_id")
    .is("converted_at", null)
    .gte("trial_end_at", startOfDay.toISOString())
    .lte("trial_end_at", endOfDay.toISOString());
  if (error) {
    console.warn(`[emails-stats] trial count ${daysAhead}d failed:`, error.message);
    return 0;
  }
  return new Set((data || []).map((r) => r.member_id).filter((id) => contactable.has(id))).size;
}

function rewindRowPassesGap(row, stage, nowMs) {
  if (!stage.gapDays) return true;
  if (!row.reengagement_last_sent_at) return false;
  return new Date(row.reengagement_last_sent_at).getTime() <= nowMs - stage.gapDays * DAY_MS;
}

async function countRewindEligible(stage, nowMs, contactable) {
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
  const uniqueIds = new Set();
  for (const row of data || []) {
    if (!contactable.has(row.member_id)) continue;
    if (!rewindRowPassesGap(row, stage, nowMs)) continue;
    uniqueIds.add(row.member_id);
  }
  return uniqueIds.size;
}

async function statsForLegacyStage(stageDef, nowMs, contactable, sentCounts) {
  const trial = TRIAL_STAGES.find((s) => s.key === stageDef.key);
  const rewind = REWIND_STAGES.find((s) => s.key === stageDef.key);
  let eligible = 0;
  if (trial) eligible = await countTrialReminderEligible(trial.daysAhead, nowMs, contactable);
  if (rewind) eligible = await countRewindEligible(rewind, nowMs, contactable);

  return {
    key: stageDef.key,
    enabled: stageDef.enabled === true,
    cron_enabled: stageDef.cronEnabled === true,
    eligible_today: eligible,
    sent_last_24h: sentCounts.last24h[stageDef.key] || 0,
    sent_last_7d: sentCounts.last7d[stageDef.key] || 0,
    next_send_at: trial || rewind ? nextLondon9AMIso(nowMs) : null,
    schedule_source:
      trial || (rewind && stageDef.enabled)
        ? "Vercel Cron (daily 09:00 Europe/London)"
        : "Zapier weekly trigger",
  };
}

function statsForTriggerStage(stageDef, nowMs, sentCounts) {
  return {
    key: stageDef.key,
    enabled: stageDef.enabled === true,
    cron_enabled: stageDef.cronEnabled === true,
    test_mode_only: stageDef.testModeOnly === true,
    eligible_today: null,
    eligible_deferred: true,
    sent_last_24h: sentCounts.last24h[stageDef.key] || 0,
    sent_last_7d: sentCounts.last7d[stageDef.key] || 0,
    next_send_at: nextLondon9AMIso(nowMs),
    schedule_source: "Vercel Cron trigger check (09:00 Europe/London)",
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
    const [sentCounts, contactable] = await Promise.all([
      fetchAllSentCounts(nowMs),
      fetchContactableMemberIds(),
    ]);

    const results = await Promise.all(
      EMAIL_STAGES.map(async (stageDef) => {
        if (stageDef.legacyStats) {
          return statsForLegacyStage(stageDef, nowMs, contactable, sentCounts);
        }
        if (stageDef.trigger) {
          return statsForTriggerStage(stageDef, nowMs, sentCounts);
        }
        return null;
      })
    );

    return res.status(200).json({
      success: true,
      generated_at: new Date(nowMs).toISOString(),
      stages: results.filter(Boolean),
    });
  } catch (err) {
    console.error("[emails-stats] unexpected failure:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
