// API endpoint to identify members with trials expiring soon and send reminder emails
// This endpoint identifies members with trial plans expiring in X days and emails them automatically
// Designed to be called by Zapier (2-step Zap: Schedule → Webhook)
// Handles both finding expiring trials AND sending emails (no Gmail step needed)
//
// Query parameters:
// - daysAhead: Number of days before expiry to send reminder (default: 7)
//   Example: ?daysAhead=7 for 7-day reminder, ?daysAhead=1 for 24-hour reminder

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");
const nodemailer = require("nodemailer");
const stripe = require("stripe");

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

// Academy upgrade URL - fallback if checkout generation fails
const UPGRADE_URL_FALLBACK = process.env.ACADEMY_UPGRADE_URL || "https://www.alanranger.com/academy/signup";

// Annual membership price ID from Memberstack
const ANNUAL_MEMBERSHIP_PRICE_ID = "prc_annual-membership-jj7y0h89";

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_ANNUAL_PRICE_ID; // Stripe price ID for annual membership

// Initialize Stripe if key is available
let stripeClient = null;
if (STRIPE_SECRET_KEY) {
  stripeClient = stripe(STRIPE_SECRET_KEY);
}

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

/**
 * Generate a personalized Stripe checkout URL for a member to upgrade to annual membership
 * Creates a Stripe checkout session linked to the member's email and ID
 */
