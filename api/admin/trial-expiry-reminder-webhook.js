// API endpoint to identify members with trials expiring soon and send reminder emails
// This endpoint identifies members with trial plans expiring in X days and emails them automatically
// Designed to be called by Zapier (2-step Zap: Schedule → Webhook)
//
// Query parameters:
// - daysAhead: Number of days before expiry to send reminder (default: 7)
//   Accepted values (matches the supported email templates):
//     daysAhead=7   → 7-days-before mid-trial reminder
//     daysAhead=1   → last-day-of-trial reminder
//     daysAhead=-1  → 1-day-after-expiry with SAVE20 offer (6 days of grace remaining)
//     daysAhead=-3  → 3-days-after-expiry with SAVE20 offer (4 days of grace remaining)
//     daysAhead=-6  → last-day-of-SAVE20 reminder (1 day of grace remaining)
//     daysAhead=-8+ → post-grace reminder (SAVE20 closed, full £79 price)
// - sendEmail: Set to false | 0 | no | off to only return JSON (no nodemailer). Zapier can send mail in a later step.
// - testEmail: Send a single test (still respects sendEmail=false for dry-run preview)
// - secret: Optional ORPHANED_WEBHOOK_SECRET for auth
//
// All emails link members to https://www.alanranger.com/academy/dashboard, where
// the locked-dashboard snippet detects the trial state (via /api/academy/trial-status)
// and opens the upgrade modal with SAVE20 auto-applied when they are within the
// 7-day grace window. Override with env var ACADEMY_UPGRADE_URL if needed.
// TRIAL_REMINDER_USE_STRIPE_CHECKOUT=true restores per-member Stripe Checkout URLs,
// but this is not recommended — the dashboard modal now creates Stripe sessions
// with the correct Memberstack metadata so the Memberstack plan auto-attaches
// after payment. Stripe sessions built from this webhook lack that metadata
// and will orphan the subscription on an unknown Stripe customer.

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");
const nodemailer = require("nodemailer");
const stripe = require("stripe");
const crypto = require("crypto");

// Vercel docs in this repo use SUPABASE_URL (server-only). Client builds may use NEXT_PUBLIC_SUPABASE_URL.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

if (!supabase) {
  console.error(
    "[trial-expiry-reminder] Supabase not configured: set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)"
  );
}

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

// Every trial reminder email links to the Academy dashboard. The dashboard
// snippet detects the trial state and opens the upgrade modal with SAVE20
// auto-applied inside the grace window. Using a single URL keeps the
// Memberstack session, Stripe customer id and Supabase trial row all
// stitched together through the upgrade flow.
const MEMBERSTACK_UPGRADE_URL =
  process.env.ACADEMY_UPGRADE_URL || "https://www.alanranger.com/academy/dashboard";
const UPGRADE_URL_FALLBACK = MEMBERSTACK_UPGRADE_URL;

// Shared HMAC secret for per-member deep-link tokens. Same fallback chain as
// the REWIND20 webhook so both sets of emails use identical link signing.
// Verified server-side by api/academy/verify-reengage-token.js.
const REENGAGE_LINK_SECRET =
  process.env.REENGAGE_LINK_SECRET || process.env.ORPHANED_WEBHOOK_SECRET || "";
const REENGAGE_TOKEN_VERSION = 1;
// Tokens in trial-expiry-reminder emails exist purely to auto-fill the login
// form (and re-open the upgrade modal if the member is already signed in).
// Coupon eligibility is still decided server-side via /api/academy/trial-status,
// so a 30-day validity window is plenty across all reminder stages.
const REENGAGE_TOKEN_TTL_DAYS = 30;

