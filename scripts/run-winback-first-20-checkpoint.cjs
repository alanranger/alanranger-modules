/**
 * Checkpoint: corrected re-send FIRST 20 only, then stop.
 * Usage:
 *   node scripts/run-winback-first-20-checkpoint.cjs --dry-run
 *   node scripts/run-winback-first-20-checkpoint.cjs
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const BATCH_SIZE = 20;
const LOG_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/WINBACK-FIRST-20-CHECKPOINT-LATEST.json";

const dryRun = process.argv.includes("--dry-run");
const useRemote = process.argv.includes("--remote");
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const handler = useRemote ? null : require("../api/admin/lapsed-trial-reengagement-webhook");

async function invokeLocal() {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const req = {
    method: "GET",
    query: {
      sendEmail: dryRun ? "false" : "true",
      correctedResend: "1",
      backlogRun: "1",
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

async function invokeRemote() {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  const params = new URLSearchParams({
    sendEmail: dryRun ? "false" : "true",
    correctedResend: "1",
    backlogRun: "1",
    batchSize: String(BATCH_SIZE),
    secret,
  });
  const res = await fetch(`${API_BASE}/api/admin/lapsed-trial-reengagement-webhook?${params}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function invoke() {
  return useRemote ? invokeRemote() : invokeLocal();
}

async function main() {
  const { status, body } = await invoke();
  const log = {
    mode: dryRun ? "dry-run" : "live",
    runner: useRemote ? "remote" : "local",
    api_base: useRemote ? API_BASE : "local-handler",
    at: new Date().toISOString(),
    status,
    batch_size: BATCH_SIZE,
    response: body,
    sent_members: (body.email_results || [])
      .filter((r) => r.sent)
      .map((r) => ({
        email: r.email,
        member_id: r.member_id,
        message_id: r.messageId || r.message_id,
        stage_key: r.stage_key,
        upgrade_url: r.upgrade_url,
      })),
  };
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf8");
  console.log(JSON.stringify(log, null, 2));
  if (status !== 200 || !body.success) process.exit(1);
  if (body.skipped) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
