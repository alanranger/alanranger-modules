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

  for (const member of annualMembers) {
    const timeline = memberTimelines[member.member_id];
    const plan = member.plan_summary || {};
    
    const isConverted = timeline && 
                       timeline.trialStartAt && 
                       timeline.annualPaidAt && 
                       timeline.annualPaidAt > timeline.trialStartAt;

    const memberInfo = {
      email: member.email,
      name: member.name,
      member_id: member.member_id,
      created_at: member.created_at,
      annual_start: plan.current_period_start || plan.created_at,
      trial_start: timeline?.trialStartAt,
      annual_paid: timeline?.annualPaidAt
    };

    if (isConverted) {
      converted.push(memberInfo);
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
  });

  console.log(`\n🎯 Direct Annual Signups: ${direct.length}`);
  direct.forEach((m, idx) => {
    console.log(`   ${idx + 1}. ${m.email} (${m.name || 'N/A'})`);
    console.log(`      Created: ${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}`);
  });

  console.log(`\n✨ Total: ${annualMembers.length} annual members\n`);
}

checkAnnualMembers().catch(console.error);
