// api/academy/trial-status.js
// Tells the dashboard whether a logged-in member is an expired-trial user
// and which (if any) discount coupon should be auto-applied at Checkout.
//
// This is the single source of truth for the "locked dashboard" mode:
// Memberstack itself sometimes strips the expired trial plan connection
// entirely, so we can't rely on planConnections alone. Instead we look at
// academy_trial_history (populated by the Stripe webhook and admin refresh).
//
// Two coupons can be live at any time:
//   SAVE20   — 7-day grace window from trial end. Fresh, high-intent.
//   REWIND20 — 7-day personal window opened when the win-back reengagement
//              webhook emails a lapsed member. Outside SAVE20 territory.
//
// SAVE20 takes precedence if both are somehow active; both yield the same
// £20 discount so the customer never pays more than £59.
//
// Response shape:
//   {
//     memberId: string,
//     isExpiredTrial: boolean,
//     hasConverted: boolean,
//     trialStartedAt: ISO | null,
//     trialEndedAt:   ISO | null,
//     trialLengthDays: number | null,
//     daysSinceExpiry: number | null,
//     couponEligible: boolean,
//     couponCode: "SAVE20" | "REWIND20" | null,
//     couponSource: "save20_grace" | "rewind20_winback" | null,
//     couponWindowDays: 7,
//     couponExpiresAt: ISO | null,      // REWIND20 personal expiry timestamp
//     reengagementOptedOut: boolean
//   }

const { createClient } = require("@supabase/supabase-js");

const SAVE20_CODE = "SAVE20";
const REWIND20_CODE = "REWIND20";
const COUPON_WINDOW_DAYS = 7;
const DAY_MS = 86400000;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.alanranger.com");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Memberstack-Id");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function getLatestTrialRow(supabase, memberId) {
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select(
      "trial_start_at, trial_end_at, trial_length_days, converted_at, reengagement_expires_at, reengagement_opted_out"
    )
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function emptyStatus() {
  return {
    isExpiredTrial: false,
    hasConverted: false,
    trialStartedAt: null,
    trialEndedAt: null,
    trialLengthDays: null,
    daysSinceExpiry: null,
    couponEligible: false,
    couponCode: null,
    couponSource: null,
    couponExpiresAt: null,
    reengagementOptedOut: false,
  };
}

function pickActiveCoupon({ isExpired, daysSinceExpiry, reengagementExpiresAt, hasConverted, optedOut, nowMs }) {
  if (hasConverted) return { code: null, source: null, expiresAt: null };
  if (isExpired && daysSinceExpiry !== null && daysSinceExpiry <= COUPON_WINDOW_DAYS) {
    return { code: SAVE20_CODE, source: "save20_grace", expiresAt: null };
  }
  if (!optedOut && reengagementExpiresAt) {
    const expMs = new Date(reengagementExpiresAt).getTime();
    if (!Number.isNaN(expMs) && expMs > nowMs) {
      return { code: REWIND20_CODE, source: "rewind20_winback", expiresAt: reengagementExpiresAt };
    }
  }
  return { code: null, source: null, expiresAt: null };
}

function describeStatus(latestTrial, nowMs) {
  if (!latestTrial) return emptyStatus();

  const trialEndedAt = latestTrial.trial_end_at || null;
  const trialStartedAt = latestTrial.trial_start_at || null;
  const hasConverted = Boolean(latestTrial.converted_at);
  const optedOut = Boolean(latestTrial.reengagement_opted_out);
  const reengagementExpiresAt = latestTrial.reengagement_expires_at || null;
  const base = {
    ...emptyStatus(),
    trialStartedAt,
    trialLengthDays: latestTrial.trial_length_days || null,
    hasConverted,
    reengagementOptedOut: optedOut,
  };

  if (!trialEndedAt) return base;

  const endMs = new Date(trialEndedAt).getTime();
  if (Number.isNaN(endMs)) return base;

  const isExpired = !hasConverted && endMs <= nowMs;
  const daysSinceExpiry = isExpired ? Math.floor((nowMs - endMs) / DAY_MS) : null;
  const coupon = pickActiveCoupon({
    isExpired,
    daysSinceExpiry,
    reengagementExpiresAt,
    hasConverted,
    optedOut,
    nowMs,
  });

  return {
    ...base,
    isExpiredTrial: isExpired,
    trialEndedAt,
    daysSinceExpiry,
    couponEligible: Boolean(coupon.code),
    couponCode: coupon.code,
    couponSource: coupon.source,
    couponExpiresAt: coupon.expiresAt,
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const memberId = req.query?.memberId;
  if (!memberId) return res.status(400).json({ error: "memberId is required" });

  try {
    const supabase = getSupabase();
    const latestTrial = await getLatestTrialRow(supabase, memberId);
    const status = describeStatus(latestTrial, Date.now());
    return res.status(200).json({
      memberId,
      ...status,
      couponWindowDays: COUPON_WINDOW_DAYS,
    });
  } catch (err) {
    console.error("[trial-status] error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};
