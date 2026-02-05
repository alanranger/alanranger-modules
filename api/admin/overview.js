// /api/admin/overview.js
// Returns aggregated KPIs for admin dashboard overview
// Combines data from ms_members_cache, academy_events, and exam tables

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const now = new Date();
    const periods = {
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    };
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // 1. Total members (all-time from cache)
    // Get all members first, then filter to only count those with valid plans
    // This matches the Members page filter logic
    const { data: allMembersRaw } = await supabase
      .from('ms_members_cache')
      .select('plan_summary, created_at, member_id, email');
    
    // Filter to only count members with valid plans (trial or annual, active/trialing status)
    // This matches the Members page filter and excludes:
    // - Members without plans
    // - Members with canceled plans
    // - Orphaned records (members deleted from Memberstack)
    const validMembers = (allMembersRaw || []).filter(member => {
      const plan = member.plan_summary || {};
      const planType = plan.plan_type || '';
      const status = (plan.status || '').toUpperCase();
      
      // Only include members with trial or annual plans that are ACTIVE or TRIALING
      return (
        (planType === 'trial' || planType === 'annual') &&
        (status === 'ACTIVE' || status === 'TRIALING')
      );
    });
    
    const totalMembers = validMembers.length;

    // 2. Plan breakdowns (use the same allMembersRaw data)
    const allMembers = allMembersRaw;

    let trials = 0;
    let annual = 0;
    let monthly = 0;
    let canceled = 0;
    let trialsExpiring30d = 0;
    let annualExpiring30d = 0;
    let allPlansExpiring7d = 0;
    
    // 3. Get conversion data from academy_plan_events
    const { data: planEvents } = await supabase
      .from('academy_plan_events')
      .select('ms_member_id, event_type, ms_price_id, created_at, stripe_invoice_id, payload')
      .order('created_at', { ascending: true });

    if (allMembers) {
      allMembers.forEach(m => {
        try {
          const plan = m.plan_summary || {};
          // Memberstack uses uppercase statuses
          const status = (plan.status || '').toUpperCase();
          
          // Trial detection: check for trial planId or ONETIME payment with expiryDate
          const trialPlanId = "pln_academy-trial-30-days--wb7v0hbh";
          const isTrial = plan.plan_id === trialPlanId || (plan.payment_mode === "ONETIME" && plan.expiry_date);
          
          if (isTrial) trials++;
          if (plan.plan_type === 'annual') annual++;
          if (plan.plan_type === 'monthly') monthly++;
          if (status === 'CANCELED' || status === 'CANCELLED') canceled++;
          
          // Count expiring trials (expiry_date within next 30 days)
          if (isTrial && plan.expiry_date) {
            try {
              const expiryDate = new Date(plan.expiry_date);
              if (!isNaN(expiryDate.getTime()) && expiryDate > now && expiryDate <= thirtyDaysFromNow) {
                trialsExpiring30d++;
              }
              // Also count for 7-day window
              if (expiryDate > now && expiryDate <= sevenDaysFromNow) {
                allPlansExpiring7d++;
              }
            } catch (e) {
              // Invalid date, skip
            }
          }
          
          // Count expiring annual plans
          // Annual plans use current_period_end (from Stripe) or expiry_date if set
          // If cancelAtPeriodEnd is true, the plan will expire at current_period_end
          if (plan.plan_type === 'annual') {
            const endDate = plan.current_period_end || plan.expiry_date;
            if (endDate) {
              try {
                const expiryDate = new Date(endDate);
                if (!isNaN(expiryDate.getTime()) && expiryDate > now && expiryDate <= thirtyDaysFromNow) {
                  annualExpiring30d++;
                }
                // Also count for 7-day window
                if (expiryDate > now && expiryDate <= sevenDaysFromNow) {
                  allPlansExpiring7d++;
                }
              } catch (e) {
                // Invalid date, skip
              }
            }
          }
        } catch (e) {
          console.error('[overview] Error processing member:', e);
        }
      });
    }

    // 3. New signups (from cache created_at) - only count valid members
    // Filter validMembers by created_at date to get signups
    const signups24h = validMembers.filter(m => {
      if (!m.created_at) return false;
      const created = new Date(m.created_at);
      return created >= periods['24h'];
    }).length;

    const signups7d = validMembers.filter(m => {
      if (!m.created_at) return false;
      const created = new Date(m.created_at);
      return created >= periods['7d'];
    }).length;

    const signups30d = validMembers.filter(m => {
      if (!m.created_at) return false;
      const created = new Date(m.created_at);
      return created >= periods['30d'];
    }).length;

    // 4. Active members (based on last activity in academy_events)
    const { data: active24h } = await supabase
      .from('academy_events')
      .select('member_id')
      .gte('created_at', periods['24h'].toISOString())
      .not('member_id', 'is', null);

    const { data: active7d } = await supabase
      .from('academy_events')
      .select('member_id')
      .gte('created_at', periods['7d'].toISOString())
      .not('member_id', 'is', null);

    const { data: active30d } = await supabase
      .from('academy_events')
      .select('member_id')
      .gte('created_at', periods['30d'].toISOString())
      .not('member_id', 'is', null);

    const activeMembers24h = new Set(active24h?.map(e => e.member_id) || []).size;
    const activeMembers7d = new Set(active7d?.map(e => e.member_id) || []).size;
    const activeMembers30d = new Set(active30d?.map(e => e.member_id) || []).size;

    // 5. Engagement metrics (30d)
    const { data: moduleOpens30d } = await supabase
      .from('academy_events')
      .select('member_id')
      .eq('event_type', 'module_open')
      .gte('created_at', periods['30d'].toISOString());

    const uniqueModulesOpened = new Set(moduleOpens30d?.map(e => e.member_id) || []).size;
    const totalModuleOpens = moduleOpens30d?.length || 0;
    const avgModulesOpened = uniqueModulesOpened > 0 ? (totalModuleOpens / uniqueModulesOpened).toFixed(1) : 0;

    // 6. Exam metrics (30d) - Note: exam_member_links uses memberstack_id, not member_id
    // For now, use module_results_ms which has memberstack_id
    const { data: examAttempts } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, passed')
      .gte('created_at', periods['30d'].toISOString());

    const examAttempts30d = examAttempts?.length || 0;
    const examPassed30d = examAttempts?.filter(e => e.passed).length || 0;
    const passRate30d = examAttempts30d > 0 ? Math.round((examPassed30d / examAttempts30d) * 100) : 0;
    const uniqueMembersWithExams = new Set(examAttempts?.map(e => e.memberstack_id) || []).size;
    const avgExamAttempts = uniqueMembersWithExams > 0 ? (examAttempts30d / uniqueMembersWithExams).toFixed(1) : 0;

    // 7. Bookmarks (30d) - Count from Memberstack JSON
    // Bookmarks are stored at raw.json.bookmarks (root level), not in arAcademy.bookmarks
    // They're also not logged as events in academy_events
    const { data: allMembersForBookmarks } = await supabase
      .from('ms_members_cache')
      .select('raw, updated_at');
    
    let totalBookmarks = 0;
    if (allMembersForBookmarks) {
      allMembersForBookmarks.forEach(member => {
        try {
          const raw = member.raw || {};
          const json = raw.json || raw.data?.json || raw;
          // Bookmarks are at root level: json.bookmarks, not json.arAcademy.bookmarks
          const bookmarks = json.bookmarks || [];
          
          if (Array.isArray(bookmarks)) {
            // Count all bookmarks (bookmarks don't have individual timestamps)
            totalBookmarks += bookmarks.length;
          }
        } catch (e) {
          // Skip members with invalid JSON
        }
      });
    }
    
    // Also check academy_events as fallback (in case some bookmarks are logged as events)
    const { count: bookmarksFromEvents } = await supabase
      .from('academy_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'bookmark_add')
      .gte('created_at', periods['30d'].toISOString());
    
    const bookmarks30d = totalBookmarks + (bookmarksFromEvents || 0);

    // ===== BI METRICS: Revenue & Retention =====
    const start7d = periods['7d'];
    const start30d = periods['30d'];
    const start90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const next30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get all members with plan details for BI calculations
    const { data: allMembersForBI } = await supabase
      .from('ms_members_cache')
      .select('member_id, email, created_at, plan_summary');

    // Historical trial records (persistent)
    const { data: trialHistory } = await supabase
      .from('academy_trial_history')
      .select('member_id, trial_start_at, trial_end_at, converted_at');
    const trialHistoryRows = Array.isArray(trialHistory) ? trialHistory : [];
    const hasTrialHistory = trialHistoryRows.length > 0;
    const trialHistoryEndedAllTime = trialHistoryRows.filter(row => {
      if (!row.trial_end_at) return false;
      const endAt = new Date(row.trial_end_at);
      return !isNaN(endAt.getTime()) && endAt <= now;
    });
    const trialHistoryEndedWithoutConversionAllTime = trialHistoryEndedAllTime.filter(row => !row.converted_at);
    const trialHistoryConversionsAllTime = trialHistoryRows.filter(row => row.converted_at);

    // Build member plan timeline map
    const memberPlans = {};
    const trialPlanId = "pln_academy-trial-30-days--wb7v0hbh";
    const ANNUAL_PRICE = 79; // £79 annual plan price
    const trialStartsByMember = {};

    if (planEvents) {
      planEvents.forEach(event => {
        if (!event.ms_member_id || !event.created_at) return;
        if (event.event_type !== 'checkout.session.completed') return;
        const priceId = event.ms_price_id || '';
        if (!priceId.includes('trial') && !priceId.includes('30-day')) return;
        const startedAt = new Date(event.created_at);
        if (isNaN(startedAt.getTime())) return;
        const existing = trialStartsByMember[event.ms_member_id];
        if (!existing || startedAt < existing) {
          trialStartsByMember[event.ms_member_id] = startedAt;
        }
      });
    }

    const trialStartsFromEvents = Object.entries(trialStartsByMember).map(([memberId, startedAt]) => ({
      member_id: memberId,
      trialStartAt: startedAt
    }));
    const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
    const trialsEndedFromEventsAll = trialStartsFromEvents
      .map(t => ({ member_id: t.member_id, trialEndAt: addDays(t.trialStartAt, 30) }))
      .filter(t => !isNaN(t.trialEndAt.getTime()) && t.trialEndAt <= now);
    const trialsEndedFromEvents30d = trialsEndedFromEventsAll.filter(t =>
      t.trialEndAt >= start30d && t.trialEndAt <= now
    );

    if (allMembersForBI) {
      allMembersForBI.forEach(member => {
        const plan = member.plan_summary || {};
        const hasTrialFromPlan =
          plan.plan_type === 'trial' ||
          plan.plan_id === trialPlanId ||
          (plan.payment_mode === "ONETIME" && plan.expiry_date);
        const trialStartFromEvents = trialStartsByMember[member.member_id] || null;
        const isTrial = hasTrialFromPlan || Boolean(trialStartFromEvents);
        
        // Calculate trial start/end
        let trialStartAt = null;
        let trialEndAt = null;
        if (isTrial) {
          trialStartAt = trialStartFromEvents || (member.created_at ? new Date(member.created_at) : null);
          if (plan.expiry_date) {
            trialEndAt = new Date(plan.expiry_date);
          } else if (trialStartAt) {
            // Default 30-day trial if no expiry_date
            trialEndAt = new Date(trialStartAt.getTime() + 30 * 24 * 60 * 60 * 1000);
          }
        }

        // Calculate annual start/end
        let annualStartAt = null;
        let annualEndAt = null;
        if (plan.plan_type === 'annual') {
          // Try to get start from created_at or plan connection date
          annualStartAt = plan.current_period_start ? new Date(plan.current_period_start) : 
                         (member.created_at ? new Date(member.created_at) : null);
          
          // End date from current_period_end or expiry_date
          if (plan.current_period_end) {
            annualEndAt = new Date(plan.current_period_end);
          } else if (plan.expiry_date) {
            annualEndAt = new Date(plan.expiry_date);
          } else if (annualStartAt) {
            // Default 1 year if no end date (only if we're confident it's always 1 year)
            annualEndAt = new Date(annualStartAt.getTime() + 365 * 24 * 60 * 60 * 1000);
          }
        }

        memberPlans[member.member_id] = {
          member_id: member.member_id,
          email: member.email,
          trialStartAt,
          trialEndAt,
          annualStartAt,
          annualEndAt,
          isTrial,
          isAnnual: plan.plan_type === 'annual',
          status: (plan.status || '').toUpperCase()
        };
      });
    }

    // ===== CONVERSION DETECTION FROM academy_plan_events =====
    // Build per-member timeline from events
    const memberTimelines = {};
    
    if (planEvents) {
      planEvents.forEach(event => {
        if (!event.ms_member_id) return;
        
        const memberId = event.ms_member_id;
        if (!memberTimelines[memberId]) {
          memberTimelines[memberId] = {
            ms_member_id: memberId,
            trialStartAt: null,
            annualPaidAt: null,
            annualInvoiceId: null,
            annualAmount: 0
          };
        }
        
        const timeline = memberTimelines[memberId];
        const eventDate = new Date(event.created_at);
        
        // Detect trial start (checkout.session.completed with trial price)
        if (event.event_type === 'checkout.session.completed') {
          const priceId = event.ms_price_id || '';
          if (priceId.includes('trial') || priceId.includes('30-day')) {
            if (!timeline.trialStartAt || eventDate < timeline.trialStartAt) {
              timeline.trialStartAt = eventDate;
            }
          }
        }
        
        // Detect annual paid (invoice.paid with annual price)
        if (event.event_type === 'invoice.paid') {
          const priceId = event.ms_price_id || '';
          if (priceId.includes('annual') || priceId === 'prc_annual-membership-jj7y0h89') {
            if (!timeline.annualPaidAt || eventDate < timeline.annualPaidAt) {
              timeline.annualPaidAt = eventDate;
              timeline.annualInvoiceId = event.stripe_invoice_id;
              
              // Try to extract amount from payload
              try {
                const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                const amount = payload?.data?.object?.amount_paid || payload?.data?.object?.total || 0;
                timeline.annualAmount = amount / 100; // Convert from pennies
              } catch (e) {
                // If we can't parse, we'll fetch from Stripe later if needed
              }
            }
          }
        }
      });
    }
    
    // Calculate conversions - improved detection
    // A conversion is when a member had a trial start and then paid for annual
    // We also check member created_at vs annual subscription creation date
    const allConversions = [];
    
    // First, get conversions from timelines (trial start event + annual paid event)
    Object.values(memberTimelines).forEach(t => {
      if (t.trialStartAt && t.annualPaidAt) {
        // Use getTime() for reliable date comparison
        const trialTime = t.trialStartAt instanceof Date ? t.trialStartAt.getTime() : new Date(t.trialStartAt).getTime();
        const annualTime = t.annualPaidAt instanceof Date ? t.annualPaidAt.getTime() : new Date(t.annualPaidAt).getTime();
        if (annualTime > trialTime) {
          allConversions.push(t);
          console.log(`[overview] ✅ Conversion from timeline: member_id=${t.ms_member_id}, trialStart=${t.trialStartAt}, annualPaid=${t.annualPaidAt}`);
        }
      }
    });
    
    // Also check annual members using the SAME logic as Stripe metrics
    // This catches cases where trial events weren't recorded but timing suggests conversion
    // CRITICAL: Use the EXACT same logic as getConversionsFromSupabase in stripe/metrics.js
    if (allMembersForBI && Array.isArray(allMembersForBI)) {
      allMembersForBI.forEach(member => {
        try {
          const plan = member.plan_summary || {};
          if (plan.plan_type === 'annual' && (plan.status || '').toUpperCase() === 'ACTIVE') {
            const memberId = member.member_id;
            if (!memberId) return;
            
            const timeline = memberTimelines[memberId];
            
            // Skip if already in conversions
            if (allConversions.find(c => c.ms_member_id === memberId)) {
              return;
            }
            
            const memberCreatedAt = member.created_at ? new Date(member.created_at) : null;
            
            // Get member events for this member
            const memberEvents = (planEvents || []).filter(e => e.ms_member_id === memberId);
            
            // Get annual subscription creation date from events
            const annualSubscriptionCreated = memberEvents.find(e => 
              e.event_type === 'customer.subscription.created' &&
              (e.ms_price_id?.includes('annual') || e.ms_price_id === 'prc_annual-membership-jj7y0h89')
            );
            const annualStartDate = annualSubscriptionCreated ? new Date(annualSubscriptionCreated.created_at) :
                                   (plan.current_period_start ? new Date(plan.current_period_start) : null);
            
            // Check 1: Trial event exists in timeline
            const hadTrialFromEvents = timeline?.trialStartAt !== null;
            
            // Check 2: Any trial-related event in their history
            const hasTrialEvent = memberEvents.some(e => 
              e.event_type === 'checkout.session.completed' &&
              (e.ms_price_id?.includes('trial') || e.ms_price_id?.includes('30-day'))
            );
            
            // Check 3: Member was created SIGNIFICANTLY before annual subscription/paid date
            // Use annualPaidAt from timeline if available, otherwise use annualStartDate
            // CRITICAL: Same-day signups (member created = annual paid same day) are NOT conversions
            const annualPaidDate = timeline?.annualPaidAt ? new Date(timeline.annualPaidAt) : annualStartDate;
            const daysBetween = memberCreatedAt && annualPaidDate ? 
                               (annualPaidDate.getTime() - memberCreatedAt.getTime()) / (1000 * 60 * 60 * 24) : 0;
            const hadTrialFromTiming = daysBetween > 1; // Must be more than 1 day gap
            
            // If ANY check is true, they had a trial
            const hadTrial = hadTrialFromEvents || hasTrialEvent || hadTrialFromTiming;
            
            // If they had a trial AND now have annual, it's a conversion
            if (hadTrial) {
              // Use annualPaidAt from timeline if available, otherwise find from events
              let finalAnnualPaidDate = timeline?.annualPaidAt ? new Date(timeline.annualPaidAt) : null;
              
              if (!finalAnnualPaidDate) {
                // Try to find invoice.paid event first (more accurate payment date)
                const invoicePaidEvent = memberEvents.find(e => 
                  e.event_type === 'invoice.paid' &&
                  (e.ms_price_id?.includes('annual') || e.ms_price_id === 'prc_annual-membership-jj7y0h89')
                );
                
                // Fall back to subscription.created if no invoice.paid found
                const annualSubEvent = invoicePaidEvent || annualSubscriptionCreated;
                
                if (annualSubEvent && annualSubEvent.created_at) {
                  finalAnnualPaidDate = new Date(annualSubEvent.created_at);
                }
              }
              
              if (finalAnnualPaidDate && !isNaN(finalAnnualPaidDate.getTime())) {
                // Extract amount from timeline or invoice.paid if available
                let annualAmount = timeline?.annualAmount || 0;
                if (annualAmount === 0) {
                  const invoicePaidEvent = memberEvents.find(e => 
                    e.event_type === 'invoice.paid' &&
                    (e.ms_price_id?.includes('annual') || e.ms_price_id === 'prc_annual-membership-jj7y0h89')
                  );
                  if (invoicePaidEvent && invoicePaidEvent.payload) {
                    try {
                      const payload = typeof invoicePaidEvent.payload === 'string' 
                        ? JSON.parse(invoicePaidEvent.payload) 
                        : invoicePaidEvent.payload;
                      const amount = payload?.data?.object?.amount_paid || 
                                   payload?.data?.object?.total || 
                                   payload?.data?.object?.amount_due || 0;
                      annualAmount = amount / 100;
                    } catch (e) {
                      // Ignore parse errors
                    }
                  }
                }
                
                // Use trialStartAt from timeline if available, otherwise use memberCreatedAt
                const trialStartDate = timeline?.trialStartAt ? new Date(timeline.trialStartAt) : memberCreatedAt;
                
                allConversions.push({
                  ms_member_id: memberId,
                  trialStartAt: trialStartDate,
                  annualPaidAt: finalAnnualPaidDate,
                  annualInvoiceId: timeline?.annualInvoiceId || null,
                  annualAmount: annualAmount
                });
                console.log(`[overview] ✅ Conversion from fallback: member_id=${memberId}, email=${member.email}, hadTrial=${hadTrial} (fromEvents=${hadTrialFromEvents}, hasTrialEvent=${hasTrialEvent}, fromTiming=${hadTrialFromTiming}), trialStart=${trialStartDate?.toISOString() || 'N/A'}, annualPaid=${finalAnnualPaidDate.toISOString()}`);
              }
            }
          }
        } catch (e) {
          // Skip members with errors, log for debugging
          console.warn('[overview] Error processing member for conversion detection:', member?.email || member?.member_id, e.message);
        }
      });
    }
    
    // Conversions in last 30d: filter by when annual subscription was CREATED/PAID (not when trial ended)
    // This allows conversions that happened recently even if trial ended months ago
    const conversions30d = allConversions.filter(t => {
      if (!t.annualPaidAt) {
        console.log(`[overview] ⚠️  Conversion missing annualPaidAt: member_id=${t.ms_member_id}`);
        return false;
      }
      try {
        const annualPaidDate = t.annualPaidAt instanceof Date ? t.annualPaidAt : new Date(t.annualPaidAt);
        if (isNaN(annualPaidDate.getTime())) {
          console.log(`[overview] ⚠️  Conversion has invalid annualPaidAt date: member_id=${t.ms_member_id}, date=${t.annualPaidAt}`);
          return false;
        }
        const isIn30d = annualPaidDate >= start30d;
        console.log(`[overview] 🔍 Checking conversion 30d: member_id=${t.ms_member_id}, annualPaid=${annualPaidDate.toISOString()}, start30d=${start30d.toISOString()}, in30d=${isIn30d}`);
        return isIn30d;
      } catch (e) {
        console.log(`[overview] ⚠️  Error filtering conversion: member_id=${t.ms_member_id}, error=${e.message}`);
        return false;
      }
    });
    
    console.log(`[overview] 📊 Conversion counts: allConversions=${allConversions.length}, conversions30d=${conversions30d.length}`);
    
    // Trial starts from events
    const trialsStartedAllTime = Object.values(memberTimelines).filter(t => t.trialStartAt);
    const trialsStarted30d = trialsStartedAllTime.filter(t => {
      if (!t.trialStartAt) return false;
      try {
        const trialStartDate = t.trialStartAt instanceof Date ? t.trialStartAt : new Date(t.trialStartAt);
        if (isNaN(trialStartDate.getTime())) return false;
        return trialStartDate >= start30d;
      } catch (e) {
        return false;
      }
    });
    
    // Conversion rates - use trials ENDED, not trials STARTED (more accurate)
    // IMPORTANT: No time restrictions on conversions - if someone had a trial and later got annual, it's ALWAYS a conversion
    // ===== DROP-OFF (Fixed: Use "trials ended" logic, not 1 - conversion) =====
    // Trials that ended in last 30d (for reporting purposes only)
    const trialsEnded30d = trialsEndedFromEvents30d;
    
    // Get all-time trials ended count from events (historical, even if member removed)
    const allTrialsEndedCount = hasTrialHistory
      ? trialHistoryEndedAllTime.length
      : trialsEndedFromEventsAll.length;
    
    // All-time conversion rate: all conversions / all trials ended
    // Use Supabase data (allConversions) - no Stripe dependency needed
    const conversionsCountAllTime = hasTrialHistory
      ? trialHistoryConversionsAllTime.length
      : allConversions.length;
    const trialToAnnualConversionRateAllTime = allTrialsEndedCount > 0 
      ? Math.round((conversionsCountAllTime / allTrialsEndedCount) * 100 * 10) / 10
      : null;

    // 30d conversion rate: conversions that happened in last 30d / trials that were active during last 30d
    // A trial is "active during last 30d" if:
    // - It started before or during the period (trialStartAt <= now)
    // - It ended after the start of the period (trialEndAt >= start30d) OR hasn't ended yet (trialEndAt is null or > now)
    // This shows: "Of trials active in the last 30 days, what % converted?"
    const conversionsCount30d = conversions30d.length;
    
    // Count trials that were active at any point during the last 30 days
    const activeTrials30d = Object.values(memberPlans).filter(m => {
      if (!m.isTrial || !m.trialStartAt) return false;
      
      const trialStart = m.trialStartAt instanceof Date ? m.trialStartAt : new Date(m.trialStartAt);
      if (isNaN(trialStart.getTime())) return false;
      
      // Trial must have started before or during the period
      if (trialStart > now) return false;
      
      // Trial must not have ended before the start of the 30d period
      if (m.trialEndAt) {
        const trialEnd = m.trialEndAt instanceof Date ? m.trialEndAt : new Date(m.trialEndAt);
        if (!isNaN(trialEnd.getTime()) && trialEnd < start30d) {
          return false; // Trial ended before the 30d window
        }
      }
      
      return true; // Trial was active during the 30d period
    });
    
    const activeTrials30dCount = activeTrials30d.length;
    const trialConversionRate30d = activeTrials30dCount > 0 
      ? Math.round((conversionsCount30d / activeTrials30dCount) * 100 * 10) / 10
      : null;
    
    // Revenue from conversions
    const revenueFromConversionsAllTime = allConversions.reduce((sum, t) => sum + (t.annualAmount || 0), 0);
    const revenueFromConversions30d = conversions30d.reduce((sum, t) => sum + (t.annualAmount || 0), 0);

    // Trials that ended without converting (exclude anyone who later converted, regardless of when)
    // Build set of member IDs who converted (from allConversions)
    const convertedMemberIds = new Set(allConversions.map(c => c.ms_member_id));
    
    const trialsEndedWithoutConversion30d = trialsEnded30d.filter(m => {
      // If this member converted (at any time), exclude them from "without conversion"
      return !convertedMemberIds.has(m.member_id);
    });

    const trialDropOff30d = trialsEndedWithoutConversion30d.length;
    const trialDropoffRate30d = trialsEnded30d.length > 0
      ? Math.round((trialDropOff30d / trialsEnded30d.length) * 100 * 10) / 10
      : null;

    // ===== STRIPE METRICS (Source of Truth - Subscriptions) =====
    // Fetch Stripe metrics FIRST before using them in calculations below
    let stripeMetrics = null;
    let stripeError = null;
    
    try {
      // Call Stripe metrics calculation function directly (server-side)
      // In Next.js, require paths are relative to project root, not file location
      // Path: api/admin/overview.js -> api/stripe/metrics.js
      const path = require('path');
      const stripeMetricsPath = path.join(process.cwd(), 'api', 'stripe', 'metrics');
      
      let stripeMetricsModule;
      try {
        stripeMetricsModule = require(stripeMetricsPath);
      } catch (requireError) {
        console.warn('[overview] Could not require stripe/metrics module:', requireError.message);
        throw new Error(`Failed to load Stripe metrics module: ${requireError.message}`);
      }
      
      const calculateStripeMetrics = stripeMetricsModule?.calculateStripeMetrics;
      
      if (!calculateStripeMetrics || typeof calculateStripeMetrics !== 'function') {
        console.warn('[overview] calculateStripeMetrics function not found in module');
        throw new Error('calculateStripeMetrics function not found in stripe/metrics module');
      }
      
      stripeMetrics = await calculateStripeMetrics(false); // Use cache if available
      console.log('[overview] Stripe metrics fetched successfully:', {
        annual_active: stripeMetrics?.annual_active_count,
        revenue_all_time: stripeMetrics?.revenue_net_all_time_gbp,
        invoices_found: stripeMetrics?.debug_invoices_found,
        annual_invoices_matched: stripeMetrics?.debug_annual_invoices_matched
      });
      
      // NOTE: Conversion rate calculation uses ONLY Supabase data (no Stripe dependency)
      // Stripe metrics are used for revenue calculations only
    } catch (error) {
      console.error('[overview] Stripe metrics error:', error.message);
      console.error('[overview] Stripe metrics error stack:', error.stack);
      // Don't fail the entire endpoint if Stripe fails - continue with null metrics
      stripeError = {
        message: error.message || 'Unknown Stripe error',
        code: error.code,
        stack: error.stack,
        debugInfo: error.debugInfo || null
      };
      console.error('[overview] Error fetching Stripe metrics:', error.message);
      console.error('[overview] Error stack:', error.stack);
    }

    // ===== LOST REVENUE OPPORTUNITY =====
    // Calculate lost revenue from trials that expired without converting (all-time)
    // This is the revenue opportunity if all expired trials had converted
    const allTrialsEnded = Object.values(memberPlans).filter(m => 
      m.isTrial && 
      m.trialEndAt && 
      m.trialEndAt <= now
    );

    // All-time trials ended without conversion (exclude anyone who later converted)
    const trialsEndedWithoutConversionAllTime = hasTrialHistory
      ? trialHistoryEndedWithoutConversionAllTime
      : trialsEndedFromEventsAll.filter(m => {
          // If this member converted (at any time), exclude them from "without conversion"
          return !convertedMemberIds.has(m.member_id);
        });

    // Get annual price from Stripe metrics or use default (stripeMetrics is now initialized above)
    const annualPrice = stripeMetrics?.academy_annual_list_price_gbp || 79;
    const lostRevenueOpportunityAllTime = Math.round(trialsEndedWithoutConversionAllTime.length * annualPrice * 100) / 100;
    const lostRevenueOpportunity30d = Math.round(trialsEndedWithoutConversion30d.length * annualPrice * 100) / 100;

    // Median days to convert (from conversions30d timeline)
    const daysToConvert = conversions30d
      .map(t => {
        try {
          if (!t.trialStartAt || !t.annualPaidAt) return null;
          
          const trialStart = t.trialStartAt instanceof Date ? t.trialStartAt : new Date(t.trialStartAt);
          const annualPaid = t.annualPaidAt instanceof Date ? t.annualPaidAt : new Date(t.annualPaidAt);
          
          if (isNaN(trialStart.getTime()) || isNaN(annualPaid.getTime())) return null;
          
          return Math.floor((annualPaid.getTime() - trialStart.getTime()) / 86400000);
        } catch (e) {
          return null;
        }
      })
      .filter(d => d !== null && d >= 0);
    const medianDaysToConvert30d = daysToConvert.length > 0
      ? daysToConvert.sort((a, b) => a - b)[Math.floor(daysToConvert.length / 2)]
      : null;

    // 2. At-risk trials (expiring next 7d + low activation)
    // Get activation data (module opens and exam attempts) for trials
    // Only count active trials (not yet expired) that are expiring soon
    const trialMemberIds = Object.values(memberPlans)
      .filter(m => {
        if (!m.isTrial || !m.trialEndAt || !m.trialStartAt) return false;
        // Trial must be active (not expired, has started) and expiring in next 7 days
        return m.trialEndAt > now && m.trialEndAt <= next7d && m.trialStartAt <= now;
      })
      .map(m => m.member_id);

    let atRiskTrialsNext7d = 0;
    if (trialMemberIds.length > 0) {
      // Get module opens for these trials
      const { data: moduleOpensForTrials } = await supabase
        .from('academy_events')
        .select('member_id, created_at')
        .eq('event_type', 'module_open')
        .in('member_id', trialMemberIds);

      // Get exam attempts for these trials
      const { data: examAttemptsForTrials } = await supabase
        .from('module_results_ms')
        .select('memberstack_id, created_at')
        .in('memberstack_id', trialMemberIds);

      // Check activation for each at-risk trial
      trialMemberIds.forEach(memberId => {
        const member = memberPlans[memberId];
        if (!member || !member.trialStartAt) return;

        const activationWindowEnd = new Date(Math.min(
          member.trialStartAt.getTime() + 7 * 24 * 60 * 60 * 1000,
          now.getTime()
        ));

        // Count module opens in first 7 days
        const moduleOpensInTrial = (moduleOpensForTrials || []).filter(e => 
          e.member_id === memberId && 
          new Date(e.created_at) >= member.trialStartAt &&
          new Date(e.created_at) <= activationWindowEnd
        ).length;

        // Count exam attempts in first 7 days
        const examAttemptsInTrial = (examAttemptsForTrials || []).filter(e => 
          e.memberstack_id === memberId &&
          new Date(e.created_at) >= member.trialStartAt &&
          new Date(e.created_at) <= activationWindowEnd
        ).length;

        // At risk if: expiring soon AND (less than 3 module opens OR 0 exam attempts)
        if (moduleOpensInTrial < 3 && examAttemptsInTrial === 0) {
          atRiskTrialsNext7d++;
        }
      });
    }

    // 3. Annual churn (90d)
    const annualChurnCount90d = Object.values(memberPlans).filter(m => 
      m.isAnnual && m.annualEndAt && m.annualEndAt >= start90d && m.annualEndAt <= now
    ).length;

    // Calculate annual active at start of 90d period
    const annualActiveAtStart90d = Object.values(memberPlans).filter(m => 
      m.isAnnual && 
      m.annualStartAt && 
      m.annualStartAt <= start90d && 
      (m.annualEndAt === null || m.annualEndAt > start90d)
    ).length;

    const annualChurnRate90d = annualActiveAtStart90d > 0
      ? Math.round((annualChurnCount90d / annualActiveAtStart90d) * 100)
      : null;

    // 4. Annual expiring next 30d
    const annualExpiringNext30d = Object.values(memberPlans).filter(m => 
      m.isAnnual && 
      m.annualEndAt && 
      m.annualEndAt > now && 
      m.annualEndAt <= next30d
    ).length;

    // 5. Revenue at risk
    const revenueAtRiskNext30d = annualExpiringNext30d * ANNUAL_PRICE;

    // 6. Activation rate (7d)
    const trialsStarted7d = Object.values(memberPlans).filter(m => 
      m.isTrial && m.trialStartAt && m.trialStartAt >= start7d
    );

    let activatedTrials7d = 0;
    if (trialsStarted7d.length > 0) {
      const trial7dMemberIds = trialsStarted7d.map(m => m.member_id);
      
      // Get module opens for 7d cohort
      const { data: moduleOpens7d } = await supabase
        .from('academy_events')
        .select('member_id, created_at')
        .eq('event_type', 'module_open')
        .in('member_id', trial7dMemberIds);

      // Get exam attempts for 7d cohort
      const { data: examAttempts7d } = await supabase
        .from('module_results_ms')
        .select('memberstack_id, created_at')
        .in('memberstack_id', trial7dMemberIds);

      trialsStarted7d.forEach(member => {
        if (!member.trialStartAt) return;
        
        const activationWindowEnd = new Date(Math.min(
          member.trialStartAt.getTime() + 7 * 24 * 60 * 60 * 1000,
          now.getTime()
        ));

        const moduleOpens = (moduleOpens7d || []).filter(e => 
          e.member_id === member.member_id &&
          new Date(e.created_at) >= member.trialStartAt &&
          new Date(e.created_at) <= activationWindowEnd
        ).length;

        const examAttempts = (examAttempts7d || []).filter(e => 
          e.memberstack_id === member.member_id &&
          new Date(e.created_at) >= member.trialStartAt &&
          new Date(e.created_at) <= activationWindowEnd
        ).length;

        // Activated if: >= 3 module opens OR >= 1 exam attempt
        if (moduleOpens >= 3 || examAttempts >= 1) {
          activatedTrials7d++;
        }
      });
    }

    const activationRate7d = trialsStarted7d.length > 0
      ? Math.round((activatedTrials7d / trialsStarted7d.length) * 100)
      : null;

    // ===== GROWTH INDICATORS =====
    // New members in last 30d
    const newMembers30d = Object.values(memberPlans).filter(m => 
      m.trialStartAt && m.trialStartAt >= start30d
    ).length;

    // Members churned in last 30d (trials ended + annuals ended, without renewal)
    const membersChurned30d = Object.values(memberPlans).filter(m => {
      // Trial ended without conversion
      if (m.isTrial && m.trialEndAt && m.trialEndAt >= start30d && m.trialEndAt <= now) {
        return !m.annualStartAt || m.annualStartAt > m.trialEndAt;
      }
      // Annual ended without renewal
      if (m.isAnnual && m.annualEndAt && m.annualEndAt >= start30d && m.annualEndAt <= now) {
        // Check if there's a renewal (new annual start after end)
        // For now, if annual ended, consider it churned (renewals would have new annualStartAt)
        return true;
      }
      return false;
    }).length;

    const netMemberGrowth30d = newMembers30d - membersChurned30d;

    // New annual starts in last 30d
    const newAnnualStarts30d = Object.values(memberPlans).filter(m => 
      m.isAnnual && m.annualStartAt && m.annualStartAt >= start30d
    ).length;

    // Annual churn in last 30d (for growth calculation)
    const annualChurn30d = Object.values(memberPlans).filter(m => 
      m.isAnnual && m.annualEndAt && m.annualEndAt >= start30d && m.annualEndAt <= now
    ).length;

    const netPaidGrowth30d = newAnnualStarts30d - annualChurn30d;

    // Active paid now (already calculated as 'annual')
    const activePaidNow = annual;

    return res.status(200).json({
      // Member counts
      totalMembers: totalMembers || 0,
      trials: trials,
      annual: annual,
      monthly: monthly,
      canceled: canceled,
      trialsExpiring30d: trialsExpiring30d,
      annualExpiring30d: annualExpiring30d,
      allPlansExpiring7d: allPlansExpiring7d,
      
      // Signups
      signups24h: signups24h || 0,
      signups7d: signups7d || 0,
      signups30d: signups30d || 0,
      
      // Active members
      activeMembers24h: activeMembers24h,
      activeMembers7d: activeMembers7d,
      activeMembers30d: activeMembers30d,
      
      // Engagement (30d)
      uniqueModulesOpened30d: uniqueModulesOpened,
      totalModuleOpens30d: totalModuleOpens,
      avgModulesOpened30d: parseFloat(avgModulesOpened),
      examAttempts30d: examAttempts30d,
      examPassed30d: examPassed30d,
      passRate30d: passRate30d,
      avgExamAttempts30d: parseFloat(avgExamAttempts),
      bookmarks30d: bookmarks30d || 0,
      
      // BI Metrics: Revenue & Retention
      bi: {
        // Conversion metrics (from Supabase - no Stripe dependency)
        trialStartsAllTime: hasTrialHistory ? trialHistoryRows.length : trialsStartedAllTime.length,
        trialStarts30d: trialsStarted30d.length,
        trialToAnnualConversionsAllTime: conversionsCountAllTime,
        trialToAnnualConversions30d: conversions30d.length,
        trialToAnnualConversionRateAllTime: trialToAnnualConversionRateAllTime,
        trialConversionRate30d: trialConversionRate30d,
        activeTrials30d: activeTrials30dCount, // Trials that were active during last 30d
        trialsEnded30d: trialsEnded30d.length, // Trials that ended in last 30d
        trialsEndedAllTime: allTrialsEndedCount,
        // Revenue from conversions - use Stripe metrics (source of truth from invoices)
        // Fall back to calculated amount only if Stripe metrics unavailable
        revenueFromConversionsAllTime: stripeMetrics?.revenue_from_conversions_net_all_time_gbp ?? Math.round(revenueFromConversionsAllTime * 100) / 100,
        revenueFromConversions30d: stripeMetrics?.revenue_from_conversions_net_30d_gbp ?? Math.round(revenueFromConversions30d * 100) / 100,
        
        // Drop-off (from Stripe if available)
        trialDropOff30d: stripeMetrics?.trials_ended_last_30d ? (stripeMetrics.trials_ended_last_30d - stripeMetrics.conversions_trial_to_annual_last_30d) : trialDropOff30d,
        trialDropoffRate30d: stripeMetrics?.trial_dropoff_last_30d ?? trialDropoffRate30d,
        // Note: trialsEnded30d already set above with adjusted count for conversion rate
        medianDaysToConvert30d: medianDaysToConvert30d,
        
        // At-risk and churn (from Stripe)
        atRiskTrialsNext7d: atRiskTrialsNext7d,
        annualChurnRate90d: stripeMetrics?.annual_churn_rate_90d ?? annualChurnRate90d,
        annualChurnCount90d: stripeMetrics?.annual_churn_90d_count ?? annualChurnCount90d,
        annualChurn30d: annualChurn30d,
        annualExpiringNext30d: stripeMetrics?.annual_expiring_next_30d_count ?? annualExpiringNext30d,
        revenueAtRiskNext30d: stripeMetrics?.revenue_at_risk_next_30d_gbp ?? revenueAtRiskNext30d,
        atRiskAnnualCount: stripeMetrics?.at_risk_annual_count ?? 0,
        
        // Activation
        activationRate7d: activationRate7d,
        activatedTrials7d: activatedTrials7d,
        trialsStarted7d: trialsStarted7d.length,
        
        // Growth indicators
        newMembers30d: newMembers30d,
        membersChurned30d: membersChurned30d,
        netMemberGrowth30d: netMemberGrowth30d,
        newAnnualStarts30d: newAnnualStarts30d,
        netPaidGrowth30d: netPaidGrowth30d,
        activePaidNow: stripeMetrics?.annual_active_count ?? activePaidNow,
        
        // Lost revenue opportunity
        lostRevenueOpportunityAllTime: lostRevenueOpportunityAllTime,
        lostRevenueOpportunity30d: lostRevenueOpportunity30d,
        trialsEndedWithoutConversionAllTime: trialsEndedWithoutConversionAllTime.length,
        trialsEndedWithoutConversion30d: trialsEndedWithoutConversion30d.length
      },
      
      // Stripe Metrics (source of truth - subscriptions + invoices)
      stripe: stripeMetrics ? {
        annual_active_count: stripeMetrics.annual_active_count,
        trials_active_count: trials, // Use ms_members_cache count, not Stripe
        revenue_net_all_time_gbp: stripeMetrics.revenue_net_all_time_gbp,
        revenue_net_last_30d_gbp: stripeMetrics.revenue_net_last_30d_gbp,
        annual_revenue_net_all_time_gbp: stripeMetrics.annual_revenue_net_all_time_gbp,
        annual_revenue_net_30d_gbp: stripeMetrics.annual_revenue_net_30d_gbp,
        revenue_from_conversions_net_all_time_gbp: stripeMetrics.revenue_from_conversions_net_all_time_gbp,
        revenue_from_conversions_net_30d_gbp: stripeMetrics.revenue_from_conversions_net_30d_gbp,
        revenue_from_direct_annual_net_all_time_gbp: stripeMetrics.revenue_from_direct_annual_net_all_time_gbp,
        revenue_from_direct_annual_net_30d_gbp: stripeMetrics.revenue_from_direct_annual_net_30d_gbp,
        // Trial opportunity: Memberstack trial count × Stripe annual list price
        opportunity_revenue_gross_gbp: stripeMetrics?.academy_annual_list_price_gbp 
          ? Math.round((trials * stripeMetrics.academy_annual_list_price_gbp) * 100) / 100 
          : 0,
        opportunity_revenue_net_estimate_gbp: stripeMetrics?.academy_annual_list_price_gbp 
          ? Math.round((trials * stripeMetrics.academy_annual_list_price_gbp * 0.97) * 100) / 100 
          : 0,
        academy_annual_list_price_gbp: stripeMetrics?.academy_annual_list_price_gbp || null,
        non_gbp_invoices_count: stripeMetrics.non_gbp_invoices_count,
        arr_gbp: stripeMetrics.arr_gbp,
        // Debug info
        stripe_key_mode: stripeMetrics.stripe_key_mode,
        academy_price_ids_used: stripeMetrics.academy_price_ids_used || stripeMetrics.annual_price_id_used,
        paid_annual_invoices_count_all_time: stripeMetrics.paid_annual_invoices_count_all_time,
        debug_sample_annual_invoice_ids: stripeMetrics.debug_sample_annual_invoice_ids,
        debug_invoices_found: stripeMetrics.debug_invoices_found,
        debug_annual_invoices_matched: stripeMetrics.debug_annual_invoices_matched,
        debug_annual_revenue_pennies_sum: stripeMetrics.debug_annual_revenue_pennies_sum
      } : (stripeError ? { 
        _error: stripeError.message, 
        _errorCode: stripeError.code,
        _debugInfo: stripeError.debugInfo
      } : null)
    });

  } catch (error) {
    console.error('[overview] Error:', error);
    console.error('[overview] Error stack:', error.stack);
    console.error('[overview] Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
