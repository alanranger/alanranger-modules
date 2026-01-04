// /api/admin/sync-members.js
// Syncs Memberstack members to Supabase ms_members_cache table
// Protected by AR_ANALYTICS_KEY header

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Security: Verify AR_ANALYTICS_KEY
    const authKey = req.headers['x-ar-analytics-key'] || req.query.key;
    const expectedKey = process.env.AR_ANALYTICS_KEY;
    
    if (!expectedKey || authKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let totalFetched = 0;
    let totalUpserted = 0;
    let errors = [];
    let after = null;
    const limit = 100;

    console.log('[sync-members] Starting Memberstack sync...');

    while (true) {
      try {
        // Fetch members from Memberstack (paginated)
        const params = { limit };
        if (after) params.after = after;

        const { data: members, error: membersError } = await memberstack.members.list(params);

        if (membersError) {
          throw new Error(`Memberstack API error: ${membersError.message || 'Unknown error'}`);
        }

        if (!members || members.length === 0) {
          console.log('[sync-members] No more members to fetch');
          break;
        }

        totalFetched += members.length;
        console.log(`[sync-members] Fetched ${members.length} members (total: ${totalFetched})`);

        // Process each member
        for (const member of members) {
          try {
            const memberId = member.id;
            const email = member.auth?.email || null;
            const name = member.customFields?.name || member.name || null;
            
            // Extract plan information
            const planSummary = {
              plan_id: null,
              plan_name: null,
              status: member.status || 'unknown',
              trial_end: null,
              is_trial: false,
              is_paid: false,
              plan_type: null // 'annual', 'monthly', etc.
            };

            // Process plan connections (Memberstack structure)
            if (member.planConnections && Array.isArray(member.planConnections) && member.planConnections.length > 0) {
              const activePlan = member.planConnections.find(p => p.status === 'active' || p.status === 'trialing');
              if (activePlan) {
                planSummary.plan_id = activePlan.planId || activePlan.id;
                planSummary.plan_name = activePlan.planName || activePlan.name || 'Unknown Plan';
                planSummary.status = activePlan.status || member.status;
                planSummary.trial_end = activePlan.trialEnd || null;
                planSummary.is_trial = activePlan.status === 'trialing' || false;
                planSummary.is_paid = activePlan.status === 'active' && !planSummary.is_trial;
                
                // Try to infer plan type from plan name
                const planNameLower = (planSummary.plan_name || '').toLowerCase();
                if (planNameLower.includes('annual') || planNameLower.includes('year')) {
                  planSummary.plan_type = 'annual';
                } else if (planNameLower.includes('month') || planNameLower.includes('monthly')) {
                  planSummary.plan_type = 'monthly';
                }
              }
            }

            // Upsert into ms_members_cache
            const { error: upsertError } = await supabase
              .from('ms_members_cache')
              .upsert([{
                member_id: memberId,
                email: email,
                name: name,
                plan_summary: planSummary,
                created_at: member.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                raw: member // Store full object
              }], {
                onConflict: 'member_id'
              });

            if (upsertError) {
              console.error(`[sync-members] Error upserting member ${memberId}:`, upsertError);
              errors.push({ member_id: memberId, error: upsertError.message });
            } else {
              totalUpserted++;
            }
          } catch (memberError) {
            console.error(`[sync-members] Error processing member ${member.id}:`, memberError);
            errors.push({ member_id: member.id, error: memberError.message });
          }
        }

        // Check if there are more pages
        if (members.length < limit) {
          break; // Last page
        }

        // Get cursor for next page (Memberstack pagination)
        after = members[members.length - 1]?.id || null;
        if (!after) break;

      } catch (pageError) {
        console.error('[sync-members] Error fetching page:', pageError);
        errors.push({ error: pageError.message });
        break;
      }
    }

    console.log(`[sync-members] Sync complete: ${totalFetched} fetched, ${totalUpserted} upserted, ${errors.length} errors`);

    return res.status(200).json({
      success: true,
      total_fetched: totalFetched,
      total_upserted: totalUpserted,
      errors: errors.length > 0 ? errors : undefined,
      message: `Synced ${totalUpserted} members from Memberstack`
    });

  } catch (error) {
    console.error('[sync-members] Fatal error:', error);
    return res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
};
