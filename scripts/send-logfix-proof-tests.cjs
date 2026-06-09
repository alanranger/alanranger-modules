/**
 * Send [LOGINFIX – day-plus-20] — verify reengage-checkout is login-stateless.
 * Usage: node scripts/send-logfix-proof-tests.cjs [memberEmail]
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
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/LOGINFIX-PROOF-LATEST.json";

async function fetchProductionPreview(secret) {
  const url =
    `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook` +
    `?secret=${encodeURIComponent(secret)}` +
    `&testEmail=${encodeURIComponent(MEMBER_EMAIL)}` +
    `&forceAttempt=1&sendEmail=false`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error || "preview failed");
  return body.result;
}

async function verifyHop(upgradeUrl, label) {
  const res = await fetch(upgradeUrl, {
    redirect: "manual",
    headers: label === "with-cookie" ? { Cookie: "dummy-session=logged-in-test" } : {},
  });
  const location = res.headers.get("location");
  return {
    label,
    redirectStatus: res.status,
    redirectLocation: location,
    isStripeCheckout: !!(location && location.includes("checkout.stripe.com")),
    isDashboardFallback: !!(location && location.includes("/academy/dashboard")),
  };
}

async function main() {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const preview = await fetchProductionPreview(secret);
  const upgradeUrl = preview.upgrade_url;
  if (!upgradeUrl?.includes("reengage-checkout")) throw new Error("missing reengage-checkout URL");

  const hopNoCookie = await verifyHop(upgradeUrl, "no-cookie");
  const hopWithCookie = await verifyHop(upgradeUrl, "with-cookie");
  if (!hopNoCookie.isStripeCheckout || !hopWithCookie.isStripeCheckout) {
    throw new Error("LOGINFIX hop verification failed");
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

  const subject = `[LOGINFIX – day-plus-20] ${preview.preview?.subject || "REWIND20 checkout"}`;
  const text = preview.preview?.body || "";

  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
    to: TEST_TO,
    subject,
    text,
  });

  const out = {
    at: new Date().toISOString(),
    memberEmail: MEMBER_EMAIL,
    upgradeUrl,
    hopProof: { noCookie: hopNoCookie, withCookie: hopWithCookie },
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
