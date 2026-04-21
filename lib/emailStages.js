// lib/emailStages.js
// Single source of truth describing every automated email the Academy sends
// in response to the trial / re-engagement lifecycle. Consumed by:
//   - /api/admin/email-stages            (list + single preview/test endpoints)
//   - /academy/admin/emails              (admin dashboard Emails tab)
// The actual email templates live inside each webhook. This config just
// tells the admin UI which webhooks exist, when they fire, and how to
// preview/test each one.

const TRIAL_WEBHOOK = "/api/admin/trial-expiry-reminder-webhook";
const REWIND_WEBHOOK = "/api/admin/lapsed-trial-reengagement-webhook";

// `preview`   → how to render a dry-run preview against a chosen member.
// `testSend`  → how to actually send a one-off test to a chosen member.
// Both return `{ subject, body, html }` (via webhook dry-run response) so
// the admin UI can render the email without caring which webhook owns it.
const EMAIL_STAGES = [
  {
    key: "day-minus-7",
    displayName: "Day -7 · Mid-trial reminder",
    daysFromTrialExpiry: -7,                   // i.e. 7 days before expiry
    sentBy: "trial-expiry-reminder-webhook",
    schedule: {
      cadence: "daily",
      timeOfDay: "09:00 Europe/London",
      mechanism: "Vercel Cron (08:00 + 09:00 UTC with London-hour gate)",
    },
    description:
      "Halfway through the 14-day trial. Activity block, 5-step plan, full feature list, " +
      "personal signed dashboard link.",
    preview: {
      webhook: TRIAL_WEBHOOK,
      params: { daysAhead: 7, forceDaysUntilExpiry: 7, sendEmail: "false" },
    },
    testSend: {
      webhook: TRIAL_WEBHOOK,
      params: { daysAhead: 7, forceDaysUntilExpiry: 7, sendEmail: "true" },
    },
  },
  {
    key: "day-minus-1",
    displayName: "Day -1 · Final-day reminder",
    daysFromTrialExpiry: -1,
    sentBy: "trial-expiry-reminder-webhook",
    schedule: {
      cadence: "daily",
      timeOfDay: "09:00 Europe/London",
      mechanism: "Vercel Cron (08:00 + 09:00 UTC with London-hour gate)",
    },
    description:
      "Last day of the free trial. Activity block, three quick wins, members-only " +
      "resources list, full feature list, personal signed dashboard link. No discount.",
    preview: {
      webhook: TRIAL_WEBHOOK,
      params: { daysAhead: 1, forceDaysUntilExpiry: 1, sendEmail: "false" },
    },
    testSend: {
      webhook: TRIAL_WEBHOOK,
      params: { daysAhead: 1, forceDaysUntilExpiry: 1, sendEmail: "true" },
    },
  },
  {
    key: "day-plus-7",
    displayName: "Day +7 · SAVE20 offer",
    daysFromTrialExpiry: 7,
    sentBy: "trial-expiry-reminder-webhook",
    schedule: {
      cadence: "daily",
      timeOfDay: "09:00 Europe/London",
      mechanism: "Vercel Cron (08:00 + 09:00 UTC with London-hour gate)",
    },
    description:
      "7 days after trial expiry. SAVE20 code (£79 → £59). Activity block, quick wins, " +
      "members-only resources, full feature list. Offer valid 7 days from send " +
      "(Day +7 → Day +13).",
    preview: {
      webhook: TRIAL_WEBHOOK,
      params: { daysAhead: -7, forceDaysUntilExpiry: -7, sendEmail: "false" },
    },
    testSend: {
      webhook: TRIAL_WEBHOOK,
      params: { daysAhead: -7, forceDaysUntilExpiry: -7, sendEmail: "true" },
    },
  },
  {
    key: "day-plus-20",
    displayName: "Day +20 · REWIND20 attempt 1",
    daysFromTrialExpiry: 20,
    sentBy: "lapsed-trial-reengagement-webhook",
    schedule: {
      cadence: "weekly (Zapier)",
      timeOfDay: "—",
      mechanism:
        "Currently scheduled by Zapier. Gated server-side: 3-send cap + min days + min gap.",
    },
    description:
      "First REWIND20 outreach. Activity block, three quick wins, members-only, " +
      "feature list, REWIND20 code (£79 → £59), personal signed link with 7-day window.",
    preview: {
      webhook: REWIND_WEBHOOK,
      params: { sendEmail: "false" },
    },
    testSend: {
      webhook: REWIND_WEBHOOK,
      params: { sendEmail: "true" },
    },
  },
  {
    key: "day-plus-30",
    displayName: "Day +30 · REWIND20 attempt 2",
    daysFromTrialExpiry: 30,
    sentBy: "lapsed-trial-reengagement-webhook",
    schedule: {
      cadence: "weekly (Zapier)",
      timeOfDay: "—",
      mechanism: "Fires 10+ days after attempt 1 if still not converted.",
    },
    description:
      "Second REWIND20 outreach (subject line escalates). Same body as attempt 1.",
    preview: {
      webhook: REWIND_WEBHOOK,
      params: { sendEmail: "false" },
    },
    testSend: {
      webhook: REWIND_WEBHOOK,
      params: { sendEmail: "true" },
    },
  },
  {
    key: "day-plus-60",
    displayName: "Day +60 · REWIND20 final attempt",
    daysFromTrialExpiry: 60,
    sentBy: "lapsed-trial-reengagement-webhook",
    schedule: {
      cadence: "weekly (Zapier)",
      timeOfDay: "—",
      mechanism: "Fires 30+ days after attempt 2. Final send; max 3 attempts per member.",
    },
    description:
      "Third and final REWIND20 outreach (subject line: 'Final offer'). Same body.",
    preview: {
      webhook: REWIND_WEBHOOK,
      params: { sendEmail: "false" },
    },
    testSend: {
      webhook: REWIND_WEBHOOK,
      params: { sendEmail: "true" },
    },
  },
];

function getStageByKey(key) {
  return EMAIL_STAGES.find((s) => s.key === key) || null;
}

module.exports = { EMAIL_STAGES, getStageByKey };
