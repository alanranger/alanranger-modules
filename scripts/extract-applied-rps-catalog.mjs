/**
 * One-time extractor: dashboard applied-learning + RPS cubes -> lib/academy-applied-rps-catalog.js
 * Run: node scripts/extract-applied-rps-catalog.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DASHBOARD_SNIPPET } from "./snippet-paths.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(DASHBOARD_SNIPPET, "utf8");

function stripSite(url) {
  return url.replace(/^https:\/\/www\.alanranger\.com/i, "");
}

const applied = [];
const gridMatch = html.match(/id="ar-applied-learning-mini-grid"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="ar-tile ar-span-4 ar-rps-tile"/);
if (!gridMatch) throw new Error("Applied learning grid not found");
const grid = gridMatch[0];
const rowRe = /<div class="ar-applied-learning-category-row">[\s\S]*?<\/div>\s*<\/div>/g;
const rows = grid.match(rowRe) || [];
rows.forEach((row) => {
  const label = (row.match(/ar-applied-learning-category-label">([^<]+)/) || [])[1];
  if (!label) return;
  const items = [];
  const linkRe = /<a href="([^"]+)"[^>]*title="([^"]*)"[^>]*>(\d+)<\/a>/g;
  let m;
  while ((m = linkRe.exec(row))) {
    items.push({ path: stripSite(m[1]), title: m[2].replace(/&amp;/g, "&") });
  }
  applied.push({ label: label.replace(/&amp;/g, "&"), items });
});

const rps = [];
const rpsMatch = html.match(/class="ar-rps-cubes">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/);
if (rpsMatch) {
  const block = rpsMatch[1];
  const aRe = /<a href="([^"]+)"[^>]*title="([^"]*)"[^>]*>(\d+)<\/a>/g;
  let m;
  while ((m = aRe.exec(block))) {
    rps.push({ path: stripSite(m[1]), title: m[2].replace(/&amp;/g, "&"), live: true });
  }
  const btnRe = /<button[^>]*aria-label="Coming soon"[^>]*>(\d+)<\/button>/g;
  while ((m = btnRe.exec(block))) {
    rps.push({ path: null, title: "Coming soon", live: false });
  }
}

const out = `/**
 * Applied Learning (40) + RPS (10) catalog — extracted from dashboard snippet.
 * Regenerate: node scripts/extract-applied-rps-catalog.mjs
 */
module.exports = {
  APPLIED_LEARNING_SECTIONS: ${JSON.stringify(applied, null, 2)},
  RPS_ITEMS: ${JSON.stringify(rps, null, 2)},
};
`;

fs.writeFileSync(path.join(root, "lib/academy-applied-rps-catalog.js"), out, "utf8");
console.log("OK:", applied.length, "applied sections,", rps.length, "RPS items");
