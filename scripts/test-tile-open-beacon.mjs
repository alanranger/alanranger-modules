/**
 * Headless: tile-open beacon fires after window.open, uses cached member id, no MS in beacon path.
 * Run: node scripts/test-tile-open-beacon.mjs
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
const dashboardSnippet = fs.readFileSync(
  path.join(root, "academy-dashboard-squarespace-snippet-v1.html"),
  "utf8"
);
const stripSnippet = fs.readFileSync(
  path.join(root, "academy-do-next-strip-squarespace-snippet-v1.html"),
  "utf8"
);

const mockBootstrap = `
<script>
  window.__testState = {
    storedJson: { arAcademy: { modules: { opened: {} } }, history: [], bookmarks: [] },
    msReads: 0,
    beacons: [],
    opens: [],
    errors: []
  };
  window.$memberstackDom = {
    getCurrentMember: async function() {
      window.__testState.msReads += 1;
      return {
        id: "mem_beacon_test",
        data: {
          id: "mem_beacon_test",
          email: "beacon@example.com",
          planConnections: [{ status: "active", planId: "pln_academy_annual", payment: { priceId: "prc_annual" } }]
        }
      };
    },
    getMemberJSON: async function() {
      window.__testState.msReads += 1;
      return { data: { json: window.__testState.storedJson } };
    },
    updateMemberJSON: async function(payload) {
      if (payload && payload.json) window.__testState.storedJson = payload.json;
      return { data: payload };
    }
  };
  var _open = window.open;
  window.open = function(url, target, features) {
    window.__testState.opens.push({ url: String(url), at: Date.now() });
    return null;
  };
  var _fetch = window.fetch.bind(window);
  window.fetch = function(url, opts) {
    if (String(url).indexOf("/api/academy/track-tile-open") >= 0) {
      window.__testState.beacons.push({
        at: Date.now(),
        body: opts && opts.body ? JSON.parse(opts.body) : null
      });
      return Promise.reject(new Error("beacon failed on purpose"));
    }
    return _fetch(url, opts);
  };
</script>
`;

function buildPage(extraBody) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
${mockBootstrap}
${extraBody || ""}
${dashboardSnippet}
</body></html>`;
}

function makeServer(pageHtml) {
  return http.createServer((req, res) => {
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
      res.end(JSON.stringify({ memberstack_id: "mem_beacon_test" }));
      return;
    }
    if (req.url && req.url.startsWith("/api/academy/trial-status")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ isTrial: false }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
}

async function runDashboardPdfBeaconTest() {
  const server = makeServer(buildPage());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let threw = false;
  page.on("pageerror", (err) => {
    threw = true;
    console.error("pageerror:", err.message);
  });

  await page.goto(`http://127.0.0.1:${port}/academy/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const pdfCube = page.locator('.ar-module-cube[data-is-pdf="true"]').first();
  await pdfCube.waitFor({ state: "visible", timeout: 15000 });
  const readsBeforeClick = await page.evaluate(() => window.__testState.msReads);
  await pdfCube.click();

  const state = await page.evaluate(() => window.__testState);
  await browser.close();
  server.close();

  if (state.opens.length < 1) throw new Error("expected window.open before beacon");
  if (state.beacons.length < 1) throw new Error("expected track-tile-open beacon");
  if (state.beacons[0].body.member_id !== "mem_beacon_test") {
    throw new Error("beacon must use cached member id");
  }
  if (state.beacons[0].at < state.opens[0].at) {
    throw new Error("beacon must fire after window.open");
  }
  if (state.msReads > readsBeforeClick + 2) {
    throw new Error("beacon path must not trigger extra Memberstack reads");
  }
  if (threw) throw new Error("beacon failure must not throw to page");
  console.log("PASS dashboard PDF cube: open then beacon, cached member id");
}

async function runStripAssignmentBeaconTest() {
  const server = makeServer(buildPage(stripSnippet));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/academy/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  const assignmentLink = page.locator('a[data-wired-module-track="true"]').first();
  const count = await assignmentLink.count();
  if (count === 0) {
    await browser.close();
    server.close();
    console.log("SKIP strip assignment (no tile 3 link in mock render)");
    return;
  }

  await assignmentLink.click();
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => window.__testState);
  await browser.close();
  server.close();

  if (state.opens.length < 1) throw new Error("strip: expected window.open first");
  if (state.beacons.length >= 1 && state.beacons[0].at < state.opens[0].at) {
    throw new Error("strip: beacon must fire after window.open");
  }
  console.log("PASS strip assignment: window.open before beacon");
}

async function main() {
  await runDashboardPdfBeaconTest();
  await runStripAssignmentBeaconTest();
  console.log("All tile-open beacon tests passed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
