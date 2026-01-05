// api/admin/refresh.js
// Sync Memberstack -> Supabase (member cache + module_open events)
// Vercel routes /api/* to serverless functions, so this needs to be here

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

module.exports = async (req, res) => {
  console.log('[refresh-api-dir] Request received:', { 
    method: req.method, 
    url: req.url,
    endpoint: 'api/admin/refresh'
  });
  
  try {
    if (req.method !== "POST") {
      console.error('[refresh-api-dir] Method not allowed:', req.method);
      return res.status(405).json({ 
        error: `Method Not Allowed. Expected POST, got ${req.method}`,
        received: req.method,
        endpoint: 'api/admin/refresh'
      });
    }
    
    console.log('[refresh-api-dir] POST request validated, proceeding...');

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
      const { data: members, error: listMembersError } = await memberstack.members.list({
        limit,
        ...(after ? { after } : {}),
        order: "ASC",
      });

      if (listMembersError) {
        throw new Error(`Failed to fetch members list: ${listMembersError.message || 'Unknown error'}`);
      }

      if (!members || members.length === 0) break;

      membersFetched += members.length;

      for (const m of members) {
        const memberId = m.id;
        if (!memberId) continue;

        let fullMemberData = null;
        let memberResponse = null;
        try {
          memberResponse = await memberstack.members.retrieve({ id: memberId });
          fullMemberData = memberResponse?.data || memberResponse;
        } catch (retrieveError) {
          fullMemberData = m;
        }

        const email = fullMemberData?.auth?.email || fullMemberData?.email || null;
        
        let name = null;
        if (fullMemberData?.customFields) {
          const firstName = fullMemberData.customFields["first-name"] || fullMemberData.customFields["firstName"] || fullMemberData.customFields["first_name"];
          const lastName = fullMemberData.customFields["last-name"] || fullMemberData.customFields["lastName"] || fullMemberData.customFields["last_name"];
          if (firstName || lastName) {
            name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
          }
          if (!name) {
            name = fullMemberData.customFields.name || fullMemberData.customFields.Name || null;
          }
        }
        if (!name && email) {
          name = email.split('@')[0];
        }

        let planConnections = [];
        if (Array.isArray(fullMemberData?.planConnections)) {
          planConnections = fullMemberData.planConnections;
        } else if (fullMemberData?.planConnections && typeof fullMemberData.planConnections === 'object') {
          planConnections = [fullMemberData.planConnections];
        } else if (fullMemberData?.planConnection) {
          planConnections = [fullMemberData.planConnection];
        } else if (fullMemberData?.plans && Array.isArray(fullMemberData.plans)) {
          planConnections = fullMemberData.plans;
        }
        
        const trialPlanId = "pln_academy-trial-30-days--wb7v0hbh";
        const trialPlan = planConnections.find(p => (p?.planId || p?.id) === trialPlanId);
        const activePlan = planConnections.find(
          (p) => p?.status === "ACTIVE" || (p?.status && p?.expiryDate)
        ) || planConnections[0];

        const planToUse = trialPlan || activePlan;
        const planId = planToUse?.planId || planToUse?.id || null;
        const rawStatus = planToUse?.status || "UNPAID";
        const planStatus = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : "UNPAID";
        
        // Extract payment info from plan connection
        const payment = planToUse?.payment || {};
        const planConnectionType = planToUse?.type || null; // "SUBSCRIPTION" or "ONETIME"
        
        // Determine payment mode: SUBSCRIPTION = RECURRING, ONETIME = ONETIME
        let paymentMode = planToUse?.paymentMode || null;
        if (!paymentMode && planConnectionType) {
          paymentMode = planConnectionType === "SUBSCRIPTION" ? "RECURRING" : "ONETIME";
        }
        
        // Extract dates from various sources
        let expiryDate = null;
        let currentPeriodEnd = null;
        
        // For subscriptions, use nextBillingDate (Unix timestamp) as current_period_end
        if (payment?.nextBillingDate) {
          // Convert Unix timestamp to ISO string
          const nextBillingTimestamp = typeof payment.nextBillingDate === 'number' 
            ? payment.nextBillingDate 
            : parseInt(payment.nextBillingDate, 10);
          if (!isNaN(nextBillingTimestamp)) {
            currentPeriodEnd = new Date(nextBillingTimestamp * 1000).toISOString();
            // For annual subscriptions, also use as expiry_date
            if (planConnectionType === "SUBSCRIPTION") {
              expiryDate = currentPeriodEnd;
            }
          }
        }
        
        // Fallback to plan connection expiryDate if available
        if (!expiryDate && trialPlan?.expiryDate) {
          expiryDate = safeIso(trialPlan.expiryDate);
        } else if (!expiryDate && planToUse?.expiryDate) {
          expiryDate = safeIso(planToUse.expiryDate);
        }
        
        // Fallback to plan connection current_period_end if available
        if (!currentPeriodEnd && planToUse?.current_period_end) {
          currentPeriodEnd = safeIso(planToUse.current_period_end);
        }
        
        const isTrial = planId === trialPlanId || (planConnectionType === "ONETIME" && expiryDate);
        const memberCreatedAt = safeIso(fullMemberData?.createdAt) || new Date().toISOString();
        if (isTrial && !expiryDate) {
          const createdDate = new Date(memberCreatedAt);
          const trialEndDate = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          expiryDate = trialEndDate.toISOString();
        }
        
        const cancelAtPeriodEnd = planToUse?.cancelAtPeriodEnd || false;
        
        // Determine is_paid: true if payment is PAID and it's a subscription, or if status is ACTIVE with RECURRING payment
        const isPaid = (payment?.status === "PAID" && planConnectionType === "SUBSCRIPTION") || 
                       (planStatus === "ACTIVE" && paymentMode === "RECURRING");
        
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

        const planSummary = {
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

        const { error: upsertMemberErr } = await supabase
          .from("ms_members_cache")
          .upsert(
            [
              {
                member_id: memberId,
                email,
                name,
                plan_summary: planSummary,
                created_at: safeIso(fullMemberData?.createdAt) || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                raw: {
                  ...(memberResponse || {}),
                  json: fullMemberData?.json || memberResponse?.json || memberResponse?.data?.json || null
                },
              },
            ],
            { onConflict: "member_id" }
          );

        if (!upsertMemberErr) membersUpserted++;

        const j = fullMemberData?.json || memberResponse?.json || memberResponse?.data?.json || {};
        const opened = j?.arAcademy?.modules?.opened || null;
        
        if (!opened || typeof opened !== "object") continue;

        for (const [path, md] of Object.entries(opened)) {
          if (!path || !md) continue;

          const createdAt = safeIso(md.lastAt) || safeIso(md.at) || new Date().toISOString();
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
};
