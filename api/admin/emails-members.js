// api/admin/emails-members.js — rewritten member row builder for send-truth dashboard.

const { createClient } = require("@supabase/supabase-js");
const { STAGE_KEYS, MANUAL_SEND_SOURCES } = require("../../lib/emailEvents");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const DAY_MS = 86400000;
const ATTRIBUTION_WINDOW_DAYS = 14;
const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 2000;
const TRIAL_SELECT =
  "member_id, trial_start_at, trial_end_at, converted_at, reengagement_send_count, reengagement_opted_out, reengagement_sent_at, reengagement_last_sent_at";

function parseInt10(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readLimit(req) {
  return Math.min(parseInt10(req.query?.limit, DEFAULT_LIMIT), MAX_LIMIT);
}

function readDays(req) {
  const raw = String(req.query?.days ?? "all").trim().toLowerCase();
  if (raw === "all" || raw === "0") return null;
  return Math.min(parseInt10(req.query?.days, 365), 3650);
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
  const data = await fetchPagedRows((from, to) => {
    let q = supabase
      .from("academy_email_events")
      .select("member_id")
      .eq("dry_run", false)
      .eq("status", "sent")
      .order("sent_at", { ascending: true })
      .range(from, to);
    if (sinceIso) q = q.gte("sent_at", sinceIso);
    return q;
  });
  return [...new Set(data.map((r) => r.member_id).filter(Boolean))];
}

async function fetchTrialRows(sinceIso) {
  return fetchPagedRows((from, to) => {
    let q = supabase
      .from("academy_trial_history")
      .select(TRIAL_SELECT)
      .order("trial_start_at", { ascending: false })
      .range(from, to);
    if (sinceIso) q = q.gte("trial_start_at", sinceIso);
    return q;
  });
}

async function fetchTrialRowsByMemberIds(memberIds) {
  if (!memberIds.length) return [];
  const chunkSize = 100;
  const rows = [];
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("academy_trial_history")
      .select(TRIAL_SELECT)
      .in("member_id", chunk);
    if (error) throw new Error(`trial history (by member): ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

function stubTrialRow(memberId) {
  return {
    member_id: memberId,
    trial_start_at: null,
    trial_end_at: null,
    converted_at: null,
    reengagement_send_count: 0,
    reengagement_opted_out: false,
    reengagement_sent_at: null,
    reengagement_last_sent_at: null,
  };
}

function buildMemberTrialRows(sinceIso, limit, recentSendMemberIds, primaryTrials) {
  const byMember = new Map();
  primaryTrials.forEach((row) => byMember.set(row.member_id, row));
  const missingIds = recentSendMemberIds.filter((id) => !byMember.has(id));
  return { byMember, missingIds };
}

function sortMemberRows(rows, recentSendSet) {
  return rows.sort((a, b) => {
    const aRecent = recentSendSet.has(a.member_id) ? 1 : 0;
    const bRecent = recentSendSet.has(b.member_id) ? 1 : 0;
    if (aRecent !== bRecent) return bRecent - aRecent;
    const aMs = a.trial_start_at ? new Date(a.trial_start_at).getTime() : 0;
    const bMs = b.trial_start_at ? new Date(b.trial_start_at).getTime() : 0;
    return bMs - aMs;
  });
}

async function fetchMemberContacts(memberIds) {
  if (!memberIds.length) return new Map();
  const chunkSize = 100;
  const map = new Map();
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("ms_members_cache")
      .select("member_id, email, name")
      .in("member_id", chunk);
    if (error) throw new Error(`ms_members_cache: ${error.message}`);
    (data || []).forEach((r) => map.set(r.member_id, r));
  }
  return map;
}

function isManualSource(source, eventDetail) {
  return MANUAL_SEND_SOURCES.includes(source) || eventDetail === "corrected_resend_2026-06-09";
}

async function fetchSendEvents(memberIds) {
  if (!memberIds.length) return { byMember: new Map(), manualLastByMember: new Map() };
  const chunkSize = 100;
  const byMember = new Map();
  const manualLastByMember = new Map();
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const data = await fetchPagedRows((from, to) =>
      supabase
        .from("academy_email_events")
        .select("member_id, stage_key, sent_at, status, message_id, send_source, event_detail")
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
        send_source: ev.send_source || "automated",
        event_detail: ev.event_detail || null,
        inferred: false,
      };
      if (isManualSource(ev.send_source, ev.event_detail) && ev.status === "sent") {
        const ms = new Date(ev.sent_at).getTime();
        const prev = manualLastByMember.get(ev.member_id);
        if (!prev || ms > prev.ms) {
          manualLastByMember.set(ev.member_id, {
            ms,
            sent_at: ev.sent_at,
            stage_key: ev.stage_key,
            send_source: ev.send_source,
          });
        }
      }
    });
  }
  return { byMember, manualLastByMember };
}

function inferSendsFromTrialHistory(trialRow) {
  const count = trialRow.reengagement_send_count || 0;
  if (count < 1) return {};
  const first = trialRow.reengagement_sent_at;
  const last = trialRow.reengagement_last_sent_at;
  const mk = (sent_at) => ({
    sent_at,
    status: "sent",
    message_id: null,
    send_source: "automated",
    inferred: true,
  });
  const out = {};
  if (first) out["day-plus-20"] = mk(first);
  if (count >= 2 && last) out["day-plus-30"] = mk(last);
  if (count >= 3 && last) out["day-plus-60"] = mk(last);
  return out;
}

function emptySendsMap() {
  const out = {};
  STAGE_KEYS.forEach((k) => {
    out[k] = null;
  });
  return out;
}

function mergeLoggedAndInferred(logged, inferred) {
  const sends = emptySendsMap();
  STAGE_KEYS.forEach((k) => {
    sends[k] = logged[k] || inferred[k] || null;
  });
  return sends;
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

function buildRow(trialRow, contact, sendsByMember, manualLastByMember) {
  const logged = sendsByMember.get(trialRow.member_id) || {};
  const inferred = inferSendsFromTrialHistory(trialRow);
  const sends = mergeLoggedAndInferred(logged, inferred);
  const attribution = computeConvertedWithinWindow(trialRow.converted_at, sends);
  const manualLast = manualLastByMember.get(trialRow.member_id) || null;
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
    manual_last_sent: manualLast
      ? {
          sent_at: manualLast.sent_at,
          stage_key: manualLast.stage_key,
          send_source: manualLast.send_source,
        }
      : null,
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
    const sinceIso = days == null ? null : new Date(Date.now() - days * DAY_MS).toISOString();

    const [primaryTrials, recentSendMemberIds] = await Promise.all([
      fetchTrialRows(sinceIso),
      fetchRecentSendMemberIds(sinceIso),
    ]);
    const { byMember, missingIds } = buildMemberTrialRows(
      sinceIso,
      limit,
      recentSendMemberIds,
      primaryTrials
    );
    const extraTrials = missingIds.length ? await fetchTrialRowsByMemberIds(missingIds) : [];
    extraTrials.forEach((row) => byMember.set(row.member_id, row));
    missingIds.forEach((id) => {
      if (!byMember.has(id)) byMember.set(id, stubTrialRow(id));
    });

    const recentSendSet = new Set(recentSendMemberIds);
    const trialRows = sortMemberRows([...byMember.values()], recentSendSet).slice(0, limit);
    const memberIds = trialRows.map((r) => r.member_id);
    const [contacts, sendMaps] = await Promise.all([
      fetchMemberContacts(memberIds),
      fetchSendEvents(memberIds),
    ]);
    const rows = trialRows.map((tr) =>
      buildRow(tr, contacts.get(tr.member_id), sendMaps.byMember, sendMaps.manualLastByMember)
    );

    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      lookback_days: days,
      lookback_all: days == null,
      limit,
      total: rows.length,
      stage_keys: STAGE_KEYS,
      attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
      includes_recent_sends: true,
      prioritizes_send_recipients: true,
      rows,
    });
  } catch (err) {
    console.error("[emails-members] unexpected failure:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
