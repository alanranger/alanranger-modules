/**
 * Email send outcomes for admin engagement tab.
 * Sources: academy_email_events, academy_events, academy_trial_history.
 */

const DAY_MS = 86_400_000;
const LOGIN_TYPES = ["login", "member_login"];

const STAGE_META = [
  { key: "day-minus-7", label: "Day −7" },
  { key: "day-minus-1", label: "Day −1" },
  { key: "day-plus-7", label: "Day +7 (SAVE20)" },
  { key: "day-plus-20", label: "Day +20 (REWIND)" },
  { key: "day-plus-30", label: "Day +30 (REWIND)" },
  { key: "day-plus-60", label: "Day +60 (REWIND)" },
];

function weekStart(isoDate) {
  const d = new Date(isoDate);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function monthKey(iso) {
  return String(iso).slice(0, 7);
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((1000 * n) / d) / 10;
}

function deltaPct(cur, prev) {
  if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
  if (prev <= 0 && cur > 0) return 100;
  return 0;
}

function deltaPoints(cur, prev) {
  return Math.round((cur - prev) * 10) / 10;
}

async function fetchEmailSends(supabase, sinceIso) {
  let q = supabase
    .from("academy_email_events")
    .select("member_id, stage_key, sent_at, status, dry_run")
    .eq("status", "sent")
    .order("sent_at", { ascending: true });
  if (sinceIso) q = q.gte("sent_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).filter((r) => !r.dry_run);
}

async function fetchEventsSince(supabase, sinceIso) {
  let q = supabase
    .from("academy_events")
    .select("member_id, event_type, created_at")
    .in("event_type", [...LOGIN_TYPES, "module_open"])
    .order("created_at", { ascending: true });
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchConversions(supabase) {
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select("member_id, converted_at")
    .not("converted_at", "is", null);
  if (error) throw error;
  const map = new Map();
  (data || []).forEach((r) => {
    if (!r.member_id || !r.converted_at) return;
    const prev = map.get(r.member_id);
    if (!prev || r.converted_at > prev) map.set(r.member_id, r.converted_at);
  });
  return map;
}

function indexEvents(rows) {
  const logins = new Map();
  const modules = new Map();
  rows.forEach((r) => {
    if (!r.member_id) return;
    const t = r.created_at;
    if (LOGIN_TYPES.includes(r.event_type)) {
      const arr = logins.get(r.member_id) || [];
      arr.push(t);
      logins.set(r.member_id, arr);
    } else if (r.event_type === "module_open") {
      const arr = modules.get(r.member_id) || [];
      arr.push(t);
      modules.set(r.member_id, arr);
    }
  });
  return { logins, modules };
}

function hadEventAfter(times, sentAt) {
  if (!times || !times.length) return false;
  const s = new Date(sentAt).getTime();
  return times.some((t) => new Date(t).getTime() > s);
}

function attachOutcomes(sends, eventIdx, conversions) {
  return sends.map((row) => {
    const loginTimes = eventIdx.logins.get(row.member_id);
    const modTimes = eventIdx.modules.get(row.member_id);
    const conv = conversions.get(row.member_id);
    const sentMs = new Date(row.sent_at).getTime();
    return {
      ...row,
      month: monthKey(row.sent_at),
      week: weekStart(row.sent_at),
      login_after: hadEventAfter(loginTimes, row.sent_at),
      module_after: hadEventAfter(modTimes, row.sent_at),
      converted_after: !!(conv && new Date(conv).getTime() > sentMs),
    };
  });
}

/** Latest send per member+stage within a month bucket. */
function dedupeMonthRows(rows, ym) {
  const map = new Map();
  rows
    .filter((r) => r.month === ym)
    .forEach((r) => {
      const k = `${r.member_id}|${r.stage_key}`;
      const prev = map.get(k);
      if (!prev || r.sent_at > prev.sent_at) map.set(k, r);
    });
  return Array.from(map.values());
}

function summariseStageRows(rows) {
  const n = rows.length;
  const login = rows.filter((r) => r.login_after).length;
  const mod = rows.filter((r) => r.module_after).length;
  const conv = rows.filter((r) => r.converted_after).length;
  return {
    emailed: n,
    login_after: login,
    login_after_pct: pct(login, n),
    module_after: mod,
    module_after_pct: pct(mod, n),
    converted_after: conv,
    converted_after_pct: pct(conv, n),
  };
}

function monthLabels(now) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const curStart = new Date(Date.UTC(y, m, 1));
  const lastStart = new Date(Date.UTC(y, m - 1, 1));
  const prevStart = new Date(Date.UTC(y, m - 2, 1));
  return {
    current: monthKey(curStart.toISOString()),
    last: monthKey(lastStart.toISOString()),
    prev: monthKey(prevStart.toISOString()),
    current_label: curStart.toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
    last_label: lastStart.toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
    prev_label: prevStart.toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
  };
}

function buildMonthTable(enriched) {
  const now = new Date();
  const labels = monthLabels(now);
  const months = [labels.current, labels.last, labels.prev];

  const stages = STAGE_META.map((meta) => {
    const period = {};
    months.forEach((ym) => {
      period[ym] = summariseStageRows(dedupeMonthRows(enriched, ym).filter((r) => r.stage_key === meta.key));
    });
    const cur = period[labels.current];
    const last = period[labels.last];
    const prev = period[labels.prev];
    return {
      ...meta,
      periods: {
        current_month: { ...cur, month: labels.current, label: `${labels.current_label} (MTD)` },
        last_month: { ...last, month: labels.last, label: labels.last_label },
        prev_month: { ...prev, month: labels.prev, label: labels.prev_label },
      },
      deltas_vs_last_month: {
        emailed: cur.emailed - last.emailed,
        emailed_pct: deltaPct(cur.emailed, last.emailed),
        login_after_pct: deltaPoints(cur.login_after_pct, last.login_after_pct),
        module_after_pct: deltaPoints(cur.module_after_pct, last.module_after_pct),
        converted_after_pct: deltaPoints(cur.converted_after_pct, last.converted_after_pct),
      },
      deltas_vs_prev_month: {
        emailed: last.emailed - prev.emailed,
        emailed_pct: deltaPct(last.emailed, prev.emailed),
        login_after_pct: deltaPoints(last.login_after_pct, prev.login_after_pct),
        module_after_pct: deltaPoints(last.module_after_pct, prev.module_after_pct),
        converted_after_pct: deltaPoints(last.converted_after_pct, prev.converted_after_pct),
      },
    };
  });

  return { labels, stages };
}

function buildWeekKeys90d() {
  const weeks = Math.ceil(90 / 7);
  const keys = [];
  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);
  const day = anchor.getUTCDay();
  anchor.setUTCDate(anchor.getUTCDate() - ((day + 6) % 7) - 7);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(anchor.getUTCDate() - i * 7);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function buildTrends90d(enriched) {
  const weeks = buildWeekKeys90d();
  const since = `${weeks[0]}T00:00:00Z`;
  const recent = enriched.filter((r) => r.sent_at >= since);
  const trendStages = STAGE_META.filter((s) =>
    ["day-minus-7", "day-minus-1", "day-plus-7", "day-plus-20"].includes(s.key)
  );

  const by_stage = {};
  trendStages.forEach((meta) => {
    const sends = weeks.map((w) => recent.filter((r) => r.week === w && r.stage_key === meta.key).length);
    const logins = weeks.map((w) => {
      const rows = recent.filter((r) => r.week === w && r.stage_key === meta.key);
      return rows.filter((r) => r.login_after).length;
    });
    by_stage[meta.key] = { label: meta.label, sends, login_after: logins };
  });

  return { weeks, by_stage, since };
}

async function buildEmailEngagementStats(supabase) {
  const now = new Date();
  const labels = monthLabels(now);
  const sinceMonths = `${labels.prev}-01T00:00:00Z`;

  const [sends, events, conversions] = await Promise.all([
    fetchEmailSends(supabase, sinceMonths),
    fetchEventsSince(supabase, sinceMonths),
    fetchConversions(supabase),
  ]);

  const enriched = attachOutcomes(sends, indexEvents(events), conversions);
  const table = buildMonthTable(enriched);
  const trends_90d = buildTrends90d(enriched);

  return {
    generated_at: now.toISOString(),
    month_labels: table.labels,
    stages: table.stages,
    trends_90d,
    note: "After = any login / module_open / conversion timestamp strictly after sent_at. One row per member per stage per month (latest send).",
  };
}

module.exports = {
  STAGE_META,
  buildEmailEngagementStats,
};
