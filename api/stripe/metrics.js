// /api/stripe/metrics.js
// Returns real-time Stripe subscription metrics for Admin Dashboard
// Uses Stripe Subscriptions API (not invoices) for accurate counts
// FILTERED TO ACADEMY PRODUCTS ONLY

const path = require('path');
const {
  isAcademyInvoice,
  isAcademyAnnualSubscription,
  getAcademyAnnualListPrice
} = require('../../lib/academyStripeConfig');

let getStripe;
try {
  // Use absolute path for Vercel serverless compatibility
  const stripePath = path.join(process.cwd(), 'lib', 'stripe');
  console.log('[stripe-metrics] Attempting to require Stripe from:', stripePath);
  getStripe = require(stripePath);
  console.log('[stripe-metrics] Stripe module loaded, getStripe type:', typeof getStripe);
} catch (requireError) {
  console.error('[stripe-metrics] Failed to require Stripe module:', requireError);
  console.error('[stripe-metrics] Require error message:', requireError.message);
  console.error('[stripe-metrics] Require error stack:', requireError.stack);
  // Try fallback relative path
  try {
    console.log('[stripe-metrics] Trying fallback relative path...');
    getStripe = require('../../lib/stripe');
    console.log('[stripe-metrics] Fallback path worked, getStripe type:', typeof getStripe);
  } catch (fallbackError) {
    console.error('[stripe-metrics] Fallback path also failed:', fallbackError);
    throw new Error(`Failed to load Stripe module: ${requireError.message}. Fallback also failed: ${fallbackError.message}`);
  }
}

// Simple in-memory cache
let cache = {
  data: null,
  timestamp: null,
  ttl: 10 * 60 * 1000 // 10 minutes
};

