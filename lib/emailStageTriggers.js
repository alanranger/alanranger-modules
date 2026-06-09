/**
 * State-trigger evaluation for scaffolded email stages.
 * Time windows gate WHEN we check; snapshot conditions gate WHO receives mail.
 */

const { getStageByKey } = require("./emailStages");
const { buildMemberEmailSnapshot } = require("./member-email-snapshot");

const DAY_MS = 86400000;
const REACH_BACK_DAYS = 180;

function inTrialDayWindow(snapshot, minDay, maxDay) {
  const day = snapshot.trialDayNumber;
  if (day == null) return false;
  return day >= minDay && day <= maxDay;
}

function daysSinceExpiry(snapshot, nowMs) {
  if (!snapshot.trialEndAt) return null;
  const endMs = new Date(snapshot.trialEndAt).getTime();
  if (!Number.isFinite(endMs) || endMs > nowMs) return null;
  return Math.floor((nowMs - endMs) / DAY_MS);
}

function evaluateStageTrigger(snapshot, stageKey, nowMs = Date.now()) {
  if (!snapshot) return false;
  const stage = getStageByKey(stageKey);
  if (!stage || !stage.trigger) return false;

  const t = stage.trigger;
  if (t.audience === "paid") {
    if (!snapshot.isPaid || snapshot.isActiveTrial) return false;
  } else if (snapshot.hasConverted) {
    return false;
  }
  if (t.audience === "active_trial" && !snapshot.isActiveTrial) return false;
  if (t.audience === "expired_trial" && snapshot.isActiveTrial) return false;

  if (t.minTrialDay != null || t.maxTrialDay != null) {
    if (!inTrialDayWindow(snapshot, t.minTrialDay ?? 1, t.maxTrialDay ?? 999)) return false;
  }

  if (t.minDaysSinceExpiry != null) {
    const lapsed = daysSinceExpiry(snapshot, nowMs);
    if (lapsed == null || lapsed < t.minDaysSinceExpiry) return false;
    if (t.maxDaysSinceExpiry != null && lapsed > t.maxDaysSinceExpiry) return false;
  }

  if (t.requireOptIn !== false && snapshot.reengagementOptedOut) return false;
  if (t.maxSendCount != null && snapshot.reengagementSendCount >= t.maxSendCount) return false;

  if (t.modulesOpenedEq != null && snapshot.modulesOpened !== t.modulesOpenedEq) return false;
  if (t.modulesOpenedMin != null && snapshot.modulesOpened < t.modulesOpenedMin) return false;
  if (t.minDaysSinceLastLogin != null) {
    if (snapshot.daysSinceLastLogin == null) return false;
    if (snapshot.daysSinceLastLogin < t.minDaysSinceLastLogin) return false;
    if (t.maxDaysSinceLastLogin != null && snapshot.daysSinceLastLogin > t.maxDaysSinceLastLogin) {
      return false;
    }
  }

  if (t.exactSendCount != null && snapshot.reengagementSendCount !== t.exactSendCount) return false;
  if (t.eventDriven || t.renewalWithinDays) return false;

  return true;
}

async function memberAlreadySent(supabase, memberId, stageKey) {
  const { count } = await supabase
    .from("academy_email_events")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("stage_key", stageKey)
    .eq("status", "sent")
    .eq("dry_run", false);
  return (count || 0) > 0;
}

async function fetchCandidateMemberIds(supabase, stageKey) {
  const stage = getStageByKey(stageKey);
  if (!stage || !stage.trigger) return [];
  const t = stage.trigger;
  const nowMs = Date.now();

  if (t.audience === "active_trial") {
    const { data } = await supabase
      .from("academy_trial_history")
      .select("member_id")
      .is("converted_at", null)
      .gt("trial_end_at", new Date(nowMs).toISOString());
    return (data || []).map((r) => r.member_id);
  }

  if (t.audience === "expired_trial") {
    const maxEnd = new Date(nowMs - (t.minDaysSinceExpiry || 0) * DAY_MS).toISOString();
    const minEnd = new Date(nowMs - REACH_BACK_DAYS * DAY_MS).toISOString();
    const { data } = await supabase
      .from("academy_trial_history")
      .select("member_id")
      .is("converted_at", null)
      .eq("reengagement_opted_out", false)
      .gte("trial_end_at", minEnd)
      .lte("trial_end_at", maxEnd);
    return (data || []).map((r) => r.member_id);
  }

  if (t.audience === "paid") {
    const { data } = await supabase
      .from("ms_members_cache")
      .select("member_id, plan_summary")
      .not("email", "is", null);
    return (data || [])
      .filter((r) => {
        const p = r.plan_summary || {};
        return p.plan_type === "annual" || p.plan_type === "monthly" || p.is_paid;
      })
      .map((r) => r.member_id);
  }

  return [];
}

async function countEligibleForStage(supabase, stageKey, contactable, nowMs = Date.now()) {
  const stage = getStageByKey(stageKey);
  if (!stage) return 0;
  if (stage.legacyStats) return null;

  const candidates = await fetchCandidateMemberIds(supabase, stageKey);
  let count = 0;
  for (const memberId of candidates) {
    if (!contactable.has(memberId)) continue;
    const snapshot = await buildMemberEmailSnapshot(supabase, memberId, nowMs);
    if (!snapshot || !evaluateStageTrigger(snapshot, stageKey, nowMs)) continue;
    if (await memberAlreadySent(supabase, memberId, stageKey)) continue;
    count += 1;
  }
  return count;
}

async function listEligibleMembers(supabase, stageKey, contactable, nowMs = Date.now(), limit = 200) {
  const out = [];
  const candidates = await fetchCandidateMemberIds(supabase, stageKey);
  for (const memberId of candidates) {
    if (out.length >= limit) break;
    if (!contactable.has(memberId)) continue;
    const snapshot = await buildMemberEmailSnapshot(supabase, memberId, nowMs);
    if (!snapshot || !evaluateStageTrigger(snapshot, stageKey, nowMs)) continue;
    if (await memberAlreadySent(supabase, memberId, stageKey)) continue;
    out.push({ memberId, snapshot });
  }
  return out;
}

module.exports = {
  evaluateStageTrigger,
  countEligibleForStage,
  listEligibleMembers,
  memberAlreadySent,
  inTrialDayWindow,
};
