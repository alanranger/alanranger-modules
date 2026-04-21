// /api/admin/expired-trials-check.js
// Checks expired trial member IDs against Memberstack

const { createClient } = require("@supabase/supabase-js");
const memberstackAdmin = require("@memberstack/admin");
const { checkAdminAccess } = require("./_auth");

const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
};

const isWebhookAuthorized = (req) => {
  const secret = process.env.ORPHANED_WEBHOOK_SECRET;
  if (!secret) return false;
  const headerSecret = req.headers["x-webhook-secret"];
  const querySecret = req.query?.secret;
  return headerSecret === secret || querySecret === secret;
};

const fetchExpiredTrials = async (supabase) => {
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select("member_id, trial_end_at, converted_at")
    .lte("trial_end_at", new Date().toISOString())
    .order("trial_end_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load expired trials");
  }
  return data || [];
};

const checkMemberstack = async (memberstack, trialRows) => {
  const exists = [];
  const missing = [];
  const errors = [];

  for (const row of trialRows) {
    if (!row?.member_id) continue;
    try {
      const { data } = await memberstack.members.retrieve({ id: row.member_id });
      if (data?.id) {
        exists.push({
          member_id: row.member_id,
          email: data.auth?.email || data.email || null,
          status: data.status || null,
          trial_end_at: row.trial_end_at || null,
          converted_at: row.converted_at || null
        });
      } else {
        missing.push({
          member_id: row.member_id,
          trial_end_at: row.trial_end_at || null,
          converted_at: row.converted_at || null
        });
      }
    } catch (error) {
      errors.push({
        member_id: row.member_id,
        trial_end_at: row.trial_end_at || null,
        converted_at: row.converted_at || null,
        error: error.message
      });
    }
  }

  return { exists, missing, errors };
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://www.alanranger.com");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Memberstack-Id, X-Webhook-Secret");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const webhookAuthorized = isWebhookAuthorized(req);
    if (!webhookAuthorized) {
      const { isAdmin, error: authError } = await checkAdminAccess(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required", details: authError || "Not authorized" });
      }
    }

    if (!process.env.MEMBERSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "MEMBERSTACK_SECRET_KEY not configured" });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured" });
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    const expiredTrials = await fetchExpiredTrials(supabase);

    const results = await checkMemberstack(memberstack, expiredTrials);

    return res.status(200).json({
      total_expired_trials: expiredTrials.length,
      checked: results.exists.length + results.missing.length + results.errors.length,
      exists: results.exists,
      missing: results.missing,
      errors: results.errors
    });
  } catch (error) {
    console.error("[expired-trials-check] Error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
