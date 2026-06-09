// Synthesizes academy_email_schedules-shaped rows from lib/emailStages.js when DB has no row.
const {
  getStageByKey,
  TRIGGER_WEBHOOK,
  TRIAL_WEBHOOK,
  REWIND_WEBHOOK,
} = require("./emailStages");

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const WEBHOOK_BY_SENDER = {
  "triggered-email-webhook": TRIGGER_WEBHOOK,
  "trial-expiry-reminder-webhook": TRIAL_WEBHOOK,
  "lapsed-trial-reengagement-webhook": REWIND_WEBHOOK,
};

function synthesizeScheduleRow(stageKey) {
  const stage = getStageByKey(stageKey);
  if (!stage?.schedule || stage.schedule.timeOfDay !== "09:00 Europe/London") return null;
  return {
    enabled: stage.cronEnabled === true,
    days_offset: stage.daysFromTrialExpiry ?? null,
    send_hour_london: 9,
    send_days: ALL_DAYS,
    stage_type: stage.trigger ? "trigger" : "timer",
    webhook_path: WEBHOOK_BY_SENDER[stage.sentBy] || null,
    synthesized: true,
  };
}

module.exports = { synthesizeScheduleRow };
