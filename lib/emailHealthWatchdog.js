/**
 * Daily email-health report: classify each lifecycle stage and format info@ mail.
 * Data collection lives in the webhook; this file stays pure and testable.
 */

const WATCHDOG_STAGES = [
  { key: "trial-welcome-nudge", label: "Trial · day ~2 welcome (0 modules)" },
  { key: "trial-progress-nudge", label: "Trial · day ~2–3 progress" },
  { key: "trial-stalled", label: "Trial · day ~5 stalled" },
  { key: "day-minus-7", label: "Trial · day −7 reminder" },
  { key: "day-minus-1", label: "Trial · day −1 reminder" },
  { key: "day-plus-7", label: "Trial · day +7 SAVE20" },
  { key: "day-plus-20", label: "REWIND · day +20" },
  { key: "day-plus-30", label: "REWIND · day +30" },
  { key: "day-plus-60", label: "REWIND · day +60" },
  { key: "day-plus-90", label: "REWIND · day +90" },
  { key: "paid-quiet", label: "Paid · quiet 30–44d" },
  { key: "paid-quiet-45", label: "Paid · quiet 45–59d" },
  { key: "paid-quiet-60", label: "Paid · quiet 60–89d" },
  { key: "paid-quiet-90", label: "Paid · quiet 90d+" },
  { key: "paid-badge-earned", label: "Paid · badge earned" },
  { key: "paid-renewal-soon", label: "Paid · renewal 14d" },
];

const CRON_FRESH_MS = 48 * 3600000;

function latestUsefulCronRun(rows) {
  const list = rows || [];
  for (const r of list) {
    if (r.auth_ok === false) return r;
    if (!r.error || !String(r.error).startsWith("gate:")) return r;
  }
  return list[0] || null;
}

function cronIsFresh(lastRun, nowMs) {
  if (!lastRun || !lastRun.run_at) return false;
  return nowMs - new Date(lastRun.run_at).getTime() <= CRON_FRESH_MS;
}

function classifyWatchdogRow({
  eligible,
  loggedSent,
  gmailFound,
  gmailOk,
  lastRun,
  nowMs,
  sourceErrors,
}) {
  const errors = (sourceErrors || []).filter(Boolean);
  if (!gmailOk) errors.push("Gmail Sent");
  if (errors.length) {
    return {
      state: "unverified",
      label: "⚠ monitor could NOT verify",
      detail: `⚠ monitor could NOT verify source ${errors.join(", ")}`,
    };
  }

  if (lastRun && lastRun.auth_ok === false) {
    return {
      state: "not_firing",
      label: "🔴 NOT FIRING",
      detail: "last cron auth_ok=false",
    };
  }

  if (loggedSent !== gmailFound) {
    return {
      state: "not_firing",
      label: "🔴 NOT FIRING",
      detail: `logged ${loggedSent} sent, only ${gmailFound} found in Gmail Sent`,
    };
  }

  if (loggedSent > 0) {
    return { state: "verified", label: "✅ Verified", detail: "events + Gmail Sent agree" };
  }

  if ((eligible || 0) > 0 && lastRun && lastRun.trigger_source === "vercel_cron") {
    if (lastRun.webhook !== "lapsed-trial-reengagement-webhook") {
      return {
        state: "not_firing",
        label: "🔴 NOT FIRING",
        detail: `eligible ${eligible} but logged 0 sends after the window`,
      };
    }
  }

  if (cronIsFresh(lastRun, nowMs) && lastRun.auth_ok) {
    return {
      state: "healthy_idle",
      label: "⚪ Healthy idle",
      detail: "cron ran (auth_ok=true), nobody qualified",
    };
  }

  return {
    state: "not_firing",
    label: "🔴 NOT FIRING",
    detail: "cron did not run (no fresh auth_ok heartbeat)",
  };
}

function bannerForRows(rows) {
  const bad = rows.filter((r) => r.state === "not_firing" || r.state === "unverified");
  if (!bad.length) {
    return `✅ All clear — ${rows.length} stages healthy`;
  }
  return `⚠ ${bad.length} stages need attention: ${bad.map((r) => r.key).join(", ")}`;
}

function formatWatchdogEmail(report) {
  const banner = bannerForRows(report.rows);
  const lines = [
    banner,
    "",
    `Generated: ${report.generatedAt}`,
    report.gmailNote || "",
    "",
    "Stage | Eligible today | Logged sent (24h) | Gmail-verified | State",
    "----- | -------------- | ----------------- | -------------- | -----",
  ];
  for (const row of report.rows) {
    const gmailCell = row.gmailOk ? String(row.gmailFound) : "⚠ n/a";
    const elig = row.eligible == null ? "⚠ n/a" : String(row.eligible);
    lines.push(
      `${row.label} | ${elig} | ${row.loggedSent} | ${gmailCell} | ${row.firingLabel}`
    );
    if (row.detail) lines.push(`  → ${row.detail}`);
  }
  const subject = banner.startsWith("✅")
    ? "✅ Academy email health — all clear"
    : "⚠ Academy email health — stages need attention";
  return { subject, text: lines.join("\n") };
}

module.exports = {
  WATCHDOG_STAGES,
  latestUsefulCronRun,
  classifyWatchdogRow,
  bannerForRows,
  formatWatchdogEmail,
};
