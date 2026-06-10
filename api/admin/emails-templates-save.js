// api/admin/emails-templates-save.js
//
// POST endpoint to save an admin edit of an academy email template. Writes
// the provided subject / body_md / preheader to academy_email_templates.
// The "revert" flag clears subject + body_md back to NULL so the webhook
// falls back to the shipped default content.
//
// Request body:
//   {
//     stage_key: "day-minus-7" | "day-minus-1" | ... | "day-plus-60",
//     subject:   "..." | null,
//     body_md:   "..." | null,
//     preheader: "..." | null,   (optional)
//     revert:    true | false,   (optional — true clears subject + body_md)
//     updated_by: "email@address" (optional — recorded on the row)
//   }
//
// Response:
//   {
//     success: true,
//     stage_key: "...",
//     row: { ...full academy_email_templates row after update... }
//   }

const { createClient } = require("@supabase/supabase-js");
const { listStageKeys } = require("../../lib/emailTemplateDefaults");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const VALID_STAGES = new Set(listStageKeys());

function sanitize(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : String(value);
}

function buildUpdatePayload(body) {
  if (body.revert === true) {
    return { subject: null, body_md: null };
  }
  const payload = {
    subject: sanitize(body.subject),
    body_md: sanitize(body.body_md),
  };
  if (Object.hasOwn(body, "preheader")) {
    payload.preheader = sanitize(body.preheader);
  }
  return payload;
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const stageKey = body.stage_key;
  if (!stageKey || !VALID_STAGES.has(stageKey)) {
    return res.status(400).json({ error: `Unknown stage_key: ${stageKey}` });
  }

  const update = buildUpdatePayload(body);
  update.updated_at = new Date().toISOString();
  if (body.updated_by) update.updated_by = String(body.updated_by).slice(0, 200);

  try {
    const { data, error } = await supabase
      .from("academy_email_templates")
      .update(update)
      .eq("stage_key", stageKey)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: `stage_key not found: ${stageKey}` });
    }
    return res.status(200).json({ success: true, stage_key: stageKey, row: data });
  } catch (err) {
    console.error("[emails-templates-save] update failed:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
