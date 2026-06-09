// api/admin/emails-members.js
//
// Returns one row per member for the /academy/admin/emails table:
//   - trials that started in the last N days (default 90), plus
//   - any member with a logged send in that same window (so manual / win-back
//     batches appear even when trial_start_at is older than the lookback).
//
// Each row includes sends for all lifecycle stage_keys from academy_email_events.

const { createClient } = require("@supabase/supabase-js");
const { STAGE_KEYS } = require("../../lib/emailEvents");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const DAY_MS = 86400000;
const ATTRIBUTION_WINDOW_DAYS = 14;
const TRIAL_SELECT =
  "member_id, trial_start_at, trial_end_at, converted_at, reengagement_send_count, reengagement_opted_out";

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

async function fetchPagedRows(buildQuery) {
  const rows = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function fetchRecentSendMemberIds(sinceIso) {
  const data = await fetchPagedRows((from, to) =>
    supabase
      .from("academy_email_events")
      .select("member_id")
      .gte("sent_at", sinceIso)
      .eq("dry_run", false)
      .eq("status", "sent")
      .order("sent_at", { ascending: true })
      .range(from, to)
  );
  return [...new Set(data.map((r) => r.member_id).filter(Boolean))];
}

async function fetchTrialRows(sinceIso, limit) {
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select(TRIAL_SELECT)
    .gte("trial_start_at", sinceIso)
    .order("trial_start_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`trial history: ${error.message}`);
  return data || [];
}

async function fetchTrialRowsByMemberIds(memberIds) {
  if (!memberIds.length) return [];
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select(TRIAL_SELECT)
    .in("member_id", memberIds);
  if (error) throw new Error(`trial history (by member): ${error.message}`);
  return data || [];
}

function mergeTrialRows(primaryRows, extraRows) {
  const byMember = new Map();
  (primaryRows || []).forEach((row) => byMember.set(row.member_id, row));
  (extraRows || []).forEach((row) => {
    if (!byMember.has(row.member_id)) byMember.set(row.member_id, row);
  });
  return Array.from(byMember.values()).sort(
    (a, b) => new Date(b.trial_start_at).getTime() - new Date(a.trial_start_at).getTime()
  );
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
  const chunkSize = 100;
  const byMember = new Map();
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const data = await fetchPagedRows((from, to) =>
      supabase
        .from("academy_email_events")
        .select("member_id, stage_key, sent_at, status, message_id")
        .in("member_id", chunk)
        .eq("dry_run", false)
        .order("sent_at", { ascending: true })
        .range(from, to)
    );
    data.forEach((ev) => {
      if (!STAGE_KEYS.includes(ev.stage_key)) return;
      if (!byMember.has(ev.member_id)) byMember.set(ev.member_id, {});
      const perStage = byMember.get(ev.member_id);
      perStage[ev.stage_key] = {
        sent_at: ev.sent_at,
        status: ev.status,
        message_id: ev.message_id,
      };
    });
  }
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

    const [primaryTrials, recentSendMemberIds] = await Promise.all([
      fetchTrialRows(sinceIso, limit),
      fetchRecentSendMemberIds(sinceIso),
    ]);
    const primaryIds = new Set(primaryTrials.map((r) => r.member_id));
    const extraIds = recentSendMemberIds.filter((id) => !primaryIds.has(id));
    const extraTrials = extraIds.length ? await fetchTrialRowsByMemberIds(extraIds) : [];
    const trialRows = mergeTrialRows(primaryTrials, extraTrials).slice(0, limit);

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
      includes_recent_sends: true,
      rows,
    });
  } catch (err) {
    console.error("[emails-members] unexpected failure:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
