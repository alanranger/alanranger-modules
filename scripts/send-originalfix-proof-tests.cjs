/**
 * Send [ORIGINALFIX] proof test using restored original dashboard?ar_rewind= URL.
 * Usage: node scripts/send-originalfix-proof-tests.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const handler = require("../api/admin/lapsed-trial-reengagement-webhook");
const { buildPersonalUpgradeUrl, DASHBOARD_URL } = require("../lib/reengage-link");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const TEST_TO = LIFECYCLE_BCC;
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/ORIGINALFIX-PROOF-LATEST.json";

async function invokeWebhook(query) {
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
    handler(req, res).catch(reject);
  });
}

async function main() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  const memberId = "originalfix-proof-member";
  const email = TEST_TO;
  const windowMs = Date.now() + 7 * 86400000;
  const upgradeUrl = buildPersonalUpgradeUrl(memberId, email, windowMs);

  const usesOriginalPattern =
    upgradeUrl.startsWith(DASHBOARD_URL) && upgradeUrl.includes("ar_rewind=");
  const usesReengageRedirect = upgradeUrl.includes("reengage-redirect");

  const dry = await invokeWebhook({ testEmail: email, sendEmail: "false" });
  const renderedUrl = dry.body?.result?.upgrade_url || upgradeUrl;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM,
      pass: process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
  });

  const subject = `[ORIGINALFIX – day-plus-20] ${dry.body?.result?.preview?.subject || "REWIND20 original URL test"}`;
  const body =
    (dry.body?.result?.preview?.body || "") +
    `\n\n---\nProof upgradeUrl (restored original pattern): ${renderedUrl}\n` +
    `Pattern: dashboard?ar_rewind=<HMAC token> — NOT reengage-redirect.\n` +
    `After login: upgrade modal auto-opens; click "Upgrade to Academy Annual" → Stripe checkout with REWIND20.\n` +
    `If you are a paid member on info@, append &ar-test-expired=1 to force the locked modal for this test.\n`;

  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
    to: TEST_TO,
    subject,
    text: body,
  });

  const out = {
    at: new Date().toISOString(),
    restoredPattern: {
      upgradeUrl: renderedUrl,
      host: "www.alanranger.com",
      path: "/academy/dashboard",
      param: "ar_rewind",
      usesOriginalDashboardDeepLink: usesOriginalPattern,
      usesReengageRedirectHop: usesReengageRedirect,
    },
    clickPath: [
      "Email link → /academy/dashboard?ar_rewind=<token>",
      "Dashboard snippet stashes token in sessionStorage, opens expired-trial modal",
      "If logged out → login with ar_rewind_email prefill → return to dashboard (context preserved)",
      "Click modal CTA → POST /api/stripe/create-upgrade-checkout → checkout.stripe.com with REWIND20",
    ],
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
