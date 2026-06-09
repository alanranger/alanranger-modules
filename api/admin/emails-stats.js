// api/admin/emails-stats.js
//
// Per-stage statistics for the /academy/admin/emails dashboard tiles.
// Legacy trial/rewind stages: fast SQL eligibility counts.
// Trigger stages: sent counts only (eligibility deferred — snapshot scan is too slow for HTTP).

const { createClient } = require("@supabase/supabase-js");
const { EMAIL_STAGES } = require("../../lib/emailStages");
const { MANUAL_SEND_SOURCES } = require("../../lib/emailEvents");

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

const REWIND_STAGE_KEYS = new Set(["day-plus-20", "day-plus-30", "day-plus-60", "day-plus-90"]);
const DEPRECATED_STAGE_KEYS = new Set(["paid-milestone"]);

function emptyWindowCounts() {
  return { today: 0, last_7d: 0, last_30d: 0, last_60d: 0, last_90d: 0, total: 0, last_24h: 0 };
}

function emptyStageMaps() {
  const last24h = {};
  const last7d = {};
  EMAIL_STAGES.forEach((s) => {
    last24h[s.key] = 0;
    last7d[s.key] = 0;
  });
  return { last24h, last7d };
}

function categoryForStageKey(key) {
  if (!key || DEPRECATED_STAGE_KEYS.has(key)) return null;
  if (key.startsWith("paid-")) return "paid_lifecycle";
  if (REWIND_STAGE_KEYS.has(key)) return "rewind_ladder";
  return "trials_scheduled";
}

function londonDateKey(isoOrMs) {
  return new Date(isoOrMs).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function bumpWindowCounts(counter, sentMs, sentDayLondon, todayLondon, nowMs) {
  counter.total += 1;
  if (sentMs >= nowMs - DAY_MS) counter.last_24h += 1;
  if (sentMs >= nowMs - 7 * DAY_MS) counter.last_7d += 1;
  if (sentMs >= nowMs - 30 * DAY_MS) counter.last_30d += 1;
  if (sentMs >= nowMs - 60 * DAY_MS) counter.last_60d += 1;
  if (sentMs >= nowMs - 90 * DAY_MS) counter.last_90d += 1;
  if (sentDayLondon === todayLondon) counter.today += 1;
}

function sumCategoryWindows(categories, keys) {
  const out = emptyWindowCounts();
  keys.forEach((key) => {
    const src = categories[key];
    if (!src) return;
    out.today += src.today;
    out.last_24h += src.last_24h;
    out.last_7d += src.last_7d;
    out.last_30d += src.last_30d;
    out.last_60d += src.last_60d;
    out.last_90d += src.last_90d;
    out.total += src.total;
  });
  return out;
}

function isManualSend(row) {
  return (
    MANUAL_SEND_SOURCES.includes(row.send_source) ||
    row.event_detail === "corrected_resend_2026-06-09"
  );
}

async function fetchSentMetrics(nowMs) {
  const stageMaps = emptyStageMaps();
  const categories = {
    trials_scheduled: emptyWindowCounts(),
    rewind_ladder: emptyWindowCounts(),
    paid_lifecycle: emptyWindowCounts(),
    manual_batch: emptyWindowCounts(),
  };
  if (!supabase) {
    return { stageMaps, categories, lifecycle_total: emptyWindowCounts() };
  }

  const todayLondon = londonDateKey(nowMs);
  const from24hMs = nowMs - DAY_MS;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("academy_email_events")
      .select("stage_key, sent_at, send_source, event_detail")
      .eq("status", "sent")
      .eq("dry_run", false)
      .order("sent_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`academy_email_events sent counts: ${error.message}`);

    for (const row of data || []) {
      const sentMs = new Date(row.sent_at).getTime();
      if (!Number.isFinite(sentMs)) continue;
      const sentDayLondon = londonDateKey(sentMs);

      const stageKey = row.stage_key;
      if (stageKey && stageMaps.last7d[stageKey] != null) {
        if (sentMs >= nowMs - 7 * DAY_MS) stageMaps.last7d[stageKey] += 1;
        if (sentMs >= from24hMs) stageMaps.last24h[stageKey] += 1;
      }

      const category = categoryForStageKey(stageKey);
      if (category) {
        bumpWindowCounts(categories[category], sentMs, sentDayLondon, todayLondon, nowMs);
      }
      if (isManualSend(row)) {
        bumpWindowCounts(categories.manual_batch, sentMs, sentDayLondon, todayLondon, nowMs);
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const lifecycle_total = sumCategoryWindows(categories, [
    "trials_scheduled",
    "rewind_ladder",
    "paid_lifecycle",
  ]);

  return { stageMaps, categories, lifecycle_total };
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

async function statsForLegacyStage(stageDef, nowMs, contactable, stageMaps) {
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
    sent_last_24h: stageMaps.last24h[stageDef.key] || 0,
    sent_last_7d: stageMaps.last7d[stageDef.key] || 0,
    next_send_at: trial || rewind ? nextLondon9AMIso(nowMs) : null,
    schedule_source:
      trial || (rewind && stageDef.enabled)
        ? "Vercel Cron (daily 09:00 Europe/London)"
        : "Zapier weekly trigger",
  };
}

function statsForTriggerStage(stageDef, nowMs, stageMaps) {
  return {
    key: stageDef.key,
    enabled: stageDef.enabled === true,
    cron_enabled: stageDef.cronEnabled === true,
    test_mode_only: stageDef.testModeOnly === true,
    eligible_today: null,
    eligible_deferred: true,
    sent_last_24h: stageMaps.last24h[stageDef.key] || 0,
    sent_last_7d: stageMaps.last7d[stageDef.key] || 0,
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
    const { stageMaps, categories, lifecycle_total } = await fetchSentMetrics(nowMs);
    const contactable = await fetchContactableMemberIds();

    const results = await Promise.all(
      EMAIL_STAGES.map(async (stageDef) => {
        if (stageDef.legacyStats) {
          return statsForLegacyStage(stageDef, nowMs, contactable, stageMaps);
        }
        if (stageDef.trigger) {
          return statsForTriggerStage(stageDef, nowMs, stageMaps);
        }
        return null;
      })
    );

    return res.status(200).json({
      success: true,
      generated_at: new Date(nowMs).toISOString(),
      stages: results.filter(Boolean),
      manual_sends: {
        key: "manual-batch",
        label: "Manual batch / corrected resend",
        sent_last_24h: categories.manual_batch.last_24h,
        sent_last_7d: categories.manual_batch.last_7d,
        windows: categories.manual_batch,
      },
      summary_by_category: {
        trials_scheduled: categories.trials_scheduled,
        rewind_ladder: categories.rewind_ladder,
        paid_lifecycle: categories.paid_lifecycle,
        manual_batch: categories.manual_batch,
        lifecycle_total,
      },
    });
  } catch (err) {
    console.error("[emails-stats] unexpected failure:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
