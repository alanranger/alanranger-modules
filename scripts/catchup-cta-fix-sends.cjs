/**
 * Corrective resend for members who got catchup with a bad upgrade CTA.
 * Uses the approved apology copy (not REWIND stage templates).
 * Hard gates: REENGAGE_LINK_SECRET + live checkout HTTP 302 per send.
 *
 * Usage: node scripts/catchup-cta-fix-sends.cjs
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(file, { overwrite = false } = {}) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (overwrite || !(m[1] in process.env)) {
      process.env[m[1]] = v.replace(/\\n/g, "\n");
    }
  }
}
loadEnvFile(".env.vercel.tmp");
loadEnvFile(".env.local", { overwrite: true });

if (!process.env.REENGAGE_LINK_SECRET || process.env.REENGAGE_LINK_SECRET.length < 20) {
  console.error("FATAL: REENGAGE_LINK_SECRET missing — refusing to send");
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");
const { sendLifecycleMail } = require("../lib/sendLifecycleMail");
const { logEmailEvent } = require("../lib/emailEvents");
const {
  buildPersonalUpgradeUrl,
  DASHBOARD_URL,
} = require("../lib/reengage-link");

const BATCH = 25;
const PAUSE_MS = 2 * 60 * 1000;
const DETAIL = "catchup_2026-08-30_cta_fix";
const SUBJECT = "Quick fix — your correct Academy upgrade link";
const SKIP_EMAILS = new Set(["campbellmp6@gmail.com"]);

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function firstNameOf(row) {
  if (row.firstName) return row.firstName;
  const n = String(row.name || "").trim();
  return n.split(/\s+/)[0] || "there";
}

function buildBody({ firstName, upgradeUrl, dashboardUrl }) {
  return [
    "Hi " + firstName + ",",
    "",
    "Apologies for the earlier email — the upgrade link wasn’t working as it should have. That’s on us, and I’m sorry for the hassle.",
    "",
    "Here’s the **corrected link**. It goes straight to Stripe Checkout and applies your **£20 off** automatically (so **£59** today for the annual membership):",
    "",
    "**[Upgrade with £20 off →](" + upgradeUrl + ")**",
    "",
    "When you’ve finished checkout, you can [sign back into the Academy here](" + dashboardUrl + ") and pick up right where you left off — everything you’ve already done is still saved.",
    "",
    "Looking forward to having you back :)",
    "",
    "Alan",
  ].join("\n");
}

async function assertLiveCheckout(url, email) {
  if (!url || !url.includes("/api/academy/reengage-checkout")) {
    throw new Error("not checkout url: " + url);
  }
  const res = await fetch(url, { method: "GET", redirect: "manual" });
  if (res.status !== 302 && res.status !== 303) {
    const text = await res.text();
    throw new Error("checkout " + res.status + " for " + email + ": " + text.slice(0, 180));
  }
}

async function alreadyFixed(memberId) {
  const { count } = await supabase
    .from("academy_email_events")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .like("event_detail", "catchup_2026-08-30_cta_fix%")
    .eq("status", "sent")
    .eq("delivery_status", "gmail_verified");
  return (count || 0) > 0;
}

async function sendOne(row) {
  if (SKIP_EMAILS.has(String(row.email || "").toLowerCase())) {
    return { status: "skipped", reason: "qa_already_sent" };
  }
  if (await alreadyFixed(row.member_id)) {
    return { status: "skipped", reason: "already_cta_fix" };
  }

  const upgradeUrl = buildPersonalUpgradeUrl(
    row.member_id,
    row.email,
    null,
    "REWIND20"
  );
  await assertLiveCheckout(upgradeUrl, row.email);

  const bodyMd = buildBody({
    firstName: firstNameOf(row),
    upgradeUrl,
    dashboardUrl: DASHBOARD_URL,
  });
  if (!bodyMd.includes("reengage-checkout")) {
    return { status: "failed", reason: "body_missing_checkout" };
  }

  try {
    const info = await sendLifecycleMail({
      to: row.email,
      subject: SUBJECT,
      bodyMd,
    });
    const logged = await logEmailEvent(supabase, {
      member_id: row.member_id,
      email: row.email,
      stage_key: "cta-fix",
      status: "sent",
      messageId: info.messageId,
      subject: SUBJECT,
      dryRun: false,
      deliveryStatus: "gmail_verified",
      sendSource: "corrected_resend",
      eventDetail: DETAIL,
    });
    if (!logged?.logged) {
      console.warn("send ok but log failed", row.email, logged?.reason || "");
    }
    return { status: "sent", messageId: info.messageId };
  } catch (err) {
    await logEmailEvent(supabase, {
      member_id: row.member_id,
      email: row.email,
      stage_key: "cta-fix",
      status: "failed",
      messageId: err?.smtp?.messageId || null,
      error: err.message,
      subject: SUBJECT,
      dryRun: false,
      deliveryStatus: err?.deliveryStatus || "smtp_fail",
      sendSource: "corrected_resend",
      eventDetail: DETAIL,
    });
    return { status: "failed", reason: err.message };
  }
}

async function main() {
  const probe = buildPersonalUpgradeUrl("mem_probe", "probe@example.com", null, "REWIND20");
  await assertLiveCheckout(probe, "probe");
  console.log("startup probe ok");

  const recipients = JSON.parse(
    fs.readFileSync(path.join("scripts/output/cta-fix-recipients.json"), "utf8")
  );
  console.log("recipients", recipients.length, "batch", BATCH);

  const results = [];
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    const batchNo = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(recipients.length / BATCH);
    console.log(`\n=== batch ${batchNo}/${totalBatches} (${batch.length}) ===`);

    for (const row of batch) {
      const t0 = Date.now();
      const out = await sendOne(row);
      results.push({
        member_id: row.member_id,
        email: row.email,
        stage_key: row.stage_key,
        ...out,
        ms: Date.now() - t0,
      });
      console.log(out.status, row.email, out.messageId || out.reason || "");
      await sleep(1500);
    }

    if (i + BATCH < recipients.length) {
      console.log(`pausing ${PAUSE_MS / 1000}s…`);
      await sleep(PAUSE_MS);
    }
  }

  const summary = { sent: 0, failed: 0, skipped: 0 };
  for (const r of results) {
    summary[r.status] = (summary[r.status] || 0) + 1;
  }
  const outPath = "scripts/output/cta-fix-send-results-LATEST.json";
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
  console.log("wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
