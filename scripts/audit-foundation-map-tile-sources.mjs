/* eslint-env node */
/**
 * Static audit: dashboard vs modules-map tile identity + opened-state sources.
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

function extractFpPaths(html) {
  const re = /data-fp-path="([^"]+)"/g;
  const set = new Set();
  let m;
  while ((m = re.exec(html))) set.add(normalizePath(m[1]));
  return set;
}

function extractApplied(html) {
  const re = /data-applied-id="([^"]+)"[^>]*href="([^"]+)"/g;
  const rows = [];
  let m;
  while ((m = re.exec(html))) {
    rows.push({ id: m[1], path: normalizePath(m[2]) });
  }
  return rows;
}

function extractRps(html) {
  const re = /data-rps-link="([^"]+)"[^>]*href="([^"]+)"/g;
  const rows = [];
  let m;
  while ((m = re.exec(html))) {
    rows.push({ id: m[1], path: normalizePath(m[2]) });
  }
  return rows;
}

function extractFpSectionSpecs(html) {
  const marker = "var FP_MAP_SECTION_SPECS = ";
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf(";\n", jsonStart);
  return JSON.parse(html.slice(jsonStart, jsonEnd));
}

const fpHtml = read(fpFile);
const dashHtml = read(dashFile);
const fpPaths = extractFpPaths(fpHtml);
const specs = extractFpSectionSpecs(fpHtml);
const applied = extractApplied(dashHtml);
const rps = extractRps(dashHtml);

const appliedPaths = new Set(applied.map((r) => r.path));
const rpsPaths = new Set(rps.map((r) => r.path));
const specApplied = specs.find((s) => s.id === "applied-learning")?.paths?.map(normalizePath) || [];
const specRps = specs.find((s) => s.id === "rps-distinctions")?.paths?.map(normalizePath) || [];

function diff(label, a, b) {
  const missing = [...a].filter((x) => !b.has(x));
  return { label, aCount: a.size, bCount: b.size, missingInB: missing };
}

console.log("=== Modules map tile source audit ===\n");
console.log("Foundation + paid tiles on map (data-fp-path):", fpPaths.size);
console.log(
  "Applied Learning: dashboard cubes",
  applied.length,
  "| map spec paths",
  specApplied.length,
  "| map DOM paths in AL zone",
  [...fpPaths].filter((p) => specApplied.includes(p)).length
);
console.log(
  "RPS: dashboard cubes",
  rps.length,
  "| map spec paths",
  specRps.length
);

const alDiffDashToSpec = specApplied.filter((p) => !appliedPaths.has(p));
const alDiffSpecToDash = [...appliedPaths].filter((p) => !specApplied.includes(p));
console.log("\nApplied Learning path mismatches (dashboard href vs map spec):");
console.log("  In map spec but not dashboard:", alDiffDashToSpec.length ? alDiffDashToSpec : "none");
console.log("  In dashboard but not map spec:", alDiffSpecToDash.length ? alDiffSpecToDash : "none");

const rpsDiff = specRps.filter((p) => !rpsPaths.has(p));
console.log("\nRPS path mismatches (map spec vs dashboard href, query stripped):");
console.log(rpsDiff.length ? rpsDiff : "none");

console.log("\nOpened-state sources after FP 1.0.44:");
console.log("  Foundation 1-60 + assignments: arAcademy.modules.opened (paths)");
console.log("  Practice packs + checklists: arAcademy.modules.opened (paths)");
console.log("  Applied Learning (40): arAcademy.appliedLearning.opened → url paths (was stale engagement count)");
console.log("  RPS (6): arAcademy.rps.opened → url paths");
console.log("\nDashboard opened-state sources:");
console.log("  Foundation: modules.opened + local tracking");
console.log("  Applied Learning: appliedLearning.opened keys (data-applied-id) + localStorage mirror");
console.log("  RPS: rps.opened keys (data-rps-link) + localStorage mirror");
