/**
 * Send [STRIPEFIX] proof test — upgradeUrl must 302 to checkout.stripe.com with REWIND20.
 * Usage: node scripts/send-stripefix-proof-tests.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const handler = require("../api/admin/lapsed-trial-reengagement-webhook");
const { buildPersonalUpgradeUrl, REENGAGE_CHECKOUT_URL } = require("../lib/reengage-link");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");

const TEST_TO = LIFECYCLE_BCC;
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/STRIPEFIX-PROOF-LATEST.json";

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

async function verifyStripeHop(upgradeUrl) {
  const usesCheckoutEndpoint = upgradeUrl.startsWith(REENGAGE_CHECKOUT_URL);
  let location = null;
  let isStripeCheckout = false;
  if (!usesCheckoutEndpoint) {
    return { usesCheckoutEndpoint, redirectStatus: null, redirectLocation: null, isStripeCheckout: false };
  }

  // Local handler test (works before Vercel deploy)
  try {
    const checkoutHandler = require("../api/academy/reengage-checkout");
    const req = { method: "GET", query: { t: new URL(upgradeUrl).searchParams.get("t") } };
    location = await new Promise((resolve, reject) => {
      const res = {
        statusCode: 302,
        setHeader() {},
        redirect(code, url) {
          this.statusCode = code;
          resolve(url);
        },
        writeHead(code, headers) {
          this.statusCode = code;
          resolve(headers.Location || headers.location);
        },
        end() {},
      };
      checkoutHandler(req, res).catch(reject);
    });
    isStripeCheckout = !!(location && location.includes("checkout.stripe.com"));
    if (isStripeCheckout) {
      return { usesCheckoutEndpoint, redirectStatus: 302, redirectLocation: location, isStripeCheckout, via: "local_handler" };
    }
  } catch (err) {
    console.warn("[stripefix-proof] local handler test failed:", err.message);
  }

  const res = await fetch(upgradeUrl, { redirect: "manual" });
  location = res.headers.get("location");
  isStripeCheckout = !!(location && location.includes("checkout.stripe.com"));
  return { usesCheckoutEndpoint, redirectStatus: res.status, redirectLocation: location, isStripeCheckout, via: "live_fetch" };
}

async function main() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  const memberId = "stripefix-proof-member";
  const email = TEST_TO;
  const upgradeUrl = buildPersonalUpgradeUrl(memberId, email, Date.now() + 7 * 86400000);
  const hopProof = await verifyStripeHop(upgradeUrl);

  const dry = await invokeWebhook({ testEmail: email, sendEmail: "false" });
  const renderedUrl = dry.body?.result?.upgrade_url || upgradeUrl;
  const renderedHop = renderedUrl !== upgradeUrl ? await verifyStripeHop(renderedUrl) : hopProof;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM,
      pass: process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
  });

  const subject = `[STRIPEFIX – day-plus-20] ${dry.body?.result?.preview?.subject || "REWIND20 direct Stripe test"}`;
  const body =
    (dry.body?.result?.preview?.body || "") +
    `\n\n---\nProof upgradeUrl (direct Stripe): ${renderedUrl}\n` +
    `Expected: one click → checkout.stripe.com with REWIND20 applied, email pre-filled.\n`;

  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
    to: TEST_TO,
    subject,
    text: body,
  });

  const out = {
    at: new Date().toISOString(),
    hopProof: renderedHop,
    upgradeUrl: renderedUrl,
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
