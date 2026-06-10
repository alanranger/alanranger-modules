/**
 * Send 5 REAL conversion emails to info@ (production templates, no proof prefixes).
 * Usage: node scripts/send-real-5-conversion-emails.cjs [memberEmailForSigning]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");
const { decodeReengageTokenPayload } = require("../lib/reengage-link");
const { htmlFromMarkdown, plainTextFromMarkdown } = require("../lib/emailHtml");

const MEMBER_EMAIL = process.argv[2] || "info@alanranger.com";
const LINKFIX_PREFIX = process.argv.includes("--linkfix") ? "[LINKFIX] " : "";
const TEST_TO = LIFECYCLE_BCC;
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/REAL-5-CONVERSION-EMAILS-LATEST.json";

const STAGES = [
  {
    stage: "day-plus-7",
    coupon: "SAVE20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/trial-expiry-reminder-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceDaysUntilExpiry=-7&sendEmail=false`,
    pickUpgradeUrl: (body) => body.upgrade_url || body.result?.upgrade_url,
    pickPreview: (body) => body.preview || body.result?.preview,
  },
  {
    stage: "day-plus-20",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceAttempt=1&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-30",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceAttempt=2&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-60",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceAttempt=3&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-90",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/triggered-email-webhook?secret=${encodeURIComponent(secret)}&stageKey=day-plus-90&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&sendEmail=false`,
    pickUpgradeUrl: (body) => {
      if (body.result?.upgrade_url) return body.result.upgrade_url;
      const fromBody = String(body.result?.preview?.body || "").match(/https:\/\/[^\s)]+reengage-checkout[^\s)]+/);
      return fromBody ? fromBody[0] : null;
    },
    pickPreview: (body) => body.result?.preview,
  },
];

function hasProofScaffolding(body) {
  if (!body) return false;
  return /Proof upgradeUrl|Click logged OUT|production-signed|Smoke test only|\[ORDERFIX|\[PROVE|\[LINKPROOF|\[NOEXPIRY/i.test(body);
}

function hasProofSubject(subject) {
  return /\[(ORDERFIX|PROVE|LINKPROOF|NOEXPIRY|STRIPEFIX|REAL-PREVIEW)/i.test(subject || "");
}

function ctaOrderOk(body) {
  if (!body) return false;
  const stripeIdx = body.search(/Do this next|Upgrade now and save/i);
  const dashIdx = body.search(/Once you've upgraded|log back into your dashboard/i);
  if (stripeIdx < 0) return false;
  if (dashIdx < 0) return true;
  return stripeIdx < dashIdx;
}

async function verifyLiveHop(upgradeUrl) {
  const res = await fetch(upgradeUrl, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  return {
    redirectStatus: res.status,
    isStripeCheckout: location.includes("checkout.stripe.com"),
    usesReengageCheckout: upgradeUrl.includes("/api/academy/reengage-checkout"),
  };
}

function tokenFromUrl(upgradeUrl) {
  try {
    return decodeURIComponent(upgradeUrl.split("t=")[1]?.split("&")[0] || "");
  } catch {
    return "";
  }
}

function assertCleanUpgradeHref(html, upgradeUrl) {
  const matches = [...String(html).matchAll(/href="([^"]*reengage-checkout[^"]*)"/g)];
  if (!matches.length) throw new Error("HTML missing reengage-checkout link");
  for (const match of matches) {
    const href = match[1];
    if (/[\)*]$/.test(href)) throw new Error(`Corrupt upgrade href: ${href}`);
    if (href !== upgradeUrl) throw new Error(`Upgrade href mismatch: ${href}`);
  }
}

async function main() {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("ORPHANED_WEBHOOK_SECRET missing");

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
  for (const stage of STAGES) {
    const previewRes = await fetch(stage.fetchPreview(secret));
    const previewBody = await previewRes.json();
    if (!previewRes.ok || previewBody.success === false) {
      throw new Error(`${stage.stage} preview failed: ${previewBody.error || previewRes.status}`);
    }
    const upgradeUrl = stage.pickUpgradeUrl(previewBody);
    const preview = stage.pickPreview(previewBody);
    if (!upgradeUrl?.includes("reengage-checkout")) {
      throw new Error(`${stage.stage} missing reengage-checkout upgrade URL`);
    }

    const hopProof = await verifyLiveHop(upgradeUrl);
    if (!hopProof.isStripeCheckout) {
      throw new Error(`${stage.stage} did not 302 to Stripe`);
    }

    const subject = `${LINKFIX_PREFIX}${preview?.subject || stage.stage}`;
    const bodyMd = preview?.body || "";
    const html = htmlFromMarkdown(bodyMd);
    const text = plainTextFromMarkdown(bodyMd);

    if (hasProofSubject(subject)) throw new Error(`${stage.stage} subject still has proof prefix`);
    if (hasProofScaffolding(bodyMd)) throw new Error(`${stage.stage} body still contains proof scaffolding`);
    if (!ctaOrderOk(bodyMd)) throw new Error(`${stage.stage} CTA order wrong`);
    assertCleanUpgradeHref(html, upgradeUrl);

    const payload = decodeReengageTokenPayload(tokenFromUrl(upgradeUrl));
    if (payload?.exp != null) {
      throw new Error(`${stage.stage} token still has exp field`);
    }
    if (payload?.c !== stage.coupon) {
      throw new Error(`${stage.stage} token coupon mismatch (got ${payload?.c})`);
    }

    const info = await transporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
      to: TEST_TO,
      subject,
      text,
      html,
    });

    results.push({
      stage: stage.stage,
      coupon: stage.coupon,
      subject,
      messageId: info.messageId,
      upgradeUrl,
      htmlUpgradeHref: html.match(/href="([^"]*reengage-checkout[^"]*)"/)?.[1] || null,
      plainTextUpgradeLine: text.split("\n").find((line) => line.includes("reengage-checkout")) || null,
      tokenPayload: payload,
      hopProof,
      primaryCtaFirst: true,
      noProofScaffolding: true,
    });
  }

  const out = {
    at: new Date().toISOString(),
    signedForMemberEmail: MEMBER_EMAIL,
    deliveredTo: TEST_TO,
    realTemplates: true,
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
