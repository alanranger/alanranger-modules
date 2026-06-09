/**
 * Corrected win-back backlog after upgradeUrl fix.
 * Phase 1: corrected re-send to broken-link cohort ([CORRECTED] subject).
 * Phase 2: never-sent +20 cohort (send_count=0, normal subject).
 * Phase 3: never-sent +30 remainder (send_count=1, excludes broken cohort, normal subject).
 *
 * Usage:
 *   node scripts/run-winback-corrected-backlog.cjs --dry-run
 *   node scripts/run-winback-corrected-backlog.cjs --remote
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const BATCH_SIZE = 20;
const DELAY_MS = 10 * 60 * 1000;
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const LOG_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/WINBACK-CORRECTED-RUN-LOG-LATEST.json";

const STOP_FILE = path.join(__dirname, "..", "WINBACK-BACKLOG-STOP");
if (fs.existsSync(STOP_FILE)) {
  console.error("WINBACK-BACKLOG-STOP file present — exiting immediately.");
  process.exit(0);
}

const dryRun = process.argv.includes("--dry-run");
const useRemote = process.argv.includes("--remote") || !process.argv.includes("--local");
const handler = useRemote ? null : require("../api/admin/lapsed-trial-reengagement-webhook");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLog(data) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function invokeBatchLocal(query) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const req = {
    method: "GET",
    query: {
      sendEmail: dryRun ? "false" : "true",
      backlogRun: "1",
      batchSize: String(BATCH_SIZE),
      secret,
      ...query,
    },
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

async function invokeBatchRemote(query) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const params = new URLSearchParams({
    sendEmail: dryRun ? "false" : "true",
    backlogRun: "1",
    batchSize: String(BATCH_SIZE),
    secret,
    ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
  });
  const res = await fetch(`${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?${params}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function invokeBatch(query) {
  return useRemote ? invokeBatchRemote(query) : invokeBatchLocal(query);
}

async function runPhase(phase, runLog) {
  const phaseLog = { ...phase, batches: [] };
  while (true) {
    if (fs.existsSync(STOP_FILE)) {
      phaseLog.stoppedReason = "stop_file";
      break;
    }
    const { status, body } = await invokeBatch(phase.query);
    if (status !== 200 || !body.success) {
      throw new Error(`${phase.label} failed: ${JSON.stringify(body)}`);
    }
    if (body.skipped) {
      phaseLog.stoppedReason = body.reason;
      break;
    }
    const batchEntry = {
      batch: phaseLog.batches.length + 1,
      at: new Date().toISOString(),
      sent: body.emails_sent || 0,
      failed: body.emails_failed || 0,
      eligible: body.candidates_eligible || 0,
      corrected_resend: body.corrected_resend === true,
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
    runner: useRemote ? "remote" : "local",
    api_base: useRemote ? API_BASE : "local-handler",
    started_at: new Date().toISOString(),
    batch_size: BATCH_SIZE,
    delay_minutes: DELAY_MS / 60000,
    phases: [],
    totalSent: 0,
    totalFailed: 0,
    status: "running",
  };
  writeLog(runLog);

  const phases = [
    { label: "corrected-100", query: { correctedResend: "1" } },
    { label: "never-sent-plus-20", query: { sendCountEq: "0" } },
    { label: "never-sent-plus-30", query: { sendCountEq: "1" } },
  ];

  for (const phase of phases) {
    runLog.phases.push(await runPhase(phase, runLog));
    writeLog(runLog);
    if (dryRun) continue;
    if (phase.label !== phases[phases.length - 1].label && runLog.phases.at(-1)?.batches?.some((b) => b.sent > 0)) {
      console.log(`Phase ${phase.label} complete. Waiting 10 minutes before next phase…`);
      await sleep(DELAY_MS);
    }
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
    existing.failed_at = new Date().toISOString();
    writeLog(existing);
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
