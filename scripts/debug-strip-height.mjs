import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { HEADER_SNIPPET, STRIP_SNIPPET } from "./snippet-paths.mjs";

const require = createRequire(
  "G:/Dropbox/alan ranger photography/Website Code/AI GEO Audit/package.json"
);
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function extractParts(html) {
  const style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || "";
  const body = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return { style, body, scripts };
}

const header = extractParts(
  fs.readFileSync(HEADER_SNIPPET, "utf8")
);
const strip = extractParts(
  fs.readFileSync(STRIP_SNIPPET, "utf8")
);

const pageHtml = `<!DOCTYPE html><html class="ar-academy"><head><style id="ar-academy-header-style">${header.style}</style><style id="ar-do-next-strip-style">${strip.style}</style></head><body>${header.body}${strip.body}<div id="filler" style="height:2400px">filler</div><script>
window.$memberstackDom={getCurrentMember:async()=>({id:"mem",data:{id:"mem",email:"a@b.com",customFields:{"first-name":"A"}}}),getMemberJSON:async()=>({data:{arAcademy:{modules:{opened:{"/blog-on-photography/what-is-exposure-in-photography":true}}}}})};
history.replaceState({},"","/academy/dashboard");
</script>${header.scripts.map((s) => `<script>${s}</script>`).join("")}${strip.scripts.map((s) => `<script>${s}</script>`).join("")}</body></html>`;

import http from "http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(pageHtml);
});
await new Promise((resolve) => server.listen(0, resolve));
const url = `http://127.0.0.1:${server.address().port}/academy/dashboard`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const strip = document.getElementById("ar-do-next-strip");
  const ids = [
    "ar-do-next-strip",
    ".ar-do-next-strip__inner",
    ".ar-do-next-strip__card",
    "#ar-do-next-badge-rail",
    "#ar-do-next-status",
    "#ar-do-next-tiles"
  ];
  const parts = ids.map((sel) => {
    const el = sel.startsWith("#") || sel.startsWith(".") ? document.querySelector(sel) : strip;
    return {
      sel,
      offsetHeight: el ? el.offsetHeight : null,
      scrollHeight: el ? el.scrollHeight : null,
      position: el ? getComputedStyle(el).position : null
    };
  });
  const stripParent = document.querySelector(".ar-do-next-badge__circle")
    ? document.querySelector(".ar-do-next-badge__circle").closest("#ar-do-next-strip")
    : null;
  const matchedRules = [];
  const stripRules = [];
  function walkRules(rules) {
    for (const rule of rules) {
      if (rule.cssRules) {
        walkRules(rule.cssRules);
        continue;
      }
      if (!rule.selectorText) continue;
      if (rule.selectorText.indexOf("ar-do-next-badge__circle") !== -1) {
        matchedRules.push(rule.selectorText);
      }
      if (rule.selectorText.indexOf("ar-do-next-strip") !== -1) {
        stripRules.push(rule.selectorText);
      }
    }
  }
  try {
    for (const sheet of document.styleSheets) {
      try {
        walkRules(sheet.cssRules);
      } catch (e) {
        stripRules.push("blocked:" + e.message);
      }
    }
  } catch (e) {
    stripRules.push(String(e));
  }
  const row = document.querySelector(".ar-do-next-badge-rail__row");
  const badges = [...document.querySelectorAll(".ar-do-next-badge")].map((b, i) => {
    const kids = [...b.children].map((c) => ({
      tag: c.tagName,
      cls: c.className,
      oh: c.offsetHeight
    }));
    return { i, offsetHeight: b.offsetHeight, childCount: b.childElementCount, kids };
  });
  return {
    pathname: location.pathname,
    pinStack: document.documentElement.classList.contains("ar-dashboard-pin-stack"),
    headerPos: getComputedStyle(document.getElementById("ar-academy-header-container")).position,
    stripDisplay: getComputedStyle(strip).display,
    fillerTop: document.getElementById("filler").getBoundingClientRect().top,
    rowOffsetHeight: row ? row.offsetHeight : null,
    badgeCount: badges.length,
    badges,
    stripParent: !!stripParent,
    matchedCircleRules: matchedRules,
    stripRuleCount: stripRules.length,
    stripRuleSample: stripRules.slice(0, 5),
    htmlClass: document.documentElement.className,
    rowFlexDirection: row ? getComputedStyle(row).flexDirection : null,
    rowAlignItems: row ? getComputedStyle(row).alignItems : null,
    badgeFlex: document.querySelector(".ar-do-next-badge")
      ? getComputedStyle(document.querySelector(".ar-do-next-badge")).flex
      : null,
    circleComputed: (() => {
      const c = document.querySelector(".ar-do-next-badge__circle");
      if (!c) return null;
      const cs = getComputedStyle(c);
      return { width: cs.width, height: cs.height, display: cs.display, flex: cs.flex };
    })(),
    parts
  };
});

const outPath = path.join(__dirname, "debug-out.json");
const hasCircleCss = pageHtml.includes("min-height:46px") && pageHtml.includes("ar-do-next-badge__circle");
fs.writeFileSync(outPath, JSON.stringify({ ...info, hasCircleCss }, null, 2));
console.log("wrote", outPath);
console.log(
  "summary",
  JSON.stringify({
    rowOffsetHeight: info.rowOffsetHeight,
    circleOH: info.badges[0] && info.badges[0].kids[0] && info.badges[0].kids[0].oh,
    circleComputed: info.circleComputed,
    fillerTop: info.fillerTop
  })
);
await browser.close();
server.close();
