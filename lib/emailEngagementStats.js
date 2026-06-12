/**
 * Email send outcomes for admin engagement tab.
 * Sources: academy_email_events, academy_events, academy_trial_history.
 */

const { EMAIL_STAGES } = require("./emailStages");
const {
  DEPRECATED_STAGE_KEYS,
  categoryForStageKey,
  buildSendSummaryFromRows,
} = require("./emailSendCategories");

const ROLLING_DAYS = 90;
const LOGIN_TYPES = ["login", "member_login"];

const STAGE_META = EMAIL_STAGES.filter((s) => !DEPRECATED_STAGE_KEYS.has(s.key)).map((s) => ({
  key: s.key,
  label: s.shortLabel,
  displayName: s.displayName,
  category: categoryForStageKey(s.key),
}));

const TREND_CATEGORY_KEYS = ["trials_scheduled", "rewind_ladder", "paid_lifecycle"];
const TREND_CATEGORY_LABELS = {
  trials_scheduled: "Trials · scheduled",
  rewind_ladder: "Trials · REWIND ladder",
  paid_lifecycle: "Paid lifecycle",
};

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

const PAGE_SIZE = 1000;
const MEMBER_CHUNK = 150;

async function fetchAllPaginated(buildQuery) {
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchEmailSends(supabase, sinceIso) {
  const rows = await fetchAllPaginated(() => {
    let q = supabase
      .from("academy_email_events")
      .select("member_id, stage_key, sent_at, status, dry_run, send_source, event_detail")
      .eq("status", "sent")
      .order("sent_at", { ascending: true });
    if (sinceIso) q = q.gte("sent_at", sinceIso);
    return q;
  });
  return rows.filter((r) => !r.dry_run);
}

async function fetchEventsForMembers(supabase, sinceIso, memberIds) {
  const unique = [...new Set((memberIds || []).filter(Boolean))];
  if (!unique.length) return [];

  const eventTypes = [...LOGIN_TYPES, "module_open"];
  const all = [];

  for (let i = 0; i < unique.length; i += MEMBER_CHUNK) {
    const chunk = unique.slice(i, i + MEMBER_CHUNK);
    const rows = await fetchAllPaginated(() => {
      let q = supabase
        .from("academy_events")
        .select("member_id, event_type, created_at")
        .in("member_id", chunk)
        .in("event_type", eventTypes)
        .order("created_at", { ascending: true });
      if (sinceIso) q = q.gte("created_at", sinceIso);
      return q;
    });
    all.push(...rows);
  }

  return all;
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

function sinceIsoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function dedupeWindowRows(rows, sinceIso) {
  const map = new Map();
  rows
    .filter((r) => r.sent_at >= sinceIso)
    .forEach((r) => {
      const k = `${r.member_id}|${r.stage_key}`;
      const prev = map.get(k);
      if (!prev || r.sent_at > prev.sent_at) map.set(k, r);
    });
  return Array.from(map.values());
}

function countRawSends(rows, stageKey, sinceIso) {
  return rows.filter(
    (r) => r.stage_key === stageKey && (!sinceIso || r.sent_at >= sinceIso)
  ).length;
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

function buildMonthTable(enriched, sentLast7dByStage) {
  const now = new Date();
  const labels = monthLabels(now);
  const months = [labels.current, labels.last, labels.prev];
  const since90 = sinceIsoDaysAgo(ROLLING_DAYS);

  const stages = STAGE_META.map((meta) => {
    const period = {};
    months.forEach((ym) => {
      period[ym] = summariseStageRows(dedupeMonthRows(enriched, ym).filter((r) => r.stage_key === meta.key));
    });
    const windowRows = dedupeWindowRows(enriched, since90).filter((r) => r.stage_key === meta.key);
    const rolling90 = summariseStageRows(windowRows);
    const cur = period[labels.current];
    const last = period[labels.last];
    const prev = period[labels.prev];
    return {
      ...meta,
      sent_last_7d: sentLast7dByStage[meta.key] || 0,
      raw_sends_90d: countRawSends(enriched, meta.key, since90),
      periods: {
        rolling_90d: {
          ...rolling90,
          label: `Last ${ROLLING_DAYS} days`,
          since: since90.slice(0, 10),
        },
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
  const by_category = {};

  TREND_CATEGORY_KEYS.forEach((catKey) => {
    const sends = weeks.map((w) =>
      recent.filter((r) => r.week === w && categoryForStageKey(r.stage_key) === catKey).length
    );
    const logins = weeks.map((w) => {
      const rows = recent.filter(
        (r) => r.week === w && categoryForStageKey(r.stage_key) === catKey
      );
      return rows.filter((r) => r.login_after).length;
    });
    by_category[catKey] = { label: TREND_CATEGORY_LABELS[catKey], sends, login_after: logins };
  });

  return { weeks, by_category, since };
}

async function fetchLoggingMeta(supabase) {
  const { data, error } = await supabase
    .from("academy_email_events")
    .select("sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const first = data && data[0] && data[0].sent_at;
  const { count, error: countErr } = await supabase
    .from("academy_email_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent");
  if (countErr) throw countErr;
  return { logging_since: first || null, all_time_logged_sends: count || 0 };
}

async function buildEmailEngagementStats(supabase) {
  const now = new Date();
  const nowMs = now.getTime();
  const labels = monthLabels(now);
  const since90 = sinceIsoDaysAgo(ROLLING_DAYS);
  const sinceMonths = `${labels.prev}-01T00:00:00Z`;
  const sinceFetch = since90 < sinceMonths ? since90 : sinceMonths;

  const allSends = await fetchEmailSends(supabase, null);
  const sendSummary = buildSendSummaryFromRows(allSends, nowMs);
  const sends = allSends.filter((r) => r.sent_at >= sinceFetch);
  const memberIds = sends.map((r) => r.member_id);
  const [events, conversions, loggingMeta] = await Promise.all([
    fetchEventsForMembers(supabase, sinceFetch, memberIds),
    fetchConversions(supabase),
    fetchLoggingMeta(supabase),
  ]);

  const enriched = attachOutcomes(sends, indexEvents(events), conversions);
  const table = buildMonthTable(enriched, sendSummary.sent_last_7d_by_stage);
  const trends_90d = buildTrends90d(enriched);

  const raw90Total = enriched.filter((r) => r.sent_at >= since90).length;
  const deduped90Total = dedupeWindowRows(enriched, since90).length;

  return {
    generated_at: now.toISOString(),
    month_labels: table.labels,
    stages: table.stages,
    summary_by_category: sendSummary.summary_by_category,
    trends_90d,
    logging: {
      ...loggingMeta,
      note: "Cron sends before this date were not written to academy_email_events (no backfill).",
    },
    totals_90d: {
      since: since90.slice(0, 10),
      raw_sends: raw90Total,
      deduped_member_stage: deduped90Total,
    },
    note:
      "Outcomes use latest send per member per stage in the window. Login/module after = academy_events strictly after sent_at. Send counts mirror the Emails tab (incl. manual/batch send_source).",
    debug: {
      events_loaded: events.length,
      sends_loaded: sends.length,
      members_with_events: new Set(events.map((r) => r.member_id)).size,
    },
  };
}

module.exports = {
  STAGE_META,
  buildEmailEngagementStats,
};
