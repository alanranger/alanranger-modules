// api/admin/emails-templates.js
//
// GET endpoint that returns every academy_email_templates + academy_email_
// schedules row, merged with the defaults shipped in lib/emailTemplateDefaults
// .js. One row per stage_key, shaped for the admin UI's Templates viewer /
// editor:
//
//   {
//     stage_key:       "day-minus-7",
//     label:           "Day -7 · Mid-trial check-in",
//     default_subject: "You're Halfway Through...",
//     default_body_md: "Hi {{firstName}}...",
//     override_subject: null,                  // null = no DB override
//     override_body_md: null,
//     effective_subject: "You're Halfway...",  // override || default
//     effective_body_md: "Hi {{firstName}}...",// override || default
//     schedule: {
//       enabled, days_offset, send_hour_london, send_days,
//       stage_type, webhook_path, updated_at, updated_by,
//     },
//     template_updated_at,
//     template_updated_by,
//   }
//
// This endpoint is read-only in Phase 2. The Phase 3 editor will POST back
// to a sibling endpoint (emails-templates-save.js) to persist overrides.

const { createClient } = require("@supabase/supabase-js");
const {
  STAGE_KEYS,
  DEFAULTS,
  MERGE_TAG_DOCS,
  listStageKeys,
} = require("../../lib/emailTemplateDefaults");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function fetchTemplates() {
  const { data, error } = await supabase
    .from("academy_email_templates")
    .select("stage_key, label, subject, body_md, preheader, notes, updated_at, updated_by");
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) map.set(row.stage_key, row);
  return map;
}

async function fetchSchedules() {
  const { data, error } = await supabase
    .from("academy_email_schedules")
    .select(
      "stage_key, enabled, days_offset, send_hour_london, send_days, stage_type, webhook_path, updated_at, updated_by"
    );
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) map.set(row.stage_key, row);
  return map;
}

function buildStageRow(stageKey, templatesMap, schedulesMap) {
  const tpl = templatesMap.get(stageKey) || {};
  const sched = schedulesMap.get(stageKey) || null;
  const def = DEFAULTS[stageKey] || { label: stageKey, subject: null, body_md: null };
  const override_subject = tpl.subject || null;
  const override_body_md = tpl.body_md || null;
  return {
    stage_key: stageKey,
    label: tpl.label || def.label,
    preheader: tpl.preheader || null,
    notes: tpl.notes || null,
    default_subject: def.subject,
    default_body_md: def.body_md,
    override_subject,
    override_body_md,
    effective_subject: override_subject || def.subject,
    effective_body_md: override_body_md || def.body_md,
    is_overridden: Boolean(override_subject || override_body_md),
    template_updated_at: tpl.updated_at || null,
    template_updated_by: tpl.updated_by || null,
    schedule: sched,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!supabase) {
    return res
      .status(500)
      .json({ error: "Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)" });
  }

  try {
    const [templatesMap, schedulesMap] = await Promise.all([
      fetchTemplates(),
      fetchSchedules(),
    ]);
    const stages = listStageKeys().map((key) =>
      buildStageRow(key, templatesMap, schedulesMap)
    );
    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      stage_keys: STAGE_KEYS,
      merge_tags: MERGE_TAG_DOCS,
      stages,
    });
  } catch (err) {
    console.error("[emails-templates] unexpected failure:", err);
    return res.status(500).json({ error: err.message || "unknown error" });
  }
};
