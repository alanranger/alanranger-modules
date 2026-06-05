/**
 * Verifies strip FOUNDATION_MODULE_PATHS matches lib/academy-module-paths.js
 * Run: node scripts/verify-academy-module-paths.mjs
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const lib = require(path.join(root, "lib/academy-module-paths.js"));

const strip = fs.readFileSync(
  path.join(root, "academy-do-next-strip-squarespace-snippet-v1.html"),
  "utf8"
);

const pathRe = /p:\s*"(\/[^"]+)"/g;
const articleStart = strip.indexOf("var ARTICLE_MODULES = [");
const articleEnd = strip.indexOf("\n\n\n  var FOUNDATION_MODULE_PATHS", articleStart);
const foundationStart = strip.indexOf("var FOUNDATION_MODULE_PATHS", articleStart);
const concatStart = strip.indexOf(".concat([", foundationStart);
const pdfEnd = strip.indexOf("]);", concatStart);

const stripPaths = [];
let m;
const articleBlock = strip.slice(articleStart, articleEnd);
while ((m = pathRe.exec(articleBlock)) !== null) stripPaths.push(m[1]);

const pdfBlock = strip.slice(concatStart, pdfEnd);
const pdfRe = /"(\/[^"]+)"/g;
while ((m = pdfRe.exec(pdfBlock)) !== null) stripPaths.push(m[1]);

const libSet = new Set(lib.FOUNDATION_MODULE_PATHS);
const stripSet = new Set(stripPaths);

const missingInStrip = lib.FOUNDATION_MODULE_PATHS.filter((p) => !stripSet.has(p));
const extraInStrip = stripPaths.filter((p) => !libSet.has(p));

if (missingInStrip.length || extraInStrip.length) {
  console.error("PATH MISMATCH strip vs lib/academy-module-paths.js");
  if (missingInStrip.length) console.error("Missing in strip:", missingInStrip);
  if (extraInStrip.length) console.error("Extra in strip:", extraInStrip);
  process.exit(1);
}

console.log("OK: " + stripPaths.length + " foundation paths match lib/academy-module-paths.js");
console.log(
  "Slices: camera=" +
    lib.CAMERA_MODULE_PATHS.length +
    " composition=" +
    lib.COMPOSITION_MODULE_PATHS.length +
    " pdfAssignments=" +
    lib.PDF_ASSIGNMENT_PATHS.length +
    " practicePacks=" +
    lib.PRACTICE_PACK_URLS.length
);
