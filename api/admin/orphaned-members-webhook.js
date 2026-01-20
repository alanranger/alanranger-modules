// API endpoint to identify orphaned members and send to Zapier
// This endpoint identifies members without plans (but doesn't delete them)
// Designed to be called by Zapier every 2 hours to email orphaned members
// Returns list of orphaned members that can be sent to Zapier webhook

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Get Memberstack key from environment
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;

if (!MEMBERSTACK_SECRET_KEY) {
  console.error("Error: MEMBERSTACK_SECRET_KEY must be set in environment variables");
}

const memberstack = memberstackAdmin.init(MEMBERSTACK_SECRET_KEY);

async function getOrphanedMembers() {
  const orphanedMembers = [];
  const now = new Date();

  try {
    // Step 1: Get all members from Memberstack
    console.log("[orphaned-webhook] Fetching all members from Memberstack...");
    const memberstackMembers = [];
    let after = null;
    const limit = 100;
    let totalFetched = 0;

    while (true) {
      try {
        const params = { limit };
        if (after) params.after = after;

        const { data: members, error: listError } = await memberstack.members.list(params);

        if (listError) {
          console.error("[orphaned-webhook] Error listing members:", listError);
          break;
        }

        if (!members || members.length === 0) {
          break;
        }

        memberstackMembers.push(...members);
        totalFetched += members.length;
        console.log(`[orphaned-webhook] Fetched ${totalFetched} members...`);

        if (members.length < limit) {
          break;
        }

        after = members[members.length - 1]?.id || null;
        if (!after) break;
      } catch (error) {
        console.error("[orphaned-webhook] Error fetching from Memberstack:", error.message);
        break;
      }
    }

    console.log(`[orphaned-webhook] Found ${memberstackMembers.length} total members in Memberstack`);

    // Step 2: Identify members without plans and filter by timing
    console.log("[orphaned-webhook] Identifying members without plans...");
    for (const member of memberstackMembers) {
      const email = member.auth?.email || member.email || "";
      const memberId = member.id;
      const name = member.name || "N/A";
      const createdAt = member.createdAt ? new Date(member.createdAt) : null;
      
      // Check if member has any active plans
      const hasActivePlan = member.planConnections && 
        Array.isArray(member.planConnections) && 
        member.planConnections.length > 0 &&
        member.planConnections.some(plan => {
          const status = (plan.status || "").toUpperCase();
          return status === "ACTIVE" || status === "TRIALING";
        });

      if (!hasActivePlan && email) {
        // Only include members created more than 2 hours ago
        // This prevents emailing immediately after signup
        // Cleanup runs every 8 hours, so this gives them time to complete signup
        const hoursSinceCreation = createdAt 
          ? (now - createdAt) / (1000 * 60 * 60)
          : 999; // If no creation date, include them (edge case)
        
        // Only email if account was created 2+ hours ago
        // This ensures we don't email immediately and gives them time to complete signup
        if (hoursSinceCreation >= 2) {
          orphanedMembers.push({
            member_id: memberId,
            email: email,
            name: name,
            created_at: member.createdAt || null,
            last_login: member.lastLoginAt || null,
            hours_since_creation: Math.round(hoursSinceCreation * 10) / 10
          });
        } else {
          console.log(`[orphaned-webhook] Skipping ${email} - created ${Math.round(hoursSinceCreation * 10) / 10} hours ago (too recent)`);
        }
      }
    }

    console.log(`[orphaned-webhook] Found ${orphanedMembers.length} orphaned members (no active plans, created 2+ hours ago)`);

    return orphanedMembers;

  } catch (error) {
    console.error("[orphaned-webhook] Fatal error:", error);
    throw error;
  }
}

module.exports = async (req, res) => {
  // Allow GET and POST requests
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Optional: Add a secret token for security
  const webhookSecret = process.env.ORPHANED_WEBHOOK_SECRET;
  const providedSecret = req.query.secret || req.headers["x-webhook-secret"];

  if (webhookSecret && providedSecret !== webhookSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log(`[orphaned-webhook] Request received at ${new Date().toISOString()}`);

    const orphanedMembers = await getOrphanedMembers();

    // Extract emails for Gmail BCC field (comma-separated)
    const emails = orphanedMembers.map(m => m.email).filter(Boolean);
    const emailsBcc = emails.join(", ");

    // Return data in multiple formats for Zapier/Gmail compatibility
    // Format 1: Array of email strings (for looping)
    // Format 2: Comma-separated string (for Gmail BCC field)
    // Format 3: Full member details (for reference)
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      count: orphanedMembers.length,
      // Simple array of emails - Gmail can use this directly
      emails: emails,
      // Comma-separated emails for Gmail BCC field
      emails_bcc: emailsBcc,
      // Full member details for reference
      orphaned_members: orphanedMembers
    });

  } catch (error) {
    console.error(`[orphaned-webhook] Failed:`, error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
