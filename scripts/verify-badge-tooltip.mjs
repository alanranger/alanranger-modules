import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(
  "G:/Dropbox/alan ranger photography/Website Code/AI GEO Audit/package.json"
);
const { chromium } = require("playwright");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const stripHtml = fs.readFileSync(
  path.join(root, "academy-do-next-strip-squarespace-snippet-v1.html"),
  "utf8"
);
const style = (stripHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || "";
const body = stripHtml
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .trim();
const scripts = [...stripHtml.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

const pageHtml = `<!DOCTYPE html><html class="ar-academy"><head>
<style>body{background:#0f1419;margin:0}</style>
<style>${style}</style></head><body>
<header id="header" style="height:72px;background:#fff;position:fixed;top:0;left:0;right:0;z-index:998">Banner mock</header>
${body}
<script>
window.$memberstackDom = {
  getCurrentMember: async () => ({
    id: "mem_cmjyljfkm0hxg0sntegon6ghi",
    data: { id: "mem_cmjyljfkm0hxg0sntegon6ghi", email: "info@alanranger.com" }
  }),
  getMemberJSON: async () => ({ data: { arAcademy: { modules: { opened: {} } } } })
};
</script>
${scripts.map((s) => `<script>${s}</script>`).join("\n")}
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(pageHtml);
});

await new Promise((r) => server.listen(0, r));
const url =
  `http://127.0.0.1:${server.address().port}/academy/dashboard?ar_preview=1&state=annual&modules=20&exams=2`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const trigger = page.locator(".ar-do-next-badge--ghost .ar-do-next-badge__trigger").first();
await trigger.hover();
await page.waitForTimeout(200);

const out = await page.evaluate(() => {
  const strip = document.getElementById("ar-do-next-strip");
  const tip = document.querySelector(".ar-do-next-badge__tooltip--fixed.is-open");
  const trigger = document.querySelector(".ar-do-next-badge--ghost .ar-do-next-badge__trigger");
  const header = document.getElementById("header");
  const tipRect = tip ? tip.getBoundingClientRect() : null;
  const triggerRect = trigger ? trigger.getBoundingClientRect() : null;
  const headerRect = header ? header.getBoundingClientRect() : null;
  const cs = tip ? getComputedStyle(tip) : null;
  return {
    tipFound: !!tip,
    tipParent: tip ? tip.parentElement?.tagName : null,
    position: cs ? cs.position : null,
    zIndex: cs ? cs.zIndex : null,
    opensBelow: tipRect && triggerRect ? tipRect.top >= triggerRect.bottom - 2 : null,
    fullyVisible:
      tipRect &&
      tipRect.top >= 0 &&
      tipRect.left >= 0 &&
      tipRect.bottom <= window.innerHeight &&
      tipRect.right <= window.innerWidth,
    tipRect: tipRect
      ? {
          top: Math.round(tipRect.top),
          left: Math.round(tipRect.left),
          bottom: Math.round(tipRect.bottom),
          right: Math.round(tipRect.right)
        }
      : null,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    aboveBanner: tipRect && headerRect ? tipRect.top >= headerRect.bottom - 1 : null,
    stripNoHScroll: strip ? strip.scrollWidth === strip.clientWidth : null,
    docNoHScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
  };
});

await browser.close();
server.close();

const pass =
  out.tipFound &&
  out.tipParent === "BODY" &&
  out.position === "fixed" &&
  Number(out.zIndex) >= 1000 &&
  out.opensBelow &&
  out.fullyVisible &&
  out.aboveBanner &&
  out.stripNoHScroll &&
  out.docNoHScroll;

console.log(JSON.stringify({ pass, ...out }, null, 2));
process.exit(pass ? 0 : 1);
