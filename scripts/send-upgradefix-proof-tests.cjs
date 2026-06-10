/**
 * Send [UPGRADEFIX] proof tests + verify reengage-redirect hop.
 * Usage: node scripts/send-upgradefix-proof-tests.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const handler = require("../api/admin/lapsed-trial-reengagement-webhook");
const trialHandler = require("../api/admin/trial-expiry-reminder-webhook");
const { buildPersonalUpgradeUrl, REENGAGE_REDIRECT_URL } = require("../lib/reengage-link");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const TEST_TO = LIFECYCLE_BCC;
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/UPGRADEFIX-PROOF-LATEST.json";

async function verifyRedirectHop(memberId, email) {
  const upgradeUrl = buildPersonalUpgradeUrl(memberId, email, Date.now() + 7 * 86400000);
  const usesHop = upgradeUrl.startsWith(REENGAGE_REDIRECT_URL);
  let location = null;
  if (usesHop) {
    const res = await fetch(upgradeUrl, { redirect: "manual" });
    location = res.headers.get("location");
  }
  return {
    upgradeUrl,
    usesReengageRedirectHop: usesHop,
    redirectStatus: usesHop ? 302 : null,
    redirectLocation: location,
    loginHasArRewind: !!(location && location.includes("ar_rewind")),
    loginHasEmailPrefill: !!(location && location.includes("ar_rewind_email")),
  };
}

async function invokeWebhook(handlerFn, query) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const req = { method: "GET", query: { ...query, secret }, headers: {} };
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handlerFn(req, res).catch(reject);
  });
}

async function main() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  const memberId = "upgradefix-proof-member";
  const email = TEST_TO;
  const hopProof = await verifyRedirectHop(memberId, email);

  const rewindDry = await invokeWebhook(handler, {
    testEmail: email,
    sendEmail: "false",
  });
  const rewindUpgradeUrl = rewindDry.body?.result?.upgrade_url || hopProof.upgradeUrl;

  const save20Dry = await invokeWebhook(trialHandler, {
    testEmail: email,
    sendEmail: "false",
    daysAhead: -7,
    forceDaysUntilExpiry: -7,
  });
  const save20Preview = save20Dry.body?.email_content_preview || save20Dry.body?.preview;
  const save20Body = save20Preview?.body || "";
  const save20UrlMatch = save20Body.match(/https:\/\/[^\s)]+/);
  const save20UpgradeUrl = save20UrlMatch ? save20UrlMatch[0] : null;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM,
      pass: process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
  });

  const rewindSubject = `[UPGRADEFIX – day-plus-20] ${rewindDry.body?.result?.preview?.subject || "REWIND20 test"}`;
  const rewindBody =
    (rewindDry.body?.result?.preview?.body || "") +
    `\n\n---\nProof upgradeUrl: ${rewindUpgradeUrl}\n`;
  const rewindInfo = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
    to: TEST_TO,
    subject: rewindSubject,
    text: rewindBody,
  });

  const save20Subject = `[UPGRADEFIX – day-plus-7] ${save20Preview?.subject || "SAVE20 test"}`;
  const save20Info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
    to: TEST_TO,
    subject: save20Subject,
    text: (save20Preview?.body || save20Body) + `\n\n---\nProof upgradeUrl: ${save20UpgradeUrl}\n`,
  });

  const out = {
    at: new Date().toISOString(),
    hopProof,
    rewindUpgradeUrl,
    save20UpgradeUrl,
    save20UsesReengageRedirect: !!(save20UpgradeUrl && save20UpgradeUrl.includes("reengage-redirect")),
    messageIds: {
      rewind: rewindInfo.messageId,
      save20: save20Info.messageId,
    },
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
