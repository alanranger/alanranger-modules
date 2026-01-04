// test-memberstack-connection.js
// Test script to verify Memberstack Admin API connectivity
// Run: node test-memberstack-connection.js
// Make sure you have a .env.local file with the required variables

// Try to load dotenv if available, otherwise use process.env directly
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not installed, use process.env directly
  console.log('Note: dotenv not found, using process.env directly\n');
}
const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");

async function testConnection() {
  console.log('🔍 Testing Memberstack and Supabase connections...\n');

  // Check environment variables
  const memberstackKey = process.env.MEMBERSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('Environment Variables:');
  console.log(`  MEMBERSTACK_SECRET_KEY: ${memberstackKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? '✅ Set' : '❌ Missing'}\n`);

  if (!memberstackKey || !supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables!');
    console.error('Create a .env.local file with:');
    console.error('  MEMBERSTACK_SECRET_KEY=sk_live_...');
    console.error('  SUPABASE_URL=https://...');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJ...');
    process.exit(1);
  }

  // Test Memberstack connection
  console.log('📡 Testing Memberstack API...');
  try {
    const memberstack = memberstackAdmin.init(memberstackKey);
    
    const { data: members, error: membersError } = await memberstack.members.list({ limit: 5 });
    
    if (membersError) {
      console.error('❌ Memberstack API Error:', membersError);
      throw membersError;
    }

    console.log(`✅ Memberstack connected! Found ${members?.length || 0} members (first page, limit 5)\n`);

    if (members && members.length > 0) {
      console.log('Sample member:');
      const sample = members[0];
      console.log(`  ID: ${sample.id}`);
      console.log(`  Email: ${sample.auth?.email || 'N/A'}`);
      console.log(`  Status: ${sample.status || 'N/A'}`);
      console.log(`  Plan Connections: ${sample.planConnections?.length || 0}\n`);

      // Test retrieving full member
      console.log('📥 Testing members.retrieve()...');
      const { data: fullMember, error: retrieveError } = await memberstack.members.retrieve({ id: sample.id });
      
      if (retrieveError) {
        console.error('❌ Error retrieving member:', retrieveError);
      } else {
        console.log('✅ Member retrieved successfully!');
        console.log(`  Has JSON field: ${fullMember?.json ? '✅' : '❌'}`);
        console.log(`  Has arAcademy: ${fullMember?.json?.arAcademy ? '✅' : '❌'}`);
        console.log(`  Has modules.opened: ${fullMember?.json?.arAcademy?.modules?.opened ? '✅' : '❌'}`);
        
        if (fullMember?.json?.arAcademy?.modules?.opened) {
          const openedCount = Object.keys(fullMember.json.arAcademy.modules.opened).length;
          console.log(`  Opened modules count: ${openedCount}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Memberstack connection failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }

  // Test Supabase connection
  console.log('\n🗄️  Testing Supabase connection...');
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('ms_members_cache')
      .select('count', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Supabase Error:', error);
      throw error;
    }

    console.log('✅ Supabase connected!');
    console.log(`  ms_members_cache table exists and is accessible\n`);
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    process.exit(1);
  }

  console.log('✅ All connections successful!');
  console.log('\n💡 If the refresh endpoint still fails, check:');
  console.log('  1. The route is at pages/api/admin/refresh.js');
  console.log('  2. Next.js is recognizing it (check build logs)');
  console.log('  3. No conflicting routes in api/ directory');
}

testConnection().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
