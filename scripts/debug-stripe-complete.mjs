import { chromium } from "playwright";
import { config } from "dotenv";
import Stripe from "stripe";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local"), override: true });

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const sessionId = process.argv[2] || "cs_live_b1DtcnmlsofqEkDg7J5k2YBNN4eN3i2qFSSRgLvsbqT9gBantWcC8pr42l";

const sess = await stripe.checkout.sessions.retrieve(sessionId);
console.log("Session", sess.id, sess.status, sess.amount_total);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(sess.url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(3000);

const body = await page.locator("body").innerText();
console.log(body.slice(0, 600));

const btn = page.locator('button[data-testid="hosted-payment-submit-button"]').first();
const visible = await btn.isVisible().catch(() => false);
console.log("Submit visible:", visible);

if (visible) {
  await btn.click();
  await page.waitForURL(/alanranger|success/, { timeout: 120000 }).catch(() => {});
  console.log("Final URL:", page.url());
}

const updated = await stripe.checkout.sessions.retrieve(sessionId);
console.log("After click:", updated.status, updated.payment_status);

await page.screenshot({ path: join(__dirname, "debug-stripe-full-url.png"), fullPage: true });
await browser.close();
