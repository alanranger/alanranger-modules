// lib/academyStripeConfig.js
// Academy-specific Stripe configuration
// Filters all revenue/churn metrics to Academy products only

/**
 * Academy Annual Price IDs
 * Add new Academy price IDs here as you create new products/plans
 */
const ACADEMY_ANNUAL_PRICE_IDS = [
  'price_1Sie474mPKLoo2btIfTbxoxk' // Academy Annual Membership
];

/**
 * Academy Product IDs (optional fallback if needed)
 * Use if you need to filter by product instead of price
 */
const ACADEMY_PRODUCT_IDS = [
  // Add product IDs here if needed
];

/**
 * Check if an invoice contains Academy annual price IDs
 * @param {Object} invoice - Stripe invoice object
 * @returns {boolean}
 */
function isAcademyInvoice(invoice) {
  if (!invoice.lines?.data) return false;
  
  return invoice.lines.data.some(line => {
    const priceId = line.price?.id;
    return priceId && ACADEMY_ANNUAL_PRICE_IDS.includes(priceId);
  });
}

/**
 * Check if a subscription is an Academy annual subscription
 * @param {Object} subscription - Stripe subscription object
 * @returns {boolean}
 */
function isAcademyAnnualSubscription(subscription) {
  if (!subscription.items?.data) return false;
  
  return subscription.items.data.some(item => {
    const priceId = item.price?.id;
    const isAnnual = item.price?.recurring?.interval === 'year';
    return priceId && isAnnual && ACADEMY_ANNUAL_PRICE_IDS.includes(priceId);
  });
}

/**
 * Get Academy annual list price from Stripe
 * @param {Object} stripe - Stripe client instance
 * @returns {Promise<number>} Price in GBP (e.g., 79.00)
 */
async function getAcademyAnnualListPrice(stripe) {
  try {
    const price = await stripe.prices.retrieve(ACADEMY_ANNUAL_PRICE_IDS[0]);
    return (price.unit_amount || 0) / 100; // Convert from cents to GBP
  } catch (error) {
    console.warn('[academy-stripe-config] Failed to retrieve annual price, using default:', error.message);
    return 79.00; // Default fallback
  }
}

module.exports = {
  ACADEMY_ANNUAL_PRICE_IDS,
  ACADEMY_PRODUCT_IDS,
  isAcademyInvoice,
  isAcademyAnnualSubscription,
  getAcademyAnnualListPrice
};
