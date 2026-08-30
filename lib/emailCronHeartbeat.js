/**
 * Cron run heartbeat — one row per stage per invocation, including zero-send runs.
 */

function detectTriggerSource(req) {
  const cronHeader = String(req.headers["x-vercel-cron"] || "").toLowerCase();
  if (cronHeader === "1" || cronHeader === "true") return "vercel_cron";
  // Vercel Cron always sends Authorization: Bearer CRON_SECRET. Treat that as
  // cron even when the x-vercel-cron header is absent (seen in production).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"] || "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return "vercel_cron";
  if (req.query?.testEmail || req.query?.dummyTest || req.query?.memberEmail || req.query?.forceSend) {
    return "manual";
  }
  return "batch";
}

function shouldSendTriggeredEmail({ testEmail, sendEmail, forceSend, authOk, londonHour }) {
  if (testEmail) return true;
  if (forceSend && authOk) return true;
  if (!sendEmail) return false;
  return londonHour === 9;
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
  if (authFail || hardError) return "not_firing";
  if ((sentLast7d || 0) > 0) return "verified_sending";
  if (stale) return "not_firing";
  return "healthy_idle";
}

module.exports = {
  detectTriggerSource,
  logCronRun,
  firingStateForStage,
  shouldSendTriggeredEmail,
};
