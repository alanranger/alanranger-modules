// /api/stripe/metrics.js
// Returns real-time Stripe subscription metrics for Admin Dashboard
// Uses Stripe Subscriptions API (not invoices) for accurate counts

const stripe = require('../../lib/stripe');

// Simple in-memory cache
let cache = {
  data: null,
  timestamp: null,
  ttl: 10 * 60 * 1000 // 10 minutes
};

// Helper to fetch all subscriptions with pagination
async function fetchAllSubscriptions(filters = {}) {
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
    const activeSubs = await fetchAllSubscriptions({
      status: 'active'
    });

    console.log('[stripe-metrics] Fetching trialing subscriptions...');
    const trialingSubs = await fetchAllSubscriptions({
      status: 'trialing'
    });

    const allActiveSubs = [...activeSubs, ...trialingSubs];

    // B) Count annual active and trials active
    allActiveSubs.forEach(sub => {
      if (sub.status === 'trialing') {
        metrics.trials_active_count++;
      }
      if (isAnnualSubscription(sub) && sub.status === 'active') {
        metrics.annual_active_count++;
      }
    });

    // C) Expiring next 30 days (annual active with current_period_end in window)
    allActiveSubs.forEach(sub => {
      if (isAnnualSubscription(sub) && sub.status === 'active' && sub.current_period_end) {
        const periodEnd = new Date(sub.current_period_end * 1000);
        if (periodEnd > nowDate && periodEnd <= thirtyDaysFromNow) {
          metrics.annual_expiring_next_30d_count++;
        }
      }
    });

    // D) Revenue at risk (cancel_at_period_end=true AND expiring soon)
    allActiveSubs.forEach(sub => {
      if (isAnnualSubscription(sub) && sub.status === 'active' && sub.cancel_at_period_end) {
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
    const canceledSubs = await fetchAllSubscriptions({
      status: 'canceled'
    });

    let annualChurned = 0;
    let annualActiveAtStart = 0;

    canceledSubs.forEach(sub => {
      if (isAnnualSubscription(sub) && sub.ended_at) {
        const endedAt = new Date(sub.ended_at * 1000);
        if (endedAt >= ninetyDaysAgo && endedAt <= nowDate) {
          annualChurned++;
        }
      }
    });

    // Count active annuals at start of 90d period (approximate)
    allActiveSubs.forEach(sub => {
      if (isAnnualSubscription(sub) && sub.status === 'active') {
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
    
    // Get all subscriptions that were trialing or have trial_end
    const allSubsForConversion = await fetchAllSubscriptions({});
    
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
      const customerId = sub.customer;
      if (!customerTrials[customerId]) {
        customerTrials[customerId] = [];
      }
      customerTrials[customerId].push(sub);
    });

    // Find annual subscriptions for these customers
    allActiveSubs.forEach(sub => {
      if (isAnnualSubscription(sub) && sub.status === 'active') {
        const customerId = sub.customer;
        if (!customerAnnuals[customerId]) {
          customerAnnuals[customerId] = [];
        }
        customerAnnuals[customerId].push(sub);
      }
    });

    // Count conversions (trial ended → annual started within 7 days)
    let conversions30d = 0;
    let conversionsAllTime = 0;
    let trialsEnded30d = 0;

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

          // Check if customer has annual subscription started within 7 days of trial end
          annuals.forEach(annual => {
            const annualStart = new Date(annual.created * 1000);
            const daysDiff = (annualStart - trialEnd) / (1000 * 60 * 60 * 24);

            if (daysDiff >= 0 && daysDiff <= 7) {
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
    metrics.conversion_rate_last_30d = trialsEnded30d > 0
      ? Math.round((conversions30d / trialsEnded30d) * 100 * 10) / 10
      : null;
    metrics.trial_dropoff_last_30d = metrics.conversion_rate_last_30d !== null
      ? Math.round((100 - metrics.conversion_rate_last_30d) * 10) / 10
      : null;

    // G) Revenue from conversions (last 30d)
    // For converted annuals started in last 30d, get first invoice
    console.log('[stripe-metrics] Calculating revenue from conversions...');
    let revenueFromConversions = 0;

    for (const customerId of Object.keys(customerAnnuals)) {
      const annuals = customerAnnuals[customerId];
      const trials = customerTrials[customerId] || [];

      for (const annual of annuals) {
        const annualStart = new Date(annual.created * 1000);
        if (annualStart >= thirtyDaysAgo) {
          // Check if this annual came from a trial
          const hasTrial = trials.some(trial => {
            if (trial.trial_end) {
              const trialEnd = new Date(trial.trial_end * 1000);
              const daysDiff = (annualStart - trialEnd) / (1000 * 60 * 60 * 24);
              return daysDiff >= 0 && daysDiff <= 7;
            }
            return false;
          });

          if (hasTrial) {
            // Get first invoice for this subscription
            try {
              const invoices = await stripe.invoices.list({
                subscription: annual.id,
                limit: 1,
                status: 'paid'
              });

              if (invoices.data.length > 0) {
                const invoice = invoices.data[0];
                revenueFromConversions += (invoice.amount_paid || 0) / 100; // Convert to GBP
              } else {
                // Fallback: use subscription revenue
                revenueFromConversions += getSubscriptionRevenue(annual);
              }
            } catch (err) {
              console.warn(`[stripe-metrics] Error fetching invoice for sub ${annual.id}:`, err.message);
              // Fallback: use subscription revenue
              revenueFromConversions += getSubscriptionRevenue(annual);
            }
          }
        }
      }
    }

    metrics.revenue_from_conversions_last_30d_gbp = Math.round(revenueFromConversions * 100) / 100;

    // H) Revenue (net) last 30 days from balance transactions
    console.log('[stripe-metrics] Calculating revenue from balance transactions...');
    let revenue30d = 0;
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = {
        limit: 100,
        type: 'charge',
        created: {
          gte: Math.floor(thirtyDaysAgo.getTime() / 1000)
        }
      };

      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const transactions = await stripe.balanceTransactions.list(params);
      
      transactions.data.forEach(tx => {
        // Only count GBP charges
        if (tx.currency === 'gbp' && tx.type === 'charge' && tx.net) {
          revenue30d += tx.net / 100; // Convert from minor units
        }
      });

      hasMore = transactions.has_more;
      if (hasMore && transactions.data.length > 0) {
        startingAfter = transactions.data[transactions.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    metrics.revenue_net_last_30d_gbp = Math.round(revenue30d * 100) / 100;

    // All-time revenue: For now, return null (too heavy to compute on every request)
    // TODO: Implement daily snapshot in Supabase or compute "since YYYY-MM-DD"
    metrics.revenue_net_all_time_gbp = null;

    // I) ARR (Annual Run-Rate) from active annual subscriptions
    allActiveSubs.forEach(sub => {
      if (isAnnualSubscription(sub) && sub.status === 'active') {
        metrics.arr_gbp += getSubscriptionRevenue(sub);
      }
    });

    metrics.arr_gbp = Math.round(metrics.arr_gbp * 100) / 100;

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
    console.error('[stripe-metrics] Error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: 'Stripe metrics calculation failed'
    });
  }
};

// Export calculation function for direct use
module.exports.calculateStripeMetrics = calculateStripeMetrics;
