/**
 * Cron run heartbeat — one row per stage per invocation, including zero-send runs.
 */

function detectTriggerSource(req) {
  if (req.headers["x-vercel-cron"] === "1") return "vercel_cron";
  if (req.query?.testEmail || req.query?.dummyTest || req.query?.memberEmail) return "manual";
  return "batch";
}

async function logCronRun(supabase, payload) {
  if (!supabase) return null;
  const row = {
    stage_key: payload.stage_key,
    run_at: payload.run_at || new Date().toISOString(),
    webhook: payload.webhook,
    trigger_source: payload.trigger_source || "batch",
    auth_ok: payload.auth_ok === true,
    members_evaluated: payload.members_evaluated != null ? Number(payload.members_evaluated) : null,
    sent: payload.sent != null ? Number(payload.sent) : 0,
    skipped_not_eligible: payload.skipped_not_eligible != null ? Number(payload.skipped_not_eligible) : 0,
    failed: payload.failed != null ? Number(payload.failed) : 0,
    error: payload.error || null,
  };
  const { error } = await supabase.from("academy_email_cron_runs").insert(row);
  if (error) console.warn("[email-cron-heartbeat]", error.message);
  return error ? null : row;
}

function firingStateForStage({ sentLast7d, lastRun, nowMs = Date.now() }) {
  const ageMs = lastRun?.run_at ? nowMs - new Date(lastRun.run_at).getTime() : Infinity;
  const stale = !lastRun || ageMs > 48 * 3600000;
  const authFail = lastRun && lastRun.auth_ok === false;
  const hardError = lastRun && lastRun.error && !String(lastRun.error).startsWith("gate:");
  if (stale || authFail || hardError) return "not_firing";
  if ((sentLast7d || 0) > 0) return "verified_sending";
  return "healthy_idle";
}

module.exports = { detectTriggerSource, logCronRun, firingStateForStage };
