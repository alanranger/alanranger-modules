/**
 * Injects lib/academy-badge-gates.js evaluation logic into the do-next strip.
 * Run after editing lib: node scripts/sync-badge-gates-to-strip.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { STRIP_SNIPPET } from "./snippet-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const libPath = path.join(root, "lib/academy-badge-gates.js");
const stripPath = STRIP_SNIPPET;

const BEGIN = "  // BEGIN BADGE-GATES-SYNC";
const END = "  // END BADGE-GATES-SYNC";

const lib = fs.readFileSync(libPath, "utf8");
const fnNames = [
  "safeNum",
  "normaliseStats",
  "isFoundationGateEarned",
  "isPractitionerGateEarned",
  "isCertifiedGateEarned",
  "isLongevityDegraded",
  "computeLongevityPoints",
  "warnLongevityDegraded",
  "isGraduateGateEarned",
  "isMasterGateEarned",
  "daysSinceActivity",
  "isSummitBadgePaused",
  "isStageConditionsMet",
  "computeJourneyBadges",
  "getHighestConsecutiveEarned",
  "getCurrentStage",
  "getNextUnearnedBadge",
  "practitionerRequirementsMet",
  "graduateRequirementsMet",
  "masterRequirementsMet",
  "componentRatio",
  "computeNextBadgeProgress",
  "computeTrackFillPct",
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
    .replace(/86_400_000/g, "86400000")
    .replace(/JOURNEY_STAGES\.map\(\(stage\) => \{/g, "JOURNEY_STAGES.map(function(stage){")
    .replace(/\.forEach\(\(badge\) => \{/g, ".forEach(function(badge){")
    .replace(/\.forEach\(\(row\) => \{/g, ".forEach(function(row){")
    .replace(/\.filter\(\(b\) => b\.earned\)/g, ".filter(function(b){ return b.earned; })")
    .replace(/\.findIndex\(\(s\) => s\.key === current\.key\)/g, ".findIndex(function(s){ return s.key === current.key; })")
    .replace(/\) => \{/g, "function(){")
    .replace(/\((\w+)\) =>/g, "function($1)")
    .replace(/typeof console !== "undefined" && console\.warn/g, "console.warn");
}

function extractConstBlock(source, name) {
  const start = source.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`Missing const ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
    } else if (ch === ";" && (!started || depth === 0)) {
      const body = source.slice(start + `const ${name} = `.length, i);
      return `var ${name} = ${body};`;
    }
  }
  throw new Error(`Unclosed const ${name}`);
}

const gateConsts = [
  "FOUNDATION_GATE",
  "PRACTITIONER_GATE",
  "CERTIFIED_GATE",
  "POINTS_WEIGHTS",
  "GRADUATE_GATE",
  "MASTER_GATE",
  "GRADUATE_TARGETS",
  "MASTER_TARGETS",
  "KEEPALIVE_DECAY_DAYS",
].map((name) => extractConstBlock(lib, name));

const injected = [
  BEGIN,
  "  // SYNC: lib/academy-badge-gates.js (run scripts/sync-badge-gates-to-strip.mjs)",
  ...gateConsts,
  "",
  ...fnNames.map((name) => toStripFn(extractFunction(lib, name))),
  END,
].join("\n\n");

const strip = fs.readFileSync(stripPath, "utf8");
const beginIdx = strip.indexOf(BEGIN);
const endIdx = strip.indexOf(END);
if (beginIdx < 0 || endIdx < 0) {
  console.error("Strip missing BADGE-GATES-SYNC markers");
  process.exit(1);
}

const updated =
  strip.slice(0, beginIdx) + injected + strip.slice(endIdx + END.length);
fs.writeFileSync(stripPath, updated, "utf8");
console.log("OK: synced badge gate logic into Squarespace Snippets/academy-do-next-strip-squarespace-snippet-v1.html");
