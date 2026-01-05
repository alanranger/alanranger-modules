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

/**
 * Check if an event is Academy-related by examining line items
 * @param {Object} obj - Stripe object (invoice, checkout session, subscription, etc.)
 * @returns {Object} { isAcademy: boolean, msAppId: string|null, msPriceId: string|null }
 */
function isAcademyEvent(obj) {
  // Check line items (invoices, checkout sessions)
  const lineItems = obj?.lines?.data || obj?.line_items?.data || [];
  
  for (const item of lineItems) {
    const price = item?.price;
    if (!price) continue;
    
    // Check 1: Price ID matches Academy config
    if (price.id && ACADEMY_ANNUAL_PRICE_IDS.includes(price.id)) {
      return {
        isAcademy: true,
        msAppId: price.metadata?.msAppId || null,
        msPriceId: price.metadata?.msPriceId || price.id || null
      };
    }
    
    // Check 2: Price metadata contains Academy app ID
    if (price.metadata?.msAppId === ACADEMY_APP_ID) {
      return {
        isAcademy: true,
        msAppId: price.metadata.msAppId,
        msPriceId: price.metadata?.msPriceId || price.id || null
      };
    }
  }
  
  // Check subscription items (for subscription events)
  const subscriptionItems = obj?.items?.data || [];
  for (const item of subscriptionItems) {
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
  
  return { isAcademy: false, msAppId: null, msPriceId: null };
}

/**
 * Look up Memberstack member ID from ms_members_cache
 * @param {string} stripeCustomerId - Stripe customer ID
 * @param {string} customerEmail - Customer email
 * @returns {Promise<string|null>} Memberstack member ID or null
 */
async function lookupMsMemberId(stripeCustomerId, customerEmail) {
  try {
    // First try by Stripe customer ID (if stored in member cache)
    if (stripeCustomerId) {
      // Note: This assumes you store Stripe customer ID in ms_members_cache
      // If not, you may need to add a stripe_customer_id column
      // For now, try email lookup
    }
    
    // Try by email
    if (customerEmail) {
      const { data, error } = await supabaseAdmin
        .from('ms_members_cache')
        .select('member_id')
        .eq('email', customerEmail)
        .limit(1)
        .single();
      
      if (!error && data?.member_id) {
        return data.member_id;
      }
    }
    
    return null;
  } catch (err) {
    console.warn('[stripe-webhook] Error looking up ms_member_id:', err.message);
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

    // Check if this is an Academy event by examining price IDs and metadata
    const academyCheck = isAcademyEvent(obj);
    
    if (!academyCheck.isAcademy) {
      console.log(`[stripe-webhook] Skipping event ${event.type} - not Academy-related`);
      return res.status(200).json({ received: true, skipped: true, reason: 'not_academy_event' });
    }

    // Extract Stripe IDs (format varies by event type)
    const stripeCustomerId = obj?.customer || obj?.customer_id || null;
    const stripeSubscriptionId = obj?.subscription || (obj?.object === 'subscription' ? obj?.id : null) || null;
    const stripeInvoiceId = obj?.invoice || (obj?.object === 'invoice' ? obj?.id : null) || null;
    const customerEmail = obj?.customer_email || obj?.customer_details?.email || null;

    // Try to look up ms_member_id from ms_members_cache
    let msMemberId = meta.msMemberId || null;
    if (!msMemberId && (stripeCustomerId || customerEmail)) {
      msMemberId = await lookupMsMemberId(stripeCustomerId, customerEmail);
      if (msMemberId) {
        console.log(`[stripe-webhook] Found ms_member_id via lookup: ${msMemberId}`);
      }
    }

    // Use Academy app ID from price metadata if available, otherwise from object metadata
    const msAppId = academyCheck.msAppId || meta.msAppId || null;
    const msPriceId = academyCheck.msPriceId || meta.msPriceId || null;

    // Insert event into academy_plan_events
    // Use stripe_event_id for idempotency (unique constraint will prevent duplicates)
    // Store even if ms_member_id is null (we can link it later)
    const { data, error } = await supabaseAdmin
      .from('academy_plan_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        created_at: new Date(event.created * 1000).toISOString(),
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_invoice_id: stripeInvoiceId,
        ms_member_id: msMemberId, // May be null - that's OK
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
        return res.status(200).json({ received: true, duplicate: true });
      }
      
      console.error('[stripe-webhook] Database insert error:', error);
      throw error;
    }

    console.log(`[stripe-webhook] Stored event ${event.type} (event ID: ${event.id})${msMemberId ? ` for member ${msMemberId}` : ' (ms_member_id not found)'}`);
    
    return res.status(200).json({ 
      received: true, 
      event_type: event.type,
      ms_member_id: msMemberId,
      stored: true,
      academy_event: true
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
