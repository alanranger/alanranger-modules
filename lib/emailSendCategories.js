/**
 * Shared category bucketing for admin email dashboards (Emails + Engagement tabs).
 */

const { MANUAL_SEND_SOURCES } = require("./emailEvents");

const REWIND_STAGE_KEYS = new Set(["day-plus-20", "day-plus-30", "day-plus-60", "day-plus-90"]);
const DEPRECATED_STAGE_KEYS = new Set(["paid-milestone"]);

const DAY_MS = 86400000;

function emptyWindowCounts() {
  return { today: 0, last_7d: 0, last_30d: 0, last_60d: 0, last_90d: 0, total: 0, last_24h: 0 };
}

function categoryForStageKey(key) {
  if (!key || DEPRECATED_STAGE_KEYS.has(key)) return null;
  if (key.startsWith("paid-")) return "paid_lifecycle";
  if (REWIND_STAGE_KEYS.has(key)) return "rewind_ladder";
  return "trials_scheduled";
}

function isManualSend(row) {
  return (
    MANUAL_SEND_SOURCES.includes(row.send_source) ||
    row.event_detail === "corrected_resend_2026-06-09"
  );
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

function buildSendSummaryFromRows(rows, nowMs) {
  const categories = {
    trials_scheduled: emptyWindowCounts(),
    rewind_ladder: emptyWindowCounts(),
    paid_lifecycle: emptyWindowCounts(),
    manual_batch: emptyWindowCounts(),
  };
  const byStage7d = {};
  const todayLondon = londonDateKey(nowMs);

  (rows || []).forEach((row) => {
    const sentMs = new Date(row.sent_at).getTime();
    if (!Number.isFinite(sentMs)) return;
    const sentDayLondon = londonDateKey(sentMs);
    const stageKey = row.stage_key;

    if (stageKey) {
      if (sentMs >= nowMs - 7 * DAY_MS) {
        byStage7d[stageKey] = (byStage7d[stageKey] || 0) + 1;
      }
    }

    const category = categoryForStageKey(stageKey);
    if (category) {
      bumpWindowCounts(categories[category], sentMs, sentDayLondon, todayLondon, nowMs);
    }
    if (isManualSend(row)) {
      bumpWindowCounts(categories.manual_batch, sentMs, sentDayLondon, todayLondon, nowMs);
    }
  });

  return {
    summary_by_category: {
      trials_scheduled: categories.trials_scheduled,
      rewind_ladder: categories.rewind_ladder,
      paid_lifecycle: categories.paid_lifecycle,
      manual_batch: categories.manual_batch,
      lifecycle_total: sumCategoryWindows(categories, [
        "trials_scheduled",
        "rewind_ladder",
        "paid_lifecycle",
      ]),
    },
    sent_last_7d_by_stage: byStage7d,
  };
}

module.exports = {
  REWIND_STAGE_KEYS,
  DEPRECATED_STAGE_KEYS,
  emptyWindowCounts,
  categoryForStageKey,
  isManualSend,
  buildSendSummaryFromRows,
};
