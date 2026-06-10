// Debug script to check what Stripe metrics is actually calculating
// Usage: node scripts/debug-stripe-metrics.js

const path = require('path');
require("dotenv").config({ path: ".env.local" });

// Get Stripe metrics calculation
let calculateStripeMetrics;
try {
  const stripeMetricsPath = path.join(process.cwd(), 'api', 'stripe', 'metrics');
  const stripeMetricsModule = require(stripeMetricsPath);
  calculateStripeMetrics = stripeMetricsModule.calculateStripeMetrics;
} catch (error) {
  console.error('Failed to load Stripe metrics:', error.message);
  process.exit(1);
}

async function debugStripeMetrics() {
  console.log("\n🔍 Debugging Stripe Metrics Calculation...\n");
  
  try {
    const metrics = await calculateStripeMetrics(false);
    
    console.log("\n📊 STRIPE METRICS RESULTS:\n");
    console.log(`Conversions (All-time): ${metrics.conversions_trial_to_annual_all_time}`);
    console.log(`Conversions (30d): ${metrics.conversions_trial_to_annual_last_30d}`);
    console.log(`\nRevenue from Conversions (All-time): £${metrics.revenue_from_conversions_net_all_time_gbp || 0}`);
    console.log(`Revenue from Conversions (30d): £${metrics.revenue_from_conversions_net_30d_gbp || 0}`);
    console.log(`\nRevenue from Direct Annual (All-time): £${metrics.revenue_from_direct_annual_net_all_time_gbp || 0}`);
    console.log(`Revenue from Direct Annual (30d): £${metrics.revenue_from_direct_annual_net_30d_gbp || 0}`);
    console.log(`\nTotal Annual Revenue (All-time): £${metrics.annual_revenue_net_all_time_gbp || 0}`);
    console.log(`Total Annual Revenue (30d): £${metrics.annual_revenue_net_30d_gbp || 0}`);
    
    console.log(`\n\n🔍 DEBUG INFO:\n`);
    console.log(`Paid Annual Invoices (All-time): ${metrics.paid_annual_invoices_count_all_time || 0}`);
    console.log(`Annual Invoices Matched: ${metrics.debug_annual_invoices_matched || 0}`);
    console.log(`Invoices Found: ${metrics.debug_invoices_found || 0}`);
    
    if (metrics.debug_sample_annual_invoice_ids && metrics.debug_sample_annual_invoice_ids.length > 0) {
      console.log(`\nSample Invoice IDs:`);
      metrics.debug_sample_annual_invoice_ids.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. ${inv.id}: £${inv.total}, created: ${inv.created}, reason: ${inv.billing_reason}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error calculating Stripe metrics:', error);
    console.error('Stack:', error.stack);
  }
}

debugStripeMetrics().catch(console.error);
