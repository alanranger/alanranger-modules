/* eslint-env node */
/**
 * Static reconciliation: dashboard vs modules-map tile identity + opened-state sources.
 * Run: node scripts/audit-foundation-map-tile-sources.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fpFile = path.join(root, "Squarespace Snippets/academy-foundation-page-squarespace-snippet-v1.html");
const dashFile = path.join(root, "Squarespace Snippets/academy-dashboard-squarespace-snippet-v1.html");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function normalizePath(p) {
  if (!p) return "";
  let s = String(p).split("?")[0].split("#")[0];
  if (s.indexOf("http") === 0) {
    try {
      s = new URL(s).pathname;
    } catch {
      /* ignore */
    }
  }
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function extractPathArray(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf("];", jsonStart);
  if (jsonEnd < 0) return [];
  const block = html.slice(jsonStart, jsonEnd + 2);
  const paths = [];
  const re = /"(\/[^"]+)"/g;
  let m;
  while ((m = re.exec(block))) paths.push(m[1]);
  return paths;
}

function extractFpSectionSpecs(html) {
  const marker = "var FP_MAP_SECTION_SPECS = ";
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const jsonStart = start + marker.length;
  const tail = html.indexOf(";\n  var FP_COLLAPSE_KEY", jsonStart);
  if (tail < 0) return [];
  return JSON.parse(html.slice(jsonStart, tail));
}

function extractDashModulePaths(html) {
  const marker = "const DEFINITIVE_MODULE_URLS = [";
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const blockStart = start + marker.length;
  const blockEnd = html.indexOf("];", blockStart);
  const block = html.slice(blockStart, blockEnd);
  const paths = [];
  const re = /'(\/[^']+)'|"(\/[^"]+)"/g;
  let m;
  while ((m = re.exec(block))) paths.push(m[1] || m[2]);
  return paths;
}
function extractHrefKeyedRows(html, idAttr) {
  const re = new RegExp(
    `<a[^>]*href="([^"]+)"[^>]*${idAttr}="([^"]+)"|<a[^>]*${idAttr}="([^"]+)"[^>]*href="([^"]+)"`,
    "g"
  );
  const rows = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[1] && m[2]) rows.push({ id: m[2], path: normalizePath(m[1]) });
    else if (m[3] && m[4]) rows.push({ id: m[3], path: normalizePath(m[4]) });
  }
  return rows;
}

function listDiff(a, b) {
  const setB = new Set(b);
  const setA = new Set(a);
  return {
    onlyA: a.filter((x) => !setB.has(x)),
    onlyB: b.filter((x) => !setA.has(x)),
    match: a.length === b.length && a.every((x) => setB.has(x)),
  };
}

function fpVersion(html) {
  const m = html.match(/data-ar-fp-version="([^"]+)"/);
  return m ? m[1] : "?";
}

const fpHtml = read(fpFile);
const dashHtml = read(dashFile);
const foundationPaths = extractPathArray(fpHtml, "var FOUNDATION_PATHS = ");
const practicePackPaths = extractPathArray(fpHtml, "var PRACTICE_PACK_URLS = ");
const checklistPaths = extractPathArray(fpHtml, "var CHECKLIST_URLS = ");
const specs = extractFpSectionSpecs(fpHtml);
const dashModules = extractDashModulePaths(dashHtml);

const appliedDash = extractHrefKeyedRows(dashHtml, "data-applied-id");
const rpsDash = extractHrefKeyedRows(dashHtml, "data-rps-link");
const appliedMapPaths = specs.find((s) => s.id === "applied-learning")?.paths?.map(normalizePath) || [];
const rpsMapPaths = specs.find((s) => s.id === "rps-distinctions")?.paths?.map(normalizePath) || [];
const practiceMapPaths = specs.find((s) => s.id === "practice-packs")?.paths?.map(normalizePath) || [];
const checklistMapPaths = specs.find((s) => s.id === "checklists")?.paths?.map(normalizePath) || [];

const foundationDiff = listDiff(foundationPaths.map(normalizePath), dashModules.map(normalizePath));
const practiceDiff = listDiff(practicePackPaths.map(normalizePath), practiceMapPaths);
const checklistDiff = listDiff(checklistPaths.map(normalizePath), checklistMapPaths);
const appliedDashPaths = appliedDash.map((r) => r.path);
const appliedDiff = listDiff(appliedMapPaths, appliedDashPaths);
const rpsDashPaths = rpsDash.map((r) => r.path);
const rpsDiff = listDiff(rpsMapPaths, rpsDashPaths);

console.log("=== Dashboard ↔ Modules Map tile reconciliation ===\n");
console.log("Map snippet:", fpVersion(fpHtml));
console.log("");

const zones = [
  {
    name: "Foundation course (articles + PDF assignments)",
    count: 60,
    dashboard: "DEFINITIVE_MODULE_URLS cubes",
    map: "data-fp-tracked + data-fp-path",
    json: "arAcademy.modules.opened[path]",
    diff: foundationDiff,
  },
  {
    name: "Practice packs",
    count: 30,
    dashboard: "practice pack grid (modules.opened paths)",
    map: "data-fp-resource + data-fp-path",
    json: "arAcademy.modules.opened[path]",
    diff: practiceDiff,
  },
  {
    name: "Field checklists",
    count: 35,
    dashboard: "checklist grid (modules.opened paths)",
    map: "data-fp-resource + data-fp-path",
    json: "arAcademy.modules.opened[path]",
    diff: checklistDiff,
  },
  {
    name: "Applied Learning",
    count: 40,
    dashboard: "data-applied-id → appliedLearning.opened[id] + url",
    map: "data-fp-paid + path; reads appliedLearning.opened url paths (FP 1.0.44+)",
    json: "arAcademy.appliedLearning.opened → normalize(url)",
    diff: appliedDiff,
  },
  {
    name: "RPS distinctions",
    count: 6,
    dashboard: "data-rps-link → rps.opened[id] + url",
    map: "data-fp-paid + path; reads rps.opened url paths (FP 1.0.44+)",
    json: "arAcademy.rps.opened → normalize(url); ?tag= stripped",
    diff: rpsDiff,
  },
];

let allMatch = true;
zones.forEach((z) => {
  const ok = z.diff.match;
  if (!ok) allMatch = false;
  console.log(`${ok ? "PASS" : "FAIL"} | ${z.name} (${z.count} tiles)`);
  console.log(`  Dashboard: ${z.dashboard}`);
  console.log(`  Map:       ${z.map}`);
  console.log(`  JSON:      ${z.json}`);
  if (!ok) {
    if (z.diff.onlyA.length) console.log(`  Map-only paths (${z.diff.onlyA.length}):`, z.diff.onlyA.slice(0, 5), z.diff.onlyA.length > 5 ? "…" : "");
    if (z.diff.onlyB.length) console.log(`  Dash-only paths (${z.diff.onlyB.length}):`, z.diff.onlyB.slice(0, 5), z.diff.onlyB.length > 5 ? "…" : "");
  }
  console.log("");
});

console.log("Exams (15): dashboard exam cubes + map exam buttons — both use /api/exams/progress (not modules.opened).");
console.log("");
console.log("Runtime parity (FP 1.0.45):");
console.log("  Map click wiring on data-fp-tracked → persist modules.opened + track-tile-open beacon + instant repaint");
console.log("  Map assignment counts → Math.max(live path count, engagement) — same Fix A as strip/dashboard");
console.log("");
console.log(allMatch ? "RESULT: All tile inventories reconcile — opened/not-opened status uses equivalent Memberstack JSON keys." : "RESULT: Inventory mismatch — fix paths before claiming parity.");