function base64UrlEncode(input) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signReengageToken(memberId, email, expiresAtMs) {
  if (!REENGAGE_LINK_SECRET) return null;
  const payload = {
    v: REENGAGE_TOKEN_VERSION,
    mid: memberId,
    em: email || null,
    exp: expiresAtMs,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", REENGAGE_LINK_SECRET)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${payloadB64}.${sig}`;
}

function buildPersonalDashboardUrl(memberId, memberEmail) {
  if (!memberId) return MEMBERSTACK_UPGRADE_URL;
  const expiresAtMs = Date.now() + REENGAGE_TOKEN_TTL_DAYS * 86400000;
  const token = signReengageToken(memberId, memberEmail, expiresAtMs);
  if (!token) return MEMBERSTACK_UPGRADE_URL; // secret missing → fall back cleanly
  const sep = MEMBERSTACK_UPGRADE_URL.includes("?") ? "&" : "?";
  return `${MEMBERSTACK_UPGRADE_URL}${sep}ar_rewind=${encodeURIComponent(token)}`;
}

// Annual membership price ID from Memberstack
const ANNUAL_MEMBERSHIP_PRICE_ID = "prc_annual-membership-jj7y0h89";

// Stripe configuration (only used when TRIAL_REMINDER_USE_STRIPE_CHECKOUT=true)
const USE_STRIPE_CHECKOUT_IN_EMAIL =
  String(process.env.TRIAL_REMINDER_USE_STRIPE_CHECKOUT || "").toLowerCase() === "true";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_ANNUAL_PRICE_ID; // Stripe price ID for annual membership

// Debug: Log Stripe configuration at module load
console.log(`[trial-expiry-reminder] Module load - STRIPE_SECRET_KEY exists: ${!!STRIPE_SECRET_KEY}, STRIPE_ANNUAL_PRICE_ID exists: ${!!STRIPE_PRICE_ID}, value: ${STRIPE_PRICE_ID || 'NOT SET'}`);

// Initialize Stripe if key is available
let stripeClient = null;
if (STRIPE_SECRET_KEY) {
  stripeClient = stripe(STRIPE_SECRET_KEY);
  console.log(`[trial-expiry-reminder] Stripe client initialized: ${!!stripeClient}`);
} else {
  console.warn(`[trial-expiry-reminder] STRIPE_SECRET_KEY not found, Stripe client not initialized`);
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
    if (!USE_STRIPE_CHECKOUT_IN_EMAIL) {
      // Signed per-member deep-link: opens the member's dashboard directly
      // (auto-popping the upgrade modal if the trial has lapsed) and pre-fills
      // their email on the login screen if the Memberstack session expired.
      // Same mechanism already used by the REWIND20 lapsed-trial webhook, so
      // every Academy email delivers the same one-click upgrade experience.
      return buildPersonalDashboardUrl(memberId, memberEmail);
    }

    // Debug: Log Stripe configuration status
    console.log(`[trial-expiry-reminder] Stripe config check: stripeClient=${!!stripeClient}, STRIPE_PRICE_ID=${!!STRIPE_PRICE_ID}, priceId=${STRIPE_PRICE_ID || 'NOT SET'}`);
    
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
    console.warn(`[trial-expiry-reminder] Stripe not fully configured (stripeClient: ${!!stripeClient}, STRIPE_PRICE_ID: ${!!STRIPE_PRICE_ID}), using checkout page for member ${memberId}`);
    return `https://www.alanranger.com/academy/checkout?memberId=${encodeURIComponent(memberId)}&priceId=${encodeURIComponent(ANNUAL_MEMBERSHIP_PRICE_ID)}`;
  } catch (error) {
    console.error(`[trial-expiry-reminder] Error generating checkout URL for member ${memberId}:`, error.message);
    // Return fallback URL if checkout generation fails
    return UPGRADE_URL_FALLBACK;
  }
}

