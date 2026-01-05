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
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // 1. Total members (all-time from cache)
    const { count: totalMembers } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true });

    // 2. Plan breakdowns
    const { data: allMembers } = await supabase
      .from('ms_members_cache')
      .select('plan_summary, created_at');

    let trials = 0;
    let annual = 0;
    let monthly = 0;
    let canceled = 0;
    let trialsExpiring30d = 0;
    let annualExpiring30d = 0;
    let allPlansExpiring60d = 0;

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
              // Also count for 60-day window
              if (expiryDate > now && expiryDate <= sixtyDaysFromNow) {
                allPlansExpiring60d++;
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
                // Also count for 60-day window
                if (expiryDate > now && expiryDate <= sixtyDaysFromNow) {
                  allPlansExpiring60d++;
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

    // 3. New signups (from cache created_at)
    const { count: signups24h } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods['24h'].toISOString());

    const { count: signups7d } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods['7d'].toISOString());

    const { count: signups30d } = await supabase
      .from('ms_members_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods['30d'].toISOString());

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

    // Build member plan timeline map
    const memberPlans = {};
    const trialPlanId = "pln_academy-trial-30-days--wb7v0hbh";
    const ANNUAL_PRICE = 79; // £79 annual plan price

    if (allMembersForBI) {
      allMembersForBI.forEach(member => {
        const plan = member.plan_summary || {};
        const isTrial = plan.plan_id === trialPlanId || (plan.payment_mode === "ONETIME" && plan.expiry_date);
        
        // Calculate trial start/end
        let trialStartAt = null;
        let trialEndAt = null;
        if (isTrial) {
          trialStartAt = member.created_at ? new Date(member.created_at) : null;
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

    // ===== CONVERSION TOTALS (All-time + Rolling Windows) =====
    // All-time trial starts
    const trialsStartedAllTime = Object.values(memberPlans).filter(m => 
      m.isTrial && m.trialStartAt
    );

    // All-time conversions (trial → annual)
    const trialsConvertedAllTime = trialsStartedAllTime.filter(m => {
      if (!m.annualStartAt || !m.trialStartAt) return false;
      // Converted if annual started after trial start
      return m.annualStartAt >= m.trialStartAt;
    });

    // 30d trial starts
    const trialsStarted30d = Object.values(memberPlans).filter(m => 
      m.isTrial && m.trialStartAt && m.trialStartAt >= start30d
    );

    // 30d conversions
    const trialsConverted30d = trialsStarted30d.filter(m => {
      if (!m.annualStartAt || !m.trialStartAt) return false;
      // Converted if annual started within 30 days of trial start
      const daysToConvert = Math.floor((m.annualStartAt - m.trialStartAt) / 86400000);
      return daysToConvert >= 0 && daysToConvert <= 30;
    });

    // Conversion rates
    const trialToAnnualConversionRateAllTime = trialsStartedAllTime.length > 0 
      ? Math.round((trialsConvertedAllTime.length / trialsStartedAllTime.length) * 100 * 10) / 10
      : null;

    const trialConversionRate30d = trialsStarted30d.length > 0 
      ? Math.round((trialsConverted30d.length / trialsStarted30d.length) * 100 * 10) / 10
      : null;

    // ===== DROP-OFF (Fixed: Use "trials ended" logic, not 1 - conversion) =====
    // Trials that ended in last 30d
    const trialsEnded30d = Object.values(memberPlans).filter(m => 
      m.isTrial && 
      m.trialEndAt && 
      m.trialEndAt >= start30d && 
      m.trialEndAt <= now
    );

    // Trials that ended without converting
    const trialsEndedWithoutConversion30d = trialsEnded30d.filter(m => {
      // Not converted if no annual start OR annual started after trial ended
      return !m.annualStartAt || m.annualStartAt > m.trialEndAt;
    });

    const trialDropOff30d = trialsEndedWithoutConversion30d.length;
    const trialDropoffRate30d = trialsEnded30d.length > 0
      ? Math.round((trialDropOff30d / trialsEnded30d.length) * 100 * 10) / 10
      : null;

    // Median days to convert
    const daysToConvert = trialsConverted30d
      .map(m => Math.floor((m.annualStartAt - m.trialStartAt) / 86400000))
      .filter(d => d >= 0);
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

    // ===== STRIPE METRICS (Source of Truth - Subscriptions) =====
    let stripeMetrics = null;
    
    try {
      // Call Stripe metrics calculation function directly (server-side)
      const { calculateStripeMetrics } = require('../stripe/metrics');
      stripeMetrics = await calculateStripeMetrics(false); // Use cache if available
    } catch (error) {
      console.warn('[overview] Error fetching Stripe metrics:', error.message);
      // Continue without Stripe data (don't break dashboard)
    }

    return res.status(200).json({
      // Member counts
      totalMembers: totalMembers || 0,
      trials: trials,
      annual: annual,
      monthly: monthly,
      canceled: canceled,
      trialsExpiring30d: trialsExpiring30d,
      annualExpiring30d: annualExpiring30d,
      allPlansExpiring60d: allPlansExpiring60d,
      
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
        // Conversion metrics (from Stripe if available, else fallback to Memberstack)
        trialStartsAllTime: trialsStartedAllTime.length,
        trialStarts30d: trialsStarted30d.length,
        trialToAnnualConversionsAllTime: stripeMetrics?.conversions_trial_to_annual_all_time ?? trialsConvertedAllTime.length,
        trialToAnnualConversions30d: stripeMetrics?.conversions_trial_to_annual_last_30d ?? trialsConverted30d.length,
        trialToAnnualConversionRateAllTime: stripeMetrics?.conversion_rate_all_time ?? trialToAnnualConversionRateAllTime,
        trialConversionRate30d: stripeMetrics?.conversion_rate_last_30d ?? trialConversionRate30d,
        
        // Drop-off (from Stripe if available)
        trialDropOff30d: stripeMetrics?.trials_ended_last_30d ? (stripeMetrics.trials_ended_last_30d - stripeMetrics.conversions_trial_to_annual_last_30d) : trialDropOff30d,
        trialDropoffRate30d: stripeMetrics?.trial_dropoff_last_30d ?? trialDropoffRate30d,
        trialsEnded30d: stripeMetrics?.trials_ended_last_30d ?? trialsEnded30d.length,
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
        activePaidNow: stripeMetrics?.annual_active_count ?? activePaidNow
      },
      
      // Stripe Metrics (source of truth - subscriptions)
      stripe: stripeMetrics ? {
        annual_active_count: stripeMetrics.annual_active_count,
        trials_active_count: stripeMetrics.trials_active_count,
        revenue_net_all_time_gbp: stripeMetrics.revenue_net_all_time_gbp,
        revenue_net_last_30d_gbp: stripeMetrics.revenue_net_last_30d_gbp,
        arr_gbp: stripeMetrics.arr_gbp,
        revenue_from_conversions_last_30d_gbp: stripeMetrics.revenue_from_conversions_last_30d_gbp
      } : null
    });

  } catch (error) {
    console.error('[overview] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
