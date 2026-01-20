// Script to check which annual members converted from trial vs went direct
// Usage: node scripts/check-annual-members.js

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

async function checkAnnualMembers() {
  console.log("\n🔍 Checking annual members to identify conversions vs direct signups...\n");

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

  // Get plan events for conversion detection
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
          annualPaidAt: null
        };
      }
      
      const timeline = memberTimelines[memberId];
      const eventDate = new Date(event.created_at);
      
      // Detect trial start
      if (event.event_type === 'checkout.session.completed') {
        const priceId = event.ms_price_id || '';
        if (priceId.includes('trial') || priceId.includes('30-day')) {
          if (!timeline.trialStartAt || eventDate < timeline.trialStartAt) {
            timeline.trialStartAt = eventDate;
          }
        }
      }
      
      // Detect annual paid
      if (event.event_type === 'invoice.paid') {
        const priceId = event.ms_price_id || '';
        if (priceId.includes('annual') || priceId === 'prc_annual-membership-jj7y0h89') {
          if (!timeline.annualPaidAt || eventDate < timeline.annualPaidAt) {
            timeline.annualPaidAt = eventDate;
          }
        }
      }
    });
  }

  // Check each annual member
  const converted = [];
  const direct = [];
  const uncertain = [];

  for (const member of annualMembers) {
    const timeline = memberTimelines[member.member_id];
    const plan = member.plan_summary || {};
    
    // Get all events for this member first
    const memberEvents = (planEvents || []).filter(e => e.ms_member_id === member.member_id);
    
    // Check if member had a trial (from plan_summary, events, or created_at date)
    const trialPlanId = "pln_academy-trial-30-days--wb7v0hbh";
    const hadTrialFromPlan = plan.plan_id === trialPlanId || 
                            (plan.payment_mode === 'ONETIME' && plan.expiry_date);
    
    const hadTrialFromEvents = timeline?.trialStartAt !== null;
    
    // Get annual subscription creation date from events (most accurate)
    const annualSubscriptionCreated = memberEvents.find(e => 
      e.event_type === 'customer.subscription.created' && 
      (e.ms_price_id?.includes('annual') || e.ms_price_id === 'prc_annual-membership-jj7y0h89')
    );
    
    const memberCreatedAt = member.created_at ? new Date(member.created_at) : null;
    const annualStartDate = annualSubscriptionCreated ? new Date(annualSubscriptionCreated.created_at) :
                           (plan.current_period_start ? new Date(plan.current_period_start) : null) ||
                           (memberCreatedAt);
    
    // If created_at is more than 7 days before annual subscription creation, likely had a trial
    const likelyHadTrialFromTiming = memberCreatedAt && annualStartDate && 
                                     (annualStartDate.getTime() - memberCreatedAt.getTime()) > (7 * 24 * 60 * 60 * 1000);
    
    const hadTrial = hadTrialFromPlan || hadTrialFromEvents || likelyHadTrialFromTiming;
    
    const annualPaidDate = timeline?.annualPaidAt || annualStartDate;
    const trialStartDate = timeline?.trialStartAt || memberCreatedAt;
    
    // Check if annual was paid after trial started (with flexible window - no 7-day limit)
    const isConverted = hadTrial && 
                       trialStartDate && 
                       annualPaidDate && 
                       annualPaidDate.getTime() > trialStartDate.getTime();

    const memberInfo = {
      email: member.email,
      name: member.name,
      member_id: member.member_id,
      created_at: member.created_at,
      annual_start: plan.current_period_start || plan.created_at,
      trial_start: trialStartDate,
      annual_paid: annualPaidDate,
      plan_id: plan.plan_id,
      payment_mode: plan.payment_mode,
      expiry_date: plan.expiry_date,
      days_between: trialStartDate && annualPaidDate ? 
        Math.floor((annualPaidDate.getTime() - trialStartDate.getTime()) / (1000 * 60 * 60 * 24)) : null,
      hadTrialFromPlan,
      hadTrialFromEvents,
      likelyHadTrialFromTiming
    };

    memberInfo.events = memberEvents.map(e => ({
      type: e.event_type,
      price_id: e.ms_price_id,
      date: e.created_at
    }));

    if (isConverted) {
      converted.push(memberInfo);
    } else if (hadTrial && !annualPaidDate) {
      uncertain.push(memberInfo);
    } else {
      direct.push(memberInfo);
    }
  }

  console.log(`\n📊 Results:\n`);
  console.log(`✅ Converted from Trial: ${converted.length}`);
  converted.forEach((m, idx) => {
    console.log(`   ${idx + 1}. ${m.email} (${m.name || 'N/A'})`);
    console.log(`      Trial started: ${m.trial_start ? new Date(m.trial_start).toLocaleDateString() : 'N/A'}`);
    console.log(`      Annual paid: ${m.annual_paid ? new Date(m.annual_paid).toLocaleDateString() : 'N/A'}`);
    if (m.days_between !== null) {
      console.log(`      Days between: ${m.days_between}`);
    }
    if (m.events && m.events.length > 0) {
      console.log(`      Events: ${m.events.length} found`);
      m.events.forEach(e => {
        console.log(`         - ${e.type} (${e.price_id}) on ${new Date(e.date).toLocaleDateString()}`);
      });
    }
  });

  console.log(`\n🎯 Direct Annual Signups: ${direct.length}`);
  direct.forEach((m, idx) => {
    console.log(`   ${idx + 1}. ${m.email} (${m.name || 'N/A'})`);
    console.log(`      Created: ${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}`);
    console.log(`      Plan ID: ${m.plan_id || 'N/A'}`);
    console.log(`      Payment Mode: ${m.payment_mode || 'N/A'}`);
    if (m.events && m.events.length > 0) {
      console.log(`      Events: ${m.events.length} found`);
      m.events.forEach(e => {
        console.log(`         - ${e.type} (${e.price_id}) on ${new Date(e.date).toLocaleDateString()}`);
      });
    }
  });

  if (uncertain.length > 0) {
    console.log(`\n❓ Uncertain (had trial but no annual payment date): ${uncertain.length}`);
    uncertain.forEach((m, idx) => {
      console.log(`   ${idx + 1}. ${m.email} (${m.name || 'N/A'})`);
      console.log(`      Trial started: ${m.trial_start ? new Date(m.trial_start).toLocaleDateString() : 'N/A'}`);
      console.log(`      Annual start: ${m.annual_start ? new Date(m.annual_start).toLocaleDateString() : 'N/A'}`);
    });
  }

  console.log(`\n✨ Total: ${annualMembers.length} annual members\n`);
}

checkAnnualMembers().catch(console.error);
