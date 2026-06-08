/**
 * Europe/London calendar-day helpers for trial-phase email triggers.
 * Matches the 09:00 London send gate used by trial-expiry-reminder-webhook.
 */

const DAY_MS = 86400000;

function londonDateKey(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function londonTrialDayNumber(trialStartAt, nowMs) {
  const startMs = new Date(trialStartAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  let day = 0;
  let cursor = startMs;
  const targetKey = londonDateKey(nowMs);
  while (day < 400) {
    day += 1;
    if (londonDateKey(cursor) === targetKey) return day;
    cursor += DAY_MS;
  }
  return null;
}

function londonHour(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const hourPart = parts.find((p) => p.type === "hour");
  return parseInt(hourPart ? hourPart.value : "0", 10);
}

module.exports = {
  DAY_MS,
  londonDateKey,
  londonTrialDayNumber,
  londonHour,
};
