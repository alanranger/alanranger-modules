// Test if we can require and call the Stripe metrics function
require('dotenv').config({ path: '.env.local' });

const path = require('path');

// Test require from overview.js perspective
console.log('Testing require path from api/admin/overview.js perspective...');
console.log('Current dir:', __dirname);

// Simulate being in api/admin/overview.js
process.chdir(path.join(__dirname, 'api', 'admin'));

try {
  const stripeMetricsModule = require('../stripe/metrics');
  console.log('✓ Require successful');
  console.log('Exports:', Object.keys(stripeMetricsModule));
  console.log('calculateStripeMetrics type:', typeof stripeMetricsModule.calculateStripeMetrics);
  
  if (typeof stripeMetricsModule.calculateStripeMetrics === 'function') {
    console.log('✓ Function found, testing call...');
    // Don't actually call it (needs Stripe key), just verify it exists
    console.log('✓ Function is callable');
  } else {
    console.error('✗ calculateStripeMetrics is not a function');
  }
} catch (error) {
  console.error('✗ Require failed:', error.message);
  console.error('Stack:', error.stack);
}
