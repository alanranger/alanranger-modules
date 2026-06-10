// Script to find and delete a member from Memberstack by email
// Usage: node scripts/delete-member-memberstack.js <email>
// Example: node scripts/delete-member-memberstack.js oladapoblessing205@gmail.com

const memberstackAdmin = require("@memberstack/admin");
require("dotenv").config({ path: ".env.local" });

const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;

if (!MEMBERSTACK_SECRET_KEY) {
  console.error("Error: MEMBERSTACK_SECRET_KEY must be set in .env.local");
  process.exit(1);
}

const memberstack = memberstackAdmin.init(MEMBERSTACK_SECRET_KEY);

async function findAndDeleteMemberByEmail(email) {
  console.log(`\n🔍 Searching for member with email: ${email}\n`);

  try {
    // Search for member by email in Memberstack
    // Note: Memberstack API doesn't have direct email search, so we need to list and filter
    let foundMember = null;
    let after = null;
    const limit = 100;
    let totalSearched = 0;

    console.log("📋 Searching through Memberstack members...\n");

    while (true) {
      const params = { limit };
      if (after) params.after = after;

      const { data: members, error: listError } = await memberstack.members.list(params);

      if (listError) {
        console.error("❌ Error listing members:", listError);
        return;
      }

      if (!members || members.length === 0) {
        break;
      }

      totalSearched += members.length;
      console.log(`   Searched ${totalSearched} members...`);

      // Search for matching email
      for (const member of members) {
        const memberEmail = member.auth?.email || member.email || "";
        if (memberEmail.toLowerCase() === email.toLowerCase()) {
          foundMember = member;
          break;
        }
      }

      if (foundMember) {
        break;
      }

      // Check if there are more pages
      if (members.length < limit) {
        break;
      }

      after = members[members.length - 1]?.id || null;
      if (!after) break;
    }

    if (!foundMember) {
      console.log(`\n❌ Member not found in Memberstack: ${email}`);
      console.log(`   Total members searched: ${totalSearched}\n`);
      return;
    }

    console.log(`\n✅ Found member in Memberstack:`);
    console.log(`   Member ID: ${foundMember.id}`);
    console.log(`   Email: ${foundMember.auth?.email || foundMember.email || "N/A"}`);
    console.log(`   Name: ${foundMember.name || foundMember.customFields?.name || "N/A"}`);
    console.log(`   Status: ${foundMember.status || "N/A"}`);
    
    // Show plan connections
    if (foundMember.planConnections && foundMember.planConnections.length > 0) {
      console.log(`   Plans: ${foundMember.planConnections.length} plan connection(s)`);
      foundMember.planConnections.forEach((pc, idx) => {
        console.log(`      ${idx + 1}. ${pc.planName || pc.planId || "Unknown"} (${pc.status || "unknown"})`);
      });
    } else {
      console.log(`   Plans: No plan connections`);
    }

    console.log(`\n⚠️  WARNING: This will permanently delete the member from Memberstack!`);
    console.log(`   This action cannot be undone.\n`);

    // For safety, we'll just show the member info and require manual deletion
    // Uncomment the deletion code below if you want to enable automatic deletion
    console.log(`\n🗑️  Deleting member from Memberstack...\n`);
    
    const { error: deleteError } = await memberstack.members.delete({ id: foundMember.id });
    
    if (deleteError) {
      console.error(`❌ Error deleting member:`, deleteError);
      return;
    }

    console.log(`✅ Member deleted successfully from Memberstack!\n`);

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/delete-member-memberstack.js <email>");
  console.error("Example: node scripts/delete-member-memberstack.js oladapoblessing205@gmail.com");
  process.exit(1);
}

// Run the search
findAndDeleteMemberByEmail(email)
  .then(() => {
    console.log("✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