async function generateCheckoutUrl(memberId, memberEmail, memberName) {
  try {
    // If Stripe is configured, create a checkout session directly
    if (stripeClient && STRIPE_PRICE_ID) {
      const session = await stripeClient.checkout.sessions.create({
        customer_email: memberEmail,
        line_items: [
          {
            price: STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `https://www.alanranger.com/academy/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: 'https://www.alanranger.com/academy/login',
        metadata: {
          memberstack_member_id: memberId,
          memberstack_price_id: ANNUAL_MEMBERSHIP_PRICE_ID,
          member_name: memberName || '',
        },
        allow_promotion_codes: true,
      });

      if (session && session.url) {
        console.log(`[trial-expiry-reminder] Generated Stripe checkout URL for member ${memberId}`);
        return session.url;
      }
    }

    // Fallback: Create a link to checkout page that uses Memberstack client-side checkout
    // This page will automatically initiate checkout for the member
    console.warn(`[trial-expiry-reminder] Stripe not fully configured, using checkout page for member ${memberId}`);
    return `https://www.alanranger.com/academy/checkout?memberId=${encodeURIComponent(memberId)}&priceId=${encodeURIComponent(ANNUAL_MEMBERSHIP_PRICE_ID)}`;
  } catch (error) {
    console.error(`[trial-expiry-reminder] Error generating checkout URL for member ${memberId}:`, error.message);
    // Return fallback URL if checkout generation fails
    return UPGRADE_URL_FALLBACK;
  }
}

async function sendTrialExpiryReminder(member, daysUntilExpiry) {
  if (!emailTransporter) {
    console.warn("[trial-expiry-reminder] Email not configured - skipping email send");
    return { sent: false, error: "Email not configured" };
  }

  // Format expiry date nicely
  const expiryDate = member.trial_expiry_date 
    ? new Date(member.trial_expiry_date).toLocaleDateString('en-GB', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : 'soon';

  const timeRemaining = daysUntilExpiry === 1 
    ? '24 hours' 
    : `${daysUntilExpiry} days`;

  const urgencyText = daysUntilExpiry === 1
    ? '**URGENT:** Only 24 hours left!'
    : `Your trial expires in ${timeRemaining}`;

  const emailSubject = daysUntilExpiry === 1
    ? "⚠️ Your Academy Trial Expires Tomorrow - Upgrade Now"
    : `Your Academy Trial Expires in ${timeRemaining} - Upgrade to Continue Access`;

  // Generate personalized checkout URL for this member
  const checkoutUrl = await generateCheckoutUrl(member.member_id, member.email, member.name);

  const emailBody = `
Hi ${member.name || "there"},

${urgencyText}

Your 30-day trial with Alan Ranger Photography Academy will end on **${expiryDate}**.

**To continue enjoying full access to all Academy content, you'll need to upgrade to an annual plan.**

**What happens if you don't upgrade?**
- Your trial access will expire on ${expiryDate}
- You'll lose access to all Academy modules, content, and resources
- You'll need to sign up for an annual plan (£79) to regain access

**Upgrade now for just £79/year and get:**
✅ Full access to all Academy modules and content
✅ Exclusive photography tutorials and guides
✅ Community support and resources
✅ Regular updates and new content
✅ All the tools and knowledge to improve your photography

**Upgrade your account now:**
${checkoutUrl}

Don't miss out on continuing your photography journey with us!

If you have any questions or need help with the upgrade process, please contact us.

Best regards,
Alan Ranger Photography Academy

---
This is an automated reminder. Your trial expires on ${expiryDate} (${timeRemaining} remaining).
  `.trim();

  try {
    const info = await emailTransporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
      to: member.email,
      bcc: "info@alanranger.com", // BCC so you get notified of all emails sent
      subject: emailSubject,
      text: emailBody,
      html: emailBody.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    });

    console.log(`[trial-expiry-reminder] Email sent to ${member.email}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[trial-expiry-reminder] Error sending email to ${member.email}:`, error.message);
    return { sent: false, error: error.message };
  }
}

async function getMembersWithExpiringTrials(daysAhead) {
  const expiringMembers = [];
  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + daysAhead);
  
  // Set to end of target day (23:59:59)
  targetDate.setHours(23, 59, 59, 999);
  
  // Also set start of target day (00:00:00) for range
  const targetDateStart = new Date(targetDate);
  targetDateStart.setHours(0, 0, 0, 0);

  try {
    // Use Supabase cache as primary source (it has expiry_date in plan_summary)
    // This is more reliable than Memberstack API which may have different structure
    console.log(`[trial-expiry-reminder] Fetching members from Supabase cache (looking for trials expiring in ${daysAhead} days)...`);
    console.log(`[trial-expiry-reminder] Date range: ${targetDateStart.toISOString()} to ${targetDate.toISOString()}`);
    
    const { data: cachedMembers, error: cacheError } = await supabase
      .from('ms_members_cache')
      .select('member_id, email, name, plan_summary, created_at')
      .not('plan_summary', 'is', null);
    
    if (cacheError) {
      console.error("[trial-expiry-reminder] Error fetching from Supabase:", cacheError);
    } else {
      console.log(`[trial-expiry-reminder] Found ${cachedMembers?.length || 0} members in Supabase cache`);
      
      let trialsChecked = 0;
      let trialsWithExpiry = 0;
      
      // Filter for trials expiring in target timeframe
      for (const member of cachedMembers || []) {
        const email = member.email || "";
        const memberId = member.member_id;
        const name = member.name || "N/A";
        const planSummary = member.plan_summary || {};
        
        // Check if member has an active trial plan
        const status = (planSummary.status || "").toUpperCase();
        const planType = planSummary.plan_type || "";
        const isTrial = planType === "trial" || 
                       (planSummary.plan_id && planSummary.plan_id.includes("trial")) ||
                       (planSummary.payment_mode === "ONETIME" && planSummary.expiry_date);
        
        if (isTrial && (status === "ACTIVE" || status === "TRIALING") && email) {
          trialsChecked++;
          
          if (planSummary.expiry_date) {
            trialsWithExpiry++;
            try {
              const expiryDate = new Date(planSummary.expiry_date);
              
              if (!isNaN(expiryDate.getTime())) {
                const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                
                // Check if expiry date falls within our target day range
                if (expiryDate >= targetDateStart && expiryDate <= targetDate) {
                  expiringMembers.push({
                    member_id: memberId,
                    email: email,
                    name: name,
                    trial_expiry_date: planSummary.expiry_date,
                    days_until_expiry: daysUntilExpiry,
                    plan_id: planSummary.plan_id || null,
                    plan_name: planSummary.plan_name || "Academy Trial" || null
                  });
                  
                  console.log(`[trial-expiry-reminder] ✅ Found expiring trial: ${email} (expires ${expiryDate.toISOString().split('T')[0]}, ${daysUntilExpiry} days)`);
                } else {
                  // Debug: Log trials that don't match (for troubleshooting)
                  if (daysUntilExpiry > 0 && daysUntilExpiry <= daysAhead + 5) {
                    console.log(`[trial-expiry-reminder] ℹ️ Member ${email} trial expires in ${daysUntilExpiry} days (expires ${expiryDate.toISOString().split('T')[0]}, target range: ${targetDateStart.toISOString().split('T')[0]} to ${targetDate.toISOString().split('T')[0]})`);
                  }
                }
              } else {
                console.log(`[trial-expiry-reminder] ⚠️ Member ${email} has invalid expiry date: ${planSummary.expiry_date}`);
              }
            } catch (dateError) {
              console.log(`[trial-expiry-reminder] ⚠️ Member ${email} error parsing expiry date: ${planSummary.expiry_date} - ${dateError.message}`);
            }
          } else {
            console.log(`[trial-expiry-reminder] ⚠️ Member ${email} has trial but no expiry_date in plan_summary`);
          }
        }
      }
      
      console.log(`[trial-expiry-reminder] Checked ${trialsChecked} trial members, ${trialsWithExpiry} had expiry dates`);
    }

    // Fallback: Also check Memberstack API if Supabase didn't find enough
    // This helps catch any members not yet synced to Supabase
    if (expiringMembers.length === 0) {
      console.log(`[trial-expiry-reminder] No expiring trials found in Supabase, checking Memberstack API as fallback...`);
      
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
            console.error("[trial-expiry-reminder] Error listing members:", listError);
            break;
          }

          if (!members || members.length === 0) {
            break;
          }

          memberstackMembers.push(...members);
          totalFetched += members.length;
          console.log(`[trial-expiry-reminder] Fetched ${totalFetched} members from Memberstack...`);

          if (members.length < limit) {
            break;
          }

          after = members[members.length - 1]?.id || null;
          if (!after) break;
        } catch (error) {
          console.error("[trial-expiry-reminder] Error fetching from Memberstack:", error.message);
          break;
        }
      }

      console.log(`[trial-expiry-reminder] Found ${memberstackMembers.length} total members in Memberstack`);

      // Check Memberstack API for trials (with debug logging)
      for (const member of memberstackMembers) {
        const email = member.auth?.email || member.email || "";
        const memberId = member.id;
        const name = member.name || "N/A";
        
        // Check if member has an active TRIALING plan
        let trialPlan = null;
        let hasTrialPlan = false;
        
        if (member.planConnections && Array.isArray(member.planConnections)) {
          trialPlan = member.planConnections.find(plan => {
            const status = (plan?.status || plan.status || "").toUpperCase();
            return status === "TRIALING";
          });
          hasTrialPlan = !!trialPlan;
        }
        
        if (hasTrialPlan && trialPlan && email) {
          // Check trial expiry date from Memberstack API
          const expiryDateStr = trialPlan.expiry_date || 
                               trialPlan.current_period_end || 
                               trialPlan.expires_at || 
                               trialPlan.endDate ||
                               trialPlan.end_date ||
                               (trialPlan.plan && trialPlan.plan.expiry_date) ||
                               (trialPlan.plan && trialPlan.plan.current_period_end);
          
          // Debug: Log the trial plan structure to understand what fields are available
          if (!expiryDateStr) {
            console.log(`[trial-expiry-reminder] ⚠️ Member ${email} has trial plan but no expiry date found. Plan structure:`, JSON.stringify(trialPlan, null, 2));
          }
          
          if (expiryDateStr) {
            const expiryDate = new Date(expiryDateStr);
            
            if (isNaN(expiryDate.getTime())) {
              console.log(`[trial-expiry-reminder] ⚠️ Member ${email} has invalid expiry date: ${expiryDateStr}`);
            } else {
              // Check if expiry date falls within our target day (within the day range)
              if (expiryDate >= targetDateStart && expiryDate <= targetDate) {
                const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                
                // Only add if not already found in Supabase
                if (!expiringMembers.find(m => m.email === email)) {
                  expiringMembers.push({
                    member_id: memberId,
                    email: email,
                    name: name,
                    trial_expiry_date: expiryDateStr,
                    days_until_expiry: daysUntilExpiry,
                    plan_id: trialPlan.plan_id || trialPlan.id || null,
                    plan_name: trialPlan.plan_name || "Academy Trial" || null
                  });
                  
                  console.log(`[trial-expiry-reminder] ✅ Found expiring trial (Memberstack): ${email} (expires ${expiryDate.toISOString().split('T')[0]}, ${daysUntilExpiry} days)`);
                }
              }
            }
          }
        }
      }
    }

    console.log(`[trial-expiry-reminder] Found ${expiringMembers.length} members with trials expiring in ${daysAhead} days`);
    return expiringMembers;

  } catch (error) {
    console.error("[trial-expiry-reminder] Fatal error:", error);
    throw error;
  }
}

