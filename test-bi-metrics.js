// Test script for BI metrics endpoint
// Run with: node test-bi-metrics.js

require('dotenv').config({ path: '.env.local' });

const { createClient } = require("@supabase/supabase-js");

async function testBIMetrics() {
  console.log('🧪 Testing BI Metrics Calculations...\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const now = new Date();
  const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const next30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  console.log('📅 Time Windows:');
  console.log(`  Now: ${now.toISOString()}`);
  console.log(`  7d ago: ${start7d.toISOString()}`);
  console.log(`  30d ago: ${start30d.toISOString()}`);
  console.log(`  90d ago: ${start90d.toISOString()}`);
  console.log(`  Next 7d: ${next7d.toISOString()}`);
  console.log(`  Next 30d: ${next30d.toISOString()}\n`);

  // Get all members
  console.log('📊 Fetching members...');
  const { data: allMembersForBI, error: membersError } = await supabase
    .from('ms_members_cache')
    .select('member_id, email, created_at, plan_summary');

  if (membersError) {
    console.error('❌ Error fetching members:', membersError);
    return;
  }

  console.log(`✅ Found ${allMembersForBI?.length || 0} members\n`);

  // Build member plan timeline map
  const memberPlans = {};
  const trialPlanId = "pln_academy-trial-30-days--wb7v0hbh";

  if (allMembersForBI) {
    allMembersForBI.forEach(member => {
      const plan = member.plan_summary || {};
      const isTrial = plan.plan_id === trialPlanId || (plan.payment_mode === "ONETIME" && plan.expiry_date);
      
      let trialStartAt = null;
      let trialEndAt = null;
      if (isTrial) {
        trialStartAt = member.created_at ? new Date(member.created_at) : null;
        if (plan.expiry_date) {
          trialEndAt = new Date(plan.expiry_date);
        } else if (trialStartAt) {
          trialEndAt = new Date(trialStartAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        }
      }

      let annualStartAt = null;
      let annualEndAt = null;
      if (plan.plan_type === 'annual') {
        annualStartAt = plan.current_period_start ? new Date(plan.current_period_start) : 
                       (member.created_at ? new Date(member.created_at) : null);
        
        if (plan.current_period_end) {
          annualEndAt = new Date(plan.current_period_end);
        } else if (plan.expiry_date) {
          annualEndAt = new Date(plan.expiry_date);
        } else if (annualStartAt) {
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

  // Test 1: Trial Conversion (30d)
  console.log('🔍 Test 1: Trial Conversion (30d)');
  const trialsStarted30d = Object.values(memberPlans).filter(m => 
    m.isTrial && m.trialStartAt && m.trialStartAt >= start30d
  );
  console.log(`  Trials started in last 30d: ${trialsStarted30d.length}`);
  
  const trialsConverted30d = trialsStarted30d.filter(m => {
    if (!m.annualStartAt || !m.trialStartAt) return false;
    const daysToConvert = Math.floor((m.annualStartAt - m.trialStartAt) / 86400000);
    return daysToConvert >= 0 && daysToConvert <= 30;
  });
  console.log(`  Trials converted: ${trialsConverted30d.length}`);
  
  const trialConversionRate30d = trialsStarted30d.length > 0 
    ? Math.round((trialsConverted30d.length / trialsStarted30d.length) * 100) 
    : null;
  console.log(`  Conversion rate: ${trialConversionRate30d !== null ? `${trialConversionRate30d}%` : '—'}\n`);

  // Test 2: At-risk trials
  console.log('🔍 Test 2: At-Risk Trials (next 7d)');
  const trialMemberIds = Object.values(memberPlans)
    .filter(m => {
      if (!m.isTrial || !m.trialEndAt || !m.trialStartAt) return false;
      return m.trialEndAt > now && m.trialEndAt <= next7d && m.trialStartAt <= now;
    })
    .map(m => m.member_id);
  console.log(`  Trials expiring in next 7d: ${trialMemberIds.length}`);
  
  if (trialMemberIds.length > 0) {
    const { data: moduleOpensForTrials } = await supabase
      .from('academy_events')
      .select('member_id, created_at')
      .eq('event_type', 'module_open')
      .in('member_id', trialMemberIds);

    const { data: examAttemptsForTrials } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, created_at')
      .in('memberstack_id', trialMemberIds);

    let atRiskCount = 0;
    trialMemberIds.forEach(memberId => {
      const member = memberPlans[memberId];
      if (!member || !member.trialStartAt) return;

      const activationWindowEnd = new Date(Math.min(
        member.trialStartAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        now.getTime()
      ));

      const moduleOpensInTrial = (moduleOpensForTrials || []).filter(e => 
        e.member_id === memberId && 
        new Date(e.created_at) >= member.trialStartAt &&
        new Date(e.created_at) <= activationWindowEnd
      ).length;

      const examAttemptsInTrial = (examAttemptsForTrials || []).filter(e => 
        e.memberstack_id === memberId &&
        new Date(e.created_at) >= member.trialStartAt &&
        new Date(e.created_at) <= activationWindowEnd
      ).length;

      if (moduleOpensInTrial < 3 && examAttemptsInTrial === 0) {
        atRiskCount++;
        console.log(`    ⚠️  At-risk: ${member.email} (${moduleOpensInTrial} opens, ${examAttemptsInTrial} exams)`);
      }
    });
    console.log(`  At-risk trials: ${atRiskCount}\n`);
  }

  // Test 3: Annual churn
  console.log('🔍 Test 3: Annual Churn (90d)');
  const annualChurnCount90d = Object.values(memberPlans).filter(m => 
    m.isAnnual && m.annualEndAt && m.annualEndAt >= start90d && m.annualEndAt <= now
  ).length;
  console.log(`  Annuals churned in last 90d: ${annualChurnCount90d}`);
  
  const annualActiveAtStart90d = Object.values(memberPlans).filter(m => 
    m.isAnnual && 
    m.annualStartAt && 
    m.annualStartAt <= start90d && 
    (m.annualEndAt === null || m.annualEndAt > start90d)
  ).length;
  console.log(`  Annuals active at start of 90d: ${annualActiveAtStart90d}`);
  
  const annualChurnRate90d = annualActiveAtStart90d > 0
    ? Math.round((annualChurnCount90d / annualActiveAtStart90d) * 100)
    : null;
  console.log(`  Churn rate: ${annualChurnRate90d !== null ? `${annualChurnRate90d}%` : '—'}\n`);

  // Test 4: Annual expiring
  console.log('🔍 Test 4: Annual Expiring (next 30d)');
  const annualExpiringNext30d = Object.values(memberPlans).filter(m => 
    m.isAnnual && 
    m.annualEndAt && 
    m.annualEndAt > now && 
    m.annualEndAt <= next30d
  ).length;
  console.log(`  Annuals expiring in next 30d: ${annualExpiringNext30d}`);
  console.log(`  Revenue at risk: £${annualExpiringNext30d * 79}\n`);

  // Test 5: Activation rate
  console.log('🔍 Test 5: Activation Rate (7d)');
  const trialsStarted7d = Object.values(memberPlans).filter(m => 
    m.isTrial && m.trialStartAt && m.trialStartAt >= start7d
  );
  console.log(`  Trials started in last 7d: ${trialsStarted7d.length}`);
  
  if (trialsStarted7d.length > 0) {
    const trial7dMemberIds = trialsStarted7d.map(m => m.member_id);
    
    const { data: moduleOpens7d } = await supabase
      .from('academy_events')
      .select('member_id, created_at')
      .eq('event_type', 'module_open')
      .in('member_id', trial7dMemberIds);

    const { data: examAttempts7d } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, created_at')
      .in('memberstack_id', trial7dMemberIds);

    let activatedCount = 0;
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

      if (moduleOpens >= 3 || examAttempts >= 1) {
        activatedCount++;
      }
    });
    
    const activationRate7d = trialsStarted7d.length > 0
      ? Math.round((activatedCount / trialsStarted7d.length) * 100)
      : null;
    console.log(`  Activated trials: ${activatedCount}`);
    console.log(`  Activation rate: ${activationRate7d !== null ? `${activationRate7d}%` : '—'}\n`);
  }

  console.log('✅ BI Metrics test complete!');
}

testBIMetrics().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
