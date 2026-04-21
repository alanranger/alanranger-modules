// GET /api/admin/email-stages
//   -> returns the full stage list (lib/emailStages.js) so the admin UI can
//      render the Emails tab. No secrets, no member data — just metadata.
//
// GET /api/admin/email-stages?key=<stageKey>&email=<memberEmail>
//   -> proxies to the underlying webhook in dry-run mode, returning
//      { success, stage, member, preview: { subject, body, html } }
//      so the UI can render the full email against any chosen member.
//
// POST /api/admin/email-stages?key=<stageKey>&email=<memberEmail>
//   -> proxies to the underlying webhook with sendEmail=true, actually
//      firing a one-off test send. Still BCCs info@alanranger.com (the
//      webhook does that unconditionally), so every test is archived.
//
// This endpoint is the ONLY thing the Emails admin tab talks to. It fans
// out to both trial-expiry-reminder-webhook and lapsed-trial-reengagement-
// webhook under the hood. Keeping one façade means the UI doesn't need to
// know which webhook owns which stage.

const { EMAIL_STAGES, getStageByKey } = require("../../../lib/emailStages");

function getBaseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function buildQueryString(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

async function proxyToWebhook({ req, webhookPath, params, email }) {
  const baseUrl = getBaseUrl(req);
  const merged = { ...params, testEmail: email };
  const url = `${baseUrl}${webhookPath}?${buildQueryString(merged)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      // Forward the cron secret if present so internal proxying stays
      // authenticated; webhook auth also falls back to warn-and-allow
      // so this is belt-and-braces.
      authorization: process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "",
    },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function extractPreview(webhookData) {
  // trial-expiry-reminder returns preview at top-level in dry-run mode.
  if (webhookData?.email_content_preview?.subject) return webhookData.email_content_preview;
  if (webhookData?.preview?.subject) return webhookData.preview;
  // lapsed-trial-reengagement nests the dry-run result under `.result`.
  if (webhookData?.result?.preview?.subject) return webhookData.result.preview;
  return null;
}

async function handleList(req, res) {
  return res.status(200).json({
    success: true,
    stages: EMAIL_STAGES.map((s) => ({
      key: s.key,
      displayName: s.displayName,
      daysFromTrialExpiry: s.daysFromTrialExpiry,
      sentBy: s.sentBy,
      schedule: s.schedule,
      description: s.description,
    })),
  });
}

async function handlePreview(req, res) {
  const key = String(req.query.key || "");
  const email = String(req.query.email || "").trim();
  const stage = getStageByKey(key);
  if (!stage) return res.status(404).json({ error: "Unknown stage key" });
  if (!email) return res.status(400).json({ error: "email query param is required" });

  const { status, data } = await proxyToWebhook({
    req,
    webhookPath: stage.preview.webhook,
    params: stage.preview.params,
    email,
  });

  if (status !== 200 || data?.success === false) {
    return res.status(status || 500).json({
      success: false,
      error: data?.error || "Preview failed",
      raw: data,
    });
  }
  const preview = extractPreview(data);
  if (!preview) {
    return res.status(500).json({
      success: false,
      error: "Webhook did not return a preview. Check dry-run response shape.",
      raw: data,
    });
  }
  return res.status(200).json({
    success: true,
    stage: {
      key: stage.key,
      displayName: stage.displayName,
      sentBy: stage.sentBy,
      schedule: stage.schedule,
    },
    member: { email },
    preview,
  });
}

async function handleTestSend(req, res) {
  const key = String(req.query.key || "");
  const email = String(req.query.email || "").trim();
  const stage = getStageByKey(key);
  if (!stage) return res.status(404).json({ error: "Unknown stage key" });
  if (!email) return res.status(400).json({ error: "email query param is required" });

  const { status, data } = await proxyToWebhook({
    req,
    webhookPath: stage.testSend.webhook,
    params: stage.testSend.params,
    email,
  });
  return res.status(status || 200).json({
    success: status === 200 && data?.success !== false,
    stage: { key: stage.key, displayName: stage.displayName },
    member: { email },
    result: data,
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") return handleTestSend(req, res);
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (req.query.key) return handlePreview(req, res);
    return handleList(req, res);
  } catch (err) {
    console.error("[email-stages] unexpected error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
