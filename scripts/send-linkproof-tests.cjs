/**
 * [LINKPROOF – day-plus-20] — token lifetime + checkout hop proof.
 * Usage: node scripts/send-linkproof-tests.cjs [memberEmail]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");
const {
  computeTokenExpiryMs,
  decodeReengageTokenPayload,
  signReengageToken,
  verifyReengageToken,
  REENGAGE_CHECKOUT_URL,
  WINDOW_DAYS,
  TOKEN_GRACE_DAYS,
  DAY_MS,
} = require("../lib/reengage-link");

const MEMBER_EMAIL = process.argv[2] || "info@alanranger.com";
const TEST_TO = LIFECYCLE_BCC;
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/LINKPROOF-LATEST.json";
const MEMBER_ID = "mem_cmlawp8jq09ka0sqe90ya793t";

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

async function hopCheckout(upgradeUrl) {
  const res = await fetch(upgradeUrl, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  return {
    status: res.status,
    location,
    isStripe: location.includes("checkout.stripe.com"),
    isErrorPage: res.status >= 400,
  };
}

function buildCheckoutUrlFromToken(token) {
  return `${REENGAGE_CHECKOUT_URL}?t=${encodeURIComponent(token)}`;
}

async function main() {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("ORPHANED_WEBHOOK_SECRET missing");

  const preview = await fetchProductionPreview(secret);
  const upgradeUrl = preview.upgrade_url;
  if (!upgradeUrl?.includes("reengage-checkout")) throw new Error("missing reengage-checkout URL");

  const livePayload = decodeReengageTokenPayload(upgradeUrl.split("t=")[1]?.split("&")[0]);
  const freshHop = await hopCheckout(upgradeUrl);
  if (!freshHop.isStripe) throw new Error("fresh production token did not 302 to Stripe");

  const sendAtMs = Date.now() - 6 * DAY_MS;
  const newExp = computeTokenExpiryMs(sendAtMs, WINDOW_DAYS);
  const oldExp = sendAtMs + WINDOW_DAYS * DAY_MS;
  const simulatedToken = signReengageToken(MEMBER_ID, MEMBER_EMAIL, newExp, "REWIND20");
  const simulatedUrl = buildCheckoutUrlFromToken(simulatedToken);
  const simulatedHop = await hopCheckout(simulatedUrl);

  const expiredToken = signReengageToken(MEMBER_ID, MEMBER_EMAIL, Date.now() - 1000, "REWIND20");
  const expiredHop = await hopCheckout(buildCheckoutUrlFromToken(expiredToken));
  const garbageHop = await hopCheckout(`${REENGAGE_CHECKOUT_URL}?t=not-a-real-token`);

  const verifyExpired = verifyReengageToken(expiredToken);
  const tokenLifetime = {
    offerWindowDays: WINDOW_DAYS,
    graceDays: TOKEN_GRACE_DAYS,
    totalValidDays: WINDOW_DAYS + TOKEN_GRACE_DAYS,
    oldFormulaDays: WINDOW_DAYS,
    newFormula: "sendAtMs + (offerWindowDays + TOKEN_GRACE_DAYS) * DAY_MS",
    setIn: "lib/reengage-link.js computeTokenExpiryMs()",
  };

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM,
      pass: process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
  });

  const subject = `[LINKPROOF – day-plus-20] ${preview.preview?.subject || "REWIND20 checkout"}`;
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
    tokenLifetime,
    productionToken: {
      payload: livePayload,
      expIso: livePayload?.exp ? new Date(livePayload.exp).toISOString() : null,
      daysFromNow: livePayload?.exp ? (livePayload.exp - Date.now()) / DAY_MS : null,
      hop: freshHop,
    },
    simulatedDay6Open: {
      sendAtIso: new Date(sendAtMs).toISOString(),
      newExpIso: new Date(newExp).toISOString(),
      oldExpWouldBeIso: new Date(oldExp).toISOString(),
      oldFormulaWouldExpireNow: Date.now() > oldExp,
      hop: simulatedHop,
      reachesStripe: simulatedHop.isStripe,
    },
    failSafe: {
      expiredTokenReason: verifyExpired.reason,
      expiredHop,
      garbageHop,
    },
    upgradeUrl,
    messageId: info.messageId,
    hardStop: true,
  };

  if (!simulatedHop.isStripe) throw new Error("simulated day-6 token did not reach Stripe");
  if (!expiredHop.isErrorPage && expiredHop.status !== 410) {
    throw new Error("expired token should return error page");
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
