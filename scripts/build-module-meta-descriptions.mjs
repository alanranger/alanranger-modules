/**
 * Builds lib/academy-module-meta-descriptions.js from blog schema + live page meta tags.
 * Run: node scripts/build-module-meta-descriptions.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = require(path.join(root, "lib/academy-module-paths.js"));
const topics = require(path.join(root, "lib/academy-module-topics.js"));
const catalog = require(path.join(root, "lib/academy-applied-rps-catalog.js"));

const SCHEMA = path.resolve(
  root,
  "../../alan-shared-resources/outputs/schema/blog/blog-schema.json"
);
const OUT = path.join(root, "lib/academy-module-meta-descriptions.js");
const SITE = "https://www.alanranger.com";
const PDF_DESC =
  "Hands-on photography practice assignment — download the PDF and complete on location.";

function normPath(p) {
  if (!p) return "";
  return String(p).split("?")[0].replace(/\/$/, "");
}

function loadSchemaMap() {
  if (!fs.existsSync(SCHEMA)) {
    console.warn("Schema not found:", SCHEMA);
    return {};
  }
  const j = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
  const posts = (j["@graph"] || []).filter((x) => x["@type"] === "BlogPosting");
  const map = {};
  posts.forEach((p) => {
    const id = String(p["@id"] || p.url || "");
    const m = id.match(/alanranger\.com([^#?]+)/i);
    if (m && p.description) map[normPath(m[1])] = String(p.description).trim();
  });
  return map;
}

async function fetchMeta(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 AcademyMetaBuild" } });
  if (!r.ok) return "";
  const h = await r.text();
  const m =
    h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    h.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  return m ? String(m[1]).trim() : "";
}

function allPaths() {
  const list = [...paths.DEFINITIVE_MODULE_URLS];
  catalog.APPLIED_LEARNING_SECTIONS.forEach((sec) =>
    sec.items.forEach((item) => list.push(item.path))
  );
  catalog.RPS_ITEMS.filter((item) => item.path).forEach((item) => list.push(item.path));
  return list;
}

function pdfDesc(modulePath, idx) {
  const topic = topics.FOUNDATION_MODULE_TOPICS[idx] || "";
  if (topic) return `Hands-on practice assignment: ${topic.replace(/^\d+\s+/, "")}. Download the PDF and complete on location.`;
  return PDF_DESC;
}

const map = loadSchemaMap();
const todo = allPaths();
let fetched = 0;

for (let i = 0; i < todo.length; i += 1) {
  const p = todo[i];
  const key = normPath(p);
  if (map[key]) continue;
  if (p.endsWith(".pdf")) {
    map[key] = pdfDesc(p, i);
    continue;
  }
  const url = SITE + p;
  process.stdout.write(`fetch ${key}... `);
  try {
    map[key] = await fetchMeta(url);
    fetched += 1;
    console.log(map[key] ? "ok" : "empty");
  } catch (err) {
    console.log("fail", err.message);
    map[key] = "";
  }
  await new Promise((r) => setTimeout(r, 200));
}

const out = `/**
 * Meta descriptions for Foundation / Applied / RPS module tooltips.
 * Regenerate: node scripts/build-module-meta-descriptions.mjs
 */
module.exports = {
  META_BY_PATH: ${JSON.stringify(map, null, 2)},
};
`;

fs.writeFileSync(OUT, out, "utf8");
console.log("OK:", OUT, "entries", Object.keys(map).length, "fetched", fetched);
