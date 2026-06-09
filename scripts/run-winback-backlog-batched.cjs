/**
 * One-time throttled win-back backlog run.
 * +30 cohort first (send_count=1), then +20 (send_count=0).
 * 20 sends per batch, 10 minutes apart. Idempotent via existing send guards.
 *
 * Usage (from repo root, requires .env.local with Supabase + SMTP):
 *   node scripts/run-winback-backlog-batched.cjs
 *   node scripts/run-winback-backlog-batched.cjs --dry-run
 *   node scripts/run-winback-backlog-batched.cjs --remote   (production API; slower deploy cycle)
 */

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
const API_BASE = process.env.ACADEMY_API_BASE || "https://alanranger-modules.vercel.app";
const COHORTS = [
  { label: "day-plus-30", sendCountEq: 1 },
  { label: "day-plus-20", sendCountEq: 0 },
];
const LOG_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/WINBACK-BACKLOG-RUN-LOG-LATEST.json";

const dryRun = process.argv.includes("--dry-run");
const useRemote = process.argv.includes("--remote");
const handler = useRemote ? null : require("../api/admin/lapsed-trial-reengagement-webhook");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLog(data) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function invokeBatchLocal(sendCountEq) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const req = {
    method: "GET",
    query: {
      sendEmail: dryRun ? "false" : "true",
      backlogRun: "1",
      sendCountEq: String(sendCountEq),
      batchSize: String(BATCH_SIZE),
      secret,
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

async function invokeBatchRemote(sendCountEq) {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("ORPHANED_WEBHOOK_SECRET not set");
  const params = new URLSearchParams({
    sendEmail: dryRun ? "false" : "true",
    backlogRun: "1",
    sendCountEq: String(sendCountEq),
    batchSize: String(BATCH_SIZE),
    secret,
  });
  const url = `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?${params}`;
  const res = await fetch(url);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  return { status: res.status, body };
}

async function invokeBatch(sendCountEq) {
  return useRemote ? invokeBatchRemote(sendCountEq) : invokeBatchLocal(sendCountEq);
}

async function runCohort(cohort, runLog) {
  const cohortLog = { label: cohort.label, sendCountEq: cohort.sendCountEq, batches: [] };
  while (true) {
    if (fs.existsSync(path.join(__dirname, "..", "WINBACK-BACKLOG-STOP"))) {
      cohortLog.stoppedReason = "stop_file";
      break;
    }
    const { status, body } = await invokeBatch(cohort.sendCountEq);
    if (status !== 200 || !body.success) {
      throw new Error(`${cohort.label} batch failed: ${JSON.stringify(body)}`);
    }
    if (body.skipped) {
      cohortLog.stoppedReason = body.reason;
      break;
    }
    const batchEntry = {
      batch: cohortLog.batches.length + 1,
      at: new Date().toISOString(),
      sent: body.emails_sent || 0,
      failed: body.emails_failed || 0,
      eligible: body.candidates_eligible || 0,
    };
    cohortLog.batches.push(batchEntry);
    runLog.totalSent += batchEntry.sent;
    runLog.totalFailed += batchEntry.failed;
    runLog.totalBatches += 1;
    writeLog(runLog);
    console.log(JSON.stringify({ cohort: cohort.label, ...batchEntry }));
    if (batchEntry.sent === 0) break;
    if (dryRun) break;
    console.log(`Waiting ${DELAY_MS / 60000} minutes before next batch…`);
    await sleep(DELAY_MS);
    if (fs.existsSync(path.join(__dirname, "..", "WINBACK-BACKLOG-STOP"))) {
      cohortLog.stoppedReason = "stop_file";
      break;
    }
  }
  return cohortLog;
}

async function main() {
  const runLog = {
    mode: dryRun ? "dry-run" : "live",
    runner: useRemote ? "remote" : "local",
    api_base: useRemote ? API_BASE : "local-handler",
    started_at: new Date().toISOString(),
    batch_size: BATCH_SIZE,
    delay_minutes: DELAY_MS / 60000,
    cohorts: [],
    totalSent: 0,
    totalFailed: 0,
    totalBatches: 0,
    status: "running",
  };
  writeLog(runLog);

  for (let i = 0; i < COHORTS.length; i += 1) {
    const cohortLog = await runCohort(COHORTS[i], runLog);
    runLog.cohorts.push(cohortLog);
    writeLog(runLog);
    if (dryRun) continue;
    if (i < COHORTS.length - 1 && cohortLog.batches.some((b) => b.sent > 0)) {
      console.log("Cohort complete. Waiting 10 minutes before next cohort…");
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
    const existing = fs.existsSync(LOG_PATH)
      ? JSON.parse(fs.readFileSync(LOG_PATH, "utf8"))
      : {};
    existing.status = "failed";
    existing.error = err.message;
    existing.failed_at = new Date().toISOString();
    writeLog(existing);
  } catch (_) {
    /* ignore log write failure */
  }
  process.exit(1);
});
