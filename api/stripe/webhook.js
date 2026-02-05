// /api/stripe/webhook.js
// Stripe webhook endpoint for tracking Academy plan lifecycle events
// Stores events in academy_plan_events table for conversion/churn analytics

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { ACADEMY_ANNUAL_PRICE_IDS } = require('../../lib/academyStripeConfig');

// Academy app ID for filtering
const ACADEMY_APP_ID = 'app_cmjlwl7re00440stg3ri2dud8';

// Initialize Stripe client
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
}

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Extract Memberstack metadata from Stripe object
 * @param {Object} obj - Stripe object (checkout session, subscription, etc.)
 * @returns {Object} Extracted metadata
 */
function extractMemberstackMeta(obj) {
  const md = obj?.metadata || {};
  return {
    msAppId: md.msAppId || md.ms_app_id || null,
    msMemberId: md.msMemberId || md.ms_member_id || null,
    msPlanId: md.msPlanId || md.ms_plan_id || null,
    msPriceId: md.msPriceId || md.ms_price_id || null,
  };
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isTrialPriceId(priceId) {
  if (!priceId) return false;
  const val = String(priceId).toLowerCase();
  return val.includes('trial') || val.includes('30-day');
}

function isAnnualPriceId(priceId) {
  if (!priceId) return false;
  return String(priceId).toLowerCase().includes('annual');
}

async function upsertTrialHistory({ eventType, msMemberId, msPriceId, createdAt }) {
  if (!msMemberId || !createdAt) return;
  const createdDate = new Date(createdAt);
  if (isNaN(createdDate.getTime())) return;

  if (eventType === 'checkout.session.completed' && isTrialPriceId(msPriceId)) {
    const trialEndAt = addDays(createdDate, 30).toISOString();
    await supabaseAdmin
      .from('academy_trial_history')
      .upsert({
        member_id: msMemberId,
        trial_start_at: createdAt,
        trial_end_at: trialEndAt,
        source: 'stripe_webhook'
      }, { onConflict: 'member_id,trial_start_at' });
  }

  if (eventType === 'invoice.paid' && isAnnualPriceId(msPriceId)) {
    const { data: latestTrial } = await supabaseAdmin
      .from('academy_trial_history')
      .select('id, trial_start_at, converted_at')
      .eq('member_id', msMemberId)
      .lte('trial_start_at', createdAt)
      .order('trial_start_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestTrial && !latestTrial.converted_at) {
      await supabaseAdmin
        .from('academy_trial_history')
        .update({ converted_at: createdAt, updated_at: new Date().toISOString() })
        .eq('id', latestTrial.id);
    }
  }
}

/**
 * Check if an event is Academy-related by examining line items and price metadata
 * @param {Object} obj - Stripe object (invoice, checkout session, subscription, etc.)
 * @param {Object} stripe - Stripe client (for retrieving expanded data if needed)
 * @returns {Promise<Object>} { isAcademy: boolean, msAppId: string|null, msPriceId: string|null }
 */
async function isAcademyEvent(obj, stripe) {
  // Check 1: Invoice line items (invoice.* events)
  if (obj?.lines?.data) {
    for (const line of obj.lines.data) {
      const price = line?.price;
      if (!price) continue;
      
      // Check price ID in Academy config
      if (price.id && ACADEMY_ANNUAL_PRICE_IDS.includes(price.id)) {
        return {
          isAcademy: true,
          msAppId: price.metadata?.msAppId || null,
          msPriceId: price.metadata?.msPriceId || price.id || null
        };
      }
      
      // Check price metadata for Academy app ID
      if (price.metadata?.msAppId === ACADEMY_APP_ID) {
        return {
          isAcademy: true,
          msAppId: price.metadata.msAppId,
          msPriceId: price.metadata?.msPriceId || price.id || null
        };
      }
    }
  }
  
  // Check 2: Checkout session line items (checkout.session.completed)
  // Try expanded line_items first
  if (obj?.line_items?.data) {
    for (const item of obj.line_items.data) {
      const price = item?.price;
      if (!price) continue;
      
      if (price.id && ACADEMY_ANNUAL_PRICE_IDS.includes(price.id)) {
        return {
          isAcademy: true,
          msAppId: price.metadata?.msAppId || null,
          msPriceId: price.metadata?.msPriceId || price.id || null
        };
      }
      
      if (price.metadata?.msAppId === ACADEMY_APP_ID) {
        return {
          isAcademy: true,
          msAppId: price.metadata.msAppId,
          msPriceId: price.metadata?.msPriceId || price.id || null
        };
      }
    }
  }
  
  // If checkout session doesn't have expanded line_items, retrieve them
  if (obj?.object === 'checkout.session' && obj?.id && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(obj.id, {
        expand: ['line_items.data.price']
      });
      
      if (session?.line_items?.data) {
        for (const item of session.line_items.data) {
          const price = item?.price;
          if (!price) continue;
          
          if (price.id && ACADEMY_ANNUAL_PRICE_IDS.includes(price.id)) {
            return {
              isAcademy: true,
              msAppId: price.metadata?.msAppId || null,
              msPriceId: price.metadata?.msPriceId || price.id || null
            };
          }
          
          if (price.metadata?.msAppId === ACADEMY_APP_ID) {
            return {
              isAcademy: true,
              msAppId: price.metadata.msAppId,
              msPriceId: price.metadata?.msPriceId || price.id || null
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[stripe-webhook] Failed to retrieve checkout session line items: ${err.message}`);
    }
  }
  
  // Check 3: Subscription items (customer.subscription.* events)
  if (obj?.items?.data) {
    for (const item of obj.items.data) {
      const price = item?.price;
      if (!price) continue;
      
      if (price.id && ACADEMY_ANNUAL_PRICE_IDS.includes(price.id)) {
        return {
          isAcademy: true,
          msAppId: price.metadata?.msAppId || null,
          msPriceId: price.metadata?.msPriceId || price.id || null
        };
      }
      
      if (price.metadata?.msAppId === ACADEMY_APP_ID) {
        return {
          isAcademy: true,
          msAppId: price.metadata.msAppId,
          msPriceId: price.metadata?.msPriceId || price.id || null
        };
      }
    }
  }
  
  return { isAcademy: false, msAppId: null, msPriceId: null };
}

/**
 * Extract ms_member_id from various locations in the Stripe event object
 * @param {Object} obj - Stripe object (invoice, checkout session, subscription, etc.)
 * @returns {string|null} Memberstack member ID or null
 */
function extractMsMemberIdFromEvent(obj) {
  // Try 1: Object metadata (most common)
  const metadata = obj?.metadata || {};
  if (metadata.msMemberId) return metadata.msMemberId;
  if (metadata.ms_member_id) return metadata.ms_member_id;
  
  // Try 2: Customer details metadata (rare)
  if (obj?.customer_details?.metadata) {
    const custMeta = obj.customer_details.metadata;
    if (custMeta.msMemberId) return custMeta.msMemberId;
    if (custMeta.ms_member_id) return custMeta.ms_member_id;
  }
  
  // Try 3: Subscription details metadata (for subscription events)
  if (obj?.subscription_details?.metadata) {
    const subMeta = obj.subscription_details.metadata;
    if (subMeta.msMemberId) return subMeta.msMemberId;
    if (subMeta.ms_member_id) return subMeta.ms_member_id;
  }
  
  // Try 4: Check invoice line items price metadata (for invoice events)
  if (obj?.lines?.data) {
    for (const line of obj.lines.data) {
      const priceMeta = line?.price?.metadata;
      if (priceMeta?.msMemberId) return priceMeta.msMemberId;
      if (priceMeta?.ms_member_id) return priceMeta.ms_member_id;
    }
  }
  
  return null;
}

/**
 * Look up ms_member_id from previous events in academy_plan_events
 * Uses stripe_customer_id to find a previous event that had ms_member_id
 * @param {string} stripeCustomerId - Stripe customer ID
 * @returns {Promise<string|null>} Memberstack member ID or null
 */
async function lookupMsMemberIdFromPreviousEvents(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  
  try {
    const { data, error } = await supabaseAdmin
      .from('academy_plan_events')
      .select('ms_member_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .not('ms_member_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!error && data?.ms_member_id) {
      console.log(`[stripe-webhook] Found ms_member_id from previous event: ${data.ms_member_id}`);
      return data.ms_member_id;
    }
    
    return null;
  } catch (err) {
    console.warn('[stripe-webhook] Error looking up ms_member_id from previous events:', err.message);
    return null;
  }
}

/**
 * Look up Memberstack member ID from ms_members_cache
 * @param {string} stripeCustomerId - Stripe customer ID
 * @param {string} customerEmail - Customer email
 * @returns {Promise<string|null>} Memberstack member ID or null
 */
async function lookupMsMemberIdFromCache(stripeCustomerId, customerEmail) {
  try {
    // Try by email (most reliable)
    if (customerEmail) {
      const { data, error } = await supabaseAdmin
        .from('ms_members_cache')
        .select('member_id')
        .eq('email', customerEmail)
        .limit(1)
        .maybeSingle();
      
      if (!error && data?.member_id) {
        return data.member_id;
      }
    }
    
    // Try by Stripe customer ID in raw JSONB (if stored)
    if (stripeCustomerId) {
      const { data, error } = await supabaseAdmin
        .from('ms_members_cache')
        .select('member_id, raw')
        .limit(100); // Get a batch to check
      
      if (!error && data) {
        for (const member of data) {
          const raw = member.raw || {};
          if (raw.stripe_customer_id === stripeCustomerId || 
              raw.stripeCustomerId === stripeCustomerId ||
              raw.customer_id === stripeCustomerId) {
            return member.member_id;
          }
        }
      }
    }
    
    return null;
  } catch (err) {
    console.warn('[stripe-webhook] Error looking up ms_member_id from cache:', err.message);
    return null;
  }
}

/**
 * Get raw request body for Stripe webhook signature verification
 * Handles both Vercel serverless functions and Next.js API routes
 */
async function getRawBody(req) {
  // For Vercel serverless functions, body might already be available
  if (req.body && Buffer.isBuffer(req.body)) {
    return req.body;
  }
  
  // For streaming requests, collect chunks
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  if (!whSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
    console.log(`[stripe-webhook] Received event: ${event.type} (id: ${event.id})`);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    const obj = event.data?.object;
    const meta = extractMemberstackMeta(obj);
    const stripe = getStripe();

    // Check if this is an Academy event by examining price IDs and metadata
    const academyCheck = await isAcademyEvent(obj, stripe);
    
    if (!academyCheck.isAcademy) {
      console.log(`[stripe-webhook] Event ${event.type} is not Academy-related`);
      return res.status(200).json({ 
        received: true, 
        stored: false, 
        reason: 'not_academy_event' 
      });
    }

    // Extract Stripe IDs (format varies by event type)
    const stripeCustomerId = obj?.customer || obj?.customer_id || null;
    const stripeSubscriptionId = obj?.subscription || (obj?.object === 'subscription' ? obj?.id : null) || null;
    const stripeInvoiceId = obj?.invoice || (obj?.object === 'invoice' ? obj?.id : null) || null;
    const customerEmail = obj?.customer_email || obj?.customer_details?.email || null;

    // Try multiple methods to resolve ms_member_id (required for insert)
    let msMemberId = null;
    
    // Method 1: Extract from event object metadata
    msMemberId = extractMsMemberIdFromEvent(obj);
    if (msMemberId) {
      console.log(`[stripe-webhook] Found ms_member_id from event metadata: ${msMemberId}`);
    }
    
    // Method 2: Look up from previous events (if same customer)
    if (!msMemberId && stripeCustomerId) {
      msMemberId = await lookupMsMemberIdFromPreviousEvents(stripeCustomerId);
    }
    
    // Method 3: Look up from ms_members_cache
    if (!msMemberId && (stripeCustomerId || customerEmail)) {
      msMemberId = await lookupMsMemberIdFromCache(stripeCustomerId, customerEmail);
      if (msMemberId) {
        console.log(`[stripe-webhook] Found ms_member_id from cache: ${msMemberId}`);
      }
    }
    
    // If still not found, skip the insert (required field)
    if (!msMemberId) {
      console.log(`[stripe-webhook] Cannot resolve ms_member_id for event ${event.type} (customer: ${stripeCustomerId || 'unknown'})`);
      return res.status(200).json({ 
        received: true, 
        skipped: true, 
        reason: 'no_ms_member_id' 
      });
    }

    // Use Academy app ID and price ID from price metadata (most reliable)
    const msAppId = academyCheck.msAppId || meta.msAppId || null;
    const msPriceId = academyCheck.msPriceId || meta.msPriceId || null;

    // Insert event into academy_plan_events
    // Use stripe_event_id for idempotency (unique constraint will prevent duplicates)
    // ms_member_id is required (we've already verified it exists above)
    const { data, error } = await supabaseAdmin
      .from('academy_plan_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        created_at: new Date(event.created * 1000).toISOString(),
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_invoice_id: stripeInvoiceId,
        ms_member_id: msMemberId, // Required - already verified above
        ms_app_id: msAppId,
        ms_plan_id: meta.msPlanId || null,
        ms_price_id: msPriceId,
        email: customerEmail,
        payload: event // Store full event for debugging
      })
      .select();

    if (error) {
      // If duplicate stripe_event_id, treat as success (idempotent)
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        console.log(`[stripe-webhook] Event ${event.id} already processed (idempotent)`);
        return res.status(200).json({ 
          received: true, 
          stored: false, 
          reason: 'duplicate' 
        });
      }
      
      console.error('[stripe-webhook] Database insert error:', error);
      throw error;
    }

    try {
      await upsertTrialHistory({
        eventType: event.type,
        msMemberId,
        msPriceId,
        createdAt: new Date(event.created * 1000).toISOString()
      });
    } catch (historyError) {
      console.warn('[stripe-webhook] Trial history upsert failed:', historyError.message);
    }

    console.log(`[stripe-webhook] Stored Academy event ${event.type} (event ID: ${event.id})${msMemberId ? ` for member ${msMemberId}` : ' (ms_member_id: null)'}`);
    
    return res.status(200).json({ 
      received: true, 
      stored: true,
      event_type: event.type,
      ms_member_id: msMemberId
    });

  } catch (err) {
    console.error('[stripe-webhook] Error processing event:', err);
    // Return 200 to prevent Stripe from retrying (we'll handle errors internally)
    return res.status(200).json({ 
      received: true, 
      error: err.message,
      note: 'Event received but processing failed - check logs'
    });
  }
};
