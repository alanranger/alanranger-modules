/**
 * Trial activation vs provisional targets for admin Engagement tab.
 * Cohort = organic stripe_webhook trials (excludes backfill + internal emails).
 */

const DAY_MS = 86_400_000;
const COHORT_BUCKET_DAYS = 28;
const TREND_BUCKETS = 6;
const PAGE_SIZE = 1000;
const MEMBER_CHUNK = 150;

const LOGIN_TYPES = ["login", "member_login"];

const INTERNAL_EMAILS = new Set([
  "info@alanranger.com",
  "marketing@alanranger.com",
]);

/** Visual target lines on tiles (provisional, not computed). */
const PROVISIONAL_TARGETS = {
  week1_modules_3: 40,
  week1_logins_5: 35,
  week2_active: 50,
  cohort_conversion: 5,
};

const REFERENCE_RATES_NOTE =
  "Reference (organic analysis): logins >=10 in 7d -> 10.3% convert vs 1.0% below; " +
  "modules >=5 in 7d -> 8.7% vs 1.8%; modules >=3 -> 6.9% vs 1.9%; exams in week 1 -> 0% convert (anti-signal).";

function pct(hit, total) {
  if (!total) return 0;
  return Math.round((1000 * hit) / total) / 10;
}

function parsePeriodStart(period) {
  const now = Date.now();
  if (period === "7d") return new Date(now - 7 * DAY_MS);
  if (period === "30d") return new Date(now - 30 * DAY_MS);
  if (period === "90d") return new Date(now - 90 * DAY_MS);
  return null;
}

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

async function fetchOrganicTrials(supabase, sinceIso) {
  const rows = await fetchAllPaginated(() => {
    let q = supabase
      .from("academy_trial_history")
      .select("member_id, trial_start_at, trial_end_at, converted_at, source")
      .eq("source", "stripe_webhook")
      .order("trial_start_at", { ascending: true });
    if (sinceIso) q = q.gte("trial_start_at", sinceIso);
    return q;
  });
  return rows.filter((r) => r.member_id && r.trial_start_at);
}

async function fetchMemberEmails(supabase, memberIds) {
  const map = new Map();
  const ids = [...new Set(memberIds)];
  for (let i = 0; i < ids.length; i += MEMBER_CHUNK) {
    const chunk = ids.slice(i, i + MEMBER_CHUNK);
    const { data, error } = await supabase
      .from("ms_members_cache")
      .select("member_id, email")
      .in("member_id", chunk);
    if (error) throw error;
    (data || []).forEach((r) => map.set(r.member_id, (r.email || "").toLowerCase()));
  }
  return map;
}

function isOrganicTrial(row, emailMap) {
  if (!row || row.source !== "stripe_webhook") return false;
  if (row.source === "academy_plan_events_backfill") return false;
  const email = emailMap.get(row.member_id) || "";
  if (INTERNAL_EMAILS.has(email)) return false;
  if (email && row.member_id && String(row.member_id).startsWith("mem_qa_")) return false;
  return true;
}

async function fetchEventsForMembers(supabase, memberIds, sinceIso) {
  const unique = [...new Set(memberIds.filter(Boolean))];
  if (!unique.length) return [];

  const all = [];
  for (let i = 0; i < unique.length; i += MEMBER_CHUNK) {
    const chunk = unique.slice(i, i + MEMBER_CHUNK);
    const rows = await fetchAllPaginated(() => {
      let q = supabase
        .from("academy_events")
        .select("member_id, event_type, path, created_at")
        .in("member_id", chunk)
        .in("event_type", [...LOGIN_TYPES, "module_open"])
        .order("created_at", { ascending: true });
      if (sinceIso) q = q.gte("created_at", sinceIso);
      return q;
    });
    all.push(...rows);
  }
  return all;
}

function indexEventsByMember(rows) {
  const byMember = new Map();
  rows.forEach((r) => {
    if (!r.member_id || !r.created_at) return;
    const list = byMember.get(r.member_id) || [];
    list.push(r);
    byMember.set(r.member_id, list);
  });
  return byMember;
}

function eventsInWindow(events, startMs, endMs) {
  return (events || []).filter((e) => {
    const t = new Date(e.created_at).getTime();
    return t >= startMs && t < endMs;
  });
}

function memberWeek1Stats(events, trialStartMs) {
  const w1End = trialStartMs + 7 * DAY_MS;
  const w1 = eventsInWindow(events, trialStartMs, w1End);
  const logins = w1.filter((e) => LOGIN_TYPES.includes(e.event_type)).length;
  const paths = new Set();
  w1.forEach((e) => {
    if (e.event_type === "module_open" && e.path) paths.add(e.path);
  });
  return { logins, uniqueModules: paths.size };
}

function memberWeek2Active(events, trialStartMs) {
  const w2Start = trialStartMs + 7 * DAY_MS;
  const w2End = trialStartMs + 14 * DAY_MS;
  const w2 = eventsInWindow(events, w2Start, w2End);
  return w2.some((e) => LOGIN_TYPES.includes(e.event_type) || e.event_type === "module_open");
}