module.exports = async (req, res) => {
  // Allow GET and POST requests
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Optional: Add a secret token for security
  const webhookSecret = process.env.ORPHANED_WEBHOOK_SECRET; // Reuse same secret
  const providedSecret = req.query.secret || req.headers["x-webhook-secret"];

  if (webhookSecret && providedSecret && providedSecret !== webhookSecret) {
    console.log("[trial-expiry-reminder] Invalid webhook secret provided");
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  if (webhookSecret && !providedSecret) {
    console.warn("[trial-expiry-reminder] Webhook secret configured but not provided in request");
  }

  try {
    // Get daysAhead from query parameter (default: 7)
    const daysAhead = parseInt(req.query.daysAhead || "7", 10);
    
    if (isNaN(daysAhead) || daysAhead < 0) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid daysAhead parameter. Must be a positive number.",
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[trial-expiry-reminder] Request received at ${new Date().toISOString()} (daysAhead: ${daysAhead})`);

    // Check if Memberstack key is configured
    if (!MEMBERSTACK_SECRET_KEY) {
      console.error("[trial-expiry-reminder] MEMBERSTACK_SECRET_KEY not configured");
      return res.status(500).json({
        success: false,
        error: "MEMBERSTACK_SECRET_KEY not configured",
        timestamp: new Date().toISOString()
      });
    }

    // TEST MODE: If testEmail query parameter is provided, send test email to that address
    const testEmail = req.query.testEmail;
    if (testEmail) {
      console.log(`[trial-expiry-reminder] TEST MODE: Sending test email to ${testEmail}`);
      
      // Fetch member data from Supabase
      const { data: testMember, error: testError } = await supabase
        .from('ms_members_cache')
        .select('member_id, email, name, plan_summary')
        .eq('email', testEmail)
        .single();
      
      if (testError || !testMember) {
        return res.status(400).json({
          success: false,
          error: `Test email ${testEmail} not found in database`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Get expiry date from plan_summary
      const planSummary = testMember.plan_summary || {};
      const expiryDateStr = planSummary.expiry_date;
      const now = new Date();
      const expiryDate = expiryDateStr ? new Date(expiryDateStr) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Default to 7 days if not found
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      
      // Create test member object
      const testMemberObj = {
        member_id: testMember.member_id,
        email: testMember.email,
        name: testMember.name || "Test User",
        trial_expiry_date: expiryDateStr || expiryDate.toISOString(),
        days_until_expiry: daysUntilExpiry
      };
      
      // Send test email
      const result = await sendTrialExpiryReminder(testMemberObj, daysUntilExpiry);
      
      return res.status(200).json({
        success: true,
        test_mode: true,
        timestamp: new Date().toISOString(),
        test_email: testEmail,
        days_until_expiry: daysUntilExpiry,
        email_sent: result.sent,
        email_error: result.error || null,
        message_id: result.messageId || null,
        email_content_preview: {
          subject: daysUntilExpiry === 1
            ? "⚠️ Your Academy Trial Expires Tomorrow - Upgrade Now"
            : `Your Academy Trial Expires in ${daysUntilExpiry === 1 ? '24 hours' : `${daysUntilExpiry} days`} - Upgrade to Continue Access`,
          upgrade_url: UPGRADE_URL
        }
      });
    }

    const expiringMembers = await getMembersWithExpiringTrials(daysAhead);

    // Send emails to all members with expiring trials
    const emailResults = [];
    let emailsSent = 0;
    let emailsFailed = 0;

    if (expiringMembers.length > 0) {
      console.log(`[trial-expiry-reminder] Sending emails to ${expiringMembers.length} members with expiring trials...`);
      
      for (const member of expiringMembers) {
        try {
          const result = await sendTrialExpiryReminder(member, member.days_until_expiry);
          emailResults.push({
            email: member.email,
            name: member.name,
            trial_expiry_date: member.trial_expiry_date,
            days_until_expiry: member.days_until_expiry,
            sent: result.sent,
            error: result.error || null
          });
          
          if (result.sent) {
            emailsSent++;
          } else {
            emailsFailed++;
          }
        } catch (emailError) {
          console.error(`[trial-expiry-reminder] Error sending email to ${member.email}:`, emailError.message);
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
      console.log(`[trial-expiry-reminder] No members with trials expiring in ${daysAhead} days`);
    }

    // Always return success (even if no members found or emails failed)
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      days_ahead: daysAhead,
      expiring_trials_found: expiringMembers.length,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      email_configured: !!emailTransporter,
      email_results: emailResults,
      expiring_members: expiringMembers
    });

  } catch (error) {
    console.error(`[trial-expiry-reminder] Failed:`, error);
    return res.status(200).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      expiring_trials_found: 0,
      emails_sent: 0,
      emails_failed: 0
    });
  }
};
