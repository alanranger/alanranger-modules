/**
 * NOEXPIRY smoke: production-signed checkout links for REAL lapsed members.
 * Does NOT email real clients — dry-run preview + hop checks only.
 * Sends one summary to info@alanranger.com (Alan only).
 *
 * Usage: node scripts/smoke-real-members-noexpiry.cjs [limit]
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { LIFECYCLE_BCC } = require("../lib/lifecycleEmailConfig");
const crypto = require("crypto");
const {
  decodeReengageTokenPayload,
  verifyReengageToken,
  REENGAGE_CHECKOUT_URL,
  DAY_MS,
} = require("../lib/reengage-link");

const LIMIT = Math.min(parseInt(process.argv[2] || "5", 10) || 5, 10);
const EXCLUDE_EMAIL = "info@alanranger.com";
const API_BASE = process.env.ACADEMY_API_BASE_URL || "https://alanranger-modules.vercel.app";
const OUT_PATH =
  "C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/NOEXPIRY-REAL-MEMBER-SMOKE-LATEST.json";

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured in .env.local");
  return createClient(url, key);
}

async function fetchRealMembers(supabase, limit) {
  const { data: trials, error } = await supabase
    .from("academy_trial_history")
    .select("member_id, trial_end_at, reengagement_send_count")
    .is("converted_at", null)
    .eq("reengagement_opted_out", false)
    .order("trial_end_at", { ascending: true })
    .limit(limit * 4);
  if (error) throw error;

  const picked = [];
  for (const row of trials || []) {
    if (picked.length >= limit) break;
    const { data: contact } = await supabase
      .from("ms_members_cache")
      .select("member_id, email, name")
      .eq("member_id", row.member_id)
      .maybeSingle();
    const email = (contact?.email || "").toLowerCase();
    if (!email || email === EXCLUDE_EMAIL) continue;
    const daysLapsed = Math.floor((Date.now() - new Date(row.trial_end_at).getTime()) / DAY_MS);
    if (daysLapsed < 20) continue;
    picked.push({
      member_id: row.member_id,
      email: contact.email,
      name: contact.name || "",
      days_lapsed: daysLapsed,
      send_count: row.reengagement_send_count || 0,
    });
  }
  if (!picked.length) throw new Error("No eligible real members found (exclude info@, need 20+ days lapsed)");
  return picked;
}

async function fetchProductionPreview(secret, memberEmail, forceAttempt = 1) {
  const url =
    `${API_BASE}/api/admin/lapsed-trial-reengagement-webhook` +
    `?secret=${encodeURIComponent(secret)}` +
    `&testEmail=${encodeURIComponent(memberEmail)}` +
    `&forceAttempt=${forceAttempt}&sendEmail=false`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error || body.result?.error || `${memberEmail} preview failed`);
  }
  return body.result;
}

async function hopCheckout(upgradeUrl) {
  const res = await fetch(upgradeUrl, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  return {
    status: res.status,
    isStripe: location.includes("checkout.stripe.com"),
    isErrorPage: res.status >= 400,
  };
}

function extractToken(upgradeUrl) {
  try {
    return decodeURIComponent(upgradeUrl.split("t=")[1]?.split("&")[0] || "");
  } catch {
    return "";
  }
}

function signLegacyTokenWithPastExp(memberId, email, couponCode) {
  const secret = process.env.REENGAGE_LINK_SECRET || process.env.ORPHANED_WEBHOOK_SECRET || "";
  if (!secret) return null;
  const payload = {
    v: 1,
    mid: memberId,
    em: email,
    exp: Date.now() - 300 * DAY_MS,
    c: couponCode,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${payloadB64}.${sig}`;
}

async function smokeMember(secret, member) {
  const forceAttempt = Math.min(Math.max((member.send_count || 0) + 1, 1), 3);
  const preview = await fetchProductionPreview(secret, member.email, forceAttempt);
  const upgradeUrl = preview.upgrade_url;
  if (!upgradeUrl?.includes("reengage-checkout")) {
    throw new Error(`${member.email}: missing reengage-checkout URL`);
  }
  const token = extractToken(upgradeUrl);
  const payload = decodeReengageTokenPayload(token);
  const freshHop = await hopCheckout(upgradeUrl);

  const legacyPastExpToken = signLegacyTokenWithPastExp(member.member_id, member.email, "REWIND20");
  const pastExpVerify = legacyPastExpToken ? verifyReengageToken(legacyPastExpToken) : { ok: false };
  const pastExpHop = legacyPastExpToken
    ? await hopCheckout(`${REENGAGE_CHECKOUT_URL}?t=${encodeURIComponent(legacyPastExpToken)}`)
    : { status: 0, isStripe: false, isErrorPage: true };

  return {
    member_id: member.member_id,
    email: member.email,
    name: member.name,
    days_lapsed: member.days_lapsed,
    upgradeUrl,
    payload,
    hasExpField: Object.prototype.hasOwnProperty.call(payload || {}, "exp"),
    freshHop,
    pastExpVerifyLocal: pastExpVerify.ok,
    pastExpHopProduction: pastExpHop,
    subject: preview.preview?.subject,
  };
}

async function main() {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("ORPHANED_WEBHOOK_SECRET missing");

  const supabase = getSupabase();
  const members = await fetchRealMembers(supabase, LIMIT);
  const results = [];
  for (const member of members) {
    results.push(await smokeMember(secret, member));
  }

  const failures = results.filter((r) => !r.freshHop.isStripe);
  if (failures.length) {
    throw new Error(`Fresh hop failed for: ${failures.map((f) => f.email).join(", ")}`);
  }

  const sample = results[0];
  const lines = results.map(
    (r, i) =>
      `${i + 1}. ${r.name || "(no name)"} <${r.email}> · ${r.days_lapsed}d lapsed · ` +
      `Stripe ${r.freshHop.isStripe ? "OK" : "FAIL"} · exp field in token: ${r.hasExpField ? "yes" : "no"}`
  );

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT || "587", 10) === 465,
    auth: {
      user: process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM,
      pass: process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
  });

  const subject = `[NOEXPIRY-SMOKE – ${results.length} real members] signature-only tokens (no client sends)`;
  const text =
    `Smoke test only — NO emails were sent to the real members below.\n\n` +
    `Validation: signature-only (exp check removed). Production webhook dry-run + live hop to checkout.stripe.com.\n\n` +
    lines.join("\n") +
    `\n\nSample member: ${sample.name} <${sample.email}>\n` +
    `Sample upgradeUrl (click to verify — same link should work whenever you re-click):\n${sample.upgradeUrl}\n\n` +
    `Signing secret chain: REENGAGE_LINK_SECRET || ORPHANED_WEBHOOK_SECRET (production Vercel + all webhooks).\n` +
    `Hard stop: ON — no member sends.\n`;

  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${process.env.ORPHANED_EMAIL_FROM}>`,
    to: LIFECYCLE_BCC,
    subject,
    text,
  });

  const out = {
    at: new Date().toISOString(),
    smokeOnly: true,
    clientsNotEmailed: results.map((r) => r.email),
    signingSecret: "REENGAGE_LINK_SECRET || ORPHANED_WEBHOOK_SECRET",
    validation: "signature-only (no exp enforcement)",
    results,
    summaryMessageId: info.messageId,
    hardStop: true,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
