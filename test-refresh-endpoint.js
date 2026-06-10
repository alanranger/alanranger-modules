// Test script to verify refresh endpoint works locally
// Run: node test-refresh-endpoint.js

require('dotenv').config({ path: '.env.local' });
const http = require('http');

const PORT = process.env.PORT || 3000;
const ENDPOINT = `http://localhost:${PORT}/api/admin/refresh`;

async function testEndpoint() {
  console.log('🧪 Testing refresh endpoint locally...\n');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Method: POST\n`);

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({});
    
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/refresh',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('\nResponse:', JSON.stringify(json, null, 2));
          
          if (res.statusCode === 200) {
            console.log('\n✅ Endpoint works!');
            resolve(json);
          } else {
            console.log(`\n❌ Endpoint returned ${res.statusCode}`);
            reject(new Error(`HTTP ${res.statusCode}: ${json.error || data}`));
          }
        } catch (e) {
          console.log('\nResponse (raw):', data);
          if (res.statusCode === 200) {
            console.log('\n✅ Endpoint works!');
            resolve(data);
          } else {
            console.log(`\n❌ Endpoint returned ${res.statusCode}`);
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on('error', (e) => {
      console.error(`\n❌ Request error: ${e.message}`);
      console.error('\n💡 Make sure Next.js dev server is running:');
      console.error('   npm run dev');
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// Check if server is running first
const checkServer = http.get(`http://localhost:${PORT}/api/admin/refresh-test`, (res) => {
  console.log('✅ Server is running\n');
  testEndpoint().catch(console.error);
});

checkServer.on('error', (e) => {
  console.error(`\n❌ Cannot connect to server on port ${PORT}`);
  console.error('💡 Start the Next.js dev server first:');
  console.error('   cd "G:\\Dropbox\\alan ranger photography\\Website Code\\Academy\\alanranger-academy-assesment"');
  console.error('   npm run dev');
  process.exit(1);
});
