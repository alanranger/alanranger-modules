/**
 * Injects lib/academy-client-gate-view.js into strip + foundation snippets.
 * Run after editing lib: node scripts/sync-client-gate-view-to-snippets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { STRIP_SNIPPET, FOUNDATION_SNIPPET } from "./snippet-paths.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const libPath = path.join(root, "lib/academy-client-gate-view.js");

const BEGIN = "  // BEGIN CLIENT-GATE-VIEW-SYNC";
const END = "  // END CLIENT-GATE-VIEW-SYNC";

const fnNames = [
  "parseExamProgress",
  "getFoundationOpenedSet",
  "getAllModulesOpenedCount",
  "countAppliedLearningOpenedFromJson",
  "mergeLongevityIntoStats",
  "buildGateContext",
  "computeGateStats",
  "buildAcademyBadgeView",
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name} in lib`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

function toStripFn(fnBody) {
  return fnBody
    .replace(/\bconst\b/g, "var")
    .replace(/\blet\b/g, "var")
    .replace(/FOUNDATION_EXAMS_TOTAL/g, "EXAM_MODULE_IDS.length")
    .replace(/countAppliedLearningOpened\(arAcademy \|\| \{\}\)/g, "countAppliedLearningOpenedFromJson({ arAcademy: arAcademy })")
    .replace(/typeof console !== "undefined" && console\.warn/g, "console.warn");
}

function buildInjected(includeExamIds) {
  const lib = fs.readFileSync(libPath, "utf8");
  const gateView = require(libPath);
  const examIdLines = includeExamIds
    ? [
        `var EXAM_MODULE_IDS = ${JSON.stringify(gateView.EXAM_MODULE_IDS)};`,
        `var COMPOSITION_EXAM_MODULE_IDS = ${JSON.stringify(gateView.COMPOSITION_EXAM_MODULE_IDS)};`,
        "",
      ]
    : [];

  const browserBuildAcademyBadgeView = [
    "function buildAcademyBadgeView(normalized, engagement, examProgressData, options) {",
    "  var opts = options || {};",
    "  if (typeof computeJourneyBadges !== \"function\" || typeof computeNextBadgeProgress !== \"function\") {",
    "    throw new Error(\"buildAcademyBadgeView requires badge gate fns\");",
    "  }",
    "  var foundationOpenedSet = opts.foundationOpenedSet || getFoundationOpenedSet(normalized);",
    "  var examInfo = opts.examInfo || parseExamProgress(examProgressData);",
    "  var gateStats = computeGateStats(normalized, foundationOpenedSet, examInfo, opts.preview || null);",
    "  var activeDays = engagement && typeof engagement.distinctActiveDaysFirst14d === \"number\"",
    "    ? engagement.distinctActiveDaysFirst14d",
    "    : 0;",
    "  var engagementDegraded = !engagement;",
    "  var gateStatsWithLongevity = mergeLongevityIntoStats(gateStats, normalized, foundationOpenedSet, engagement);",
    "  var gateContext = buildGateContext(engagement);",
    "  var badges = computeJourneyBadges(gateStatsWithLongevity, activeDays, engagementDegraded, gateContext);",
    "  var modulesTotal = opts.modulesTotal != null ? opts.modulesTotal : 60;",
    "  var openedCount = gateStats.totalModulesOpened;",
    "  var progress = computeNextBadgeProgress(badges, gateStatsWithLongevity, activeDays, engagementDegraded, openedCount, modulesTotal);",
    "  return {",
    "    badges: badges,",
    "    stats: gateStatsWithLongevity,",
    "    gateStats: gateStats,",
    "    examInfo: examInfo,",
    "    foundationOpenedSet: foundationOpenedSet,",
    "    activeDays: activeDays,",
    "    engagementDegraded: engagementDegraded,",
    "    openedCount: openedCount,",
    "    modulesTotal: modulesTotal,",
    "    progress: progress,",
    "    gateContext: gateContext,",
    "    hasConverted: !!(gateContext && gateContext.hasConverted)",
    "  };",
    "}",
  ].join("\n");

  return [
    BEGIN,
    "  // SYNC: lib/academy-client-gate-view.js (run scripts/sync-client-gate-view-to-snippets.mjs)",
    ...examIdLines,
    ...fnNames
      .filter((name) => name !== "buildAcademyBadgeView")
      .map((name) => toStripFn(extractFunction(lib, name))),
    browserBuildAcademyBadgeView,
    END,
  ].join("\n\n");
}

function syncFile(filePath, label, includeExamIds) {
  const content = fs.readFileSync(filePath, "utf8");
  const beginIdx = content.indexOf(BEGIN);
  const endIdx = content.indexOf(END);
  if (beginIdx < 0 || endIdx < 0) {
    console.error(`${label} missing CLIENT-GATE-VIEW-SYNC markers`);
    process.exit(1);
  }
  const updated =
    content.slice(0, beginIdx) +
    buildInjected(includeExamIds) +
    content.slice(endIdx + END.length);
  fs.writeFileSync(filePath, updated, "utf8");
  console.log(`OK: synced client gate view into ${label}`);
}

syncFile(STRIP_SNIPPET, "strip", false);
syncFile(FOUNDATION_SNIPPET, "foundation page", true);
