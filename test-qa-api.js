// test-qa-api.js
// End-to-end test for Q&A API endpoint
//
// Usage: node test-qa-api.js
//
// Requires env vars (or .env file):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - API_BASE_URL (optional, defaults to http://localhost:3000)

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Use native fetch (Node 18+) or node-fetch
let fetch;
if (typeof globalThis.fetch !== 'undefined') {
  fetch = globalThis.fetch;
} else {
  try {
    fetch = require('node-fetch');
  } catch (e) {
    console.error('❌ Error: fetch is not available.');
    console.error('   Node.js 18+ includes native fetch, or install: npm install node-fetch');
    process.exit(1);
  }
}

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
// Test both routes - flat route first (Vercel serverless), then nested (Next.js pages/api)
const FLAT_ROUTE = `${API_BASE}/api/academy-qa-questions`;
const NESTED_ROUTE = `${API_BASE}/api/academy/qa/questions`;
const API_URL = process.env.QA_API_URL || FLAT_ROUTE;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test configuration
const TEST_PAGE_URL = 'https://www.alanranger.com/test-qa-page';
const TEST_QUESTION = `Test question created at ${new Date().toISOString()}`;
const TEST_MEMBER_ID = 'test_member_' + Date.now();
const TEST_MEMBER_EMAIL = 'test@alanranger.com';
const TEST_MEMBER_NAME = 'Test User';

let testQuestionId = null;
let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m',  // Green
    error: '\x1b[31m',    // Red
    warning: '\x1b[33m',  // Yellow
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

async function testPostQuestion() {
  log('Testing POST /api/academy/qa/questions...', 'info');
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.alanranger.com'
      },
      body: JSON.stringify({
        page_url: TEST_PAGE_URL,
        question: TEST_QUESTION,
        member_id: TEST_MEMBER_ID,
        member_email: TEST_MEMBER_EMAIL,
        member_name: TEST_MEMBER_NAME
      })
    });

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      log(`Response was not JSON: ${text.substring(0, 200)}`, 'error');
      return false;
    }

    assert(response.ok, `POST request succeeded (status ${response.status})`);
    assert(response.status === 200, `POST returned 200 status`);
    
    if (!json.data) {
      log(`Response structure: ${JSON.stringify(json, null, 2)}`, 'error');
    }
    
    assert(json.data, 'Response contains data object');
    assert(json.data.id, 'Response contains question id');
    assert(json.data.question === TEST_QUESTION, 'Question text matches');
    assert(json.data.page_url === TEST_PAGE_URL, 'Page URL matches');
    assert(json.data.member_id === TEST_MEMBER_ID, 'Member ID matches');
    assert(json.data.member_email === TEST_MEMBER_EMAIL, 'Member email matches');
    assert(json.data.member_name === TEST_MEMBER_NAME, 'Member name matches');
    assert(json.data.created_at, 'Created timestamp exists');

    testQuestionId = json.data.id;
    log(`Created question with ID: ${testQuestionId}`, 'success');
    return true;
  } catch (error) {
    log(`POST request failed: ${error.message}`, 'error');
    console.error(error);
    return false;
  }
}

async function testGetQuestions() {
  log('Testing GET /api/academy/qa/questions...', 'info');
  
  try {
    const url = `${API_URL}?page_url=${encodeURIComponent(TEST_PAGE_URL)}&limit=25`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Origin': 'https://www.alanranger.com'
      }
    });

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      log(`Response was not JSON: ${text.substring(0, 200)}`, 'error');
      return false;
    }

    if (!response.ok) {
      log(`GET request failed with status ${response.status}: ${text.substring(0, 200)}`, 'error');
    }
    
    assert(response.ok, `GET request succeeded (status ${response.status})`);
    assert(response.status === 200, `GET returned 200 status`);
    
    if (!json.data) {
      log(`Response structure: ${JSON.stringify(json, null, 2)}`, 'error');
    }
    
    assert(json.data, 'Response contains data array');
    assert(Array.isArray(json.data), 'Data is an array');
    assert(json.data.length > 0, 'At least one question returned');
    
    // Find our test question
    const testQuestion = json.data.find(q => q.id === testQuestionId);
    assert(testQuestion, 'Test question found in results');
    if (testQuestion) {
      assert(testQuestion.question === TEST_QUESTION, 'Question text matches in GET');
      assert(testQuestion.page_url === TEST_PAGE_URL, 'Page URL matches in GET');
      assert(testQuestion.member_id === TEST_MEMBER_ID, 'Member ID matches in GET');
      assert(testQuestion.member_email === TEST_MEMBER_EMAIL, 'Member email matches in GET');
      assert(testQuestion.member_name === TEST_MEMBER_NAME, 'Member name matches in GET');
    }

    log(`Retrieved ${json.data.length} question(s)`, 'success');
    return true;
  } catch (error) {
    log(`GET request failed: ${error.message}`, 'error');
    console.error(error);
    return false;
  }
}