function aggregateCohort(trials, eventsByMember, nowMs, opts) {
  const requireDays = opts.requireDays || 0;
  let total = 0;
  let hitModules3 = 0;
  let hitLogins5 = 0;
  let week2Eligible = 0;
  let week2Active = 0;
  let converted = 0;

  trials.forEach((trial) => {
    const startMs = new Date(trial.trial_start_at).getTime();
    if (Number.isNaN(startMs)) return;
    if (requireDays > 0 && nowMs < startMs + requireDays * DAY_MS) return;

    total++;
    if (trial.converted_at) converted++;

    const events = eventsByMember.get(trial.member_id) || [];
    const w1 = memberWeek1Stats(events, startMs);
    if (w1.uniqueModules >= 3) hitModules3++;
    if (w1.logins >= 5) hitLogins5++;

    if (nowMs >= startMs + 14 * DAY_MS) {
      week2Eligible++;
      if (memberWeek2Active(events, startMs)) week2Active++;
    }
  });

  return {
    total,
    week1_modules_3: { hit: hitModules3, total, pct: pct(hitModules3, total) },
    week1_logins_5: { hit: hitLogins5, total, pct: pct(hitLogins5, total) },
    week2_active: {
      hit: week2Active,
      total: week2Eligible,
      pct: pct(week2Active, week2Eligible),
    },
    conversion: { hit: converted, total, pct: pct(converted, total) },
  };
}

function buildTrendBuckets(now) {
  const buckets = [];
  const anchor = new Date(now);
  anchor.setUTCHours(0, 0, 0, 0);
  for (let i = TREND_BUCKETS - 1; i >= 0; i--) {
    const end = new Date(anchor.getTime() - i * COHORT_BUCKET_DAYS * DAY_MS);
    const start = new Date(end.getTime() - COHORT_BUCKET_DAYS * DAY_MS);
    buckets.push({
      label: start.toISOString().slice(0, 10),
      startMs: start.getTime(),
      endMs: end.getTime(),
    });
  }
  return buckets;
}

function trialsInBucket(trials, bucket) {
  return trials.filter((t) => {
    const ms = new Date(t.trial_start_at).getTime();
    return ms >= bucket.startMs && ms < bucket.endMs;
  });
}

function buildTileSeries(buckets, trials, eventsByMember, nowMs, metricKey) {
  return buckets.map((bucket) => {
    const subset = trialsInBucket(trials, bucket);
    if (metricKey === "week2_active" || metricKey === "conversion") {
      const agg = aggregateCohort(subset, eventsByMember, nowMs, { requireDays: 0 });
      return metricKey === "conversion" ? agg.conversion.pct : agg.week2_active.pct;
    }
    const agg = aggregateCohort(subset, eventsByMember, nowMs, { requireDays: 7 });
    return metricKey === "week1_logins_5" ? agg.week1_logins_5.pct : agg.week1_modules_3.pct;
  });
}

async function buildActivationTargetsStats(supabase, period) {
  const now = Date.now();
  const periodStart = parsePeriodStart(period);
  const trendStart = new Date(
    now - (TREND_BUCKETS * COHORT_BUCKET_DAYS + 14) * DAY_MS
  );
  const fetchSince = periodStart
    ? new Date(Math.min(periodStart.getTime(), trendStart.getTime()))
    : trendStart;

  const rawTrials = await fetchOrganicTrials(supabase, fetchSince.toISOString());
  const emailMap = await fetchMemberEmails(
    supabase,
    rawTrials.map((r) => r.member_id)
  );
  const organicTrials = rawTrials.filter((r) => isOrganicTrial(r, emailMap));

  const cohortTrials = periodStart
    ? organicTrials.filter((t) => new Date(t.trial_start_at) >= periodStart)
    : organicTrials;

  const events = await fetchEventsForMembers(
    supabase,
    organicTrials.map((t) => t.member_id),
    fetchSince.toISOString()
  );
  const eventsByMember = indexEventsByMember(events);

  const week1Current = aggregateCohort(cohortTrials, eventsByMember, now, { requireDays: 7 });
  const fullCurrent = aggregateCohort(cohortTrials, eventsByMember, now, { requireDays: 0 });

  const buckets = buildTrendBuckets(now);
  const trend = {
    buckets: buckets.map((b) => b.label),
    week1_modules_3: buildTileSeries(buckets, organicTrials, eventsByMember, now, "week1_modules_3"),
    week1_logins_5: buildTileSeries(buckets, organicTrials, eventsByMember, now, "week1_logins_5"),
    week2_active: buildTileSeries(buckets, organicTrials, eventsByMember, now, "week2_active"),
    conversion: buildTileSeries(buckets, organicTrials, eventsByMember, now, "conversion"),
  };

  return {
    note:
      "Targets are provisional, set from early conversion data (small sample, n=4 organic converters). " +
      "Revisit as the sample grows.",
    reference_rates: REFERENCE_RATES_NOTE,
    cohort_definition:
      "Organic trials only (source=stripe_webhook), excluding internal emails and backfill rows. " +
      "Metrics are per-member from each trial start date, then aggregated for signups in the selected period — not calendar-week site totals.",
    period,
    provisional_targets: PROVISIONAL_TARGETS,
    mature_week1_trials: week1Current.total,
    mature_week2_trials: fullCurrent.week2_active.total,
    cohort_trials: fullCurrent.total,
    cohort: {
      week1_modules_3: week1Current.week1_modules_3,
      week1_logins_5: week1Current.week1_logins_5,
      week2_active: fullCurrent.week2_active,
      conversion: fullCurrent.conversion,
    },
    trend,
  };
}

module.exports = {
  PROVISIONAL_TARGETS,
  buildActivationTargetsStats,
};
