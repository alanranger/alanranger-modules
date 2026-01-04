// /api/admin/refresh.js
// Refreshes data from Memberstack and updates Supabase events
// This syncs the latest module opens from Memberstack JSON to Supabase events
// Also syncs members to ms_members_cache

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  // Security: Add admin authentication check here
  // For now, this is a placeholder - add proper auth in production
  
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let membersSynced = 0;
    let processed = 0;
    let eventsAdded = 0;
    let skipped = 0;
    let after = null;
    const limit = 100;
    let totalMembersFetched = 0;

    console.log('[refresh] Starting refresh: syncing members and module events...');

    // Single loop: sync members to cache AND process module events
    while (true) {
      const params = { limit };
      if (after) params.after = after;

      const { data: members, error: membersError } = await memberstack.members.list(params);

      if (membersError) {
        console.error('[refresh] Error fetching members:', membersError);
        throw new Error(`Failed to fetch members: ${membersError.message || 'Unknown error'}`);
      }

      if (!members || members.length === 0) {
        console.log(`[refresh] No more members`);
        break;
      }

      totalMembersFetched += members.length;
      console.log(`[refresh] Fetched ${members.length} members (total: ${totalMembersFetched})`);

      for (const member of members) {
        try {
          const memberId = member.id;
          const memberEmail = member.auth?.email || null;
          const name = member.customFields?.name || member.name || null;
          
          // 1. Sync member to cache
          const planSummary = {
            plan_id: null,
            plan_name: null,
            status: member.status || 'unknown',
            trial_end: null,
            is_trial: false,
            is_paid: false,
            plan_type: null
          };

          if (member.planConnections && Array.isArray(member.planConnections) && member.planConnections.length > 0) {
            const activePlan = member.planConnections.find(p => p.status === 'active' || p.status === 'trialing');
            if (activePlan) {
              planSummary.plan_id = activePlan.planId || activePlan.id;
              planSummary.plan_name = activePlan.planName || activePlan.name || 'Unknown Plan';
              planSummary.status = activePlan.status || member.status;
              planSummary.trial_end = activePlan.trialEnd || null;
              planSummary.is_trial = activePlan.status === 'trialing' || false;
              planSummary.is_paid = activePlan.status === 'active' && !planSummary.is_trial;
              
              const planNameLower = (planSummary.plan_name || '').toLowerCase();
              if (planNameLower.includes('annual') || planNameLower.includes('year')) {
                planSummary.plan_type = 'annual';
              } else if (planNameLower.includes('month') || planNameLower.includes('monthly')) {
                planSummary.plan_type = 'monthly';
              }
            }
          }

          const { error: upsertError } = await supabase.from('ms_members_cache').upsert([{
            member_id: memberId,
            email: memberEmail,
            name: name,
            plan_summary: planSummary,
            created_at: member.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            raw: member
          }], { onConflict: 'member_id' });

          if (upsertError) {
            console.error(`[refresh] Error upserting member ${memberId} to cache:`, upsertError);
          } else {
            membersSynced++;
          }

          // 2. Process module events from member JSON
          const memberJson = await memberstack.members.getMemberJSON({ id: memberId });
          
          if (!memberJson || !memberJson.arAcademy || !memberJson.arAcademy.modules || !memberJson.arAcademy.modules.opened) {
            skipped++;
            console.log(`[refresh] Skipping member ${memberId} (${memberEmail || 'no email'}) - no opened modules data`);
            continue;
          }

          const opened = memberJson.arAcademy.modules.opened;

          // Process each opened module
          for (const [path, moduleData] of Object.entries(opened)) {
            if (!path || !moduleData) continue;

            // Check if event already exists (avoid duplicates)
            const { data: existing } = await supabase
              .from('academy_events')
              .select('id')
              .eq('member_id', memberId)
              .eq('path', path)
              .eq('event_type', 'module_open')
              .limit(1)
              .single();

            if (existing) {
              // Update lastAt if needed (only if module was opened more recently)
              if (moduleData.lastAt) {
                await supabase
                  .from('academy_events')
                  .update({ 
                    created_at: moduleData.lastAt,
                    email: memberEmail 
                  })
                  .eq('id', existing.id);
              }
              continue;
            }

            // Insert new event
            const { error: insertError } = await supabase
              .from('academy_events')
              .insert([{
                event_type: 'module_open',
                member_id: memberId,
                email: memberEmail,
                path: path,
                title: moduleData.t || moduleData.title || 'Module',
                category: moduleData.cat || moduleData.category || null,
                meta: {
                  source: 'memberstack_sync',
                  first_opened_at: moduleData.at || null,
                  last_opened_at: moduleData.lastAt || moduleData.at || null
                },
                created_at: moduleData.lastAt || moduleData.at || new Date().toISOString()
              }]);

            if (!insertError) {
              eventsAdded++;
            } else {
              console.error(`[refresh] Error inserting event for ${memberId}/${path}:`, insertError);
            }
          }

          processed++;
        } catch (memberError) {
          console.error(`[refresh] Error processing member ${member.id}:`, memberError);
          skipped++;
        }
      }

      if (members.length < limit) {
        break; // Last page
      }
      after = members[members.length - 1]?.id || null;
      if (!after) break;
    }

      if (membersError) {
        console.error('[refresh] Error fetching members:', membersError);
        throw new Error(`Failed to fetch members: ${membersError.message || 'Unknown error'}`);
      }

      if (!members || members.length === 0) {
        console.log(`[refresh] No more members (page ${page})`);
        break;
      }

      totalMembersFetched += members.length;
      console.log(`[refresh] Fetched page ${page}: ${members.length} members (total so far: ${totalMembersFetched})`);

      for (const member of members) {
        try {
          const memberId = member.id;
          const memberEmail = member.auth?.email || null;
          
          // Get member JSON (contains arAcademy.modules.opened)
          const memberJson = await memberstack.members.getMemberJSON({ id: memberId });
          

    console.log(`[refresh] Summary: ${membersSynced} members synced, ${totalMembersFetched} total members fetched, ${processed} processed, ${skipped} skipped, ${eventsAdded} events added`);

    return res.status(200).json({
      success: true,
      members_synced: membersSynced,
      total_members_fetched: totalMembersFetched,
      members_processed: processed,
      members_skipped: skipped,
      events_added: eventsAdded,
      message: `Synced ${membersSynced} members, fetched ${totalMembersFetched} members, processed ${processed} with opened modules, skipped ${skipped}, added ${eventsAdded} new events`
    });
  } catch (error) {
    console.error('[refresh] Fatal error:', error);
    console.error('[refresh] Error stack:', error.stack);
    return res.status(500).json({ 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
