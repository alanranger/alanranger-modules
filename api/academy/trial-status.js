// api/academy/trial-status.js
// Tells the dashboard whether a logged-in member is an expired-trial user
// and whether the SAVE20 grace-period coupon still applies.
//
// This is the single source of truth for the "locked dashboard" mode:
// Memberstack itself sometimes strips the expired trial plan connection
// entirely, so we can't rely on planConnections alone. Instead we look at
// academy_trial_history (populated by the Stripe webhook and admin refresh).
//
// Response shape:
//   {
//     memberId: string,
//     isExpiredTrial: boolean,   // true if they had a trial and it has ended
//     hasConverted: boolean,     // true if trial already converted to annual
//     trialStartedAt: ISO | null,
//     trialEndedAt:   ISO | null,
//     trialLengthDays: number | null,
//     daysSinceExpiry: number | null,
//     couponEligible: boolean,   // true when daysSinceExpiry is 0..7 inclusive
//     couponCode: "SAVE20" | null,
//     couponWindowDays: 7
//   }

const { createClient } = require("@supabase/supabase-js");

const UPGRADE_COUPON_CODE = "SAVE20";
const UPGRADE_COUPON_WINDOW_DAYS = 7;
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
    .select("trial_start_at, trial_end_at, trial_length_days, converted_at")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function describeStatus(latestTrial, nowMs) {
  const empty = {
    isExpiredTrial: false,
    hasConverted: false,
    trialStartedAt: null,
    trialEndedAt: null,
    trialLengthDays: null,
    daysSinceExpiry: null,
    couponEligible: false,
    couponCode: null,
  };
  if (!latestTrial) return empty;

  const trialEndedAt = latestTrial.trial_end_at || null;
  const trialStartedAt = latestTrial.trial_start_at || null;
  const hasConverted = Boolean(latestTrial.converted_at);

  if (!trialEndedAt) {
    return { ...empty, trialStartedAt, trialLengthDays: latestTrial.trial_length_days || null };
  }

  const endMs = new Date(trialEndedAt).getTime();
  if (isNaN(endMs)) {
    return { ...empty, trialStartedAt, trialLengthDays: latestTrial.trial_length_days || null };
  }

  const isExpired = !hasConverted && endMs <= nowMs;
  const daysSinceExpiry = isExpired ? Math.floor((nowMs - endMs) / DAY_MS) : null;
  const couponEligible =
    isExpired && daysSinceExpiry !== null && daysSinceExpiry <= UPGRADE_COUPON_WINDOW_DAYS;

  return {
    isExpiredTrial: isExpired,
    hasConverted,
    trialStartedAt,
    trialEndedAt,
    trialLengthDays: latestTrial.trial_length_days || null,
    daysSinceExpiry,
    couponEligible,
    couponCode: couponEligible ? UPGRADE_COUPON_CODE : null,
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
      couponWindowDays: UPGRADE_COUPON_WINDOW_DAYS,
    });
  } catch (err) {
    console.error("[trial-status] error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};
