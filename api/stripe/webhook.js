// /api/stripe/webhook.js
// Stripe webhook endpoint for tracking Academy plan lifecycle events
// Stores events in academy_plan_events table for conversion/churn analytics

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

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

    // Extract Stripe IDs (format varies by event type)
    const stripeCustomerId = obj?.customer || obj?.customer_id || null;
    const stripeSubscriptionId = obj?.subscription || (obj?.object === 'subscription' ? obj?.id : null) || null;
    const stripeInvoiceId = obj?.invoice || (obj?.object === 'invoice' ? obj?.id : null) || null;

    // Only store events that have Memberstack member ID (Academy-related)
    const shouldStore = Boolean(meta.msMemberId);

    if (!shouldStore) {
      console.log(`[stripe-webhook] Skipping event ${event.type} - no msMemberId in metadata`);
      return res.status(200).json({ received: true, skipped: true, reason: 'no_ms_member_id' });
    }

    // Insert event into academy_plan_events
    // Use stripe_event_id for idempotency (unique constraint will prevent duplicates)
    const { data, error } = await supabaseAdmin
      .from('academy_plan_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        created_at: new Date(event.created * 1000).toISOString(),
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_invoice_id: stripeInvoiceId,
        ms_member_id: meta.msMemberId,
        ms_app_id: meta.msAppId,
        ms_plan_id: meta.msPlanId,
        ms_price_id: meta.msPriceId,
        email: obj?.customer_email || obj?.customer_details?.email || null,
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

    console.log(`[stripe-webhook] Stored event ${event.type} for member ${meta.msMemberId} (event ID: ${event.id})`);
    
    return res.status(200).json({ 
      received: true, 
      event_type: event.type,
      ms_member_id: meta.msMemberId,
      stored: true
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
