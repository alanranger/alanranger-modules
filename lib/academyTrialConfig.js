// lib/academyTrialConfig.js
// Single source of truth for trial duration. Reads from the public.academy_config
// table in Supabase so changes don't require a redeploy.
//
// Keys used:
//   current_trial_length_days  -> integer, duration (days) applied to NEW trials.
//   trial_length_cutover_iso   -> ISO timestamp. Trials that started BEFORE this
//                                 date use the legacy length (30), trials on/after
//                                 use the current length.
//
// All lookups are cached in-memory for 5 minutes so we don't hammer Supabase on
// high-traffic endpoints (e.g. the webhook).

const { createClient } = require("@supabase/supabase-js");

const CACHE_TTL_MS = 5 * 60 * 1000;
const LEGACY_TRIAL_LENGTH_DAYS = 30;
const FALLBACK_CURRENT_TRIAL_LENGTH_DAYS = 14;
const FALLBACK_CUTOVER_ISO = "2026-04-20T00:00:00Z";

let cachedConfig = null;
let cachedAt = 0;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function fallbackConfig() {
  return {
    currentTrialLengthDays: FALLBACK_CURRENT_TRIAL_LENGTH_DAYS,
    legacyTrialLengthDays: LEGACY_TRIAL_LENGTH_DAYS,
    cutoverIso: FALLBACK_CUTOVER_ISO,
    source: "fallback",
  };
}

function parseRows(rows) {
  const byKey = new Map();
  (rows || []).forEach(row => byKey.set(row.key, row));
  const currentRow = byKey.get("current_trial_length_days");
  const cutoverRow = byKey.get("trial_length_cutover_iso");
  const currentTrialLengthDays =
    Number.isInteger(currentRow?.value_int) && currentRow.value_int > 0
      ? currentRow.value_int
      : FALLBACK_CURRENT_TRIAL_LENGTH_DAYS;
  const cutoverIso = cutoverRow?.value_text || FALLBACK_CUTOVER_ISO;
  return {
    currentTrialLengthDays,
    legacyTrialLengthDays: LEGACY_TRIAL_LENGTH_DAYS,
    cutoverIso,
    source: "supabase",
  };
}

async function getTrialConfig({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("academy_config")
      .select("key, value_int, value_text")
      .in("key", ["current_trial_length_days", "trial_length_cutover_iso"]);
    if (error) throw error;
    cachedConfig = parseRows(data);
  } catch (err) {
    console.warn("[academyTrialConfig] Falling back to defaults:", err.message);
    cachedConfig = fallbackConfig();
  }
  cachedAt = now;
  return cachedConfig;
}

/**
 * Synchronous helper: choose the trial length that applies to a given start
 * date, using a config object you've already loaded with getTrialConfig().
 * Used for backfills and fallbacks where we know the start date but don't
 * have a recorded length.
 */
function trialLengthForStart(startDate, config) {
  if (!config) throw new Error("trialLengthForStart requires a loaded config object");
  if (!startDate) return config.currentTrialLengthDays;
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  if (isNaN(start.getTime())) return config.currentTrialLengthDays;
  const cutover = new Date(config.cutoverIso);
  return start < cutover ? config.legacyTrialLengthDays : config.currentTrialLengthDays;
}

function addDays(date, days) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function invalidateTrialConfigCache() {
  cachedConfig = null;
  cachedAt = 0;
}

module.exports = {
  LEGACY_TRIAL_LENGTH_DAYS,
  FALLBACK_CURRENT_TRIAL_LENGTH_DAYS,
  FALLBACK_CUTOVER_ISO,
  getTrialConfig,
  trialLengthForStart,
  addDays,
  invalidateTrialConfigCache,
};
