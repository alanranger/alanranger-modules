/**
 * Trials by signup_source for Engagement tab (forward-only from tracking start).
 */

const {
  SIGNUP_SOURCE_TRACKING_FROM,
  normalizeSignupSource,
} = require("./signupSource");

const PAGE_SIZE = 1000;
const INTERNAL_EMAILS = new Set(["info@alanranger.com", "marketing@alanranger.com"]);

async function fetchAll(buildQuery) {
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((1000 * n) / d) / 10;
}

async function buildSignupSourceStats(supabase, periodSinceIso) {
  const sinceIso = periodSinceIso || `${SIGNUP_SOURCE_TRACKING_FROM}T00:00:00.000Z`;
  const trackingFrom = `${SIGNUP_SOURCE_TRACKING_FROM}T00:00:00.000Z`;
  const effectiveSince =
    new Date(sinceIso).getTime() > new Date(trackingFrom).getTime() ? sinceIso : trackingFrom;

  const trials = await fetchAll(() =>
    supabase
      .from("academy_trial_history")
      .select("member_id, trial_start_at, converted_at, source, signup_source")
      .eq("source", "stripe_webhook")
      .gte("trial_start_at", effectiveSince)
      .order("trial_start_at", { ascending: true })
  );

  const memberIds = [...new Set(trials.map((t) => t.member_id).filter(Boolean))];
  const emailMap = new Map();
  for (let i = 0; i < memberIds.length; i += 150) {
    const chunk = memberIds.slice(i, i + 150);
    const { data } = await supabase.from("ms_members_cache").select("member_id, email").in("member_id", chunk);
    (data || []).forEach((r) => emailMap.set(r.member_id, (r.email || "").toLowerCase()));
  }

  const bySource = new Map();
  let tagged = 0;
  let untagged = 0;
  for (const row of trials) {
    if (String(row.member_id || "").startsWith("mem_qa_")) continue;
    const email = emailMap.get(row.member_id) || "";
    if (INTERNAL_EMAILS.has(email)) continue;
    const key = normalizeSignupSource(row.signup_source) || "(uncaptured)";
    if (key === "(uncaptured)") untagged += 1;
    else tagged += 1;
    const bucket = bySource.get(key) || { signup_source: key, trials: 0, converted: 0 };
    bucket.trials += 1;
    if (row.converted_at) bucket.converted += 1;
    bySource.set(key, bucket);
  }

  const rows = [...bySource.values()]
    .map((b) => ({
      ...b,
      conversion_pct: pct(b.converted, b.trials),
    }))
    .sort((a, b) => b.trials - a.trials || a.signup_source.localeCompare(b.signup_source));

  return {
    tracking_from: SIGNUP_SOURCE_TRACKING_FROM,
    label: `Source tracking from ${SIGNUP_SOURCE_TRACKING_FROM} (forward-only — earlier trials have no signup_source)`,
    period_since: effectiveSince,
    tagged_trials: tagged,
    uncaptured_trials: untagged,
    rows,
  };
}

module.exports = { buildSignupSourceStats };
