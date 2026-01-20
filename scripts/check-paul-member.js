// Script to check paul@paul-wright.me.uk in Supabase
// Usage: node scripts/check-paul-member.js

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkPaulMember() {
  console.log("\n🔍 Checking paul@paul-wright.me.uk in Supabase...\n");

  // Get member record
  const { data: members, error: memberError } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name, created_at, plan_summary")
    .eq("email", "paul@paul-wright.me.uk");

  if (memberError) {
    console.error("❌ Error fetching member:", memberError);
    return;
  }

  if (!members || members.length === 0) {
    console.log("❌ Member not found in Supabase");
    return;
  }

  const member = members[0];
  console.log(`✅ Found member: ${member.email} (${member.name || 'N/A'})`);
  console.log(`   Member ID: ${member.member_id}`);
  console.log(`   Created: ${member.created_at}`);
  console.log(`   Plan Summary:`, JSON.stringify(member.plan_summary, null, 2));

  // Get all plan events for this member
  const { data: planEvents, error: eventsError } = await supabase
    .from("academy_plan_events")
    .select("ms_member_id, event_type, ms_price_id, created_at, stripe_invoice_id, payload")
    .eq("ms_member_id", member.member_id)
    .order("created_at", { ascending: true });

  if (eventsError) {
    console.error("❌ Error fetching events:", eventsError);
    return;
  }

  console.log(`\n📊 Found ${planEvents?.length || 0} plan events:\n`);

  if (planEvents && planEvents.length > 0) {
    planEvents.forEach((event, idx) => {
      console.log(`   ${idx + 1}. ${event.event_type}`);
      console.log(`      Date: ${event.created_at}`);
      console.log(`      Price ID: ${event.ms_price_id || 'N/A'}`);
      console.log(`      Invoice ID: ${event.stripe_invoice_id || 'N/A'}`);
      
      // Try to extract subscription ID from payload
      if (event.payload) {
        try {
          const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
          const subscriptionId = payload?.data?.object?.subscription || payload?.data?.object?.id;
          const customerId = payload?.data?.object?.customer;
          
          if (subscriptionId) {
            console.log(`      Subscription ID: ${typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id || subscriptionId}`);
          }
          if (customerId) {
            console.log(`      Customer ID: ${typeof customerId === 'string' ? customerId : customerId.id || customerId}`);
          }
        } catch (e) {
          console.log(`      Payload parse error: ${e.message}`);
        }
      }
      console.log();
    });

    // Analyze conversion
    console.log("\n🔍 CONVERSION ANALYSIS:\n");
    
    const trialStart = planEvents.find(e => 
      e.event_type === 'checkout.session.completed' &&
      (e.ms_price_id?.includes('trial') || e.ms_price_id?.includes('30-day'))
    );
    
    const annualPaid = planEvents.find(e => 
      e.event_type === 'invoice.paid' &&
      (e.ms_price_id?.includes('annual') || e.ms_price_id === 'prc_annual-membership-jj7y0h89')
    );
    
    const subscriptionCreated = planEvents.find(e => 
      e.event_type === 'customer.subscription.created' &&
      (e.ms_price_id?.includes('annual') || e.ms_price_id === 'prc_annual-membership-jj7y0h89')
    );
    
    console.log(`   Trial Start: ${trialStart ? trialStart.created_at : 'NOT FOUND'}`);
    console.log(`   Annual Paid: ${annualPaid ? annualPaid.created_at : 'NOT FOUND'}`);
    console.log(`   Subscription Created: ${subscriptionCreated ? subscriptionCreated.created_at : 'NOT FOUND'}`);
    
    if (trialStart && annualPaid) {
      const trialDate = new Date(trialStart.created_at);
      const annualDate = new Date(annualPaid.created_at);
      const isConverted = annualDate > trialDate;
      console.log(`   \n   ✅ IS CONVERSION: ${isConverted ? 'YES' : 'NO'}`);
      console.log(`   Days between: ${Math.round((annualDate - trialDate) / (1000 * 60 * 60 * 24))}`);
    } else {
      console.log(`   \n   ⚠️  Cannot determine conversion - missing trial or annual event`);
    }
    
    // Check subscription ID from subscription.created event
    if (subscriptionCreated && subscriptionCreated.payload) {
      try {
        const payload = typeof subscriptionCreated.payload === 'string' 
          ? JSON.parse(subscriptionCreated.payload) 
          : subscriptionCreated.payload;
        const subscriptionId = payload?.data?.object?.id;
        console.log(`   \n   Subscription ID from event: ${subscriptionId || 'NOT FOUND'}`);
        console.log(`   Expected from Stripe: sub_1SrasC4mPKLoo2btud2jmT4Y`);
        console.log(`   Match: ${subscriptionId === 'sub_1SrasC4mPKLoo2btud2jmT4Y' ? '✅ YES' : '❌ NO'}`);
      } catch (e) {
        console.log(`   \n   Could not parse subscription.created payload: ${e.message}`);
      }
    }
  } else {
    console.log("   No events found");
  }
}

checkPaulMember().catch(console.error);
