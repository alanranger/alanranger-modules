/**
 * Corrected win-back backlog after upgradeUrl fix.
 * Phase 1: corrected re-send to 80 broken-link day-plus-30 members.
 * Phase 2: never-sent +20 cohort (send_count=0).
 * Phase 3: never-sent +30 remainder (send_count=1, not in broken set, not corrected yet).
 *
 * Usage:
 *   node scripts/run-winback-corrected-backlog.cjs --dry-run
 *   node scripts/run-winback-corrected-backlog.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    process.env[k] = v;
  }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
}

const BATCH_SIZE = 20;
const DELAY_MS = 10 * 60 * 1000;
const LOG_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/WINBACK-CORRECTED-RUN-LOG-LATEST.json";

const dryRun = process.argv.includes("--dry-run");
const handler = require("../api/admin/lapsed-trial-reengagement-webhook");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLog(data) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function invokeBatch(query) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const req = {
    method: "GET",
    query: { sendEmail: dryRun ? "false" : "true", backlogRun: "1", batchSize: String(BATCH_SIZE), secret, ...query },
    headers: {},
  };
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler(req, res).catch(reject);
  });
}

async function runPhase(phase, runLog) {
  const phaseLog = { ...phase, batches: [] };
  while (true) {
    const { status, body } = await invokeBatch(phase.query);
    if (status !== 200 || !body.success) {
      throw new Error(`${phase.label} failed: ${JSON.stringify(body)}`);
    }
    const batchEntry = {
      batch: phaseLog.batches.length + 1,
      at: new Date().toISOString(),
      sent: body.emails_sent || 0,
      failed: body.emails_failed || 0,
      eligible: body.candidates_eligible || 0,
    };
    phaseLog.batches.push(batchEntry);
    runLog.totalSent += batchEntry.sent;
    runLog.totalFailed += batchEntry.failed;
    writeLog(runLog);
    console.log(JSON.stringify({ phase: phase.label, ...batchEntry }));
    if (batchEntry.sent === 0 && !dryRun) break;
    if (dryRun) break;
    await sleep(DELAY_MS);
  }
  return phaseLog;
}

async function main() {
  const runLog = {
    mode: dryRun ? "dry-run" : "live",
    started_at: new Date().toISOString(),
    batch_size: BATCH_SIZE,
    phases: [],
    totalSent: 0,
    totalFailed: 0,
    status: "running",
  };
  writeLog(runLog);

  const phases = [
    { label: "corrected-80", query: { correctedResend: "1" } },
    { label: "never-sent-plus-20", query: { sendCountEq: "0" } },
    { label: "never-sent-plus-30", query: { sendCountEq: "1" } },
  ];

  for (const phase of phases) {
    runLog.phases.push(await runPhase(phase, runLog));
    writeLog(runLog);
  }

  runLog.finished_at = new Date().toISOString();
  runLog.status = "complete";
  writeLog(runLog);
  console.log("DONE", JSON.stringify(runLog, null, 2));
}

main().catch((err) => {
  console.error(err);
  try {
    const existing = fs.existsSync(LOG_PATH) ? JSON.parse(fs.readFileSync(LOG_PATH, "utf8")) : {};
    existing.status = "failed";
    existing.error = err.message;
    writeLog(existing);
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
