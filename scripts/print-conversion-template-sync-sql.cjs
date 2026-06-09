/** Sync conversion stage DB overrides from code defaults (run once, then apply via Supabase MCP). */
const { getDefault } = require("../lib/emailTemplateDefaults");

const STAGES = ["day-plus-20", "day-plus-30", "day-plus-60", "day-plus-90"];

for (const stageKey of STAGES) {
  const def = getDefault(stageKey);
  if (!def) throw new Error(`missing default for ${stageKey}`);
  const subject = def.subject.replace(/'/g, "''");
  const body = def.body_md;
  console.log(
    `UPDATE academy_email_templates SET subject = '${subject}', body_md = $tmpl$${body}$tmpl$, updated_at = now() WHERE stage_key = '${stageKey}';`
  );
}
