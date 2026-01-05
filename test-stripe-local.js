// Test Stripe initialization locally
require('dotenv').config({ path: '.env.local' });

const path = require('path');

console.log('Testing Stripe initialization...');
console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
console.log('STRIPE_SECRET_KEY length:', process.env.STRIPE_SECRET_KEY?.length || 0);
console.log('STRIPE_SECRET_KEY starts with sk_:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_') || false);

try {
  // Test the same require path as the API
  const stripePath = path.join(process.cwd(), 'lib', 'stripe');
  console.log('Requiring from:', stripePath);
  const getStripe = require(stripePath);
  console.log('getStripe type:', typeof getStripe);
  
  if (typeof getStripe !== 'function') {
    throw new Error('getStripe is not a function');
  }
  
  const stripe = getStripe();
  console.log('Stripe client type:', typeof stripe);
  console.log('Stripe client has subscriptions:', !!stripe.subscriptions);
  console.log('Stripe subscriptions.list type:', typeof stripe.subscriptions?.list);
  
  if (!stripe.subscriptions || typeof stripe.subscriptions.list !== 'function') {
    throw new Error('Stripe client is not properly initialized');
  }
  
  console.log('✅ Stripe client initialized successfully!');
  console.log('Testing subscriptions.list()...');
  
  // Test a simple API call
  stripe.subscriptions.list({ limit: 1 })
    .then(result => {
      console.log('✅ API call successful! Found', result.data.length, 'subscription(s)');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ API call failed:', err.message);
      process.exit(1);
    });
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
