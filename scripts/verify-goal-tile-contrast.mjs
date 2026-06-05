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
${body}
<script>
window.$memberstackDom = {
  getCurrentMember: async () => ({
    id: "mem_cmjyljfkm0hxg0sntegon6ghi",
    data: {
      id: "mem_cmjyljfkm0hxg0sntegon6ghi",
      email: "info@alanranger.com",
      customFields: { "first-name": "Alan", "last-name": "Ranger" }
    }
  }),
  getMemberJSON: async () => ({ data: { arAcademy: { modules: { opened: {} } } } })
};
</script>
${scripts.map((s) => `<script>${s}</script>`).join("\n")}
</body></html>`;

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(bg, fg) {
  const L1 = luminance(bg);
  const L2 = luminance(fg);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function parseRgb(s) {
  if (!s || typeof s !== "string") return null;
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(pageHtml);
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url =
  `http://127.0.0.1:${port}/academy/dashboard?ar_preview=1&state=annual&modules=60&exams=8`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const out = await page.evaluate(() => {
  const tile = document.querySelector(".ar-do-next-tile--goal-checklist");
  const met = tile?.querySelector(".ar-do-next-criteria-row--met span");
  const unmet = tile?.querySelector(".ar-do-next-criteria-row--unmet span");
  const unmetCircle = tile?.querySelector(".ar-do-next-criteria-icon--unmet circle");
  return {
    tileFound: !!tile,
    label: tile?.querySelector(".ar-do-next-tile__eyebrow")?.textContent?.trim(),
    bg: tile ? getComputedStyle(tile).backgroundColor : null,
    metCol: met ? getComputedStyle(met).color : null,
    unmetCol: unmet ? getComputedStyle(unmet).color : null,
    unmetCircleStroke: unmetCircle ? getComputedStyle(unmetCircle).stroke : null,
    unmetText: unmet?.textContent?.trim(),
    unmetCount: tile?.querySelectorAll(".ar-do-next-criteria-row--unmet").length ?? 0
  };
});

await browser.close();
server.close();

if (!out.tileFound) {
  console.log(JSON.stringify({ pass: false, error: "goal-checklist tile not rendered", ...out }, null, 2));
  process.exit(1);
}

const bg = parseRgb(out.bg);
const unmet = parseRgb(out.unmetCol);
const met = parseRgb(out.metCol);
const unmetRatio = bg && unmet ? contrast(bg, unmet) : 0;
const metRatio = bg && met ? contrast(bg, met) : 0;
const pass = unmetRatio >= 4.5 && metRatio >= 4.5 && out.unmetCount > 0;

console.log(
  JSON.stringify(
    {
      pass,
      unmetContrast: unmetRatio.toFixed(2),
      metContrast: metRatio.toFixed(2),
      minRequired: 4.5,
      ...out
    },
    null,
    2
  )
);
process.exit(pass ? 0 : 1);
