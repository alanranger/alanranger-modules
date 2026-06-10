/** Proof: structural markdown link fix across templates + production render path. */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { htmlFromMarkdown, plainTextFromMarkdown } = require("../lib/emailHtml");
const { getDefault, renderTemplate, STAGE_KEYS, DEFAULTS } = require("../lib/emailTemplateDefaults");
const { sanitizeReengageToken, verifyReengageToken } = require("../lib/reengage-link");

const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const TEST_EMAIL = "info@alanranger.com";

function auditTemplates() {
  const rows = [];
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const body = def.body_md || "";
    const hasLink = /\[([^\]]+)\]\(([^)]+)\)/.test(body);
    if (!hasLink) {
      rows.push({ stage: key, links: 0, pattern: "no markdown links" });
      continue;
    }
    const unsafe = (body.match(/\*\*\[[^\]]+\]\([^)]+\)\*\*/g) || []).length;
    const safe = (body.match(/\[\*\*[^\]]+\*\*\]\([^)]+\)/g) || []).length;
    rows.push({
      stage: key,
      links: safe + unsafe,
      pattern: unsafe ? "UNSAFE legacy outer-bold" : "safe [**text**](url)",
    });
  }
  return rows;
}

function renderProof(label, bodyMd) {
  const html = htmlFromMarkdown(bodyMd);
  const text = plainTextFromMarkdown(bodyMd);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const bad = hrefs.filter((h) => /[\)*]$/.test(h));
  const plainUpgrade = text.split("\n").find((l) => l.includes("reengage-checkout") || l.includes("alanranger.com/academy"));
  return { label, hrefs, bad, plainUpgrade, htmlSnippet: html.slice(0, 400) };
}

async function productionPreview(path) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const res = await fetch(`${API_BASE}${path}&secret=${encodeURIComponent(secret)}&testEmail=${encodeURIComponent(TEST_EMAIL)}&sendEmail=false`);
  const body = await res.json();
  if (!res.ok || body.success === false) throw new Error(body.error || res.status);
  return body;
}

async function main() {
  console.log("=== Q1 template audit (code defaults) ===");
  console.log(JSON.stringify(auditTemplates(), null, 2));

  const token =
    "eyJ2IjoxLCJtaWQiOiJtZW1fY21sYXdwOGpxMDlrYTBzcWU5MHlhNzkzdCIsImVtIjoiaW5mb0BhbGFucmFuZ2VyLmNvbSIsImMiOiJSRVdJTkQyMCJ9.XA7ksr6eHo_4TIpV6oASsw0-RRG1wTOYq0THpvj1NJY)**";
  console.log("\n=== Q4 sanitiser ===");
  console.log("mangled verifies:", verifyReengageToken(token).ok);

  const offerPreview = await productionPreview(
    "/api/admin/lapsed-trial-reengagement-webhook?forceAttempt=1"
  );
  const paidPreview = await productionPreview(
    "/api/admin/triggered-email-webhook?stageKey=paid-quiet"
  );

  const offerBody = offerPreview.result?.preview?.body || "";
  const paidBody = paidPreview.result?.preview?.body || "";

  console.log("\n=== Q5 production render proofs ===");
  console.log(JSON.stringify(renderProof("day-plus-20 (production preview body)", offerBody), null, 2));
  console.log(JSON.stringify(renderProof("paid-quiet (production preview body)", paidBody), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
