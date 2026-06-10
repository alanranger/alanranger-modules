/**
 * Full flow: login + Stripe £0 trial checkout (fills name + Complete order).
 */
import { chromium } from "playwright";
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local"), override: true });

const EMAIL = "marketing@alanranger.com";
const PASSWORD = process.env.MARKETING_TEST_PASSWORD || "AcademyTest!2026";

async function findMember() {
  const key = process.env.MEMBERSTACK_SECRET_KEY;
  let after = null;
  for (let i = 0; i < 50; i++) {
    const url = new URL("https://admin.memberstack.com/members");
    url.searchParams.set("first", "100");
    if (after) url.searchParams.set("after", after);
    const body = await fetch(url, { headers: { "X-API-KEY": key } }).then((r) => r.json());
    for (const m of body.data || []) {
      if ((m.auth?.email || "").toLowerCase() === EMAIL) return m;
    }
    if ((body.data || []).length < 100) break;
    after = body.data[body.data.length - 1]?.id;
  }
  return null;
}

async function clearSupabaseForMember(memberId) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const tables = [
    () => supabase.from("academy_events").delete().eq("member_id", memberId),
    () => supabase.from("module_results_ms").delete().eq("memberstack_id", memberId),
    () => supabase.from("academy_plan_events").delete().eq("ms_member_id", memberId),
    () => supabase.from("exam_member_links").delete().eq("memberstack_id", memberId),
    () => supabase.from("academy_annual_history").delete().eq("member_id", memberId),
    () => supabase.from("academy_trial_history").delete().eq("member_id", memberId),
  ];
  for (const run of tables) await run();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("https://www.alanranger.com/academy/login", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.getByRole("button", { name: /GOT IT/i }).click({ timeout: 5000 }).catch(() => {});

await page.locator("#arpLoginBtn").click();
await page.locator('input[name="eml"]').fill(EMAIL);
await page.locator('input[name="psw"]').fill(PASSWORD);
await page.locator('button[type="submit"]:has-text("Log in"), button:has-text("Log in")').last().click();
await page.waitForTimeout(5000);
await page.waitForFunction(() => window.$memberstackDom?.purchasePlansWithCheckout, { timeout: 30000 });

const checkoutResult = await page.evaluate(async () => {
  return window.$memberstackDom.purchasePlansWithCheckout({
    priceId: "prc_30-day-free-trial-mg18p0u9z",
    successUrl: "https://www.alanranger.com/academy/dashboard",
    cancelUrl: "https://www.alanranger.com/academy/login",
    autoRedirect: false,
  });
});

const checkoutUrl = checkoutResult?.data?.url;
if (!checkoutUrl) throw new Error("No checkout URL from Memberstack");

const checkoutPage = await context.newPage();
await checkoutPage.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await checkoutPage.waitForTimeout(3000);

const nameInput = checkoutPage.locator('input[name="billingName"], input[autocomplete="name"], input[placeholder="Name"]').first();
await nameInput.fill("Alan Ranger");

await checkoutPage.getByRole("button", { name: /Complete order/i }).click();
await checkoutPage.waitForURL(/alanranger\.com/, { timeout: 120000 });
console.log("Success URL:", checkoutPage.url());

await browser.close();
await new Promise((r) => setTimeout(r, 8000));

const member = await findMember();
const trial = (member?.planConnections || []).find(
  (p) => p.planId === "pln_academy-trial-30-days--wb7v0hbh" && p.active !== false
);

if (member?.id) await clearSupabaseForMember(member.id);

console.log(JSON.stringify({
  ok: !!trial,
  member_id: member?.id,
  email: member?.auth?.email,
  password: PASSWORD,
  plans: member?.planConnections?.map((p) => ({ planId: p.planId, status: p.status, active: p.active })),
}, null, 2));

if (!trial) process.exit(1);
