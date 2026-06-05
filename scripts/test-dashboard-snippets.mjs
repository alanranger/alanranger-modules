/**
 * Local integration test: header + do-next + minimal dashboard shell.
 * Run: node scripts/test-dashboard-snippets.mjs
 */
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(
  "G:/Dropbox/alan ranger photography/Website Code/AI GEO Audit/package.json"
);
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readSnippet(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function extractParts(html) {
  const style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || "";
  const body = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return { style, body, scripts };
}

const header = extractParts(readSnippet("academy-header-elements-squarespace-snippet-v1.html"));
const strip = extractParts(readSnippet("academy-do-next-strip-squarespace-snippet-v1.html"));

const pageHtml = `<!DOCTYPE html>
<html class="ar-academy">
<head>
  <meta charset="utf-8" />
  <title>Academy dashboard snippet test</title>
  <style>
    body { margin: 0; background: #0f1419; font-family: system-ui, sans-serif; }
    .sqs-layout { max-width: 1400px; margin: 0 auto; padding: 20px; color: #fff; }
    .tall { height: 2400px; background: linear-gradient(#0f1419, #1a2030); }
  </style>
  <style id="ar-academy-header-style">${header.style}</style>
  <style id="ar-do-next-strip-style">${strip.style}</style>
</head>
<body>
  <header id="header" style="height:72px;background:#fff;border-bottom:1px solid #ddd;display:flex;align-items:center;padding:0 20px;position:sticky;top:0;z-index:999;">Sqsp nav mock</header>
  ${header.body}
  ${strip.body}
  <div class="sqs-layout">
    <div class="ar-academy-dashboard is-ready" style="opacity:1;min-height:400px;">
      <p>Dashboard tiles area mock</p>
    </div>
    <div class="tall">Scroll test filler</div>
  </div>
  <script>
    window.$memberstackDom = {
      getCurrentMember: async () => ({
        id: "mem_test",
        data: {
          id: "mem_test",
          email: "test@example.com",
          customFields: { "first-name": "Alan", "last-name": "Ranger" }
        }
      }),
      getMemberJSON: async () => ({
        data: {
          arAcademy: {
            modules: {
              opened: {
                "/blog-on-photography/what-is-exposure-in-photography": true,
                "/blog-on-photography/what-is-aperture-in-photography": true
              }
            }
          }
        }
      })
    };
  </script>
  ${header.scripts.map((s) => `<script>${s}</script>`).join("\n")}
  ${strip.scripts.map((s) => `<script>${s}</script>`).join("\n")}
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/academy/dashboard")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pageHtml);
    return;
  }
  res.writeHead(302, { Location: "/academy/dashboard" });
  res.end();
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/academy/dashboard`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const strip = document.getElementById("ar-do-next-strip");
  const header = document.getElementById("ar-academy-header-container");
  const welcome = document.getElementById("ar-academy-header-welcome-text");
  const badge = document.getElementById("ar-do-next-banner-stage");
  const tiles = document.querySelectorAll("#ar-do-next-tiles .ar-do-next-tile").length;
  const cs = strip ? getComputedStyle(strip) : null;
  return {
    stripExists: !!strip,
    stripReady: strip ? strip.classList.contains("is-ready") : false,
    stripDisplay: cs ? cs.display : null,
    stripHeight: strip ? strip.getBoundingClientRect().height : 0,
    stripInnerHeight: strip
      ? (strip.querySelector(".ar-do-next-strip__inner") || strip).offsetHeight
      : 0,
    tileCount: tiles,
    headerPosition: header ? getComputedStyle(header).position : null,
    pinStack: document.documentElement.classList.contains("ar-dashboard-pin-stack"),
    welcomeText: welcome ? welcome.textContent.trim() : null,
    badgeExists: !!badge,
    headerSpacer: !!document.getElementById("ar-academy-header-spacer"),
    stripSpacer: !!document.getElementById("ar-do-next-strip-spacer"),
    coach: window.__arDoNextStrip || null
  };
});

await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(400);
const afterScroll = await page.evaluate(() => {
  const strip = document.getElementById("ar-do-next-strip");
  const header = document.getElementById("ar-academy-header-container");
  const doc = document.documentElement;
  const tile3 = document.querySelector("#ar-do-next-tiles .ar-do-next-tile:nth-child(5)");
  return {
    headerTop: header ? Math.round(header.getBoundingClientRect().top) : null,
    stripTop: strip ? Math.round(strip.getBoundingClientRect().top) : null,
    headerPosition: header ? getComputedStyle(header).position : null,
    stripPosition: strip ? getComputedStyle(strip).position : null,
    pinStack: document.documentElement.classList.contains("ar-dashboard-pin-stack"),
    stripScrollOverflow: strip ? strip.scrollWidth === strip.clientWidth : null,
    docScrollOverflow: doc.scrollWidth === doc.clientWidth,
    tile3Href: tile3 ? tile3.getAttribute("href") : null,
    tile3Target: tile3 ? tile3.getAttribute("target") : null,
    tile3Tracked: tile3 ? tile3.getAttribute("data-wired-module-track") === "true" : null,
    tile3Action: tile3 ? tile3.querySelector(".ar-do-next-tile__action")?.textContent?.trim() : null
  };
});

await browser.close();
server.close();

const pass =
  state.stripExists &&
  state.stripReady &&
  state.stripDisplay === "block" &&
  state.stripHeight > 40 &&
  state.stripHeight < 1200 &&
  state.tileCount === 4 &&
  state.pinStack &&
  state.stripSpacer &&
  afterScroll.pinStack &&
  afterScroll.headerPosition === "fixed" &&
  afterScroll.stripPosition === "fixed" &&
  afterScroll.headerTop >= 70 &&
  afterScroll.headerTop <= 74 &&
  afterScroll.stripTop > 0 &&
  afterScroll.stripScrollOverflow === true &&
  afterScroll.docScrollOverflow === true &&
  afterScroll.tile3Href &&
  afterScroll.tile3Href.includes("/s/") &&
  afterScroll.tile3Target === "_blank" &&
  afterScroll.tile3Tracked === true &&
  afterScroll.tile3Action &&
  afterScroll.tile3Action.includes("practical assignment") &&
  errors.length === 0;

console.log(JSON.stringify({ pass, url, errors, before: state, afterScroll }, null, 2));
process.exit(pass ? 0 : 1);
