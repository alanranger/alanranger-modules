/**
 * Send [STRIPEFIX] proof test using a PRODUCTION-signed upgradeUrl for a real
 * expired-trial member (default info@alanranger.com). Local token signing fails
 * on Vercel when secrets differ — always dry-run the live webhook first.
 *
 * Usage: node scripts/send-stripefix-proof-tests.cjs [expiredMemberEmail]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const TEST_TO = LIFECYCLE_BCC;
const MEMBER_EMAIL = process.argv[2] || "info@alanranger.com";
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/STRIPEFIX-PROOF-LATEST.json";

async function fetchProductionPreview(memberEmail) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("ORPHANED_WEBHOOK_SECRET missing — cannot call production webhook");
  const url =
    `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook` +
    `?secret=${encodeURIComponent(secret)}` +
    `&testEmail=${encodeURIComponent(memberEmail)}` +
    `&sendEmail=false`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error || `Production preview failed (${res.status})`);
  }
  return body.result;
}

async function verifyLiveStripeHop(upgradeUrl) {
  const res = await fetch(upgradeUrl, { redirect: "manual" });
  const location = res.headers.get("location");
  return {
    redirectStatus: res.status,
    redirectLocation: location,
    isStripeCheckout: !!(location && location.includes("checkout.stripe.com")),
    isDashboardFallback: !!(location && location.includes("/academy/dashboard")),
  };
}

async function main() {
  const preview = await fetchProductionPreview(MEMBER_EMAIL);
  const upgradeUrl = preview.upgrade_url;
  if (!upgradeUrl) throw new Error("Production preview missing upgrade_url");

  const hopProof = await verifyLiveStripeHop(upgradeUrl);
  if (!hopProof.isStripeCheckout) {
    throw new Error(
      `Live hop did not reach Stripe (status=${hopProof.redirectStatus}, location=${hopProof.redirectLocation})`
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM,
      pass: process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
  });

  const subject = `[STRIPEFIX v2 – day-plus-20] ${preview.preview?.subject || "REWIND20 direct Stripe test"}`;
  const body =
    (preview.preview?.body || "") +
    `\n\n---\nProof upgradeUrl (production-signed, real expired member ${MEMBER_EMAIL}):\n${upgradeUrl}\n\n` +
    `Click logged OUT → should land on checkout.stripe.com with REWIND20 (£59), email pre-filled.\n` +
    `Member: ${preview.member_id || preview.name || MEMBER_EMAIL} · days lapsed: ${preview.days_lapsed}\n`;

  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
    to: TEST_TO,
    subject,
    text: body,
  });

  const out = {
    at: new Date().toISOString(),
    memberEmail: MEMBER_EMAIL,
    memberId: preview.member_id,
    daysLapsed: preview.days_lapsed,
    upgradeUrl,
    hopProof,
    messageId: info.messageId,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
