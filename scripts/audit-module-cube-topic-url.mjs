/**
 * Full topic<->URL audit for all 60 foundation module cubes.
 * Compares lib SSOT vs dashboard, strip, and bookmark snippets.
 * Run: node scripts/audit-module-cube-topic-url.mjs
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const lib = require(path.join(root, "lib/academy-module-paths.js"));
const topics = require(path.join(root, "lib/academy-module-topics.js"));
const cubeOpen = require(path.join(root, "lib/academy-cube-open.js"));

function extractDashboardPaths(html) {
  const start = html.indexOf("DEFINITIVE_MODULE_URLS = [");
  const end = html.indexOf("\n      ];\n", start);
  const block = html.slice(start, end);
  const re = /'(\/[^']+)'|"(\/[^"]+)"/g;
  const paths = [];
  let m;
  while ((m = re.exec(block)) !== null) paths.push(m[1] || m[2]);
  return paths;
}

function extractStripPaths(html) {
  const articleStart = html.indexOf("var ARTICLE_MODULES = [");
  const articleEnd = html.indexOf("\n\n\n  var FOUNDATION_MODULE_PATHS", articleStart);
  const concatStart = html.indexOf(".concat([", articleStart);
  const pdfEnd = html.indexOf("]);", concatStart);
  const paths = [];
  const pathRe = /p:\s*"(\/[^"]+)"/g;
  let m;
  const articleBlock = html.slice(articleStart, articleEnd);
  while ((m = pathRe.exec(articleBlock)) !== null) paths.push(m[1]);
  const pdfBlock = html.slice(concatStart, pdfEnd);
  const pdfRe = /"(\/[^"]+)"/g;
  while ((m = pdfRe.exec(pdfBlock)) !== null) paths.push(m[1]);
  return paths;
}

function extractBookmarkPaths(html) {
  return extractStripPaths(html);
}

function compare(label, actual, expected) {
  const mismatches = [];
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      mismatches.push({
        cube: i + 1,
        expected: expected[i],
        actual: actual[i] || "(missing)",
        topic: topics.FOUNDATION_MODULE_TOPICS[i] || topics.deriveTitleFromUrl(expected[i]),
        isPdfExpected: cubeOpen.isPdfModuleUrl(expected[i]),
        isPdfActual: actual[i] ? cubeOpen.isPdfModuleUrl(actual[i]) : false,
      });
    }
  }
  if (actual.length !== expected.length) {
    mismatches.push({ cube: "count", expected: expected.length, actual: actual.length });
  }
  return mismatches;
}

const canonical = lib.DEFINITIVE_MODULE_URLS;
const dashboard = extractDashboardPaths(
  fs.readFileSync(path.join(root, "academy-dashboard-squarespace-snippet-v1.html"), "utf8")
);
const strip = extractStripPaths(
  fs.readFileSync(path.join(root, "academy-do-next-strip-squarespace-snippet-v1.html"), "utf8")
);
const bookmark = extractBookmarkPaths(
  fs.readFileSync(path.join(root, "academy-bookmark-buttons-squarespace-snippet-v1.html"), "utf8")
);

const report = {
  auditedAt: new Date().toISOString(),
  sourceOfTruth: "lib/academy-module-paths.js",
  singleSource: true,
  mismatches: [],
  cubes: canonical.map((url, i) => ({
    cube: i + 1,
    topic: i < 45 ? topics.ARTICLE_TOPICS[i] : topics.ASSIGNMENT_SHORT_LABELS[i - 45],
    hoverTitle: topics.deriveTitleFromUrl(url),
    url,
    isPdf: cubeOpen.isPdfModuleUrl(url),
    category: lib.MODULE_CATEGORY_MAP[url],
  })),
};

["dashboard", "strip", "bookmark"].forEach((name) => {
  const actual = name === "dashboard" ? dashboard : name === "strip" ? strip : bookmark;
  const diff = compare(name, actual, canonical);
  if (diff.length) {
    report.singleSource = false;
    report.mismatches.push({ snippet: name, items: diff });
  }
});

console.log(JSON.stringify(report, null, 2));

if (!report.singleSource) {
  console.error("\nMISMATCH: snippets diverge from lib/academy-module-paths.js");
  process.exit(1);
}

console.log("\nOK: all 60 cubes match lib SSOT across dashboard, strip, and bookmark.");
