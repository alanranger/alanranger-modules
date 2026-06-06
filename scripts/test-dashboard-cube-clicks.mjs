/**
 * Browser integration: full dashboard snippet — cube open + tracking.
 * Run: node scripts/test-dashboard-cube-clicks.mjs
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
  window.__testState = {
    storedJson: { arAcademy: { modules: { opened: {} } }, history: [], bookmarks: [] },
    updates: [],
    opens: []
  };
  window.$memberstackDom = {
    getCurrentMember: async function() {
      return {
        id: "mem_test_live",
        data: {
          id: "mem_test_live",
          email: "algenon@hotmail.com",
          planConnections: [{ status: "active", planId: "pln_academy_annual", payment: { priceId: "prc_annual" } }],
          customFields: { "first-name": "Alan", "last-name": "Test" }
        }
      };
    },
    getMemberJSON: async function() {
      return { data: { json: window.__testState.storedJson } };
    },
    updateMemberJSON: async function(payload) {
      if (payload && payload.json) {
        window.__testState.storedJson = payload.json;
        window.__testState.updates.push(JSON.parse(JSON.stringify(payload.json)));
      }
      return { data: payload };
    }
  };
  var _open = window.open;
  window.open = function(url, target, features) {
    window.__testState.opens.push({ url: url, target: target || "" });
    return null;
  };
</script>
`;

const pageHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Dashboard cube click test</title>
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
  res.writeHead(302, { Location: "/academy/dashboard" });
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
await page.waitForSelector("#ar-modules-mini-grid .ar-module-cube", { timeout: 45000 });

const pdfCube = page.locator('.ar-module-cube[data-is-pdf="true"]').first();
const pdfUrl = await pdfCube.getAttribute("data-module-url");
await pdfCube.click();

await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const pdf = document.querySelector('.ar-module-cube[data-is-pdf="true"]');
  const blog = document.querySelector('.ar-module-cube[data-is-pdf="false"]');
  return {
    testState: window.__testState,
    pdfClass: pdf ? pdf.className : null,
    blogClass: blog ? blog.className : null,
    gridVisible: !!document.querySelector("#ar-modules-mini-grid .ar-module-cube"),
    memberIdSet: typeof window.$memberstackDom !== "undefined"
  };
});

await browser.close();
server.close();

const pass =
  errors.length === 0 &&
  result.gridVisible &&
  result.testState.opens.length === 1 &&
  result.testState.opens[0].url === "https://www.alanranger.com" + pdfUrl &&
  result.pdfClass && result.pdfClass.indexOf("status-opened") !== -1 &&
  result.testState.updates.length >= 1 &&
  result.testState.storedJson.arAcademy &&
  result.testState.storedJson.arAcademy.modules.opened &&
  Object.keys(result.testState.storedJson.arAcademy.modules.opened).length >= 1;

console.log(
  JSON.stringify(
    {
      pass,
      url,
      errors,
      pdfUrl,
      opens: result.testState.opens,
      updates: result.testState.updates.length,
      pdfClass: result.pdfClass,
      openedKeys: Object.keys(
        (result.testState.storedJson.arAcademy && result.testState.storedJson.arAcademy.modules.opened) || {}
      )
    },
    null,
    2
  )
);

process.exit(pass ? 0 : 1);
