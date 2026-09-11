// api/admin/refresh.js
// Sync Memberstack -> Supabase (member cache + module_open events)
// Tuned to finish under Vercel limits: longer maxDuration + concurrent member sync.

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");
const { createExampleQuestionsForMember } = require("../academy/qa/create-example-questions");
const { getTrialConfig, trialLengthForStart } = require("../../lib/academyTrialConfig");

const TRIAL_PLAN_ID = "pln_academy-trial-30-days--wb7v0hbh";
const PAGE_SIZE = 100;
const CONCURRENCY = 8;

function safeIso(d) {
  try {
    const x = new Date(d);
    return isNaN(x.getTime()) ? null : x.toISOString();
  } catch {
    return null;
  }
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

function memberName(fullMemberData, email) {
  let name = null;
  if (fullMemberData?.customFields) {
    const firstName = fullMemberData.customFields["first-name"]
      || fullMemberData.customFields["firstName"]
      || fullMemberData.customFields["first_name"];
    const lastName = fullMemberData.customFields["last-name"]
      || fullMemberData.customFields["lastName"]
      || fullMemberData.customFields["last_name"];
    if (firstName || lastName) {
      name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
    }
    if (!name) {
      name = fullMemberData.customFields.name || fullMemberData.customFields.Name || null;
    }
  }
  if (!name && email) name = email.split("@")[0];
  return name;
}

function planConnectionsOf(fullMemberData) {
  if (Array.isArray(fullMemberData?.planConnections)) return fullMemberData.planConnections;
  if (fullMemberData?.planConnections && typeof fullMemberData.planConnections === "object") {
    return [fullMemberData.planConnections];
  }
  if (fullMemberData?.planConnection) return [fullMemberData.planConnection];
  if (Array.isArray(fullMemberData?.plans)) return fullMemberData.plans;
  return [];
}

function buildPlanSummary(fullMemberData, existingMember, trialConfig) {
  const planConnections = planConnectionsOf(fullMemberData);
  const trialPlan = planConnections.find((p) => (p?.planId || p?.id) === TRIAL_PLAN_ID);
  const activePlan = planConnections.find(
    (p) => p?.status === "ACTIVE" || (p?.status && p?.expiryDate)
  ) || planConnections[0];

  const planToUse = trialPlan || activePlan;
  const planId = planToUse?.planId || planToUse?.id || null;
  const rawStatus = planToUse?.status || "UNPAID";
  const planStatus = typeof rawStatus === "string" ? rawStatus.toUpperCase() : "UNPAID";
  const payment = planToUse?.payment || {};
  const planConnectionType = planToUse?.type || null;

  let paymentMode = planToUse?.paymentMode || null;
  if (!paymentMode && planConnectionType) {
    paymentMode = planConnectionType === "SUBSCRIPTION" ? "RECURRING" : "ONETIME";
  }

  let expiryDate = null;
  let currentPeriodEnd = null;

  if (payment?.nextBillingDate) {
    const nextBillingTimestamp = typeof payment.nextBillingDate === "number"
      ? payment.nextBillingDate
      : parseInt(payment.nextBillingDate, 10);
    if (!isNaN(nextBillingTimestamp)) {
      currentPeriodEnd = new Date(nextBillingTimestamp * 1000).toISOString();
      if (planConnectionType === "SUBSCRIPTION") expiryDate = currentPeriodEnd;
    }
  }

  if (!expiryDate && trialPlan?.expiryDate) expiryDate = safeIso(trialPlan.expiryDate);
  else if (!expiryDate && planToUse?.expiryDate) expiryDate = safeIso(planToUse.expiryDate);
  if (!currentPeriodEnd && planToUse?.current_period_end) {
    currentPeriodEnd = safeIso(planToUse.current_period_end);
  }

  const isTrial = planId === TRIAL_PLAN_ID || (planConnectionType === "ONETIME" && expiryDate);
  const memberCreatedAt =
    safeIso(fullMemberData?.createdAt) ||
    existingMember?.created_at ||
    new Date().toISOString();

  if (isTrial && !expiryDate) {
    const createdDate = new Date(memberCreatedAt);
    const trialLengthDays = trialLengthForStart(createdDate, trialConfig);
    expiryDate = new Date(createdDate.getTime() + trialLengthDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const cancelAtPeriodEnd = planToUse?.cancelAtPeriodEnd || false;
  const isPaid = (payment?.status === "PAID" && planConnectionType === "SUBSCRIPTION")
    || (planStatus === "ACTIVE" && paymentMode === "RECURRING");

  let planType = null;
  let planName = null;
  if (planId) {
    const planIdLower = String(planId).toLowerCase();
    if (planIdLower.includes("annual") || planIdLower.includes("year")) {
      planType = "annual";
      planName = "Academy Annual";
    } else if (planIdLower.includes("month") || planIdLower.includes("monthly")) {
      planType = "monthly";
      planName = "Academy Monthly";
    } else if (planIdLower.includes("trial")) {
      planType = "trial";
      planName = "Academy Trial";
    } else {
      planName = planToUse?.planName || planToUse?.name || planId;
    }
  } else if (planConnections.length > 0) {
    planName = planConnections[0]?.planName || planConnections[0]?.name || "Plan Connected";
  }

  let planSummary = {
    plan_id: planId,
    plan_name: planName,
    status: planStatus,
    expiry_date: expiryDate,
    current_period_end: currentPeriodEnd,
    payment_mode: paymentMode,
    is_trial: isTrial,
    is_paid: isPaid,
    plan_type: planType,
    cancel_at_period_end: cancelAtPeriodEnd,
  };
  if (!planId && planConnections.length === 0 && existingMember?.plan_summary) {
    planSummary = existingMember.plan_summary;
  }

  return { planSummary, memberCreatedAt };
}

async function syncOneMember(ctx, m, existingById) {
  const memberId = m?.id;
  if (!memberId) return { membersUpserted: 0, eventsUpserted: 0 };

  let memberResponse = null;
  let fullMemberData = null;
  try {
    memberResponse = await ctx.memberstack.members.retrieve({ id: memberId });
    fullMemberData = memberResponse?.data || memberResponse;
  } catch {
    fullMemberData = m;
  }

  const email = fullMemberData?.auth?.email || fullMemberData?.email || null;
  const name = memberName(fullMemberData, email);
  const existingMember = existingById.get(memberId) || null;
  const isNewMember = !existingMember;
  const { planSummary, memberCreatedAt } = buildPlanSummary(
    fullMemberData,
    existingMember,
    ctx.trialConfig
  );

  const { error: upsertMemberErr } = await ctx.supabase
    .from("ms_members_cache")
    .upsert(
      [{
        member_id: memberId,
        email,
        name,
        plan_summary: planSummary,
        created_at: memberCreatedAt,
        updated_at: new Date().toISOString(),
        raw: {
          ...(memberResponse || {}),
          json: fullMemberData?.json || memberResponse?.json || memberResponse?.data?.json || null
        },
      }],
      { onConflict: "member_id" }
    );

  let membersUpserted = 0;
  let eventsUpserted = 0;

  if (!upsertMemberErr) {
    membersUpserted = 1;
    // Only seed example Qs for brand-new cache rows (was N queries every refresh).
    if (isNewMember) {
      try {
        await createExampleQuestionsForMember(memberId, email, name);
      } catch (exampleErr) {
        console.error(`[refresh-api] example questions failed for ${memberId}:`, exampleErr?.message || exampleErr);
      }
    }
  }

  const j = fullMemberData?.json || memberResponse?.json || memberResponse?.data?.json || {};
  const opened = j?.arAcademy?.modules?.opened || null;
  if (!opened || typeof opened !== "object") {
    return { membersUpserted, eventsUpserted };
  }

  for (const [path, md] of Object.entries(opened)) {
    if (!path || !md) continue;
    const createdAt = safeIso(md.lastAt) || safeIso(md.at) || new Date().toISOString();
    const { error: upsertEventErr } = await ctx.supabase
      .from("academy_events")
      .upsert(
        [{
          event_type: "module_open",
          member_id: memberId,
          email,
          path,
          title: md.t || md.title || "Module",
          category: md.cat || md.category || null,
          meta: {
            source: "memberstack_sync",
            first_opened_at: safeIso(md.at) || null,
            last_opened_at: safeIso(md.lastAt) || safeIso(md.at) || null,
          },
          created_at: createdAt,
        }],
        { onConflict: "member_id,event_type,path" }
      );
    if (!upsertEventErr) eventsUpserted += 1;
  }

  return { membersUpserted, eventsUpserted };
}

module.exports = async (req, res) => {
  console.log("[refresh-api-dir] Request received:", {
    method: req.method,
    url: req.url,
    endpoint: "api/admin/refresh"
  });

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({
        error: `Method Not Allowed. Expected GET or POST, got ${req.method}`,
        received: req.method,
        endpoint: "api/admin/refresh"
      });
    }

    // Vercel Cron uses GET + Authorization: Bearer CRON_SECRET
    if (req.method === "GET") {
      const cronSecret = process.env.CRON_SECRET;
      const auth = String(req.headers.authorization || "");
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const provided = bearer || req.query.secret || req.headers["x-cron-secret"];
      if (cronSecret && provided !== cronSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const trialConfig = await getTrialConfig({ forceRefresh: true });
    const ctx = { memberstack, supabase, trialConfig };

    let membersFetched = 0;
    let membersUpserted = 0;
    let eventsUpserted = 0;
    let after = undefined;

    while (true) {
      const { data: members, error: listMembersError } = await memberstack.members.list({
        limit: PAGE_SIZE,
        ...(after ? { after } : {}),
        order: "ASC",
      });

      if (listMembersError) {
        throw new Error(`Failed to fetch members list: ${listMembersError.message || "Unknown error"}`);
      }
      if (!members || members.length === 0) break;

      membersFetched += members.length;
      const ids = members.map((m) => m.id).filter(Boolean);

      const existingById = new Map();
      if (ids.length) {
        const { data: existingRows } = await supabase
          .from("ms_members_cache")
          .select("member_id, plan_summary, created_at")
          .in("member_id", ids);
        for (const row of existingRows || []) {
          existingById.set(row.member_id, row);
        }
      }

      const pageResults = await mapPool(members, CONCURRENCY, (m) =>
        syncOneMember(ctx, m, existingById)
      );
      for (const r of pageResults) {
        if (!r) continue;
        membersUpserted += r.membersUpserted || 0;
        eventsUpserted += r.eventsUpserted || 0;
      }

      if (members.length < PAGE_SIZE) break;
      after = members[members.length - 1]?.id;
      if (!after) break;
    }

    return res.status(200).json({
      success: true,
      members_fetched: membersFetched,
      members_upserted: membersUpserted,
      events_upserted: eventsUpserted,
    });
  } catch (err) {
    console.error("[refresh-api-dir] failed:", err?.message || err);
    return res.status(500).json({
      error: err?.message || "Unknown error",
    });
  }
};
