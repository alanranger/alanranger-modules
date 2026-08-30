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
      label: "🔴 NOT DELIVERED",
      detail: `Gmail-verified log ${loggedSent}, Sent mailbox shows ${gmailFound} — phantom or IMAP miss`,
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

  // No run row at all is a different problem from a run row that has gone
  // stale, and saying "cron did not run" for a stage that has never once run
  // sends you looking for a broken schedule instead of a missing one.
  if (!lastRun) {
    return {
      state: "not_firing",
      label: "🔴 NOT FIRING",
      detail: "no heartbeat yet — this stage has never logged a cron run",
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

// Outlook ignores <style> blocks and most modern CSS, so the HTML mail is a
// plain table with inline styles only. No flexbox/grid.
const STATE_COLOURS = {
  verified: { bg: "#e8f5e9", fg: "#1b5e20" },
  healthy_idle: { bg: "#f4f4f4", fg: "#424242" },
  not_firing: { bg: "#fdecea", fg: "#b71c1c" },
  unverified: { bg: "#fff8e1", fg: "#e65100" },
};

const CELL = "padding:7px 10px;border-bottom:1px solid #e0e0e0;font-size:13px;vertical-align:top";
const CELL_NUM = `${CELL};text-align:right;white-space:nowrap`;
const HEAD = "padding:8px 10px;border-bottom:2px solid #bdbdbd;font-size:12px;text-align:left;color:#424242;text-transform:uppercase;letter-spacing:.4px";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function gmailCellFor(row) {
  return row.gmailOk ? String(row.gmailFound) : "⚠ n/a";
}

function eligibleCellFor(row) {
  return row.eligible == null ? "⚠ n/a" : String(row.eligible);
}

function watchdogHtmlRow(row) {
  const colour = STATE_COLOURS[row.state] || STATE_COLOURS.unverified;
  const detail = row.detail
    ? `<div style="font-size:11px;color:#5f5f5f;margin-top:3px">${escapeHtml(row.detail)}</div>`
    : "";
  return [
    "<tr>",
    `<td style="${CELL}">${escapeHtml(row.label)}</td>`,
    `<td style="${CELL_NUM}">${escapeHtml(eligibleCellFor(row))}</td>`,
    `<td style="${CELL_NUM}">${escapeHtml(String(row.loggedSent))}</td>`,
    `<td style="${CELL_NUM}">${escapeHtml(gmailCellFor(row))}</td>`,
    `<td style="${CELL};background:${colour.bg};color:${colour.fg}">`,
    `<strong>${escapeHtml(row.firingLabel)}</strong>${detail}`,
    "</td>",
    "</tr>",
  ].join("");
}

function watchdogHtml(report, banner) {
  const bad = report.rows.filter((r) => r.state === "not_firing" || r.state === "unverified");
  const bannerColour = bad.length ? STATE_COLOURS.not_firing : STATE_COLOURS.verified;
  return [
    '<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#212121;max-width:860px">',
    `<div style="padding:11px 14px;border-radius:4px;background:${bannerColour.bg};color:${bannerColour.fg};font-size:15px;font-weight:600">`,
    escapeHtml(banner),
    "</div>",
    `<p style="font-size:12px;color:#5f5f5f;margin:12px 0 2px">Generated: ${escapeHtml(report.generatedAt)}</p>`,
    `<p style="font-size:12px;color:#5f5f5f;margin:0 0 14px">${escapeHtml(report.gmailNote || "")}</p>`,
    '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%">',
    "<thead><tr>",
    `<th style="${HEAD}">Stage</th>`,
    `<th style="${HEAD};text-align:right">Eligible today</th>`,
    `<th style="${HEAD};text-align:right">Gmail-verified log (24h)</th>`,
    `<th style="${HEAD};text-align:right">In Gmail Sent (24h)</th>`,
    `<th style="${HEAD}">State</th>`,
    "</tr></thead><tbody>",
    report.rows.map(watchdogHtmlRow).join(""),
    "</tbody></table>",
    '<p style="font-size:11px;color:#8a8a8a;margin:14px 0 0">',
    "This email always sends, healthy or not — its absence is itself the alert.",
    "</p>",
    "</div>",
  ].join("");
}

function formatWatchdogEmail(report) {
  const banner = bannerForRows(report.rows);
  const lines = [
    banner,
    "",
    `Generated: ${report.generatedAt}`,
    report.gmailNote || "",
    "",
    "Stage | Eligible today | Gmail-verified log (24h) | In Gmail Sent (24h) | State",
    "----- | -------------- | ------------------------ | ------------------- | -----",
  ];
  for (const row of report.rows) {
    lines.push(
      `${row.label} | ${eligibleCellFor(row)} | ${row.loggedSent} | ${gmailCellFor(row)} | ${row.firingLabel}`
    );
    if (row.detail) lines.push(`  → ${row.detail}`);
  }
  const subject = banner.startsWith("✅")
    ? "✅ Academy email health — all clear"
    : "⚠ Academy email health — stages need attention";
  // text is kept as the multipart fallback; clients that block HTML still get
  // a readable report.
  return { subject, text: lines.join("\n"), html: watchdogHtml(report, banner) };
}

module.exports = {
  WATCHDOG_STAGES,
  latestUsefulCronRun,
  classifyWatchdogRow,
  bannerForRows,
  formatWatchdogEmail,
  escapeHtml,
};
