/**
 * Audit all trackable dashboard links (~190).
 * Run: npm run audit:dashboard-links
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const catalogLib = require(path.join(root, "lib/academy-dashboard-catalog.js"));
const openedState = require(path.join(root, "lib/academy-opened-state.js"));
const { isPdfModuleUrl } = require(path.join(root, "lib/academy-cube-open.js"));

const html = catalogLib.loadDashboardHtml(root);
const catalog = catalogLib.buildCatalog(html);
const mismatches = [];

catalog.forEach((link) => {
  if (!link.targetUrl || link.targetUrl === "#") {
    mismatches.push({ ...link, issue: "missing_target_url" });
  }
  if (link.isPdf !== isPdfModuleUrl(link.targetUrl)) {
    mismatches.push({ ...link, issue: "is_pdf_flag_mismatch" });
  }
  if (link.trackSection === "modules" && link.targetUrl) {
    const sampleMap = {
      [`https://www.alanranger.com${link.targetUrl}`]: { at: "2020-01-01" },
    };
    if (!openedState.isPathOpened(sampleMap, link.targetUrl)) {
      mismatches.push({ ...link, issue: "full_url_key_not_recognised" });
    }
    const normMap = { [link.targetUrl]: { at: "2020-01-01" } };
    if (!openedState.isPathOpened(normMap, link.targetUrl)) {
      mismatches.push({ ...link, issue: "normalised_key_not_recognised" });
    }
  }
});

const bySection = catalog.reduce((acc, link) => {
  acc[link.section] = (acc[link.section] || 0) + 1;
  return acc;
}, {});

const report = {
  auditedAt: new Date().toISOString(),
  totalTrackableLinks: catalog.length,
  catalogSlotsIncludingPlaceholders: 205,
  rpsComingSoonNotTracked: 4,
  bySection,
  mismatches,
  catalog,
};

console.log(JSON.stringify(report, null, 2));

const expectedTrackable = 201;
if (catalog.length !== expectedTrackable) {
  console.error(`FAIL: expected ${expectedTrackable} trackable links, got ${catalog.length}`);
  process.exit(1);
}
if (mismatches.length > 0) {
  console.error(`FAIL: ${mismatches.length} audit issue(s)`);
  process.exit(1);
}
console.log(`OK: ${catalog.length} dashboard links audited, 0 issues`);
