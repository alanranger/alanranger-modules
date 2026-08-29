/**
 * Marketing signup attribution (?src= + optional UTMs).
 * signup_source is separate from academy_trial_history.source (stripe_webhook vs backfill).
 */

const SIGNUP_SOURCE_TRACKING_FROM = "2026-08-29";
const MAX_SRC_LEN = 64;
const SRC_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function normalizeSignupSource(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().slice(0, MAX_SRC_LEN);
  if (!s || s === "null" || s === "undefined") return null;
  if (!SRC_RE.test(s)) return null;
  return s;
}

function normalizeUtm(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().slice(0, 128);
  return s || null;
}

function extractSignupSourceFromStripeObject(obj) {
  const md = obj?.metadata || {};
  return (
    normalizeSignupSource(md.signup_source) ||
    normalizeSignupSource(md.src) ||
    normalizeSignupSource(md.utm_source) ||
    null
  );
}

async function storeSignupAttribution(supabase, payload) {
  const memberId = String(payload.member_id || "").trim();
  const signupSource = normalizeSignupSource(payload.signup_source);
  if (!memberId || !memberId.startsWith("mem_") || !signupSource) {
    return { ok: false, reason: "invalid" };
  }
  const row = {
    member_id: memberId,
    signup_source: signupSource,
    utm_source: normalizeUtm(payload.utm_source),
    utm_medium: normalizeUtm(payload.utm_medium),
    utm_campaign: normalizeUtm(payload.utm_campaign),
    landing_path: normalizeUtm(payload.landing_path),
    captured_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase
    .from("academy_signup_attribution")
    .select("member_id, signup_source")
    .eq("member_id", memberId)
    .maybeSingle();
  if (existing?.signup_source) {
    await applyAttributionToLatestTrial(supabase, memberId, existing.signup_source);
    return { ok: true, signup_source: existing.signup_source, first_touch: true };
  }
  const { error } = await supabase.from("academy_signup_attribution").upsert(row, {
    onConflict: "member_id",
  });
  if (error) return { ok: false, reason: error.message };
  await applyAttributionToLatestTrial(supabase, memberId, signupSource);
  return { ok: true, signup_source: signupSource, first_touch: false };
}

async function applyAttributionToLatestTrial(supabase, memberId, signupSource) {
  const src = normalizeSignupSource(signupSource);
  if (!src) return;
  const { data: trial } = await supabase
    .from("academy_trial_history")
    .select("id, signup_source")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trial || trial.signup_source) return;
  await supabase
    .from("academy_trial_history")
    .update({ signup_source: src, updated_at: new Date().toISOString() })
    .eq("id", trial.id)
    .is("signup_source", null);
  await supabase
    .from("academy_signup_attribution")
    .update({ applied_at: new Date().toISOString() })
    .eq("member_id", memberId);
}

async function lookupPendingSignupSource(supabase, memberId) {
  if (!memberId) return null;
  const { data } = await supabase
    .from("academy_signup_attribution")
    .select("signup_source")
    .eq("member_id", memberId)
    .maybeSingle();
  return normalizeSignupSource(data?.signup_source);
}

module.exports = {
  SIGNUP_SOURCE_TRACKING_FROM,
  normalizeSignupSource,
  normalizeUtm,
  extractSignupSourceFromStripeObject,
  storeSignupAttribution,
  applyAttributionToLatestTrial,
  lookupPendingSignupSource,
};
