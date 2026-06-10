// /api/admin/qa-seed-trial.js
//
// Test-only endpoint that seeds or removes a scratch row in
// academy_trial_history so the SAVE20 grace-window regression test
// (scripts/test-coupon-window.js) can verify /api/academy/trial-status
// and /api/stripe/create-upgrade-checkout against known trial states
// without needing Supabase credentials on the developer's machine.
//
// Protected by AR_ANALYTICS_KEY (header x-ar-analytics-key or ?key=).
// Only accepts synthetic member ids (prefix "mem_qa_") so real member
// history can never be touched through this endpoint even if the key
// leaks.
//
// POST /api/admin/qa-seed-trial
//   body: { memberId, offsetDays=0, converted=false, trialLengthDays=14 }
//   → upserts a trial row with trial_end_at = now + offsetDays * 1 day
//     (negative offsets for expired trials).
//
// DELETE /api/admin/qa-seed-trial?memberId=mem_qa_...
//   → removes all trial rows for that scratch member.
"use strict";

const { createClient } = require("@supabase/supabase-js");

const DAY_MS = 86400000;
const SCRATCH_PREFIX = "mem_qa_";

function isAuthorized(req) {
  const expected = process.env.AR_ANALYTICS_KEY;
  if (!expected) return false;
  const supplied = req.headers["x-ar-analytics-key"] || req.query?.key;
  return Boolean(supplied) && supplied === expected;
}

function isScratchId(id) {
  return typeof id === "string" && id.startsWith(SCRATCH_PREFIX);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function seedRow(supabase, params) {
  const { memberId, offsetDays, converted, trialLengthDays } = params;
  const now = Date.now();
  const endAt = new Date(now + offsetDays * DAY_MS).toISOString();
  const startAt = new Date(now + offsetDays * DAY_MS - trialLengthDays * DAY_MS).toISOString();
  const row = {
    member_id: memberId,
    trial_start_at: startAt,
    trial_end_at: endAt,
    trial_length_days: trialLengthDays,
    source: "qa_coupon_window_test",
    converted_at: converted ? new Date().toISOString() : null,
  };
  // Clear prior rows so "latest by start_at" returns exactly this row.
  await supabase.from("academy_trial_history").delete().eq("member_id", memberId);
  const { error } = await supabase
    .from("academy_trial_history")
    .upsert(row, { onConflict: "member_id,trial_start_at" });
  if (error) throw error;
  return { startAt, endAt, converted: Boolean(converted), trialLengthDays };
}

async function deleteRows(supabase, memberId) {
  const { error } = await supabase.from("academy_trial_history").delete().eq("member_id", memberId);
  if (error) throw error;
}

function readMemberId(req, body) {
  return body.memberId || req.query?.memberId || null;
}

async function handlePost(req, res, supabase) {
  const body = parseBody(req);
  const memberId = readMemberId(req, body);
  if (!isScratchId(memberId)) {
    return res.status(400).json({ error: "memberId must start with 'mem_qa_'" });
  }
  const offsetDays = Number.isFinite(body.offsetDays) ? Number(body.offsetDays) : 0;
  const converted = Boolean(body.converted);
  const trialLengthDays = Number.isFinite(body.trialLengthDays) ? Number(body.trialLengthDays) : 14;
  const seeded = await seedRow(supabase, { memberId, offsetDays, converted, trialLengthDays });
  return res.status(200).json({ ok: true, memberId, ...seeded });
}

async function handleDelete(req, res, supabase) {
  const body = parseBody(req);
  const memberId = readMemberId(req, body);
  if (!isScratchId(memberId)) {
    return res.status(400).json({ error: "memberId must start with 'mem_qa_'" });
  }
  await deleteRows(supabase, memberId);
  return res.status(200).json({ ok: true, memberId, deleted: true });
}

async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const supabase = getSupabase();
    if (req.method === "POST") return handlePost(req, res, supabase);
    if (req.method === "DELETE") return handleDelete(req, res, supabase);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[qa-seed-trial] error:", err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
