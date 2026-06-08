/**
 * Reset a Memberstack member to a fresh active trial with zero engagement history.
 * Usage: node scripts/reset-fresh-trial-member.mjs [email] [--member=mem_...]
 */
import { createClient } from "@supabase/supabase-js";
import memberstackAdmin from "@memberstack/admin";
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local"), override: true });

const DEFAULT_EMAIL = "marketing@alanranger.com";
const DEFAULT_MEMBER_ID = "mem_cmnmycye827od0so41xvx4bdf";
const TRIAL_PLAN_ID = "pln_academy-trial-30-days--wb7v0hbh";
const ANNUAL_PLAN_ID = "pln_academy-annual-membership-h57x0h8g";
const TRIAL_DAYS = 14;

function parseArgs(argv) {
  let email = DEFAULT_EMAIL;
  let memberId = DEFAULT_MEMBER_ID;
  for (const a of argv.slice(2)) {
    if (a.startsWith("--member=")) memberId = a.slice("--member=".length);
    else if (!a.startsWith("--")) email = a;
  }
  return { email, memberId };
}

function emptyArAcademy() {
  return {
    modules: { opened: {} },
    appliedLearning: { opened: {} },
    rps: { opened: {} },
  };
}

async function clearSupabase(supabase, memberId, email) {
  const emailLower = email.toLowerCase();
  const tables = [
    ["academy_events", () => supabase.from("academy_events").delete().eq("member_id", memberId)],
    ["academy_events_email", () => supabase.from("academy_events").delete().ilike("email", emailLower)],
    ["module_results_ms", () => supabase.from("module_results_ms").delete().eq("memberstack_id", memberId)],
    ["module_results_ms_email", () => supabase.from("module_results_ms").delete().ilike("email", emailLower)],
    ["academy_plan_events", () => supabase.from("academy_plan_events").delete().eq("ms_member_id", memberId)],
    ["exam_member_links", () => supabase.from("exam_member_links").delete().eq("memberstack_id", memberId)],
    ["academy_annual_history", () => supabase.from("academy_annual_history").delete().eq("member_id", memberId)],
    ["academy_trial_history", () => supabase.from("academy_trial_history").delete().eq("member_id", memberId)],
  ];
  const out = {};
  for (const [name, run] of tables) {
    const { error } = await run();
    out[name] = error ? { error: error.message } : { ok: true };
  }
  return out;
}

async function seedActiveTrial(supabase, memberId) {
  const now = Date.now();
  const startAt = new Date(now).toISOString();
  const endAt = new Date(now + TRIAL_DAYS * 86400000).toISOString();
  const { error } = await supabase.from("academy_trial_history").insert({
    member_id: memberId,
    trial_start_at: startAt,
    trial_end_at: endAt,
    trial_length_days: TRIAL_DAYS,
    source: "fresh_trial_reset_script",
    converted_at: null,
  });
  if (error) throw error;
  return { startAt, endAt };
}

async function syncCacheFromMember(supabase, member) {
  const memberId = member.id;
  const email = member.auth?.email || member.email || null;
  const planSummary = {
    plan_id: null,
    plan_name: null,
    status: member.status || "unknown",
    trial_end: null,
    is_trial: false,
    is_paid: false,
    plan_type: null,
  };
  const active = (member.planConnections || []).find(
    (p) => p.status === "active" || p.status === "trialing"
  );
  if (active) {
    planSummary.plan_id = active.planId || active.id;
    planSummary.plan_name = active.planName || active.name || "Unknown Plan";
    planSummary.status = active.status || member.status;
    planSummary.is_trial = active.status === "trialing" || active.planId === TRIAL_PLAN_ID;
    planSummary.is_paid = !planSummary.is_trial && (active.status === "active");
    if (active.planId === TRIAL_PLAN_ID) planSummary.plan_type = "trial";
    if (active.planId === ANNUAL_PLAN_ID) planSummary.plan_type = "annual";
  }
  const row = {
    member_id: memberId,
    email,
    name: member.customFields?.name || member.name || null,
    plan_summary: planSummary,
    raw: member,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("ms_members_cache").upsert(row, { onConflict: "member_id" });
  if (error) throw error;
  return planSummary;
}

async function main() {
  const { email, memberId } = parseArgs(process.argv);
  const msKey = process.env.MEMBERSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!msKey || !supabaseUrl || !supabaseKey) {
    throw new Error("Missing MEMBERSTACK_SECRET_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY");
  }

  const memberstack = memberstackAdmin.init(msKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Resetting ${email} (${memberId}) to fresh active trial...\n`);

  const cleared = await clearSupabase(supabase, memberId, email);
  console.log("Supabase cleared:", JSON.stringify(cleared, null, 2));

  const trial = await seedActiveTrial(supabase, memberId);
  console.log("Fresh trial row:", trial);

  const retrieveRes = await memberstack.members.retrieve({ id: memberId });
  const member = retrieveRes?.data || retrieveRes;
  const currentJson = member?.json && typeof member.json === "object" ? { ...member.json } : {};
  const nextJson = {
    ...currentJson,
    bookmarks: [],
    history: [],
    arAcademy: emptyArAcademy(),
  };

  await memberstack.members.update({
    id: memberId,
    data: { json: nextJson },
  });
  console.log("Memberstack JSON cleared (arAcademy opened, bookmarks, history).");

  const pcs = Array.isArray(member.planConnections) ? member.planConnections : [];
  const hasActiveTrial = pcs.some(
    (p) => p.planId === TRIAL_PLAN_ID && (p.status === "trialing" || p.status === "active") && p.active !== false
  );

  if (!hasActiveTrial) {
    console.log("\nMemberstack trial plan requires £0 checkout (admin add-plan API cannot attach paid plans).");
    console.log("After logging in as this member on www.alanranger.com, run in the browser console:\n");
    console.log(`  await $memberstackDom.purchasePlansWithCheckout({
    priceId: "prc_30-day-free-trial-mg18p0u9z",
    successUrl: "https://www.alanranger.com/academy/dashboard",
    cancelUrl: "https://www.alanranger.com/academy/login",
    autoRedirect: true
  });`);
    console.log("\nComplete the £0 Stripe checkout (no card required). Supabase history is already cleared.\n");
  }

  const verifyRes = await memberstack.members.retrieve({ id: memberId });
  const verifyMember = verifyRes?.data || verifyRes;
  const planSummary = await syncCacheFromMember(supabase, verifyMember);

  const opened = verifyMember?.json?.arAcademy?.modules?.opened || {};
  console.log("\nDone:", JSON.stringify({
    email,
    member_id: memberId,
    modules_opened: Object.keys(opened).length,
    trial_start: trial.startAt,
    trial_end: trial.endAt,
    plan_summary: planSummary,
    plan_connections: (verifyMember.planConnections || []).map((p) => ({
      planId: p.planId,
      status: p.status,
      active: p.active,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
