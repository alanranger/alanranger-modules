/**
 * Headless: fresh trial signup for marketing@alanranger.com via live site.
 * Prerequisite: member deleted from Memberstack (no duplicate email).
 */
import { chromium } from "playwright";
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local"), override: true });

const EMAIL = "marketing@alanranger.com";
const PASSWORD = process.env.MARKETING_TEST_PASSWORD || "AcademyTest!2026";
const LOGIN_URL = "https://www.alanranger.com/academy/login";

async function findMemberByEmail(email) {
  const key = process.env.MEMBERSTACK_SECRET_KEY;
  if (!key) return null;
  let after = null;
  for (let i = 0; i < 50; i++) {
    const url = new URL("https://admin.memberstack.com/members");
    url.searchParams.set("first", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { "X-API-KEY": key } });
    const body = await res.json();
    const members = body.data || [];
    for (const m of members) {
      const em = (m.auth?.email || m.email || "").toLowerCase();
      if (em === email.toLowerCase()) return m;
    }
    if (members.length < 100) break;
    after = members[members.length - 1]?.id || null;
    if (!after) break;
  }
  return null;
}

async function dismissCookies(page) {
  await page.getByRole("button", { name: /GOT IT/i }).click({ timeout: 5000 }).catch(() => {});
}

async function main() {
  console.log("Starting trial signup automation for", EMAIL);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 90000 });
  await dismissCookies(page);

  await page.locator("#arpTrialBtn").click({ timeout: 15000 });
  await page.locator('input[name="eml"], input[type="email"]').last().waitFor({ state: "visible", timeout: 30000 });

  await page.locator('input[name="first-name"]').fill("Alan");
  await page.locator('input[name="last-name"]').fill("Ranger");
  await page.locator('input[name="eml"]').fill(EMAIL);
  await page.locator('input[name="psw"]').fill(PASSWORD);

  const signupPromise = page.context().waitForEvent("page", { timeout: 30000 }).catch(() => null);
  await page.locator('button[type="submit"]:has-text("Sign up"), button:has-text("Sign up")').last().click();

  let checkoutPage = await signupPromise;
  if (!checkoutPage) {
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60000 }).catch(() => {});
    checkoutPage = page.url().includes("checkout.stripe.com") ? page : null;
  }

  if (!checkoutPage) {
    await page.screenshot({ path: join(__dirname, "debug-signup-fail.png"), fullPage: true });
    throw new Error("Stripe checkout did not open. Screenshot: scripts/debug-signup-fail.png");
  }

  await checkoutPage.waitForLoadState("domcontentloaded");
  console.log("Stripe checkout:", checkoutPage.url().slice(0, 90));

  const payBtn = checkoutPage.locator(
    'button[data-testid="hosted-payment-submit-button"], button:has-text("Subscribe"), button:has-text("Pay"), button:has-text("Complete")'
  ).first();
  await payBtn.waitFor({ state: "visible", timeout: 90000 });
  await payBtn.click();
  await checkoutPage.waitForURL(/alanranger\.com/, { timeout: 120000 });
  console.log("Done. Landed on:", checkoutPage.url());

  await browser.close();

  await new Promise((r) => setTimeout(r, 5000));
  const member = await findMemberByEmail(EMAIL);
  if (!member) throw new Error("Member not found after signup");

  const pcs = member.planConnections || [];
  const trial = pcs.find(
    (p) => p.planId === "pln_academy-trial-30-days--wb7v0hbh" && p.status !== "CANCELED" && p.active !== false
  );

  console.log(JSON.stringify({
    ok: !!trial,
    member_id: member.id,
    email: member.auth?.email || member.email,
    password: PASSWORD,
    planConnections: pcs.map((p) => ({ planId: p.planId, status: p.status, active: p.active })),
  }, null, 2));

  if (!trial) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
