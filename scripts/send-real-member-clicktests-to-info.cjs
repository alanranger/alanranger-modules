/**
 * Send full conversion emails signed for REAL lapsed members — delivered to info@ only.
 * Clients are NOT emailed. Alan clicks the upgrade button in a real browser.
 *
 * Usage: node scripts/send-real-member-clicktests-to-info.cjs [limit=5]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");
const { decodeReengageTokenPayload } = require("../lib/reengage-link");
const { htmlFromMarkdown, plainTextFromMarkdown } = require("../lib/emailHtml");

const LIMIT = Math.min(parseInt(process.argv[2] || "5", 10) || 5, 5);
const EXCLUDE_EMAIL = "info@alanranger.com";
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/REAL-MEMBER-CLICKTESTS-TO-INFO-LATEST.json";

const STAGES = [
  {
    stage: "day-plus-7",
    coupon: "SAVE20",
    fetchPreview: (secret, email) =>
      `${API_BASE}/api/admin/trial-expiry-reminder-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(email)}&forceDaysUntilExpiry=-7&sendEmail=false`,
    pickUpgradeUrl: (body) => body.upgrade_url || body.result?.upgrade_url,
    pickPreview: (body) => body.preview || body.result?.preview,
  },
  {
    stage: "day-plus-20",
    coupon: "REWIND20",
    fetchPreview: (secret, email) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(email)}&forceAttempt=1&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-30",
    coupon: "REWIND20",
    fetchPreview: (secret, email) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(email)}&forceAttempt=2&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-60",
    coupon: "REWIND20",
    fetchPreview: (secret, email) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(email)}&forceAttempt=3&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-90",
    coupon: "REWIND20",
    fetchPreview: (secret, email) =>
      `${API_BASE}/api/admin/triggered-email-webhook?secret=${encodeURIComponent(secret)}&stageKey=day-plus-90&testEmail=${encodeURIComponent(email)}&sendEmail=false`,
    pickUpgradeUrl: (body) => {
      if (body.result?.upgrade_url) return body.result.upgrade_url;
      const fromBody = String(body.result?.preview?.body || "").match(/https:\/\/[^\s)]+reengage-checkout[^\s)]+/);
      return fromBody ? fromBody[0] : null;
    },
    pickPreview: (body) => body.result?.preview,
  },
];

async function fetchRealMembers(secret, limit) {
  const url =
    `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook` +
    `?secret=${encodeURIComponent(secret)}&sendEmail=false&limit=${limit * 3}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error || "production dry-run failed");
  const rows = (body.email_results || []).filter(
    (r) =>
      r.email &&
      r.email.toLowerCase() !== EXCLUDE_EMAIL &&
      r.upgrade_url &&
      r.dry_run
  );
  if (rows.length < limit) throw new Error(`Need ${limit} real members, got ${rows.length}`);
  return rows.slice(0, limit).map((r) => ({
    member_id: r.member_id,
    email: r.email,
    name: r.name || "",
    days_lapsed: r.days_lapsed,
  }));
}

function tokenFromUrl(upgradeUrl) {
  try {
    return decodeURIComponent(upgradeUrl.split("t=")[1]?.split("&")[0] || "");
  } catch {
    return "";
  }
}

function assertCleanUpgradeHref(html, upgradeUrl) {
  const href = html.match(/href="([^"]*reengage-checkout[^"]*)"/)?.[1];
  if (!href) throw new Error("HTML missing reengage-checkout link");
  if (/[\)*]$/.test(href)) throw new Error(`Corrupt upgrade href: ${href}`);
  if (href !== upgradeUrl) throw new Error(`Upgrade href mismatch`);
}

function clickTestBanner(member) {
  return (
    `**Alan click-test only** — upgrade link signed for **${member.name || member.email}** ` +
    `(\`${member.email}\`, ${member.member_id}). **NOT sent to the client.**\n\n---\n\n`
  );
}

async function main() {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("ORPHANED_WEBHOOK_SECRET missing");

  const members = await fetchRealMembers(secret, LIMIT);
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM,
      pass: process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
  });

  const results = [];
  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const member = members[i];
    const previewRes = await fetch(stage.fetchPreview(secret, member.email));
    const previewBody = await previewRes.json();
    if (!previewRes.ok || previewBody.success === false) {
      throw new Error(`${stage.stage} / ${member.email}: ${previewBody.error || previewRes.status}`);
    }
    const upgradeUrl = stage.pickUpgradeUrl(previewBody);
    const preview = stage.pickPreview(previewBody);
    if (!upgradeUrl?.includes("reengage-checkout")) {
      throw new Error(`${stage.stage} / ${member.email}: missing reengage-checkout URL`);
    }

    const payload = decodeReengageTokenPayload(tokenFromUrl(upgradeUrl));
    if (payload?.em !== member.email) {
      throw new Error(`${stage.stage}: token email mismatch (got ${payload?.em})`);
    }
    if (payload?.c !== stage.coupon) {
      throw new Error(`${stage.stage}: coupon mismatch (got ${payload?.c})`);
    }

    const bodyMd = clickTestBanner(member) + (preview?.body || "");
    const html = htmlFromMarkdown(bodyMd);
    const text = plainTextFromMarkdown(bodyMd);
    assertCleanUpgradeHref(html, upgradeUrl);

    const subject =
      `[CLICKTEST – ${member.name || member.email}] ${preview?.subject || stage.stage}`;
    const info = await transporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
      to: LIFECYCLE_BCC,
      subject,
      text,
      html,
    });

    results.push({
      stage: stage.stage,
      coupon: stage.coupon,
      signedFor: {
        member_id: member.member_id,
        email: member.email,
        name: member.name,
        days_lapsed: member.days_lapsed,
      },
      deliveredTo: LIFECYCLE_BCC,
      subject,
      messageId: info.messageId,
      upgradeUrl,
      tokenPayload: payload,
      htmlUpgradeHref: html.match(/href="([^"]*reengage-checkout[^"]*)"/)?.[1] || null,
    });
  }

  const out = {
    at: new Date().toISOString(),
    clickTestOnly: true,
    clientsNotEmailed: members.map((m) => m.email),
    deliveredTo: LIFECYCLE_BCC,
    results,
    hardStop: true,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
