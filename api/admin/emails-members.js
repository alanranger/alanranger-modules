// api/admin/emails-members.js
//
// Returns one row per member whose trial started in the last N days
// (default 90), pivoted across all six email stages.
//
// Each row includes:
//   member_id, email, name, trial_start_at, trial_end_at, converted_at,
//   reengagement_send_count, reengagement_opted_out,
//   sends: { [stageKey]: { sent_at, status, message_id } | null } for all 6,
//   converted_within_14d_of_send: boolean (last-touch attribution)
//
// Query params:
//   days  - lookback window in days (default 90, max 365)
//   limit - page size (default 200, max 500)
//
// This endpoint only reads. No schema writes. Safe for frequent polling.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const STAGE_KEYS = [
  "day-minus-7",
  "day-minus-1",
  "day-plus-7",
  "day-plus-20",
  "day-plus-30",
  "day-plus-60",
];

const DAY_MS = 86400000;
const ATTRIBUTION_WINDOW_DAYS = 14;

function parseInt10(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readLimit(req) {
  const raw = req.query?.limit;
  const n = parseInt10(raw, 200);
  return Math.min(n, 500);
}

function readDays(req) {
  const raw = req.query?.days;
  const n = parseInt10(raw, 90);
  return Math.min(n, 365);
}

async function fetchTrialRows(sinceIso, limit) {
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select(
      "member_id, trial_start_at, trial_end_at, converted_at, reengagement_send_count, reengagement_opted_out"
    )
    .gte("trial_start_at", sinceIso)
    .order("trial_start_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`trial history: ${error.message}`);
  return data || [];
}

async function fetchMemberContacts(memberIds) {
  if (!memberIds.length) return new Map();
  const { data, error } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name")
    .in("member_id", memberIds);
  if (error) throw new Error(`ms_members_cache: ${error.message}`);
  const map = new Map();
  (data || []).forEach((r) => map.set(r.member_id, r));
  return map;
}

async function fetchSendEvents(memberIds) {
  if (!memberIds.length) return new Map();
  const { data, error } = await supabase
    .from("academy_email_events")
    .select("member_id, stage_key, sent_at, status, message_id")
    .in("member_id", memberIds)
    .eq("dry_run", false)
    .order("sent_at", { ascending: true });
  if (error) throw new Error(`academy_email_events: ${error.message}`);
  // Group by member → latest event per stage_key.
  const byMember = new Map();
  (data || []).forEach((ev) => {
    if (!byMember.has(ev.member_id)) byMember.set(ev.member_id, {});
    const perStage = byMember.get(ev.member_id);
    // Last write wins → because we sorted ascending, the most recent send
    // ends up as the stored value.
    perStage[ev.stage_key] = {
      sent_at: ev.sent_at,
      status: ev.status,
      message_id: ev.message_id,
    };
  });
  return byMember;
}

function emptySendsMap() {
  const out = {};
  STAGE_KEYS.forEach((k) => {
    out[k] = null;
  });
  return out;
}

function computeConvertedWithinWindow(convertedAt, sends) {
  if (!convertedAt) return { attributed: false, stage_key: null };
  const convertedMs = new Date(convertedAt).getTime();
  if (!Number.isFinite(convertedMs)) return { attributed: false, stage_key: null };
  const windowMs = ATTRIBUTION_WINDOW_DAYS * DAY_MS;
  // Last-touch: find the most-recent send before convertedAt and within the window.
  let best = null;
  STAGE_KEYS.forEach((k) => {
    const ev = sends[k];
    if (!ev || ev.status !== "sent") return;
    const sentMs = new Date(ev.sent_at).getTime();
    if (!Number.isFinite(sentMs)) return;
    if (sentMs > convertedMs) return;
    if (convertedMs - sentMs > windowMs) return;
    if (!best || sentMs > best.ms) best = { ms: sentMs, key: k };
  });
  if (!best) return { attributed: false, stage_key: null };
  return { attributed: true, stage_key: best.key };
}

function buildRow(trialRow, contact, sendsByMember) {
  const sendsRaw = sendsByMember.get(trialRow.member_id) || {};
  const sends = emptySendsMap();
  STAGE_KEYS.forEach((k) => {
    if (sendsRaw[k]) sends[k] = sendsRaw[k];
  });
  const attribution = computeConvertedWithinWindow(trialRow.converted_at, sends);
  return {
    member_id: trialRow.member_id,
    email: contact?.email || null,
    name: contact?.name || null,
    trial_start_at: trialRow.trial_start_at,
    trial_end_at: trialRow.trial_end_at,
    converted_at: trialRow.converted_at,
    reengagement_send_count: trialRow.reengagement_send_count || 0,
    reengagement_opted_out: !!trialRow.reengagement_opted_out,
    sends,
    converted_within_window: attribution.attributed,
    conversion_attributed_stage: attribution.stage_key,
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
    const days = readDays(req);
    const limit = readLimit(req);
    const sinceIso = new Date(Date.now() - days * DAY_MS).toISOString();

    const trialRows = await fetchTrialRows(sinceIso, limit);
    const memberIds = trialRows.map((r) => r.member_id);
    const [contacts, sendsByMember] = await Promise.all([
      fetchMemberContacts(memberIds),
      fetchSendEvents(memberIds),
    ]);
    const rows = trialRows.map((tr) =>
      buildRow(tr, contacts.get(tr.member_id), sendsByMember)
    );

    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      lookback_days: days,
      limit,
      total: rows.length,
      stage_keys: STAGE_KEYS,
      attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
      rows,
    });
  } catch (err) {
    console.error("[emails-members] unexpected failure:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
