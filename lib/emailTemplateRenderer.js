// lib/emailTemplateRenderer.js
//
// Thin async helper that fetches per-stage template overrides from
// academy_email_templates and composes them with the shipped defaults +
// renderTemplate() helper. Webhooks call renderStageEmail() to produce
// { subject, body } strings; any DB override wins field-by-field.
//
// Failure modes are deliberately quiet: if Supabase is unconfigured or the
// query errors, we fall back to the inline default. Email sends are
// mission-critical — never crash because of a template-lookup glitch.

const { getDefault, renderTemplate } = require("./emailTemplateDefaults");

async function loadOverride(supabase, stageKey) {
  if (!supabase || !stageKey) return null;
  try {
    const { data, error } = await supabase
      .from("academy_email_templates")
      .select("subject, body_md")
      .eq("stage_key", stageKey)
      .maybeSingle();
    if (error || !data) return null;
    return {
      subject: data.subject || null,
      body_md: data.body_md || null,
    };
  } catch (err) {
    console.warn(`[email-template-renderer] override lookup failed for ${stageKey}:`, err.message);
    return null;
  }
}

async function resolveTemplate(supabase, stageKey) {
  const def = getDefault(stageKey);
  if (!def) return null;
  const override = await loadOverride(supabase, stageKey);
  return {
    subject: override?.subject || def.subject,
    body_md: override?.body_md || def.body_md,
    is_overridden: Boolean(override?.subject || override?.body_md),
  };
}

async function renderStageEmail(supabase, stageKey, vars) {
  const tpl = await resolveTemplate(supabase, stageKey);
  if (!tpl) return null;
  return {
    subject: renderTemplate(tpl.subject, vars),
    body: renderTemplate(tpl.body_md, vars),
    is_overridden: tpl.is_overridden,
  };
}

module.exports = {
  loadOverride,
  resolveTemplate,
  renderStageEmail,
};
