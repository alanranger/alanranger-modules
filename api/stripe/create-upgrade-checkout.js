// api/stripe/create-upgrade-checkout.js
// POST handler for dashboard upgrade modal → Stripe Checkout.

const { createUpgradeCheckoutSession } = require("../../lib/upgradeCheckoutSession");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.alanranger.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Memberstack-Id");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { memberId, email, name, returnUrl } = parseJsonBody(req);
  if (!memberId || !email) {
    return res.status(400).json({ error: "memberId and email are required" });
  }

  try {
    const checkout = await createUpgradeCheckoutSession({
      memberId,
      email,
      name,
      returnUrl,
      metadataSource: "dashboard_upgrade_modal",
    });
    return res.status(200).json(checkout);
  } catch (err) {
    console.error("[create-upgrade-checkout] error:", err);
    return res.status(500).json({ error: "Failed to create checkout session", details: err.message });
  }
};
