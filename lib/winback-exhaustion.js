/**
 * Terminal state after day-plus-90 — excludes members from future win-backs / catch-up blasts.
 */

const WINBACK_TERMINAL_SEND_COUNT = 4;

async function memberHasDayPlus90Sent(supabase, memberId) {
  const { count } = await supabase
    .from("academy_email_events")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("stage_key", "day-plus-90")
    .eq("status", "sent")
    .eq("dry_run", false);
  return (count || 0) > 0;
}

async function isWinbackExhausted(supabase, memberId, sendCount, optedOut) {
  if (optedOut) return true;
  if ((sendCount || 0) >= WINBACK_TERMINAL_SEND_COUNT) return true;
  return memberHasDayPlus90Sent(supabase, memberId);
}

async function markWinbackExhausted(supabase, memberId) {
  if (!supabase || !memberId) return { ok: false };
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("academy_trial_history")
    .update({
      reengagement_send_count: WINBACK_TERMINAL_SEND_COUNT,
      reengagement_last_sent_at: nowIso,
    })
    .eq("member_id", memberId);
  if (error) {
    console.warn("[winback-exhaustion] stamp failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, sendCount: WINBACK_TERMINAL_SEND_COUNT };
}

module.exports = {
  WINBACK_TERMINAL_SEND_COUNT,
  isWinbackExhausted,
  markWinbackExhausted,
  memberHasDayPlus90Sent,
};
