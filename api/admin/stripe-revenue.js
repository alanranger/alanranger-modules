// /api/admin/stripe-revenue.js
// Returns Stripe revenue summary for Academy price IDs
// Source of truth for revenue metrics

const Stripe = require('stripe');

// Shared function to calculate Stripe revenue (can be called directly or via API)
async function calculateStripeRevenue() {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.warn('[stripe-revenue] STRIPE_SECRET_KEY not set, returning null revenue');
      return {
        stripeRevenueSummary: null,
        revenueSeries30d: [],
        error: 'Stripe not configured'
      };
    }

    const stripe = new Stripe(stripeSecretKey);

    // Academy price IDs
    const ACADEMY_PRICE_IDS = [
      'prc_annual-membership-jj7y0h89', // Annual membership
      'prc_30-day-free-trial-mg18p0u9z' // Trial (usually £0, but include for completeness)
    ];

    const now = new Date();
    const periods = {
      allTime: null, // No start date
      last7d: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      last30d: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      last90d: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    };

    // Helper to convert Stripe amount (in cents) to major units (pounds)
    const centsToPounds = (cents) => cents ? (cents / 100).toFixed(2) : 0;

    // Helper to fetch all invoices with pagination
    const fetchAllInvoices = async (createdAfter = null) => {
      const invoices = [];
      let hasMore = true;
      let startingAfter = null;

      while (hasMore) {
        const params = {
          limit: 100,
          status: 'paid',
          expand: ['data.lines.data.price']
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

    // Fetch all paid invoices
    const allInvoices = await fetchAllInvoices();

    // Filter to Academy price IDs
    const filterAcademyInvoices = (invoices, createdAfter = null) => {
      return invoices.filter(invoice => {
        // Check created date if filter provided
        if (createdAfter) {
          const created = new Date(invoice.created * 1000);
          if (created < createdAfter) return false;
        }

        // Check if any line item matches Academy price IDs
        const lines = invoice.lines?.data || [];
        return lines.some(line => {
          const priceId = line.price?.id;
          return priceId && ACADEMY_PRICE_IDS.includes(priceId);
        });
      });
    };

    // Calculate revenue for a period
    const calculateRevenue = (invoices) => {
      let gross = 0;
      let refunds = 0;
      let paidCount = 0;

      invoices.forEach(invoice => {
        const lines = invoice.lines?.data || [];
        const hasAcademyPrice = lines.some(line => {
          const priceId = line.price?.id;
          return priceId && ACADEMY_PRICE_IDS.includes(priceId);
        });

        if (hasAcademyPrice) {
          // Amount paid (in cents)
          const amountPaid = invoice.amount_paid || 0;
          gross += amountPaid;
          paidCount++;

          // Refunds (in cents)
          if (invoice.amount_refunded) {
            refunds += invoice.amount_refunded;
          }
        }
      });

      return {
        gross: parseFloat(centsToPounds(gross)),
        refunds: parseFloat(centsToPounds(refunds)),
        net: parseFloat(centsToPounds(gross - refunds)),
        paidCount
      };
    };

    // Calculate revenue for each period
    const allTimeInvoices = filterAcademyInvoices(allInvoices);
    const last7dInvoices = filterAcademyInvoices(allInvoices, periods.last7d);
    const last30dInvoices = filterAcademyInvoices(allInvoices, periods.last30d);
    const last90dInvoices = filterAcademyInvoices(allInvoices, periods.last90d);

    const allTime = calculateRevenue(allTimeInvoices);
    const last7d = calculateRevenue(last7dInvoices);
    const last30d = calculateRevenue(last30dInvoices);
    const last90d = calculateRevenue(last90dInvoices);

    // Generate revenue series for last 30d (for sparkline)
    const revenueSeries30d = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const dayInvoices = allInvoices.filter(inv => {
        const created = new Date(inv.created * 1000);
        return created >= start && created <= end;
      });
      const dayFiltered = filterAcademyInvoices(dayInvoices);
      const dayRevenue = calculateRevenue(dayFiltered);
      revenueSeries30d.push({
        date: dateStr,
        net: dayRevenue.net
      });
    }

    return {
      stripeRevenueSummary: {
        currency: 'gbp',
        allTime,
        last7d,
        last30d,
        last90d
      },
      revenueSeries30d
    };

  } catch (error) {
    console.error('[stripe-revenue] Error:', error);
    // Return null revenue on error (don't break the dashboard)
    return {
      stripeRevenueSummary: null,
      revenueSeries30d: [],
      error: error.message
    };
  }
}

// Export API route handler
const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const result = await calculateStripeRevenue();
  return res.status(200).json(result);
};

// Export both the handler and the function
handler.calculateStripeRevenue = calculateStripeRevenue;
module.exports = handler;
