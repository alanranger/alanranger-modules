// API endpoint to identify orphaned members and send emails directly
// This endpoint identifies members without plans and emails them automatically
// Designed to be called by Zapier every 2 hours (2-step Zap: Schedule → Webhook)
// Handles both finding orphaned members AND sending emails (no Gmail step needed)

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");
const nodemailer = require("nodemailer");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Get Memberstack key from environment
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;

if (!MEMBERSTACK_SECRET_KEY) {
  console.error("Error: MEMBERSTACK_SECRET_KEY must be set in environment variables");
}

const memberstack = memberstackAdmin.init(MEMBERSTACK_SECRET_KEY);

// Email configuration from environment variables
const EMAIL_FROM = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
const EMAIL_SMTP_HOST = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
const EMAIL_SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || "587");

// Create email transporter
let emailTransporter = null;
if (EMAIL_FROM && EMAIL_PASSWORD) {
  emailTransporter = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    secure: EMAIL_SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: EMAIL_FROM,
      pass: EMAIL_PASSWORD
    }
  });
}

async function sendEmailToOrphanedMember(member) {
  if (!emailTransporter) {
    console.warn("[orphaned-webhook] Email not configured - skipping email send");
    return { sent: false, error: "Email not configured" };
  }

  const emailSubject = "Complete Your Academy Signup - Action Required";
  const emailBody = `
Hi ${member.name || "there"},

We noticed you started creating an account with Alan Ranger Photography Academy but didn't complete the checkout process.

Your Memberstack account was created, but no subscription plan was attached. To access the Academy content, you'll need to complete the signup process.

**What you need to do:**
1. Visit the Academy signup page
2. Complete the checkout process to select a trial or annual plan
3. Once complete, you'll have full access to all Academy content

**Important:** If you don't complete your signup within 8 hours of account creation, your account will be automatically removed.

If you have any questions or need help, please contact us.

Best regards,
Alan Ranger Photography Academy

---
This is an automated message. Your account was created ${member.hours_since_creation || "recently"} hours ago.
  `.trim();

  try {
    const info = await emailTransporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
      to: member.email,
      bcc: "info@alanranger.com", // BCC so you get notified of all emails sent
      subject: emailSubject,
      text: emailBody,
      html: emailBody.replace(/\n/g, "<br>")
    });

    console.log(`[orphaned-webhook] Email sent to ${member.email}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[orphaned-webhook] Error sending email to ${member.email}:`, error.message);
    return { sent: false, error: error.message };
  }
}

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
      // Members without plans will have planConnections as null, undefined, or empty array
      let hasActivePlan = false;
      
      // Check planConnections field (primary check)
      if (member.planConnections) {
        if (Array.isArray(member.planConnections)) {
          // Standard array format - check if any plan is ACTIVE or TRIALING
          hasActivePlan = member.planConnections.length > 0 &&
            member.planConnections.some(plan => {
              const status = (plan?.status || plan.status || "").toUpperCase();
              return status === "ACTIVE" || status === "TRIALING";
            });
        } else if (typeof member.planConnections === 'object') {
          // Might be an object with nested structure
          const connections = member.planConnections.data || member.planConnections.items || [];
          hasActivePlan = Array.isArray(connections) && connections.length > 0 &&
            connections.some(plan => {
              const status = (plan?.status || plan.status || "").toUpperCase();
              return status === "ACTIVE" || status === "TRIALING";
            });
        }
      }
      
      // Also check if member has plans in other possible fields
      if (!hasActivePlan && member.plans) {
        const plans = Array.isArray(member.plans) ? member.plans : [];
        hasActivePlan = plans.length > 0 && plans.some(plan => {
          const status = (plan?.status || plan.status || "").toUpperCase();
          return status === "ACTIVE" || status === "TRIALING";
        });
      }
      
      // If planConnections is null/undefined/empty, member has no active plan
      // This is the key check for orphaned members

      if (!hasActivePlan && email) {
        // Only include members created more than 2 hours ago
        // This prevents emailing immediately after signup
        // Cleanup runs every 8 hours, so this gives them time to complete signup
        const hoursSinceCreation = createdAt 
          ? (now - createdAt) / (1000 * 60 * 60)
          : 999; // If no creation date, include them (edge case)
        
        // Debug logging
        console.log(`[orphaned-webhook] Member ${email}: hasActivePlan=${hasActivePlan}, hoursSinceCreation=${Math.round(hoursSinceCreation * 10) / 10}, createdAt=${member.createdAt}`);
        
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
          console.log(`[orphaned-webhook] ✅ Added orphaned member: ${email} (${Math.round(hoursSinceCreation * 10) / 10} hours old)`);
        } else {
          console.log(`[orphaned-webhook] ⏳ Skipping ${email} - created ${Math.round(hoursSinceCreation * 10) / 10} hours ago (too recent, need 2+ hours)`);
        }
      } else if (!hasActivePlan && !email) {
        console.log(`[orphaned-webhook] ⚠️ Member ${memberId} has no active plan but also no email - skipping`);
      }
    }

    console.log(`[orphaned-webhook] Found ${orphanedMembers.length} orphaned members (no active plans, created 2+ hours ago)`);
    
    // Debug: Log all members without plans (regardless of timing)
    const allMembersWithoutPlans = memberstackMembers.filter(m => {
      const hasActivePlan = m.planConnections && 
        Array.isArray(m.planConnections) && 
        m.planConnections.length > 0 &&
        m.planConnections.some(plan => {
          const status = (plan.status || "").toUpperCase();
          return status === "ACTIVE" || status === "TRIALING";
        });
      return !hasActivePlan && (m.auth?.email || m.email);
    });
    console.log(`[orphaned-webhook] Total members without plans (all ages): ${allMembersWithoutPlans.length}`);
    allMembersWithoutPlans.forEach(m => {
      const email = m.auth?.email || m.email || "";
      const createdAt = m.createdAt ? new Date(m.createdAt) : null;
      const hoursSinceCreation = createdAt ? (now - createdAt) / (1000 * 60 * 60) : 999;
      console.log(`[orphaned-webhook]   - ${email}: ${Math.round(hoursSinceCreation * 10) / 10} hours old`);
    });

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
  // Only enforce if secret is set AND a secret is provided
  // If no secret is set, allow access (for easier Zapier setup)
  const webhookSecret = process.env.ORPHANED_WEBHOOK_SECRET;
  const providedSecret = req.query.secret || req.headers["x-webhook-secret"];

  // Only check secret if BOTH are present (secret is configured AND provided)
  // This allows the endpoint to work without a secret if not configured
  if (webhookSecret && providedSecret && providedSecret !== webhookSecret) {
    console.log("[orphaned-webhook] Invalid webhook secret provided");
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // If secret is configured but not provided, warn but allow (for Zapier compatibility)
  // You can enforce this by uncommenting the return below
  if (webhookSecret && !providedSecret) {
    console.warn("[orphaned-webhook] Webhook secret configured but not provided in request");
    // Uncomment below to enforce secret requirement:
    // return res.status(401).json({ error: "Unauthorized - secret required" });
  }

  try {
    console.log(`[orphaned-webhook] Request received at ${new Date().toISOString()}`);

    // Check if Memberstack key is configured
    if (!MEMBERSTACK_SECRET_KEY) {
      console.error("[orphaned-webhook] MEMBERSTACK_SECRET_KEY not configured");
      return res.status(500).json({
        success: false,
        error: "MEMBERSTACK_SECRET_KEY not configured",
        timestamp: new Date().toISOString()
      });
    }

    const orphanedMembers = await getOrphanedMembers();

    // Send emails to all orphaned members
    const emailResults = [];
    let emailsSent = 0;
    let emailsFailed = 0;

    if (orphanedMembers.length > 0) {
      console.log(`[orphaned-webhook] Sending emails to ${orphanedMembers.length} orphaned members...`);
      
      for (const member of orphanedMembers) {
        try {
          const result = await sendEmailToOrphanedMember(member);
          emailResults.push({
            email: member.email,
            name: member.name,
            sent: result.sent,
            error: result.error || null
          });
          
          if (result.sent) {
            emailsSent++;
          } else {
            emailsFailed++;
          }
        } catch (emailError) {
          console.error(`[orphaned-webhook] Error sending email to ${member.email}:`, emailError.message);
          emailResults.push({
            email: member.email,
            name: member.name,
            sent: false,
            error: emailError.message
          });
          emailsFailed++;
        }
      }
    } else {
      console.log("[orphaned-webhook] No orphaned members to email");
    }

    // Always return success (even if no members found or emails failed)
    // This allows Zapier to complete successfully
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      orphaned_members_found: orphanedMembers.length,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      email_configured: !!emailTransporter,
      email_results: emailResults,
      orphaned_members: orphanedMembers
    });

  } catch (error) {
    console.error(`[orphaned-webhook] Failed:`, error);
    // Return 200 with error details so Zapier doesn't fail
    // This allows the Zap to complete even if there's an issue
    return res.status(200).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      orphaned_members_found: 0,
      emails_sent: 0,
      emails_failed: 0
    });
  }
};