async function testOptionsPreflight() {
  log('Testing OPTIONS preflight request...', 'info');
  
  try {
    const response = await fetch(API_URL, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.alanranger.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    const statusOk = response.status === 204;
    assert(statusOk, `OPTIONS returned 204 status (got ${response.status})`);
    
    // Check CORS headers (case-insensitive)
    const headers = response.headers;
    const allowOrigin = headers.get('access-control-allow-origin') || headers.get('Access-Control-Allow-Origin');
    const allowMethods = headers.get('access-control-allow-methods') || headers.get('Access-Control-Allow-Methods');
    
    assert(allowOrigin, 'CORS header present');
    assert(allowMethods, 'CORS methods header present');
    assert(allowOrigin === 'https://www.alanranger.com', `CORS origin matches request origin (got: ${allowOrigin})`);

    log('OPTIONS preflight successful', 'success');
    return true;
  } catch (error) {
    log(`OPTIONS request failed: ${error.message}`, 'error');
    console.error(error);
    return false;
  }
}

async function testSupabaseDirect() {
  log('Testing direct Supabase connection...', 'info');
  
  try {
    if (!testQuestionId) {
      log('Skipping Supabase test - no question ID from POST test', 'warning');
      return false;
    }

    const { data, error } = await supabase
      .from('academy_qa_questions')
      .select('*')
      .eq('id', testQuestionId)
      .single();

    assert(!error, `Supabase query succeeded: ${error?.message || 'OK'}`);
    assert(data, 'Question found in Supabase');
    if (data) {
      assert(data.question === TEST_QUESTION, 'Question text matches in Supabase');
      assert(data.page_url === TEST_PAGE_URL, 'Page URL matches in Supabase');
      assert(data.member_id === TEST_MEMBER_ID, 'Member ID matches in Supabase');
      assert(data.member_email === TEST_MEMBER_EMAIL, 'Member email matches in Supabase');
      assert(data.member_name === TEST_MEMBER_NAME, 'Member name matches in Supabase');
      assert(data.created_at, 'Created timestamp exists in Supabase');
    }

    log('Supabase direct query successful', 'success');
    return true;
  } catch (error) {
    log(`Supabase test failed: ${error.message}`, 'error');
    console.error(error);
    return false;
  }
}

async function cleanup() {
  log('Cleaning up test data...', 'info');
  
  if (!testQuestionId) {
    log('No test question ID to clean up', 'warning');
    return;
  }

  try {
    const { error } = await supabase
      .from('academy_qa_questions')
      .delete()
      .eq('id', testQuestionId);

    if (error) {
      log(`Cleanup failed: ${error.message}`, 'warning');
    } else {
      log(`Deleted test question ${testQuestionId}`, 'success');
    }
  } catch (error) {
    log(`Cleanup error: ${error.message}`, 'warning');
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('Q&A API End-to-End Test Suite');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log(`Test Page URL: ${TEST_PAGE_URL}`);
  console.log('='.repeat(60) + '\n');

  // Check environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log('Missing required environment variables:', 'error');
    log('  - SUPABASE_URL', 'error');
    log('  - SUPABASE_SERVICE_ROLE_KEY', 'error');
    log('\nCreate a .env file or set these environment variables.', 'warning');
    process.exit(1);
  }

  // Check if API is accessible
  try {
    const healthCheck = await fetch(API_BASE);
    log(`API base URL accessible: ${API_BASE}`, 'success');
  } catch (error) {
    log(`API base URL not accessible: ${API_BASE}`, 'warning');
    log('Make sure your Next.js dev server is running (npm run dev)', 'warning');
    log('Or set API_BASE_URL to your Vercel deployment URL', 'warning');
  }

  // Run tests
  await testOptionsPreflight();
  await testPostQuestion();
  await testGetQuestions();
  await testSupabaseDirect();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  log(`Passed: ${testsPassed}`, 'success');
  log(`Failed: ${testsFailed}`, testsFailed > 0 ? 'error' : 'success');
  console.log('='.repeat(60) + '\n');

  // Cleanup
  await cleanup();

  // Exit with appropriate code
  process.exit(testsFailed > 0 ? 1 : 0);
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  log(`Unhandled rejection: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});

// Run tests
runTests().catch((error) => {
  log(`Test suite failed: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});
