// Script to check actual revenue breakdown from database
// Usage: node scripts/check-revenue-breakdown.js

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkRevenueBreakdown() {
  console.log("\n🔍 Checking revenue breakdown from database...\n");

  // Get all annual members from Supabase
  const { data: members, error } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name, created_at, plan_summary")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error fetching members:", error);
    return;
  }

  // Filter to annual members
  const annualMembers = (members || []).filter(m => {
    const plan = m.plan_summary || {};
    return plan.plan_type === 'annual' && 
           (plan.status || '').toUpperCase() === 'ACTIVE';
  });

  console.log(`✅ Found ${annualMembers.length} annual members\n`);

  // Get plan events for conversion detection and revenue
  const { data: planEvents } = await supabase
    .from("academy_plan_events")
    .select("ms_member_id, event_type, ms_price_id, created_at, stripe_invoice_id, payload")
    .order("created_at", { ascending: true });

  // Build timeline for each member
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
          annualAmount: 0,
          events: []
        };
      }
      
      const timeline = memberTimelines[memberId];
      const eventDate = new Date(event.created_at);
      
      timeline.events.push({
        type: event.event_type,
        price_id: event.ms_price_id,
        date: event.created_at,
        invoice_id: event.stripe_invoice_id,
        payload: event.payload
      });
      
      // Detect trial start
      if (event.event_type === 'checkout.session.completed') {
        const priceId = event.ms_price_id || '';
        if (priceId.includes('trial') || priceId.includes('30-day')) {
          if (!timeline.trialStartAt || eventDate < timeline.trialStartAt) {
            timeline.trialStartAt = eventDate;
          }
        }
      }
      
      // Detect annual paid and extract amount
      if (event.event_type === 'invoice.paid') {
        const priceId = event.ms_price_id || '';
        if (priceId.includes('annual') || priceId === 'prc_annual-membership-jj7y0h89') {
          if (!timeline.annualPaidAt || eventDate < timeline.annualPaidAt) {
            timeline.annualPaidAt = eventDate;
            timeline.annualInvoiceId = event.stripe_invoice_id;
            
            // Try to extract amount from payload
            try {
              const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
              const amount = payload?.data?.object?.amount_paid || 
                           payload?.data?.object?.total || 
                           payload?.data?.object?.amount_due || 0;
              timeline.annualAmount = amount / 100; // Convert from pennies
            } catch (e) {
              console.warn(`Could not parse payload for ${memberId}:`, e.message);
            }
          }
        }
      }
    });
  }

  // Check each annual member
  const converted = [];
  const direct = [];

  for (const member of annualMembers) {
    const timeline = memberTimelines[member.member_id];
    const plan = member.plan_summary || {};
    
    // Get annual subscription creation date from events
    const memberEvents = (planEvents || []).filter(e => e.ms_member_id === member.member_id);
    const annualSubscriptionCreated = memberEvents.find(e => 
      e.event_type === 'customer.subscription.created' && 
      (e.ms_price_id?.includes('annual') || e.ms_price_id === 'prc_annual-membership-jj7y0h89')
    );
    
    const memberCreatedAt = member.created_at ? new Date(member.created_at) : null;
    const annualStartDate = annualSubscriptionCreated ? new Date(annualSubscriptionCreated.created_at) :
                           (plan.current_period_start ? new Date(plan.current_period_start) : null) ||
                           (memberCreatedAt);
    
    // Check if member had a trial (from events or timing)
    const hadTrialFromEvents = timeline?.trialStartAt !== null;
    const likelyHadTrialFromTiming = memberCreatedAt && annualStartDate && 
                                     (annualStartDate.getTime() - memberCreatedAt.getTime()) > (7 * 24 * 60 * 60 * 1000);
    
    const hadTrial = hadTrialFromEvents || likelyHadTrialFromTiming;
    
    const annualPaidDate = timeline?.annualPaidAt || annualStartDate;
    const trialStartDate = timeline?.trialStartAt || memberCreatedAt;
    
    // Check if annual was paid after trial started (no time limit)
    const isConverted = hadTrial && 
                       trialStartDate && 
                       annualPaidDate && 
                       annualPaidDate.getTime() > trialStartDate.getTime();

    const memberInfo = {
      email: member.email,
      name: member.name,
      member_id: member.member_id,
      created_at: member.created_at,
      annual_start: annualStartDate,
      trial_start: trialStartDate,
      annual_paid: annualPaidDate,
      annual_amount: timeline?.annualAmount || 0,
      annual_invoice_id: timeline?.annualInvoiceId,
      plan_id: plan.plan_id,
      current_period_start: plan.current_period_start
    };

    if (isConverted) {
      converted.push(memberInfo);
    } else {
      direct.push(memberInfo);
    }
  }

  console.log(`\n📊 CONVERSIONS (Trial → Annual): ${converted.length}\n`);
  let conversionsTotal = 0;
  converted.forEach((m, idx) => {
    console.log(`   ${idx + 1}. ${m.email} (${m.name || 'N/A'})`);
    console.log(`      Trial started: ${m.trial_start ? new Date(m.trial_start).toLocaleDateString() : 'N/A'}`);
    console.log(`      Annual paid: ${m.annual_paid ? new Date(m.annual_paid).toLocaleDateString() : 'N/A'}`);
    console.log(`      Amount: £${m.annual_amount || 0}`);
    console.log(`      Invoice ID: ${m.annual_invoice_id || 'N/A'}`);
    conversionsTotal += m.annual_amount || 0;
  });
  console.log(`\n   💰 TOTAL REVENUE FROM CONVERSIONS: £${conversionsTotal}\n`);

  console.log(`\n🎯 DIRECT ANNUAL SIGNUPS: ${direct.length}\n`);
  let directTotal = 0;
  direct.forEach((m, idx) => {
    console.log(`   ${idx + 1}. ${m.email} (${m.name || 'N/A'})`);
    console.log(`      Created: ${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}`);
    console.log(`      Annual start: ${m.annual_start ? new Date(m.annual_start).toLocaleDateString() : 'N/A'}`);
    console.log(`      Amount: £${m.annual_amount || 0}`);
    console.log(`      Invoice ID: ${m.annual_invoice_id || 'N/A'}`);
    directTotal += m.annual_amount || 0;
  });
  console.log(`\n   💰 TOTAL REVENUE FROM DIRECT ANNUAL: £${directTotal}\n`);

  console.log(`\n✨ SUMMARY:\n`);
  console.log(`   Conversions: ${converted.length} members, £${conversionsTotal} total`);
  console.log(`   Direct Annual: ${direct.length} members, £${directTotal} total`);
  console.log(`   Grand Total: £${conversionsTotal + directTotal}\n`);
}

checkRevenueBreakdown().catch(console.error);
