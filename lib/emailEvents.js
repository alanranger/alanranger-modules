/**
 * Helpers for writing to the academy_email_events log.
 *
 * Every automated trial / REWIND20 email send should call logEmailEvent() so
 * the admin "Emails" tab can show per-member history and conversion.
 *
 * Schema (see migration create_academy_email_events):
 *   id, member_id, email, stage_key, sent_at, status,
 *   message_id, error, subject, dry_run, created_at
 */

const STAGE_KEYS = [
  "day-minus-7",
  "day-minus-1",
  "day-plus-7",
  "day-plus-20",
  "day-plus-30",
  "day-plus-60",
];

function stageKeyForTrialReminder(daysAhead) {
  const n = Number(daysAhead);
  if (n === 7) return "day-minus-7";
  if (n === 1) return "day-minus-1";
  if (n === -7) return "day-plus-7";
  return null;
}

function stageKeyForRewind(attempt) {
  const n = Number(attempt);
  if (n === 1) return "day-plus-20";
  if (n === 2) return "day-plus-30";
  if (n === 3) return "day-plus-60";
  return null;
}

/**
 * Insert one row into academy_email_events. Never throws — logging must not
 * take down the email pipeline. Pass the already-initialised supabase client
 * from the caller so we share the service-role connection.
 *
 * @param {object} supabase
 * @param {object} opts
 * @param {string} opts.member_id
 * @param {string} opts.email
 * @param {string} opts.stage_key
 * @param {"sent"|"failed"|"skipped"} [opts.status="sent"]
 * @param {string|null} [opts.messageId]
 * @param {string|null} [opts.error]
 * @param {string|null} [opts.subject]
 * @param {boolean} [opts.dryRun=false]
 */
async function logEmailEvent(supabase, opts) {
  if (!supabase) return { logged: false, reason: "no supabase client" };
  if (!opts || !opts.member_id || !opts.email || !opts.stage_key) {
    return { logged: false, reason: "missing required fields" };
  }
  if (!STAGE_KEYS.includes(opts.stage_key)) {
    return { logged: false, reason: `unknown stage_key: ${opts.stage_key}` };
  }

  const row = {
    member_id: opts.member_id,
    email: opts.email,
    stage_key: opts.stage_key,
    status: opts.status || "sent",
    message_id: opts.messageId || null,
    error: opts.error || null,
    subject: opts.subject || null,
    dry_run: !!opts.dryRun,
  };

  try {
    const { error } = await supabase.from("academy_email_events").insert(row);
    if (error) {
      console.warn("[emailEvents] insert failed:", error.message);
      return { logged: false, reason: error.message };
    }
    return { logged: true };
  } catch (err) {
    console.warn("[emailEvents] insert threw:", err.message || err);
    return { logged: false, reason: err.message || String(err) };
  }
}

module.exports = {
  STAGE_KEYS,
  stageKeyForTrialReminder,
  stageKeyForRewind,
  logEmailEvent,
};
