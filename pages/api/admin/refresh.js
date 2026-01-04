// pages/api/admin/refresh.js
// Sync Memberstack -> Supabase (member cache + module_open events)
//
// Requires env:
// - MEMBERSTACK_SECRET_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");

function safeIso(d) {
  try {
    const x = new Date(d);
    return isNaN(x.getTime()) ? null : x.toISOString();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let membersFetched = 0;
    let membersUpserted = 0;
    let eventsUpserted = 0;

    let after = undefined;
    const limit = 100;

    while (true) {
      const { data: members } = await memberstack.members.list({
        limit,
        ...(after ? { after } : {}),
        order: "ASC",
      });

      if (!members || members.length === 0) break;

      membersFetched += members.length;

      for (const m of members) {
        const memberId = m.id;
        if (!memberId) continue;

        // Retrieve full member (includes `json` field per Memberstack Admin Package docs)
        const full = await memberstack.members.retrieve({ id: memberId });

        const email = full?.auth?.email || null;
        const name = full?.customFields?.name || full?.name || null;

        // Plan summary - Memberstack uses uppercase statuses: ACTIVE, CANCELED, PAST_DUE, UNPAID
        // Check multiple possible locations for plan data
        let planConnections = [];
        if (Array.isArray(full?.planConnections)) {
          planConnections = full.planConnections;
        } else if (full?.planConnections && typeof full.planConnections === 'object') {
          planConnections = [full.planConnections];
        } else if (full?.planConnection) {
          planConnections = [full.planConnection];
        } else if (full?.plans && Array.isArray(full.plans)) {
          planConnections = full.plans;
        }
        
        // Debug: Log planConnections structure for first 3 members
        if (membersFetched <= 3) {
          console.log(`[refresh] Member ${memberId.substring(0, 20)}... planConnections:`, JSON.stringify(planConnections, null, 2));
          console.log(`[refresh] Member ${memberId.substring(0, 20)}... full keys:`, Object.keys(full || {}));
          if (full?.planConnections !== undefined) {
            console.log(`[refresh] planConnections type:`, typeof full.planConnections, 'isArray:', Array.isArray(full.planConnections));
          }
        }
        
        // Find active plan (ACTIVE status) or trial (has expiryDate)
        // Also check for any plan with a status (might be the only one)
        const activePlan = planConnections.find(
          (p) => p?.status === "ACTIVE" || (p?.status && p?.expiryDate)
        ) || planConnections[0]; // Fallback to first plan if no active found

        // Get plan name from planId or plan object
        // Note: Memberstack planConnections structure may vary
        // Check both planId and id fields
        const planId = activePlan?.planId || activePlan?.id || null;
        // Status might be in different case, normalize to uppercase
        const rawStatus = activePlan?.status || "UNPAID";
        const planStatus = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : "UNPAID";
        const expiryDate = activePlan?.expiryDate ? safeIso(activePlan.expiryDate) : null;
        const paymentMode = activePlan?.paymentMode || null; // FREE, ONETIME, RECURRING
        
        // Determine if trial (has expiryDate and status might be ACTIVE with future expiry)
        const isTrial = expiryDate ? (new Date(expiryDate) > new Date()) : false;
        // Paid = ACTIVE status + (RECURRING payment OR no expiryDate indicating it's not a trial)
        const isPaid = planStatus === "ACTIVE" && !isTrial && (paymentMode === "RECURRING" || !expiryDate);
        
        // Determine plan type from planId (e.g., pln_academy-annual...)
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
            planName = planId; // Use planId as name if can't determine
          }
        } else if (planConnections.length > 0) {
          // If no planId but we have connections, mark as unknown
          planName = "Plan Connected";
        }

        const planSummary = {
          plan_id: planId,
          plan_name: planName,
          status: planStatus, // ACTIVE, CANCELED, PAST_DUE, UNPAID
          expiry_date: expiryDate,
          payment_mode: paymentMode,
          is_trial: isTrial,
          is_paid: isPaid,
          plan_type: planType,
          cancel_at_period_end: activePlan?.cancelAtPeriodEnd || false,
        };

        // Upsert member cache (this is what your KPI "totalMembers/trials/paid" should read from)
        const { error: upsertMemberErr } = await supabase
          .from("ms_members_cache")
          .upsert(
            [
              {
                member_id: memberId,
                email,
                name,
                plan_summary: planSummary,
                created_at: safeIso(full?.createdAt) || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                raw: full,
              },
            ],
            { onConflict: "member_id" }
          );

        if (!upsertMemberErr) membersUpserted++;

        // Read opened modules from Member JSON
        const j = full?.json || {};
        const opened = j?.arAcademy?.modules?.opened || null;
        if (!opened || typeof opened !== "object") continue;

        // Upsert module_open events
        for (const [path, md] of Object.entries(opened)) {
          if (!path || !md) continue;

          const createdAt =
            safeIso(md.lastAt) ||
            safeIso(md.at) ||
            new Date().toISOString();

          const meta = {
            source: "memberstack_sync",
            first_opened_at: safeIso(md.at) || null,
            last_opened_at: safeIso(md.lastAt) || safeIso(md.at) || null,
          };

          const { error: upsertEventErr } = await supabase
            .from("academy_events")
            .upsert(
              [
                {
                  event_type: "module_open",
                  member_id: memberId,
                  email,
                  path,
                  title: md.t || md.title || "Module",
                  category: md.cat || md.category || null,
                  meta,
                  created_at: createdAt,
                },
              ],
              // IMPORTANT: you should add a unique constraint on (member_id,event_type,path)
              // so this upsert is deterministic.
              { onConflict: "member_id,event_type,path" }
            );

          if (!upsertEventErr) eventsUpserted++;
        }
      }

      if (members.length < limit) break;
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
    return res.status(500).json({
      error: err?.message || "Unknown error",
    });
  }
}
