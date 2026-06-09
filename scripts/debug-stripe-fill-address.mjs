import { chromium } from "playwright";
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local"), override: true });

const EMAIL = "marketing@alanranger.com";
const PASSWORD = process.env.MARKETING_TEST_PASSWORD || "AcademyTest!2026";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://www.alanranger.com/academy/login", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /GOT IT/i }).click({ timeout: 5000 }).catch(() => {});
await page.locator("#arpLoginBtn").click();
await page.locator('input[name="eml"]').fill(EMAIL);
await page.locator('input[name="psw"]').fill(PASSWORD);
await page.locator('button:has-text("Log in")').last().click();
await page.waitForTimeout(5000);
await page.waitForFunction(() => window.$memberstackDom?.purchasePlansWithCheckout);

const res = await page.evaluate(async () => window.$memberstackDom.purchasePlansWithCheckout({
  priceId: "prc_30-day-free-trial-mg18p0u9z",
  successUrl: "https://www.alanranger.com/academy/dashboard",
  cancelUrl: "https://www.alanranger.com/academy/login",
  autoRedirect: false,
}));

const checkout = await browser.newPage();
await checkout.goto(res.data.url, { waitUntil: "domcontentloaded" });
await checkout.waitForTimeout(2000);

await checkout.locator('input[autocomplete="name"], input[name="billingName"]').first().fill("Alan Ranger");
await checkout.getByRole("link", { name: /Enter address manually/i }).click({ timeout: 5000 }).catch(() => {});
await checkout.locator('input[name="billingAddressLine1"], input[autocomplete="address-line1"]').first().fill("1 Test Street").catch(() => {});
await checkout.locator('input[name="billingLocality"], input[autocomplete="address-level2"]').first().fill("Coventry").catch(() => {});
await checkout.locator('input[name="billingPostalCode"], input[autocomplete="postal-code"]').first().fill("CV1 1AA").catch(() => {});

await checkout.getByRole("button", { name: /Complete order/i }).click();
await checkout.waitForTimeout(8000);
await checkout.screenshot({ path: join(__dirname, "debug-after-complete-click.png"), fullPage: true });
console.log("URL after click:", checkout.url());
console.log("Body:", (await checkout.locator("body").innerText()).slice(0, 500));

await browser.close();
