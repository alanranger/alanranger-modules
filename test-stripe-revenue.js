// Test script to diagnose Stripe revenue calculation
// Run with: node test-stripe-revenue.js
// Or: STRIPE_SECRET_KEY=sk_live_... node test-stripe-revenue.js

// Try to load from .env.local, .env, or use process.env
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  try {
    require('dotenv').config({ path: '.env' });
  } catch (e2) {
    // No .env file, use process.env directly
  }
}

// Get Stripe key from environment
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('❌ STRIPE_SECRET_KEY not found!');
  console.error('   Set it in .env.local, .env, or as environment variable');
  console.error('   Example: STRIPE_SECRET_KEY=sk_live_... node test-stripe-revenue.js');
  process.exit(1);
}

// Initialize Stripe directly (don't use lib/stripe.js which throws on missing key)
const Stripe = require('stripe');
const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16'
});

const ANNUAL_PRICE_ID = 'price_1Sie474mPKLoo2btIfTbxoxk'; // Capital 'I' not lowercase 'f'

async function testStripeRevenue() {
  console.log('\n=== Stripe Revenue Diagnostic Test ===\n');
  
  // 1. Check Stripe key mode
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
    return;
  }
  
  const keyMode = stripeKey.startsWith('sk_live_') ? 'live' : 'test';
  console.log(`✓ Stripe Key Mode: ${keyMode}`);
  console.log(`✓ Key starts with: ${stripeKey.substring(0, 10)}...`);
  
  // 2. Test connection by fetching account
  try {
    const account = await stripe.accounts.retrieve();
    console.log(`✓ Connected to Stripe account: ${account.id}`);
  } catch (err) {
    console.error('❌ Failed to connect to Stripe:', err.message);
    return;
  }
  
  // 3. Fetch paid invoices
  console.log('\n--- Fetching Paid Invoices ---');
  let allInvoices = [];
  let hasMore = true;
  let startingAfter = null;
  
  while (hasMore && allInvoices.length < 100) {
    const params = {
      limit: 100,
      status: 'paid',
      expand: ['data.subscription', 'data.charge', 'data.lines.data.price']
    };
    
    if (startingAfter) {
      params.starting_after = startingAfter;
    }
    
    try {
      const response = await stripe.invoices.list(params);
      allInvoices.push(...response.data);
      console.log(`  Fetched ${response.data.length} invoices (total: ${allInvoices.length})`);
      
      hasMore = response.has_more;
      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error('❌ Error fetching invoices:', err.message);
      return;
    }
  }
  
  console.log(`\n✓ Total paid invoices found: ${allInvoices.length}`);
  
  // 4. Filter GBP invoices
  const gbpInvoices = allInvoices.filter(inv => inv.currency === 'gbp');
  console.log(`✓ GBP invoices: ${gbpInvoices.length}`);
  
  // 5. Check for annual price ID in invoices
  console.log('\n--- Checking for Annual Price ID ---');
  console.log(`Looking for price ID: ${ANNUAL_PRICE_ID}`);
  
  // First, let's see what price IDs are actually in the invoices
  console.log('\n--- All Price IDs Found in Invoices ---');
  const allPriceIds = new Set();
  for (const invoice of gbpInvoices) {
    if (invoice.lines?.data) {
      invoice.lines.data.forEach(line => {
        if (line.price?.id) {
          allPriceIds.add(line.price.id);
        }
      });
    }
  }
  console.log(`Found ${allPriceIds.size} unique price IDs:`);
  Array.from(allPriceIds).sort().forEach(priceId => {
    console.log(`  - ${priceId}`);
  });
  
  const annualInvoices = [];
  let totalRevenue = 0;
  let annualRevenue = 0;
  
  for (const invoice of gbpInvoices) {
    const invoiceTotal = invoice.total ? invoice.total / 100 : 0;
    totalRevenue += invoiceTotal;
    
    // Check if invoice contains annual price ID
    let containsAnnualPrice = false;
    if (invoice.lines?.data) {
      for (const line of invoice.lines.data) {
        if (line.price?.id === ANNUAL_PRICE_ID) {
          containsAnnualPrice = true;
          break;
        }
      }
    }
    
    if (containsAnnualPrice) {
      annualInvoices.push(invoice);
      annualRevenue += invoiceTotal;
      
      console.log(`\n✓ Found Annual Invoice:`);
      console.log(`  ID: ${invoice.id}`);
      console.log(`  Total: £${invoiceTotal.toFixed(2)}`);
      console.log(`  Amount Paid: £${invoice.amount_paid ? invoice.amount_paid / 100 : 0}`);
      console.log(`  Billing Reason: ${invoice.billing_reason || 'none'}`);
      console.log(`  Created: ${new Date(invoice.created * 1000).toLocaleString()}`);
      console.log(`  Status: ${invoice.status}`);
      
      // Show line items
      if (invoice.lines?.data) {
        console.log(`  Line Items:`);
        invoice.lines.data.forEach((line, idx) => {
          console.log(`    ${idx + 1}. Price ID: ${line.price?.id || 'none'}, Amount: £${line.amount ? line.amount / 100 : 0}`);
        });
      }
    }
  }
  
  // Also check for invoices with the subscription's price ID
  const subscriptionPriceId = 'price_1Sie474mPKLoo2btIfTbxoxk';
  console.log(`\n--- Checking for Subscription Price ID: ${subscriptionPriceId} ---`);
  const subscriptionInvoices = [];
  let subscriptionRevenue = 0;
  for (const invoice of gbpInvoices) {
    if (invoice.lines?.data) {
      for (const line of invoice.lines.data) {
        if (line.price?.id === subscriptionPriceId) {
          const invoiceTotal = invoice.total ? invoice.total / 100 : 0;
          subscriptionInvoices.push(invoice);
          subscriptionRevenue += invoiceTotal;
          
          console.log(`\n✓ Found Invoice with Subscription Price ID:`);
          console.log(`  ID: ${invoice.id}`);
          console.log(`  Total: £${invoiceTotal.toFixed(2)}`);
          console.log(`  Billing Reason: ${invoice.billing_reason || 'none'}`);
          console.log(`  Created: ${new Date(invoice.created * 1000).toLocaleString()}`);
          break;
        }
      }
    }
  }
  console.log(`\n✓ Invoices with subscription price ID: ${subscriptionInvoices.length}`);
  console.log(`✓ Revenue from subscription price ID: £${subscriptionRevenue.toFixed(2)}`);
  
  // 6. Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total Paid Invoices: ${allInvoices.length}`);
  console.log(`GBP Invoices: ${gbpInvoices.length}`);
  console.log(`Annual Invoices (with price ${ANNUAL_PRICE_ID}): ${annualInvoices.length}`);
  console.log(`\nTotal Revenue (all GBP invoices): £${totalRevenue.toFixed(2)}`);
  console.log(`Annual Revenue (invoices with annual price): £${annualRevenue.toFixed(2)}`);
  
  // 7. Check active subscriptions
  console.log('\n--- Checking Active Subscriptions ---');
  try {
    const activeSubs = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.items.data.price']
    });
    
    console.log(`✓ Active subscriptions: ${activeSubs.data.length}`);
    
    const annualSubs = activeSubs.data.filter(sub => {
      return sub.items.data.some(item => 
        item.price?.recurring?.interval === 'year'
      );
    });
    
    console.log(`✓ Annual subscriptions: ${annualSubs.length}`);
    
    if (annualSubs.length > 0) {
      console.log('\nAnnual Subscription Details:');
      annualSubs.forEach((sub, idx) => {
        const annualItem = sub.items.data.find(item => item.price?.recurring?.interval === 'year');
        console.log(`  ${idx + 1}. Subscription ${sub.id}`);
        console.log(`     Price ID: ${annualItem?.price?.id || 'none'}`);
        console.log(`     Amount: £${annualItem?.price?.unit_amount ? annualItem.price.unit_amount / 100 : 0}/year`);
        console.log(`     Status: ${sub.status}`);
      });
    }
  } catch (err) {
    console.error('❌ Error fetching subscriptions:', err.message);
  }
  
  // 8. Check trialing subscriptions
  console.log('\n--- Checking Trialing Subscriptions ---');
  try {
    const trialingSubs = await stripe.subscriptions.list({
      status: 'trialing',
      limit: 100
    });
    
    console.log(`✓ Trialing subscriptions: ${trialingSubs.data.length}`);
  } catch (err) {
    console.error('❌ Error fetching trialing subscriptions:', err.message);
  }
  
  console.log('\n=== Test Complete ===\n');
}

// Run the test
testStripeRevenue().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
