// lib/stageScheduleUi.js — build-time cross-check for admin email tiles.
const vercelJson = require("../vercel.json");
const { auditAllStages } = require("./emailScheduleAudit");

const STAGE_SCHEDULE_AUDIT = Object.fromEntries(
  auditAllStages(vercelJson).map((s) => [s.key, s])
);

function stageCronScheduled(key) {
  return STAGE_SCHEDULE_AUDIT[key]?.scheduled === true;
}

module.exports = { STAGE_SCHEDULE_AUDIT, stageCronScheduled };
