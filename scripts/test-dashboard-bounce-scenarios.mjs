/**
 * Multi-scenario bounce tests (local Playwright + mocked Memberstack).
 * Run: node scripts/test-dashboard-bounce-scenarios.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { DASHBOARD_SNIPPET } from "./snippet-paths.mjs";

const require = createRequire(
  "G:/Dropbox/alan ranger photography/Website Code/AI GEO Audit/package.json"
);
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const snippet = fs.readFileSync(DASHBOARD_SNIPPET, "utf8");

function buildPage(mockBootstrap) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
${mockBootstrap}
${snippet}
</body></html>`;
}

function makeServer(pageHtml) {
  const server = http.createServer((req, res) => {
    if (req.url && req.url.startsWith("/academy/dashboard")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(pageHtml);
      return;
    }
    if (req.url && req.url.startsWith("/blogs/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body><a href='/academy/dashboard'>Back to Dashboard</a></body></html>");
      return;
    }
    if (req.url && req.url.startsWith("/api/exams/progress")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ modules: [] }));
      return;
    }
    if (req.url && req.url.startsWith("/api/exams/whoami")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ memberstack_id: null }));
      return;
    }
    if (req.url && req.url.startsWith("/api/academy/trial-status")) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "fail" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return server;
}

const redirectHook = `
<script>
  window.__testState = { redirects: [], authLogs: [] };
  var _assign = window.location.assign.bind(window.location);
  window.location.assign = function(url) {
    window.__testState.redirects.push(String(url));
    _assign(url);
  };
  var _replace = window.location.replace.bind(window.location);
  window.location.replace = function(url) {
    window.__testState.redirects.push(String(url));
    _replace(url);
  };
  var _log = console.log.bind(console);
  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    if (args[0] === "[AR-AUTH]") window.__testState.authLogs.push(args[1]);
    return _log.apply(console, args);
  };
</script>`;

const scenarios = [
  {
    id: "slow-hydrate-marker",
    desc: "Session marker + MS null x5 then member (article-return shape)",
    bootstrap: `
${redirectHook}
<script>
  sessionStorage.setItem("ar-dashboard-session-v1", JSON.stringify({ id: "mem_a", at: Date.now() }));
  var n = 0;
  window.$memberstackDom = {
    getCurrentMember: async function() {
      n++; if (n < 6) return null;
      return { id: "mem_a", data: { id: "mem_a", planConnections: [{ status: "active", planId: "pln_x", payment: { priceId: "prc_x" } }] } };
    },
    getMemberJSON: async function() { return n < 6 ? null : { data: { json: {} } }; }
  };
</script>`
  },
  {
    id: "ms-never-loads-marker",
    desc: "Session marker + $memberstackDom never appears (27s path)",
    bootstrap: `
${redirectHook}
<script>
  sessionStorage.setItem("ar-dashboard-session-v1", JSON.stringify({ id: "mem_b", at: Date.now() }));
</script>`
  },
  {
    id: "member-no-plan-marker",
    desc: "Session marker + member with no plans + trial-status 500",
    bootstrap: `
${redirectHook}
<script>
  sessionStorage.setItem("ar-dashboard-session-v1", JSON.stringify({ id: "mem_c", at: Date.now() }));
  window.$memberstackDom = {
    getCurrentMember: async function() {
      return { id: "mem_c", data: { id: "mem_c", planConnections: [] } };
    },
    getMemberJSON: async function() { return { data: { json: {} } }; },
    logout: function() { window.__testState.redirects.push("ms.logout-called"); }
  };
</script>`
  },
  {
    id: "article-return-navigation",
    desc: "Dashboard OK -> article -> Back to Dashboard with MS slow on return",
    bootstrap: `
${redirectHook}
<script>
  sessionStorage.setItem("ar-dashboard-session-v1", JSON.stringify({ id: "mem_d", at: Date.now() }));
  window.__testPhase = "first";
  window.$memberstackDom = {
    getCurrentMember: async function() {
      if (window.__testPhase === "first") {
        return { id: "mem_d", data: { id: "mem_d", planConnections: [{ status: "active", planId: "pln_x", payment: { priceId: "prc_x" } }] } };
      }
      return null;
    },
    getMemberJSON: async function() {
      if (window.__testPhase === "first") return { data: { json: {} } };
      return null;
    }
  };
</script>`
  }
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const sc of scenarios) {
  const server = makeServer(buildPage(sc.bootstrap));
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const page = await browser.newPage();
  const waitMs = sc.id === "ms-never-loads-marker" ? 28000 : 14000;

  try {
    if (sc.id === "article-return-navigation") {
      await page.goto(`${base}/academy/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => { window.__testPhase = "return"; });
      await page.goto(`${base}/blogs/test-article`, { waitUntil: "domcontentloaded" });
      await page.click('a[href="/academy/dashboard"]');
      await page.waitForTimeout(waitMs);
    } else {
      await page.goto(`${base}/academy/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(waitMs);
    }

    const out = await page.evaluate(() => {
      var trace = [];
      try { trace = JSON.parse(sessionStorage.getItem("ar-auth-trace") || "[]"); } catch (e) { trace = []; }
      return {
        redirects: (window.__testState && window.__testState.redirects) || [],
        authLogs: (window.__testState && window.__testState.authLogs) || [],
        trace: trace,
        pathname: window.location.pathname,
        ready: document.querySelector(".ar-academy-dashboard.is-ready") !== null
      };
    });

    const loginRedirects = out.redirects.filter((u) => String(u).indexOf("/academy/login") !== -1);
    const pass = loginRedirects.length === 0 && out.pathname.indexOf("/academy/dashboard") !== -1;
    results.push({ id: sc.id, desc: sc.desc, pass, loginRedirects, authLogs: out.authLogs, trace: out.trace, pathname: out.pathname, ready: out.ready });
  } catch (err) {
    results.push({ id: sc.id, desc: sc.desc, pass: false, error: String(err) });
  } finally {
    await page.close();
    server.close();
  }
}

await browser.close();

const allPass = results.every((r) => r.pass);
console.log(JSON.stringify({ allPass, results }, null, 2));
process.exit(allPass ? 0 : 1);
