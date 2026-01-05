// lib/stripe.js
// Stripe client initialization (server-side only)

const Stripe = require('stripe');

// Lazy initialization - check env var at runtime, not module load time
function getStripe() {
  // Debug: Log what env vars are available (without exposing secrets)
  const envKeys = Object.keys(process.env).filter(k => k.includes('STRIPE'));
  console.log('[stripe-init] Available Stripe-related env vars:', envKeys);
  console.log('[stripe-init] STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
  console.log('[stripe-init] STRIPE_SECRET_KEY length:', process.env.STRIPE_SECRET_KEY?.length || 0);
  console.log('[stripe-init] STRIPE_SECRET_KEY starts with sk_:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_') || false);
  
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('STRIPE_SECRET_KEY environment variable is required');
    error.debugInfo = {
      availableEnvVars: envKeys,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL ? 'yes' : 'no'
    };
    throw error;
  }

  // Initialize Stripe client with API version
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
}

// Export a getter function instead of direct instance
// This allows the env var to be checked at runtime
module.exports = getStripe;
