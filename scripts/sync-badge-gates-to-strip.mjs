/**
 * Injects lib/academy-badge-gates.js evaluation logic into the do-next strip.
 * Run after editing lib: node scripts/sync-badge-gates-to-strip.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const libPath = path.join(root, "lib/academy-badge-gates.js");
const stripPath = path.join(root, "academy-do-next-strip-squarespace-snippet-v1.html");

const BEGIN = "  // BEGIN BADGE-GATES-SYNC";
const END = "  // END BADGE-GATES-SYNC";

const lib = fs.readFileSync(libPath, "utf8");
const fnNames = [
  "safeNum",
  "normaliseStats",
  "isFoundationGateEarned",
  "isPractitionerGateEarned",
  "isCertifiedGateEarned",
  "isStageConditionsMet",
  "computeJourneyBadges",
  "getHighestConsecutiveEarned",
  "getCurrentStage",
  "getNextUnearnedBadge",
  "practitionerRequirementsMet",
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
    .replace(/=>/g, "function")
    .replace(/for \(var (\w+) = 0; (\w+) < ([^;]+); (\w+) \+= 1\)/g, "for (var $1 = 0; $1 < $3; $1++)")
    .replace(/\.forEach\(\(badge\) => \{/g, ".forEach(function(badge){")
    .replace(/\.findIndex\(\(s\) => s\.key === current\.key\)/g, 'function(s){ return s.key === current.key; })')
    .replace(/JOURNEY_STAGES\.map\(\(stage\) => \{/g, "JOURNEY_STAGES.map(function(stage){")
    .replace(/\) => \{/g, "function(){")
    .replace(/\)\s*=>/g, "function")
    .replace(/\.filter\(\(b\) => b\.earned\)/g, 'function(b){ return b.earned; }')
    .replace(/\.findIndex\(\(s\) => s\.key === current\.key\) \+ 1/g, 'function(s){ return s.key === current.key; }) + 1');
}

function extractConstBlock(source, name) {
  const re = new RegExp(`const ${name} = ([\\s\\S]*?);\\n`);
  const match = source.match(re);
  if (!match) throw new Error(`Missing const ${name}`);
  return `var ${name} = ${match[1]};`;
}

const gateConsts = ["FOUNDATION_GATE", "PRACTITIONER_GATE", "CERTIFIED_GATE"].map((name) =>
  extractConstBlock(lib, name)
);

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
console.log("OK: synced badge gate logic into academy-do-next-strip-squarespace-snippet-v1.html");