function shouldSendEmailFromRequest(req) {
  const v = req.query.sendEmail;
  if (v === undefined || v === null || String(v).trim() === "") return true;
  const s = String(v).toLowerCase().trim();
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Email content
// ─────────────────────────────────────────────────────────────────────────
// Kept in this file so the trial reminder copy has a single source of truth
// that mirrors the dashboard upgrade modal (see
// academy-dashboard-squarespace-snippet-v1.html). If you edit wording here,
// also update the modal comparison table so in-app and email stay aligned.

const ACADEMY_ANNUAL_PRICE_GBP = 79;
const SAVE20_DISCOUNT_GBP = 20;
const SAVE20_PRICE_GBP = ACADEMY_ANNUAL_PRICE_GBP - SAVE20_DISCOUNT_GBP; // 59
const SAVE20_GRACE_WINDOW_DAYS = 7;

const FEATURE_BULLETS = [
  "**60 training modules** — in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing",
  "**35 one-page field checklists** — print-ready PDFs for every shoot scenario",
  "**30 practice packs** — self-paced assignments built around Alan's frameworks and guidance",
  "**15 exams with downloadable certificates** — individual pass certificates with score details, plus a master certificate once you complete them all",
  "**741-page searchable eBook** — every module in a printable PDF, yours for life",
  "**Applied Learning Library** — 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)",
  "**Pro photographer toolkit** — exposure calculator, print size calculator, style quiz, Hue test",
  "**Robo-Ranger AI assistant** — on-demand answers on technique, gear and Academy content",
  "**Direct messaging & Q&A with Alan** — message Alan with questions and join the live Q&A sessions"
];

function renderFeatureList() {
  return FEATURE_BULLETS.map((b) => "- " + b).join("\n");
}

// SAVE20 is only valid within SAVE20_GRACE_WINDOW_DAYS of trial end. This
// mirrors /api/academy/trial-status + /api/stripe/create-upgrade-checkout so
// the email, dashboard modal and Stripe Checkout always agree.
function computeSave20State(daysUntilExpiry) {
  if (daysUntilExpiry >= 0) return { eligible: false, daysLeft: 0 };
  const daysSince = Math.abs(daysUntilExpiry);
  const daysLeft = SAVE20_GRACE_WINDOW_DAYS - daysSince;
  return { eligible: daysLeft > 0, daysLeft: Math.max(0, daysLeft) };
}

function buildSoftReminderEmail(member, expiryDateStr, upgradeUrl, daysUntilExpiry) {
  const subject = "Your Academy trial — a gentle heads-up";
  const body = `
Hi ${member.name || "there"},

Just a friendly heads-up that your trial with the **Alan Ranger Photography Academy** will end on **${expiryDateStr}** (${daysUntilExpiry} days from now).

If you'd like to carry on learning, you can upgrade to full annual membership at any time for **£${ACADEMY_ANNUAL_PRICE_GBP}/year** — less than a single coffee a week — and everything you've already built (progress, bookmarks, notes, quiz scores) stays on your account.

**A quick reminder of what's in your trial (and what annual membership keeps unlocked):**

${renderFeatureList()}

**Upgrade in one click**

Log back in and you'll see a quick upgrade option on your Academy dashboard:

${upgradeUrl}

No pressure — your trial keeps running either way. Any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
  `.trim();
  return { subject, body };
}

function buildSevenDayReminderEmail(member, expiryDateStr, upgradeUrl) {
  const subject = "You're Halfway Through Your Free Trial — 7 Days Left";
  const body = `
Hi ${member.name || "there"},

You're about halfway through your 14-day free trial of the **Alan Ranger Photography Academy** — **7 days to go**. Hopefully you're finding your way around and starting to build some momentum.

A quick reminder of what's in your trial (and everything you can keep if you lock in an annual membership before it ends):

${renderFeatureList()}

**A few suggestions for your next 7 days**

- Pick **one module** you haven't opened yet and read it end-to-end — the practical examples make far more sense than skimming
- Download **one field checklist** for your next shoot — it's the fastest way to feel the value
- Try **one practice pack** — small, self-contained, and designed so you actually finish it
- Ask Alan something in **Q&A** or throw a question at **Robo-Ranger** while the trial is still running

**Want to lock in annual access now?**

If you already know you want to keep learning, you can upgrade to the full annual membership for **£${ACADEMY_ANNUAL_PRICE_GBP}/year** — that's less than a single coffee a week — and everything you've already built (progress, bookmarks, notes, quiz scores) stays on your account.

Click the personal link below — we'll take you straight to your Academy dashboard. If you're not still signed in, your email address will be pre-filled on the login screen, so all you need is your password:

${upgradeUrl}

Your trial expires on **${expiryDateStr}**. No pressure — your trial keeps running either way. Any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
  `.trim();
  return { subject, body };
}

function buildFinalDayReminderEmail(member, expiryDateStr, upgradeUrl) {
  const subject = "Last day of your Academy trial — keep everything you've started";
  const body = `
Hi ${member.name || "there"},

Your 14-day free trial of the **Alan Ranger Photography Academy** ends **tomorrow (${expiryDateStr})**.

If you've been finding your way around the training modules, practice packs and checklists, this is the moment to lock in your full annual membership — everything you've already built (progress, bookmarks, notes, quiz scores) stays on your account, ready to pick up where you left off.

**Upgrade today for £${ACADEMY_ANNUAL_PRICE_GBP}/year and keep full access to:**

${renderFeatureList()}

**Upgrade in one click**

Log back in and you'll see the upgrade option on your Academy dashboard:

${upgradeUrl}

If you decide not to upgrade, your access to the training modules pauses tomorrow — but your account stays put and you can come back any time.

Any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
  `.trim();
  return { subject, body };
}

function buildExpiredWithCouponEmail(member, expiryDateStr, upgradeUrl, daysLeftInGrace) {
  const daysWord = daysLeftInGrace === 1 ? "day" : "days";
  const daysLeftPhrase = `**${daysLeftInGrace} ${daysWord}** left`;
  const subject = `Your Academy trial ended — SAVE20 is yours for ${daysLeftInGrace} more ${daysWord}`;
  const body = `
Hi ${member.name || "there"},

Your 14-day free trial of the **Alan Ranger Photography Academy** ended on **${expiryDateStr}**, so access to the full library has now paused.

If you'd like to carry on learning, you can upgrade to full annual membership for **£${ACADEMY_ANNUAL_PRICE_GBP}/year** — and for the next ${daysLeftPhrase} you can use the code **SAVE20** to take **£${SAVE20_DISCOUNT_GBP} off your first year**, bringing it down to just **£${SAVE20_PRICE_GBP}**. That's less than a single coffee a week for the whole year.

Everything you've already started — your module progress, quiz scores, bookmarks, practice-pack notes and recent activity — is still on your account, waiting to pick up where you left off.

**Here's what full annual membership keeps unlocked:**

${renderFeatureList()}

**Upgrade in one click**

Just log back into your Academy dashboard — the upgrade will pop up automatically with **SAVE20 already applied**. No codes to type in, no separate checkout page to find.

${upgradeUrl}

SAVE20 only runs for ${daysLeftPhrase} from today — after that the discount closes and annual membership returns to full price at £${ACADEMY_ANNUAL_PRICE_GBP}.

Any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
  `.trim();
  return { subject, body };
}

function buildExpiredNoCouponEmail(member, expiryDateStr, upgradeUrl) {
  const subject = "Your Academy trial has ended — come back any time";
  const body = `
Hi ${member.name || "there"},

Your trial of the **Alan Ranger Photography Academy** ended on **${expiryDateStr}**, and the SAVE20 grace-period discount has now closed.

If you'd still like to continue, annual membership is available at the standard rate of **£${ACADEMY_ANNUAL_PRICE_GBP}/year** — and everything you built during your trial (progress, bookmarks, notes, quiz scores) is still on your account, ready to pick up where you left off.

**What full annual membership keeps unlocked:**

${renderFeatureList()}

**Upgrade whenever you're ready**

Log back into your Academy dashboard and you'll see a quick upgrade option:

${upgradeUrl}

Any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
  `.trim();
  return { subject, body };
}

function buildExpiredEmail(member, expiryDateStr, upgradeUrl, daysUntilExpiry) {
  const coupon = computeSave20State(daysUntilExpiry);
  if (coupon.eligible) {
    return buildExpiredWithCouponEmail(member, expiryDateStr, upgradeUrl, coupon.daysLeft);
  }
  return buildExpiredNoCouponEmail(member, expiryDateStr, upgradeUrl);
}

function buildEmailContent(member, daysUntilExpiry, expiryDateStr, upgradeUrl) {
  if (daysUntilExpiry < 0) return buildExpiredEmail(member, expiryDateStr, upgradeUrl, daysUntilExpiry);
  if (daysUntilExpiry === 1) return buildFinalDayReminderEmail(member, expiryDateStr, upgradeUrl);
  if (daysUntilExpiry === 7) return buildSevenDayReminderEmail(member, expiryDateStr, upgradeUrl);
  return buildSoftReminderEmail(member, expiryDateStr, upgradeUrl, daysUntilExpiry);
}

async function sendTrialExpiryReminder(member, daysUntilExpiry, options) {
  const sendEmail = options?.sendEmail !== false;

  // Format expiry date nicely
  const expiryDate = member.trial_expiry_date 
    ? new Date(member.trial_expiry_date).toLocaleDateString('en-GB', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : 'soon';

  // Generate personalized checkout URL for this member
  const checkoutUrl = await generateCheckoutUrl(member.member_id, member.email, member.name);

  if (!sendEmail) {
    return { sent: false, skipped: true, upgrade_url: checkoutUrl };
  }

  if (!emailTransporter) {
    console.warn("[trial-expiry-reminder] Email not configured - skipping email send");
    return { sent: false, error: "Email not configured", upgrade_url: checkoutUrl };
  }

  // Build email content from the shared template helpers so all four
  // templates (soft/7-day/final-day/expired) stay aligned with the dashboard
  // modal copy. See FEATURE_BULLETS and computeSave20State above.
  const content = buildEmailContent(member, daysUntilExpiry, expiryDate, checkoutUrl);
  const emailSubject = content.subject;
  const emailBody = content.body;

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
  if (!supabase) {
    throw new Error("Supabase client not configured");
  }
  const expiringMembers = [];
  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + daysAhead);
  
  // Set to end of target day (23:59:59)
  targetDate.setHours(23, 59, 59, 999);
  
  // Also set start of target day (00:00:00) for range
  const targetDateStart = new Date(targetDate);
  targetDateStart.setHours(0, 0, 0, 0);

  // Determine if we're looking for expired trials (negative daysAhead)
  const isExpiredSearch = daysAhead < 0;
  const daysDescription = isExpiredSearch 
    ? `${Math.abs(daysAhead)} day(s) ago` 
    : `${daysAhead} day(s) ahead`;

  try {
    // Use Supabase cache as primary source (it has expiry_date in plan_summary)
    // This is more reliable than Memberstack API which may have different structure
    console.log(`[trial-expiry-reminder] Fetching members from Supabase cache (looking for trials ${isExpiredSearch ? 'expired' : 'expiring'} ${daysDescription})...`);
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
        
        // Check if member has a trial plan (active or expired)
        const status = (planSummary.status || "").toUpperCase();
        const planType = planSummary.plan_type || "";
        const isTrial = planType === "trial" || 
                       (planSummary.plan_id && planSummary.plan_id.includes("trial")) ||
                       (planSummary.payment_mode === "ONETIME" && planSummary.expiry_date);
        
        // For expired search, include EXPIRED/INACTIVE status; for future search, only ACTIVE/TRIALING
        const validStatus = isExpiredSearch
          ? (status === "EXPIRED" || status === "INACTIVE" || status === "CANCELLED" || status === "ACTIVE" || status === "TRIALING")
          : (status === "ACTIVE" || status === "TRIALING");
        
        if (isTrial && validStatus && email) {
          trialsChecked++;
          
          if (planSummary.expiry_date) {
            trialsWithExpiry++;
            try {
              const expiryDate = new Date(planSummary.expiry_date);
              
              if (!isNaN(expiryDate.getTime())) {
                const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                
                // Check if expiry date falls within our target day range
                // For expired search, also verify the trial has actually expired (expiryDate < now)
                const isInDateRange = expiryDate >= targetDateStart && expiryDate <= targetDate;
                const isActuallyExpired = isExpiredSearch ? (expiryDate < now) : true;
                
                if (isInDateRange && isActuallyExpired) {
                  expiringMembers.push({
                    member_id: memberId,
                    email: email,
                    name: name,
                    trial_expiry_date: planSummary.expiry_date,
                    days_until_expiry: daysUntilExpiry,
                    plan_id: planSummary.plan_id || null,
                    plan_name: planSummary.plan_name || "Academy Trial" || null
                  });
                  
                  const action = isExpiredSearch ? 'expired' : 'expiring';
                  console.log(`[trial-expiry-reminder] ✅ Found ${action} trial: ${email} (${action} ${expiryDate.toISOString().split('T')[0]}, ${daysUntilExpiry} days)`);
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
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error:
          "Supabase not configured: set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in Vercel, then redeploy.",
        timestamp: new Date().toISOString()
      });
    }

    const doSendEmail = shouldSendEmailFromRequest(req);

    // Get daysAhead from query parameter (default: 7)
    // Negative values are allowed for expired notifications (e.g., -1 for 1 day after expiry)
    const daysAhead = parseInt(req.query.daysAhead || "7", 10);
    
    if (isNaN(daysAhead)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid daysAhead parameter. Must be a number (positive for future expiry, negative for past expiry).",
        timestamp: new Date().toISOString()
      });
    }

    console.log(
      `[trial-expiry-reminder] Request received at ${new Date().toISOString()} (daysAhead: ${daysAhead}, sendEmail: ${doSendEmail})`
    );

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
      
      const result = await sendTrialExpiryReminder(testMemberObj, daysUntilExpiry, {
        sendEmail: doSendEmail
      });

      return res.status(200).json({
        success: true,
        test_mode: true,
        send_email: doSendEmail,
        timestamp: new Date().toISOString(),
        test_email: testEmail,
        member_id: testMemberObj.member_id,
        days_until_expiry: daysUntilExpiry,
        email_sent: !!(result.sent && !result.skipped),
        email_skipped: !!result.skipped,
        email_error: result.error || null,
        message_id: result.messageId || null,
        upgrade_url: result.upgrade_url || null,
        email_content_preview: {
          upgrade_url: result.upgrade_url || null
        }
      });
    }

    const expiringMembers = await getMembersWithExpiringTrials(daysAhead);

    // Send emails to all members with expiring trials
    const emailResults = [];
    let emailsSent = 0;
    let emailsFailed = 0;

    if (expiringMembers.length > 0) {
      console.log(
        `[trial-expiry-reminder] ${doSendEmail ? "Sending emails" : "Skipping send (sendEmail=false); listing members only"} — ${expiringMembers.length} member(s)`
      );
      
      for (const member of expiringMembers) {
        try {
          const result = await sendTrialExpiryReminder(member, member.days_until_expiry, {
            sendEmail: doSendEmail
          });
          emailResults.push({
            email: member.email,
            name: member.name,
            trial_expiry_date: member.trial_expiry_date,
            days_until_expiry: member.days_until_expiry,
            sent: !!(result.sent && !result.skipped),
            skipped: !!result.skipped,
            upgrade_url: result.upgrade_url || null,
            error: result.error || null
          });
          
          if (result.sent && !result.skipped) {
            emailsSent++;
          } else if (!result.skipped) {
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
      send_email: doSendEmail,
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