// Helper to fetch all subscriptions with pagination
async function fetchAllSubscriptions(stripe, filters = {}) {
  if (!stripe) {
    throw new Error('fetchAllSubscriptions: stripe parameter is required but was undefined or null');
  }
  
  if (!stripe.subscriptions) {
    throw new Error('fetchAllSubscriptions: stripe.subscriptions is undefined. Stripe object keys: ' + Object.keys(stripe || {}).join(', '));
  }
  
  if (typeof stripe.subscriptions.list !== 'function') {
    throw new Error('fetchAllSubscriptions: stripe.subscriptions.list is not a function. Type: ' + typeof stripe.subscriptions.list);
  }
  
  const subscriptions = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const params = {
      limit: 100,
      expand: ['data.customer', 'data.items.data.price'],
      ...filters
    };

    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const response = await stripe.subscriptions.list(params);
    subscriptions.push(...response.data);

    hasMore = response.has_more;
    if (hasMore && response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return subscriptions;
}

// Check if subscription is annual (has any item with interval=year)
function isAnnualSubscription(subscription) {
  return subscription.items?.data?.some(item => 
    item.price?.recurring?.interval === 'year'
  ) || false;
}

// Get subscription revenue (unit_amount * quantity)
function getSubscriptionRevenue(subscription) {
  let total = 0;
  subscription.items?.data?.forEach(item => {
    const amount = item.price?.unit_amount || 0;
    const quantity = item.quantity || 1;
    total += amount * quantity;
  });
  return total / 100; // Convert from cents to GBP
}

// Main calculation function (can be called directly or via API)
async function calculateStripeMetrics(forceRefresh = false) {
  try {
    // Initialize Stripe client (checks env var at runtime)
    console.log('[stripe-metrics] Initializing Stripe client...');
    console.log('[stripe-metrics] getStripe type:', typeof getStripe);
    
    if (!getStripe || typeof getStripe !== 'function') {
      throw new Error(`getStripe is not a function. Type: ${typeof getStripe}, value: ${getStripe}`);
    }
    
    let stripe;
    try {
      stripe = getStripe();
      console.log('[stripe-metrics] getStripe() returned, type:', typeof stripe);
    } catch (initError) {
      console.error('[stripe-metrics] Failed to initialize Stripe client:', initError);
      console.error('[stripe-metrics] Init error message:', initError.message);
      console.error('[stripe-metrics] Init error stack:', initError.stack);
      throw initError;
    }
    
    if (!stripe) {
      throw new Error('Stripe client initialization returned undefined or null');
    }
    
    if (typeof stripe !== 'object') {
      throw new Error(`Stripe client is not an object. Type: ${typeof stripe}, value: ${stripe}`);
    }
    
    if (!stripe.subscriptions) {
      console.error('[stripe-metrics] Stripe client missing subscriptions property.');
      console.error('[stripe-metrics] Stripe object keys:', Object.keys(stripe || {}));
      console.error('[stripe-metrics] Stripe object type:', typeof stripe);
      throw new Error('Stripe client is not properly initialized - missing subscriptions property');
    }
    
    if (typeof stripe.subscriptions.list !== 'function') {
      console.error('[stripe-metrics] Stripe subscriptions.list is not a function.');
      console.error('[stripe-metrics] subscriptions.list type:', typeof stripe.subscriptions.list);
      console.error('[stripe-metrics] subscriptions keys:', Object.keys(stripe.subscriptions || {}));
      throw new Error('Stripe client is not properly initialized - subscriptions.list is not a function');
    }
    
    console.log('[stripe-metrics] Stripe client initialized successfully');
    
    // Check cache unless force refresh
    const now = Date.now();

    if (!forceRefresh && cache.data && cache.timestamp && (now - cache.timestamp) < cache.ttl) {
      return cache.data;
    }

    const metrics = {
      annual_active_count: 0,
      trials_active_count: 0,
      annual_expiring_next_30d_count: 0,
      revenue_at_risk_next_30d_gbp: 0,
      at_risk_annual_count: 0,
      annual_churn_90d_count: 0,
      annual_churn_rate_90d: null,
      conversions_trial_to_annual_last_30d: 0,
      conversions_trial_to_annual_all_time: 0,
      trials_ended_last_30d: 0,
      conversion_rate_last_30d: null,
      trial_dropoff_last_30d: null,
      revenue_from_conversions_last_30d_gbp: 0,
      revenue_net_all_time_gbp: null, // Will be computed or cached
      revenue_net_last_30d_gbp: 0,
      arr_gbp: 0
    };

    const nowDate = new Date();
    const thirtyDaysAgo = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(nowDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(nowDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    // A) Fetch all active and trialing subscriptions
    console.log('[stripe-metrics] Fetching active subscriptions...');
    const activeSubs = await fetchAllSubscriptions(stripe, {
      status: 'active'
    });

    console.log('[stripe-metrics] Fetching trialing subscriptions...');
    const trialingSubs = await fetchAllSubscriptions(stripe, {
      status: 'trialing'
    });

    const allActiveSubs = [...activeSubs, ...trialingSubs];

    // B) Count Academy annual active and trials active (FILTERED TO ACADEMY ONLY)
    allActiveSubs.forEach(sub => {
      // Note: Trials are tracked via Memberstack, not Stripe (trials are £0 checkouts)
      // This count is for reference only - actual trial count comes from Memberstack
      if (sub.status === 'trialing' && isAcademyAnnualSubscription(sub)) {
        metrics.trials_active_count++;
      }
      if (isAcademyAnnualSubscription(sub) && sub.status === 'active') {
        metrics.annual_active_count++;
      }
    });

    // C) Expiring next 30 days (Academy annual active with current_period_end in window)
    allActiveSubs.forEach(sub => {
      if (isAcademyAnnualSubscription(sub) && sub.status === 'active' && sub.current_period_end) {
        const periodEnd = new Date(sub.current_period_end * 1000);
        if (periodEnd > nowDate && periodEnd <= thirtyDaysFromNow) {
          metrics.annual_expiring_next_30d_count++;
        }
      }
    });

    // D) Revenue at risk (Academy annual with cancel_at_period_end=true AND expiring soon)
    allActiveSubs.forEach(sub => {
      if (isAcademyAnnualSubscription(sub) && sub.status === 'active' && sub.cancel_at_period_end) {
        if (sub.current_period_end) {
          const periodEnd = new Date(sub.current_period_end * 1000);
          if (periodEnd > nowDate && periodEnd <= thirtyDaysFromNow) {
            metrics.at_risk_annual_count++;
            metrics.revenue_at_risk_next_30d_gbp += getSubscriptionRevenue(sub);
          }
        }
      }
    });

    // E) Annual churn (canceled in last 90 days)
    console.log('[stripe-metrics] Fetching canceled subscriptions...');
    const canceledSubs = await fetchAllSubscriptions(stripe, {
      status: 'canceled'
    });

    let annualChurned = 0;
    let annualActiveAtStart = 0;

    // Filter churn to Academy annual subscriptions only
    canceledSubs.forEach(sub => {
      if (isAcademyAnnualSubscription(sub) && sub.ended_at) {
        const endedAt = new Date(sub.ended_at * 1000);
        if (endedAt >= ninetyDaysAgo && endedAt <= nowDate) {
          annualChurned++;
        }
      }
    });

    // Count active Academy annuals at start of 90d period (approximate)
    allActiveSubs.forEach(sub => {
      if (isAcademyAnnualSubscription(sub) && sub.status === 'active') {
        if (sub.created) {
          const created = new Date(sub.created * 1000);
          if (created <= ninetyDaysAgo) {
            annualActiveAtStart++;
          }
        }
      }
    });

    metrics.annual_churn_90d_count = annualChurned;
    metrics.annual_churn_rate_90d = (annualActiveAtStart + annualChurned) > 0
      ? Math.round((annualChurned / (annualActiveAtStart + annualChurned)) * 100 * 10) / 10
      : null;

    // F) Trial → Annual conversions
    // Build trial cohort (trialing or ended with trial_end in last 30d)
    console.log('[stripe-metrics] Calculating trial conversions...');
    
    // Use subscriptions we already fetched (active, trialing, canceled) instead of making another API call
    const allSubsForConversion = [...allActiveSubs, ...canceledSubs];
    
    const trialCohort = allSubsForConversion.filter(sub => {
      if (sub.status === 'trialing') return true;
      if (sub.trial_end) {
        const trialEnd = new Date(sub.trial_end * 1000);
        return trialEnd >= thirtyDaysAgo && trialEnd <= nowDate;
      }
      return false;
    });

    // Group by customer to find conversions
    const customerTrials = {};
    const customerAnnuals = {};

    trialCohort.forEach(sub => {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      if (customerId) {
        if (!customerTrials[customerId]) {
          customerTrials[customerId] = [];
        }
        customerTrials[customerId].push(sub);
      }
    });

    // Find Academy annual subscriptions for these customers
    allActiveSubs.forEach(sub => {
      if (isAcademyAnnualSubscription(sub) && sub.status === 'active') {
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (customerId) {
          if (!customerAnnuals[customerId]) {
            customerAnnuals[customerId] = [];
          }
          customerAnnuals[customerId].push(sub);
        }
      }
    });

    // Build map of converted annual subscription IDs and count conversions
    const convertedAnnualSubIds = new Set();
    let conversions30d = 0;
    let conversionsAllTime = 0;
    let trialsEnded30d = 0;
    let trialsEndedAllTime = 0;

    Object.keys(customerTrials).forEach(customerId => {
      const trials = customerTrials[customerId];
      const annuals = customerAnnuals[customerId] || [];

      trials.forEach(trial => {
        if (trial.trial_end) {
          const trialEnd = new Date(trial.trial_end * 1000);
          const isInLast30d = trialEnd >= thirtyDaysAgo && trialEnd <= nowDate;

          if (isInLast30d) {
            trialsEnded30d++;
          }
          // Count all-time trials ended (any trial that has ended)
          if (trialEnd <= nowDate) {
            trialsEndedAllTime++;
          }

          // Check if customer has annual subscription started within 7 days of trial end
          annuals.forEach(annual => {
            const annualStart = new Date(annual.created * 1000);
            const daysDiff = (annualStart - trialEnd) / (1000 * 60 * 60 * 24);

            if (daysDiff >= 0 && daysDiff <= 7) {
              convertedAnnualSubIds.add(annual.id);
              if (isInLast30d) {
                conversions30d++;
              }
              conversionsAllTime++;
            }
          });
        }
      });
    });

    metrics.conversions_trial_to_annual_last_30d = conversions30d;
    metrics.conversions_trial_to_annual_all_time = conversionsAllTime;
    metrics.trials_ended_last_30d = trialsEnded30d;
    metrics.trials_ended_all_time = trialsEndedAllTime;
    metrics.conversion_rate_last_30d = trialsEnded30d > 0
      ? Math.round((conversions30d / trialsEnded30d) * 100 * 10) / 10
      : null;
    metrics.conversion_rate_all_time = trialsEndedAllTime > 0
      ? Math.round((conversionsAllTime / trialsEndedAllTime) * 100 * 10) / 10
      : null;
    metrics.trial_dropoff_last_30d = metrics.conversion_rate_last_30d !== null
      ? Math.round((100 - metrics.conversion_rate_last_30d) * 10) / 10
      : null;

    // G) Revenue from conversions will be calculated in step H (invoice processing)

    // H) Revenue (net) from PAID ACADEMY INVOICES ONLY (all-time + 30d)
    console.log('[stripe-metrics] Calculating Academy revenue from paid invoices...');
    
    // Detect Stripe key mode
    const stripeKeyMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test';
    
    // Helper to fetch all paid invoices with pagination
    const fetchAllPaidInvoices = async (createdAfter = null, maxInvoices = 5000) => {
      const invoices = [];
      let hasMore = true;
      let startingAfter = null;

      while (hasMore && invoices.length < maxInvoices) {
        const params = {
          limit: 100,
          status: 'paid',
          expand: ['data.subscription', 'data.charge', 'data.lines.data.price']
        };

        if (createdAfter) {
          params.created = { gte: Math.floor(createdAfter.getTime() / 1000) };
        }

        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const response = await stripe.invoices.list(params);
        invoices.push(...response.data);

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        } else {
          hasMore = false;
        }
      }

      return invoices;
    };

    // Fetch all paid invoices (all-time, capped at 5k for performance)
    const allPaidInvoices = await fetchAllPaidInvoices();
    
    // Filter to Academy invoices only
    const academyInvoices = allPaidInvoices.filter(invoice => isAcademyInvoice(invoice));
    console.log(`[stripe-metrics] Filtered ${academyInvoices.length} Academy invoices from ${allPaidInvoices.length} total paid invoices`);
    
    // Helper to get revenue from invoice (minimum correct approach: use invoice.total)
    // This includes discounts and is after refunds, before Stripe fees
    const getInvoiceRevenue = (invoice) => {
      // Use invoice.total (includes discounts, after refunds, before Stripe fees)
      // This is the minimum correct approach per user requirements
      if (invoice.total && invoice.currency === 'gbp') {
        return invoice.total / 100; // Convert from minor units to GBP
      }
      
      // Fallback: use amount_paid if total is missing
      if (invoice.amount_paid && invoice.currency === 'gbp') {
        return invoice.amount_paid / 100;
      }
      
      return 0;
    };
    
    // Helper to get net revenue from invoice (after Stripe fees)
    // This is the more accurate approach but requires balance_transaction lookup
    const getInvoiceNetRevenue = async (invoice) => {
      // Try to get net from balance_transaction (most accurate - after Stripe fees)
      if (invoice.charge) {
        try {
          const chargeId = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge.id;
          if (chargeId) {
            const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
            
            if (charge.balance_transaction) {
              const balanceTx = typeof charge.balance_transaction === 'string'
                ? await stripe.balanceTransactions.retrieve(charge.balance_transaction)
                : charge.balance_transaction;
              
              if (balanceTx.net && balanceTx.currency === 'gbp') {
                return balanceTx.net / 100; // Convert to GBP major units
              }
            }
          }
        } catch (err) {
          console.warn(`[stripe-metrics] Error fetching balance_transaction for invoice ${invoice.id}:`, err.message);
        }
      }
      
      // Fallback: use invoice.total (before Stripe fees, but includes discounts)
      return getInvoiceRevenue(invoice);
    };

    // Calculate revenue metrics
    let revenueNetAllTime = 0;
    let revenueNet30d = 0;
    let annualRevenueNetAllTime = 0;
    let annualRevenueNet30d = 0;
    let revenueFromConversionsNetAllTime = 0;
    let revenueFromConversionsNet30d = 0;
    let revenueFromDirectAnnualNetAllTime = 0;
    let revenueFromDirectAnnualNet30d = 0;
    let nonGbpInvoicesCount = 0;
    let paidAnnualInvoicesCountAllTime = 0;
    const debugSampleAnnualInvoiceIds = [];
    
    // Debug counters
    let invoicesFound = allPaidInvoices.length;
    let annualInvoicesMatched = 0;
    let annualRevenuePenniesSum = 0;

    // Build subscription ID to type map for faster lookup (Academy only)
    const subscriptionTypeMap = new Map();
    allActiveSubs.forEach(sub => {
      if (isAcademyAnnualSubscription(sub)) {
        subscriptionTypeMap.set(sub.id, 'academy_annual');
      }
    });

    // Process Academy invoices only (already filtered above)
    const invoicesToProcess = academyInvoices.slice(0, 1000);
    console.log(`[stripe-metrics] Processing ${invoicesToProcess.length} Academy invoices...`);
    
    for (const invoice of invoicesToProcess) {
      // Skip non-GBP invoices
      if (invoice.currency !== 'gbp') {
        nonGbpInvoicesCount++;
        continue;
      }

      // Use invoice.total (includes discounts, after refunds, before Stripe fees)
      // invoice.total is in minor units (pence), so divide by 100
      const invoiceRevenue = getInvoiceRevenue(invoice);
      
      // Log invoice details for debugging
      if (invoice.total && invoice.total > 0) {
        console.log(`[stripe-metrics] Academy invoice ${invoice.id}: total=${invoice.total} (${invoice.total/100} GBP), billing_reason=${invoice.billing_reason || 'none'}, status=${invoice.status}`);
      }
      
      if (invoiceRevenue === 0) {
        console.log(`[stripe-metrics] Academy invoice ${invoice.id} has zero revenue, skipping`);
        continue;
      }

      const invoiceCreated = new Date(invoice.created * 1000);
      const isInLast30d = invoiceCreated >= thirtyDaysAgo;

      // All invoices in this loop are Academy invoices, so add to totals
      revenueNetAllTime += invoiceRevenue;
      if (isInLast30d) {
        revenueNet30d += invoiceRevenue;
      }

      // All invoices here are Academy annual (already filtered)
      const isAcademyAnnual = true;
      
      if (isAcademyAnnual) {
        annualInvoicesMatched++;
        paidAnnualInvoicesCountAllTime++;
        annualRevenuePenniesSum += invoice.total || 0;
        
        console.log(`[stripe-metrics] Found annual invoice: ${invoice.id}, total=${invoice.total} (${invoice.total/100} GBP), billing_reason=${invoice.billing_reason || 'none'}`);
        
        // Store sample invoice IDs for debug
        if (debugSampleAnnualInvoiceIds.length < 3) {
          debugSampleAnnualInvoiceIds.push({
            id: invoice.id,
            total: invoice.total / 100,
            created: new Date(invoice.created * 1000).toISOString(),
            billing_reason: invoice.billing_reason || 'unknown',
            amount_paid: invoice.amount_paid ? invoice.amount_paid / 100 : null,
            currency: invoice.currency
          });
        }

        annualRevenueNetAllTime += invoiceRevenue;
        if (isInLast30d) {
          annualRevenueNet30d += invoiceRevenue;
        }

        // Classify as conversion or direct (if subscription exists)
        if (invoice.subscription) {
          const subscriptionId = typeof invoice.subscription === 'string' 
            ? invoice.subscription 
            : invoice.subscription.id;

          if (convertedAnnualSubIds.has(subscriptionId)) {
            revenueFromConversionsNetAllTime += invoiceRevenue;
            if (isInLast30d) {
              revenueFromConversionsNet30d += invoiceRevenue;
            }
          } else {
            revenueFromDirectAnnualNetAllTime += invoiceRevenue;
            if (isInLast30d) {
              revenueFromDirectAnnualNet30d += invoiceRevenue;
            }
          }
        } else {
          // Invoice has annual price but no subscription (unlikely but handle it)
          // Treat as direct annual
          revenueFromDirectAnnualNetAllTime += invoiceRevenue;
          if (isInLast30d) {
            revenueFromDirectAnnualNet30d += invoiceRevenue;
          }
        }
      }
    }
    
    console.log(`[stripe-metrics] Academy revenue summary: invoicesFound=${academyInvoices.length}, annualInvoicesMatched=${annualInvoicesMatched}, annualRevenuePenniesSum=${annualRevenuePenniesSum}, annualRevenueNetAllTime=${annualRevenueNetAllTime}`);

    metrics.revenue_net_all_time_gbp = Math.round(revenueNetAllTime * 100) / 100;
    metrics.revenue_net_last_30d_gbp = Math.round(revenueNet30d * 100) / 100;
    metrics.annual_revenue_net_all_time_gbp = Math.round(annualRevenueNetAllTime * 100) / 100;
    metrics.annual_revenue_net_30d_gbp = Math.round(annualRevenueNet30d * 100) / 100;
    metrics.revenue_from_conversions_net_all_time_gbp = Math.round(revenueFromConversionsNetAllTime * 100) / 100;
    metrics.revenue_from_conversions_net_30d_gbp = Math.round(revenueFromConversionsNet30d * 100) / 100;
    metrics.revenue_from_direct_annual_net_all_time_gbp = Math.round(revenueFromDirectAnnualNetAllTime * 100) / 100;
    metrics.revenue_from_direct_annual_net_30d_gbp = Math.round(revenueFromDirectAnnualNet30d * 100) / 100;
    metrics.non_gbp_invoices_count = nonGbpInvoicesCount;
    
    // Debug info
    metrics.stripe_key_mode = stripeKeyMode;
    metrics.academy_price_ids_used = require('../../lib/academyStripeConfig').ACADEMY_ANNUAL_PRICE_IDS;
    metrics.paid_annual_invoices_count_all_time = paidAnnualInvoicesCountAllTime;
    metrics.debug_sample_annual_invoice_ids = debugSampleAnnualInvoiceIds;
    metrics.debug_invoices_found = academyInvoices.length;
    metrics.debug_annual_invoices_matched = annualInvoicesMatched;
    metrics.debug_annual_revenue_pennies_sum = annualRevenuePenniesSum;

    // I) ARR (Annual Run-Rate) from active Academy annual subscriptions only
    allActiveSubs.forEach(sub => {
      if (isAcademyAnnualSubscription(sub) && sub.status === 'active') {
        metrics.arr_gbp += getSubscriptionRevenue(sub);
      }
    });

    metrics.arr_gbp = Math.round(metrics.arr_gbp * 100) / 100;

    // J) Opportunity Revenue (if all trials convert)
    // NOTE: Trial count comes from Memberstack/DB (not Stripe, since trials are £0 checkouts)
    // This will be set by the overview.js endpoint using Memberstack trial count
    // For now, get the annual list price from Stripe
    let annualPriceGross = 0;
    
    try {
      annualPriceGross = await getAcademyAnnualListPrice(stripe);
      console.log(`[stripe-metrics] Retrieved Academy annual list price from Stripe: £${annualPriceGross}`);
    } catch (priceError) {
      console.warn(`[stripe-metrics] Failed to retrieve annual price, using fallback:`, priceError.message);
      // Fallback: try to get from active subscription
      const academyAnnualSub = allActiveSubs.find(sub => isAcademyAnnualSubscription(sub) && sub.status === 'active');
      if (academyAnnualSub && academyAnnualSub.items?.data?.length > 0) {
        const academyItem = academyAnnualSub.items.data.find(item => 
          require('../../lib/academyStripeConfig').ACADEMY_ANNUAL_PRICE_IDS.includes(item.price?.id)
        );
        if (academyItem && academyItem.price?.unit_amount) {
          annualPriceGross = academyItem.price.unit_amount / 100;
          console.log(`[stripe-metrics] Using annual price from active subscription: £${annualPriceGross}`);
        }
      }
      
      // Final fallback
      if (annualPriceGross === 0) {
        annualPriceGross = 79.00; // Default £79 annual price
        console.log(`[stripe-metrics] Using default annual price: £${annualPriceGross}`);
      }
    }

    // Store the annual list price for use by overview.js (which has Memberstack trial count)
    metrics.academy_annual_list_price_gbp = annualPriceGross;
    
    // Note: Trial opportunity calculation will be done in overview.js using Memberstack trial count
    // For now, set to 0 (will be overridden by overview.js)
    metrics.opportunity_revenue_gross_gbp = 0;
    metrics.opportunity_revenue_net_estimate_gbp = 0;

    // Update cache
    cache.data = metrics;
    cache.timestamp = now;

    return metrics;

  } catch (error) {
    console.error('[stripe-metrics] Error:', error);
    throw error;
  }
}

// API route handler
module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const forceRefresh = req.query.force === '1';
    const metrics = await calculateStripeMetrics(forceRefresh);
    
    return res.status(200).json(metrics);

  } catch (error) {
    console.error('[stripe-metrics] API Error:', error);
    console.error('[stripe-metrics] Error message:', error.message);
    console.error('[stripe-metrics] Error stack:', error.stack);
    if (error.debugInfo) {
      console.error('[stripe-metrics] Debug info:', JSON.stringify(error.debugInfo, null, 2));
    }
    
    // Return error details in response for debugging
    return res.status(500).json({ 
      error: error.message,
      details: 'Stripe metrics calculation failed',
      debugError: error.message,
      debugStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      debugInfo: error.debugInfo || null,
      stripe_key_mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test',
      stripe_key_exists: !!process.env.STRIPE_SECRET_KEY,
      stripe_key_length: process.env.STRIPE_SECRET_KEY?.length || 0
    });
  }
};

// Export calculation function for direct use
module.exports.calculateStripeMetrics = calculateStripeMetrics;
