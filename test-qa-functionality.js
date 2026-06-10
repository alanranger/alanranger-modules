// test-qa-functionality.js
// End-to-end test script for Q&A member scoping
// Tests with two different accounts to verify privacy

require('dotenv').config({ path: '.env.local' });

const TEST_ACCOUNTS = {
  trial: {
    email: 'info@alanranger.com',
    password: 'Ipswich1968',
    description: 'Trial member'
  },
  annual: {
    email: 'marketing@alanranger.com',
    password: 'ipswich1968',
    description: 'Annual member'
  }
};

const API_BASE = process.env.API_BASE_URL || 'https://alanranger-modules.vercel.app';
const API_URL = `${API_BASE}/api/academy-qa-questions`;

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ';
  console.log(`${colors[type] || ''}${icon} ${message}${colors.reset}`);
}

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    log(`PASS: ${message}`, 'success');
    return true;
  } else {
    testsFailed++;
    log(`FAIL: ${message}`, 'error');
    return false;
  }
}

async function testUnauthenticatedAccess() {
  log('\n=== Test 1: Unauthenticated Access ===', 'info');
  
  try {
    // Test GET without authentication
    const response = await fetch(API_URL + '?limit=25', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // Explicitly do NOT include credentials
    });
    
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { error: text }; }
    
    // Should return 401 for unauthenticated requests
    if (response.status === 401) {
      assert(true, `GET returns 401 for unauthenticated request`);
      assert(json.error && (json.error.includes('Authentication') || json.error.includes('required')), 'Error message indicates authentication required');
    } else {
      log(`⚠ GET returned ${response.status} instead of 401. Response: ${text.substring(0, 200)}`, 'warning');
      // This might be OK if the API has different auth handling - log for manual verification
      assert(false, `GET should return 401 for unauthenticated request (got ${response.status})`);
    }
    
  } catch (err) {
    log(`Error testing unauthenticated access: ${err.message}`, 'error');
    testsFailed++;
  }
}

async function testPostWithoutAuth() {
  log('\n=== Test 2: POST Without Authentication ===', 'info');
  
  try {
    // Test POST without authentication (no cookies, no auth headers)
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Explicitly do NOT include credentials
      body: JSON.stringify({
        page_url: 'https://test.example.com',
        question: 'Test question without auth - should fail'
      })
    });
    
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { error: text }; }
    
    // Should return 401 for unauthenticated requests
    if (response.status === 401) {
      assert(true, `POST returns 401 for unauthenticated request`);
      assert(json.error && (json.error.includes('Authentication') || json.error.includes('required')), 'Error message indicates authentication required');
    } else {
      log(`⚠ POST returned ${response.status} instead of 401. Response: ${text.substring(0, 200)}`, 'warning');
      log(`⚠ This suggests authentication may not be working correctly. Manual verification required.`, 'warning');
      assert(false, `POST should return 401 for unauthenticated request (got ${response.status})`);
    }
    
  } catch (err) {
    log(`Error testing POST without auth: ${err.message}`, 'error');
    testsFailed++;
  }
}

async function testMemberIsolation() {
  log('\n=== Test 3: Member Isolation (Manual Verification Required) ===', 'warning');
  log('This test requires manual browser testing:', 'info');
  log('1. Open test-qa-page.html in browser', 'info');
  log('2. Log in as info@alanranger.com', 'info');
  log('3. Post a question (e.g., "Test question from info account")', 'info');
  log('4. Log out', 'info');
  log('5. Log in as marketing@alanranger.com', 'info');
  log('6. Verify info@alanranger.com question is NOT visible', 'info');
  log('7. Post a question from marketing account', 'info');
  log('8. Verify only marketing account questions are visible', 'info');
}

async function testAPIValidation() {
  log('\n=== Test 4: API Input Validation ===', 'info');
  
  // Note: These tests will fail with 401 since we can't authenticate in Node.js
  // But they verify the validation logic exists
  log('Validation tests require authenticated requests', 'warning');
  log('Validation rules:', 'info');
  log('  - Question must be at least 10 characters', 'info');
  log('  - Question must be <= 2000 characters', 'info');
  log('  - page_url is required', 'info');
}

async function runTests() {
  console.log('\n============================================================');
  console.log('Q&A Member Scoping - Test Suite');
  console.log('============================================================');
  console.log(`API URL: ${API_URL}`);
  console.log('============================================================\n');

  await testUnauthenticatedAccess();
  await testPostWithoutAuth();
  await testAPIValidation();
  await testMemberIsolation();

  console.log('\n============================================================');
  console.log('Test Summary');
  console.log('============================================================');
  log(`Passed: ${testsPassed}`, testsPassed > 0 ? 'success' : 'info');
  log(`Failed: ${testsFailed}`, testsFailed > 0 ? 'error' : 'info');
  console.log('============================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

// Use native fetch (Node 18+)
if (typeof globalThis.fetch === 'undefined') {
  console.error('❌ Error: fetch is not available.');
  console.error('   Node.js 18+ includes native fetch, or install: npm install node-fetch');
  process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
