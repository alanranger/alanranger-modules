// test-qa-comprehensive.js
// Comprehensive test suite for Q&A API member scoping
// Tests both unauthenticated and validates API structure

require('dotenv').config({ path: '.env.local' });

const API_BASE = process.env.API_BASE_URL || 'https://alanranger-modules.vercel.app';
const API_URL = `${API_BASE}/api/academy-qa-questions`;

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

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
    testResults.push({ status: 'PASS', message });
    log(`PASS: ${message}`, 'success');
    return true;
  } else {
    testsFailed++;
    testResults.push({ status: 'FAIL', message });
    log(`FAIL: ${message}`, 'error');
    return false;
  }
}

async function testUnauthenticatedGET() {
  log('\n=== Test 1: GET Without Authentication ===', 'info');
  
  try {
    const response = await fetch(API_URL + '?limit=25', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { error: text }; }
    
    assert(response.status === 401, `GET returns 401 (got ${response.status})`);
    assert(json.error && (json.error.includes('Authentication') || json.error.includes('required')), 
      `Error message indicates auth required: "${json.error}"`);
    
    return { status: response.status, error: json.error };
  } catch (err) {
    log(`Error: ${err.message}`, 'error');
    testsFailed++;
    return null;
  }
}

async function testUnauthenticatedPOST() {
  log('\n=== Test 2: POST Without Authentication ===', 'info');
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_url: 'https://test.example.com',
        question: 'Test question without authentication'
      })
    });
    
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { error: text }; }
    
    assert(response.status === 401, `POST returns 401 (got ${response.status})`);
    assert(json.error && (json.error.includes('Authentication') || json.error.includes('required')), 
      `Error message indicates auth required: "${json.error}"`);
    
    return { status: response.status, error: json.error };
  } catch (err) {
    log(`Error: ${err.message}`, 'error');
    testsFailed++;
    return null;
  }
}

async function testOPTIONSPreflight() {
  log('\n=== Test 3: OPTIONS Preflight (CORS) ===', 'info');
  
  try {
    const response = await fetch(API_URL, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.alanranger.com',
        'Access-Control-Request-Method': 'GET'
      }
    });
    
    assert(response.status === 204, `OPTIONS returns 204 (got ${response.status})`);
    
    const corsHeader = response.headers.get('Access-Control-Allow-Origin');
    assert(corsHeader !== null, 'CORS header is present');
    
    return { status: response.status, corsHeader };
  } catch (err) {
    log(`Error: ${err.message}`, 'error');
    testsFailed++;
    return null;
  }
}

async function testAPIStructure() {
  log('\n=== Test 4: API Structure Validation ===', 'info');
  
  // Verify API endpoint exists and responds
  try {
    const response = await fetch(API_URL + '?limit=25', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    assert(response.status !== 404, 'API endpoint exists (not 404)');
    assert(response.status !== 500, 'API endpoint is functional (not 500)');
    
    log('API endpoint is accessible', 'success');
    return true;
  } catch (err) {
    log(`Error: ${err.message}`, 'error');
    testsFailed++;
    return false;
  }
}

async function checkDatabaseSchema() {
  log('\n=== Test 5: Database Schema Check ===', 'info');
  
  // This would require Supabase access - for now just log
  log('Database schema verification requires Supabase access', 'warning');
  log('Expected fields: id, member_id, question, status, ai_answer, ai_answered_at, created_at', 'info');
  return true;
}

async function generateTestReport() {
  log('\n=== Test Report ===', 'info');
  log(`Total Tests: ${testsPassed + testsFailed}`, 'info');
  log(`Passed: ${testsPassed}`, testsPassed > 0 ? 'success' : 'info');
  log(`Failed: ${testsFailed}`, testsFailed > 0 ? 'error' : 'info');
  
  if (testsFailed === 0) {
    log('\n✅ All automated tests passed!', 'success');
    log('⚠️  Member isolation testing requires manual browser testing with actual Memberstack sessions', 'warning');
    log('   See TESTING_INSTRUCTIONS.md for manual test steps', 'info');
  }
}

async function runAllTests() {
  console.log('\n============================================================');
  console.log('Q&A API - Comprehensive Test Suite');
  console.log('============================================================');
  console.log(`API URL: ${API_URL}`);
  console.log('============================================================\n');

  await testAPIStructure();
  await testOPTIONSPreflight();
  await testUnauthenticatedGET();
  await testUnauthenticatedPOST();
  await checkDatabaseSchema();
  
  await generateTestReport();
  
  console.log('\n============================================================\n');
  
  return testsFailed === 0;
}

// Use native fetch (Node 18+)
if (typeof globalThis.fetch === 'undefined') {
  console.error('❌ Error: fetch is not available.');
  console.error('   Node.js 18+ includes native fetch, or install: npm install node-fetch');
  process.exit(1);
}

runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
