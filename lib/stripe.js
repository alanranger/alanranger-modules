// lib/stripe.js
// Stripe client initialization (server-side only)

const Stripe = require('stripe');

// Lazy initialization - check env var at runtime, not module load time
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }

  // Initialize Stripe client with API version
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
}

// Export a getter function instead of direct instance
// This allows the env var to be checked at runtime
module.exports = getStripe;
