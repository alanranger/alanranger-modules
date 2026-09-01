// lib/emailScheduleAudit.js
// Cross-check emailStages.js against vercel.json so "LIVE · cron on" cannot lie.

const { EMAIL_STAGES } = require("./emailStages");

/** Webhooks that must appear in vercel.json for cronEnabled stages to fire. */
const REQUIRED_CRON_PATHS = {
  "trial-expiry-reminder-webhook": [
    "/api/admin/trial-expiry-reminder-webhook?daysAhead=7&sendEmail=true",
    "/api/admin/trial-expiry-reminder-webhook?daysAhead=1&sendEmail=true",
    "/api/admin/trial-expiry-reminder-webhook?daysAhead=-7&sendEmail=true",
  ],
  "triggered-email-webhook": [
    "/api/admin/triggered-email-webhook?stage=all&sendEmail=true",
  ],
  "lapsed-trial-reengagement-webhook": [
    "/api/admin/lapsed-trial-reengagement-webhook?sendEmail=true",
  ],
};

function cronPathsFromVercelJson(vercelJson) {
  return (vercelJson?.crons || []).map((c) => c.path).filter(Boolean);
}

function missingCronPaths(vercelJson) {
  const configured = new Set(cronPathsFromVercelJson(vercelJson));
  const missing = [];
  for (const paths of Object.values(REQUIRED_CRON_PATHS)) {
    for (const p of paths) {
      if (!configured.has(p)) missing.push(p);
    }
  }
  return missing;
}

function isStageScheduledOnVercel(stage) {
  if (!stage?.cronEnabled || stage.sentBy === "manual" || stage.deprecated) return false;
  const required = REQUIRED_CRON_PATHS[stage.sentBy];
  return Boolean(required?.length);
}

function auditStageSchedule(stage, vercelJson) {
  if (!stage.cronEnabled || stage.sentBy === "manual" || stage.deprecated) {
    return { scheduled: false, reason: stage.deprecated ? "deprecated" : "manual_or_cron_disabled" };
  }
  const required = REQUIRED_CRON_PATHS[stage.sentBy] || [];
  const configured = new Set(cronPathsFromVercelJson(vercelJson));
  const missing = required.filter((p) => !configured.has(p));
  if (missing.length) {
    return { scheduled: false, reason: "missing_vercel_cron", missing };
  }
  return { scheduled: true, reason: "ok" };
}

function auditAllStages(vercelJson) {
  return EMAIL_STAGES.map((stage) => ({
    key: stage.key,
    displayName: stage.displayName,
    sentBy: stage.sentBy,
    cronEnabled: stage.cronEnabled,
    ...auditStageSchedule(stage, vercelJson),
  }));
}

function unscheduledCronEnabledStages(vercelJson) {
  return auditAllStages(vercelJson).filter((s) => s.cronEnabled && !s.scheduled && s.sentBy !== "manual");
}

module.exports = {
  REQUIRED_CRON_PATHS,
  cronPathsFromVercelJson,
  missingCronPaths,
  isStageScheduledOnVercel,
  auditStageSchedule,
  auditAllStages,
  unscheduledCronEnabledStages,
};
