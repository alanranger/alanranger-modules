/**
 * Send 5 [PROVE – …] conversion email tests (production-signed URLs).
 * Usage: node scripts/send-prove-all-5-conversion-emails.cjs [memberEmail]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const MEMBER_EMAIL = process.argv[2] || "info@alanranger.com";
const TEST_TO = LIFECYCLE_BCC;
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/PROVE-ALL-5-CONVERSION-EMAILS-LATEST.json";

const PROOF_STAGES = [
  {
    stage: "day-plus-7",
    subjectPrefix: "[ORDERFIX – day-plus-7 SAVE20]",
    coupon: "SAVE20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/trial-expiry-reminder-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceDaysUntilExpiry=-7&sendEmail=false`,
    pickUpgradeUrl: (body) => body.upgrade_url || body.result?.upgrade_url,
    pickPreview: (body) => body.preview || body.result?.preview,
  },
  {
    stage: "day-plus-20",
    subjectPrefix: "[ORDERFIX – day-plus-20 REWIND20]",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceAttempt=1&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-30",
    subjectPrefix: "[ORDERFIX – day-plus-30 REWIND20]",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceAttempt=2&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-60",
    subjectPrefix: "[ORDERFIX – day-plus-60 REWIND20]",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&forceAttempt=3&sendEmail=false`,
    pickUpgradeUrl: (body) => body.result?.upgrade_url,
    pickPreview: (body) => body.result?.preview,
  },
  {
    stage: "day-plus-90",
    subjectPrefix: "[ORDERFIX – day-plus-90 REWIND20]",
    coupon: "REWIND20",
    fetchPreview: (secret) =>
      `${API_BASE}/api/admin/triggered-email-webhook?secret=${encodeURIComponent(secret)}&stageKey=day-plus-90&testEmail=${encodeURIComponent(MEMBER_EMAIL)}&sendEmail=false`,
    pickUpgradeUrl: (body) => {
      const fromBody = String(body.result?.preview?.body || "").match(/https:\/\/[^\s)]+reengage-checkout[^\s)]+/);
      return fromBody ? fromBody[0] : null;
    },
    pickPreview: (body) => body.result?.preview,
  },
];

function ctaOrderOk(body) {
  if (!body) return false;
  const stripeIdx = body.search(/Do this next|Upgrade now and save|reengage-checkout/i);
  const dashIdx = body.search(/Once you've upgraded|log back into your dashboard/i);
  if (stripeIdx < 0) return false;
  if (dashIdx < 0) return true;
  return stripeIdx < dashIdx;
}

function hasProofScaffolding(body) {
  if (!body) return false;
  return /Proof upgradeUrl|Click logged OUT|production-signed/i.test(body);
}

async function verifyLiveHop(upgradeUrl) {
  const res = await fetch(upgradeUrl, { redirect: "manual" });
  const location = res.headers.get("location");
  return {
    redirectStatus: res.status,
    redirectLocation: location,
    isStripeCheckout: !!(location && location.includes("checkout.stripe.com")),
    isDashboardFallback: !!(location && location.includes("/academy/dashboard")),
    usesReengageCheckout: upgradeUrl.includes("/api/academy/reengage-checkout"),
  };
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
  for (const stage of PROOF_STAGES) {
    const previewRes = await fetch(stage.fetchPreview(secret));
    const previewBody = await previewRes.json();
    if (!previewRes.ok || previewBody.success === false) {
      throw new Error(`${stage.stage} preview failed: ${previewBody.error || previewRes.status}`);
    }
    const upgradeUrl = stage.pickUpgradeUrl(previewBody);
    const preview = stage.pickPreview(previewBody);
    if (!upgradeUrl || !upgradeUrl.includes("reengage-checkout")) {
      throw new Error(`${stage.stage} missing reengage-checkout upgrade URL`);
    }
    const hopProof = await verifyLiveHop(upgradeUrl);
    if (!hopProof.isStripeCheckout) {
      throw new Error(`${stage.stage} did not 302 to Stripe (${hopProof.redirectLocation})`);
    }

    const subject = `${stage.subjectPrefix} ${preview?.subject || stage.stage}`;
    const text = preview?.body || "";

    if (hasProofScaffolding(text)) {
      throw new Error(`${stage.stage} body still contains proof scaffolding`);
    }

    const info = await transporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
      to: TEST_TO,
      subject,
      text,
    });

    results.push({
      stage: stage.stage,
      coupon: stage.coupon,
      upgradeUrl,
      hopProof,
      primaryCtaFirst: ctaOrderOk(text),
      noProofScaffolding: !hasProofScaffolding(text),
      messageId: info.messageId,
      subject,
    });
  }

  const out = {
    at: new Date().toISOString(),
    memberEmail: MEMBER_EMAIL,
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
