/**
 * Regression: slow Memberstack hydrate on dashboard return must not bounce to login.
 * Run: node scripts/test-dashboard-auth-hydrate.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(
  "G:/Dropbox/alan ranger photography/Website Code/AI GEO Audit/package.json"
);
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const snippet = fs.readFileSync(
  path.join(root, "academy-dashboard-squarespace-snippet-v1.html"),
  "utf8"
);

const mockBootstrap = `
<script>
  window.__hydrateCalls = 0;
  window.__testState = { redirects: [] };
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
  sessionStorage.setItem("ar-dashboard-session-v1", JSON.stringify({
    id: "mem_slow_hydrate",
    at: Date.now()
  }));
  window.$memberstackDom = {
    getCurrentMember: async function() {
      window.__hydrateCalls += 1;
      if (window.__hydrateCalls < 6) return null;
      return {
        id: "mem_slow_hydrate",
        data: {
          id: "mem_slow_hydrate",
          email: "member@example.com",
          planConnections: [{ status: "active", planId: "pln_academy_annual", payment: { priceId: "prc_annual" } }]
        }
      };
    },
    getMemberJSON: async function() {
      if (window.__hydrateCalls < 6) return null;
      return { data: { json: { arAcademy: { modules: { opened: {} } } } } };
    }
  };
</script>
`;

const pageHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Dashboard auth hydrate test</title>
</head>
<body>
${mockBootstrap}
${snippet}
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/academy/dashboard")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pageHtml);
    return;
  }
  if (req.url && req.url.startsWith("/api/exams/progress")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ modules: [] }));
    return;
  }
  if (req.url && req.url.startsWith("/api/exams/whoami")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      memberstack_id: "mem_slow_hydrate",
      email: "member@example.com",
      planConnections: [{ status: "active", planId: "pln_academy_annual" }]
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/academy/dashboard`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000);

const result = await page.evaluate(() => ({
  redirects: window.__testState.redirects,
  hydrateCalls: window.__hydrateCalls,
  dashboardReady: document.querySelector(".ar-academy-dashboard.is-ready") !== null,
  pathname: window.location.pathname
}));

await browser.close();
server.close();

const loginRedirects = result.redirects.filter((u) => u.indexOf("/academy/login") !== -1);
const pass =
  errors.length === 0 &&
  loginRedirects.length === 0 &&
  result.pathname.indexOf("/academy/dashboard") !== -1 &&
  result.dashboardReady &&
  result.hydrateCalls >= 6;

console.log(
  JSON.stringify(
    {
      pass,
      url,
      errors,
      hydrateCalls: result.hydrateCalls,
      loginRedirects,
      dashboardReady: result.dashboardReady,
      pathname: result.pathname
    },
    null,
    2
  )
);

process.exit(pass ? 0 : 1);
