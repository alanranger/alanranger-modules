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
  // Log the request method for debugging
  console.log('[refresh] Request received:', { method: req.method, url: req.url });
  
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method Not Allowed. Expected POST, got ${req.method}` });
  }
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Allow GET for testing, but prefer POST
  if (req.method !== "POST" && req.method !== "GET") {
    console.error('[refresh] Method not allowed:', req.method);
    return res.status(405).json({ 
      error: "Method Not Allowed", 
      received: req.method,
      allowed: ['POST', 'GET', 'OPTIONS']
    });
  }
  
  try {
    console.log('[refresh] Processing request...');

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

    console.log('[refresh] Starting refresh: syncing members and module events...');

    while (true) {
      const { data: members, error: listMembersError } = await memberstack.members.list({
        limit,
        ...(after ? { after } : {}),
        order: "ASC",
      });

      if (listMembersError) {
        console.error('[refresh] Error fetching members list:', listMembersError);
        throw new Error(`Failed to fetch members list: ${listMembersError.message || 'Unknown error'}`);
      }

      if (!members || members.length === 0) break;

      membersFetched += members.length;
      console.log(`[refresh] Fetched ${members.length} members (total: ${membersFetched})`);

      for (const m of members) {
        const memberId = m.id;
        if (!memberId) continue;

        let fullMemberData = null;
        let memberResponse = null;
        try {
          memberResponse = await memberstack.members.retrieve({ id: memberId });
          // Memberstack Admin API may return { data: {...} } or the member object directly
          fullMemberData = memberResponse?.data || memberResponse;
        } catch (retrieveError) {
          console.error(`[refresh] Error retrieving full member data for ${memberId}:`, retrieveError);
          // Continue processing with partial data if full retrieve fails
          fullMemberData = m; // Use data from list if retrieve fails
        }

        // Extract email - check multiple possible locations
        const email = fullMemberData?.auth?.email || fullMemberData?.email || null;
        
        // Extract name - Memberstack custom fields use keys like "first-name" and "last-name"
        let name = null;
        if (fullMemberData?.customFields) {
          // Try common name field patterns
          const firstName = fullMemberData.customFields["first-name"] || fullMemberData.customFields["firstName"] || fullMemberData.customFields["first_name"];
          const lastName = fullMemberData.customFields["last-name"] || fullMemberData.customFields["lastName"] || fullMemberData.customFields["last_name"];
          if (firstName || lastName) {
            name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
          }
          // Fallback to generic name field
          if (!name) {
            name = fullMemberData.customFields.name || fullMemberData.customFields.Name || null;
          }
        }
        // Final fallback
        if (!name && email) {
          name = email.split('@')[0]; // Use part of email as name
        }

        // Plan summary - Memberstack uses uppercase statuses: ACTIVE, CANCELED, PAST_DUE, UNPAID
        // Check multiple possible locations for plan data
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
        
        // Find trial plan first (if exists), then active plan
        const trialPlan = planConnections.find(p => (p?.planId || p?.id) === trialPlanId);
        const activePlan = planConnections.find(
          (p) => p?.status === "ACTIVE" || (p?.status && p?.expiryDate)
        ) || planConnections[0]; // Fallback to first plan if no active found

        // Use trial plan if it exists, otherwise use active plan
        const planToUse = trialPlan || activePlan;

        // Get plan name from planId or plan object
        // Note: Memberstack planConnections structure may vary
        // Check both planId and id fields
        const planId = planToUse?.planId || planToUse?.id || null;
        // Status might be in different case, normalize to uppercase
        const rawStatus = planToUse?.status || "UNPAID";
        const planStatus = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : "UNPAID";
        
        // Extract expiryDate - check trial plan first, then active plan
        let expiryDate = null;
        if (trialPlan?.expiryDate) {
          expiryDate = safeIso(trialPlan.expiryDate);
        } else if (planToUse?.expiryDate) {
          expiryDate = safeIso(planToUse.expiryDate);
        }
        
        // Determine if trial: 
        // 1. Check for specific trial planId: pln_academy-trial-30-days--wb7v0hbh
        // 2. OR check for ONETIME payment mode with expiryDate (30-day free trial)
        const isTrial = planId === trialPlanId || (planToUse?.paymentMode === "ONETIME" && expiryDate);
        
        // For trials without expiryDate, calculate it (30 days from created_at or now)
        const memberCreatedAt = safeIso(fullMemberData?.createdAt) || new Date().toISOString();
        if (isTrial && !expiryDate) {
          // Calculate 30 days from member creation date
          const createdDate = new Date(memberCreatedAt);
          const trialEndDate = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          expiryDate = trialEndDate.toISOString();
        }
        
        const paymentMode = planToUse?.paymentMode || null; // FREE, ONETIME, RECURRING
        // For annual plans, check for current_period_end (from Stripe) or cancelAtPeriodEnd
        const currentPeriodEnd = planToUse?.current_period_end ? safeIso(planToUse.current_period_end) : null;
        const cancelAtPeriodEnd = planToUse?.cancelAtPeriodEnd || false;
        
        // Paid = ACTIVE status + RECURRING payment mode (annual subscription)
        // Annual plans are RECURRING, not ONETIME
        const isPaid = planStatus === "ACTIVE" && paymentMode === "RECURRING";
        
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
            planName = planToUse?.planName || planToUse?.name || planId; // Use planName from activePlan or planId as name if can't determine
          }
        } else if (planConnections.length > 0) {
          // If no planId but we have connections, try to get name from first plan
          planName = planConnections[0]?.planName || planConnections[0]?.name || "Plan Connected";
        }

        const planSummary = {
          plan_id: planId,
          plan_name: planName,
          status: planStatus, // ACTIVE, CANCELED, PAST_DUE, UNPAID
          expiry_date: expiryDate, // For trials (ONETIME plans)
          current_period_end: currentPeriodEnd, // For annual subscriptions (RECURRING)
          payment_mode: paymentMode,
          is_trial: isTrial,
          is_paid: isPaid,
          plan_type: planType,
          cancel_at_period_end: cancelAtPeriodEnd,
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
                created_at: safeIso(fullMemberData?.createdAt) || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                raw: {
                  ...(memberResponse || {}),
                  // Ensure json field is accessible at top level for easy querying
                  json: fullMemberData?.json || memberResponse?.json || memberResponse?.data?.json || null
                },
              },
            ],
            { onConflict: "member_id" }
          );

        if (upsertMemberErr) {
          console.error(`[refresh] Error upserting member ${memberId} to cache:`, upsertMemberErr);
        } else {
          membersUpserted++;
        }

        // Read opened modules from Member JSON
        // JSON might be in full.json, memberResponse.json, or memberResponse.data.json
        const j = fullMemberData?.json || memberResponse?.json || memberResponse?.data?.json || {};
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

    console.log(`[refresh] Summary: Fetched ${membersFetched} members, Upserted ${membersUpserted} members to cache, Upserted ${eventsUpserted} events`);

    return res.status(200).json({
      success: true,
      members_fetched: membersFetched,
      members_upserted: membersUpserted,
      events_upserted: eventsUpserted,
    });
  } catch (err) {
    console.error('[refresh] Fatal error:', err);
    console.error('[refresh] Error stack:', err.stack);
    return res.status(500).json({
      error: err?.message || "Unknown error",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
