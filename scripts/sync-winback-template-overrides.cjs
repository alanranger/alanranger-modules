#!/usr/bin/env node
/**
 * Sync coached win-back defaults into academy_email_templates (+30/+60 DB overrides).
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const { getDefault, STAGE_KEYS } = require("../lib/emailTemplateDefaults");

const ROOT = path.join(__dirname, "..");
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, ".env.local")));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY);

const STAGES = [
  STAGE_KEYS.DAY_PLUS_20,
  STAGE_KEYS.DAY_PLUS_30,
  STAGE_KEYS.DAY_PLUS_60,
  STAGE_KEYS.DAY_PLUS_90,
];

async function main() {
  for (const stageKey of STAGES) {
    const def = getDefault(stageKey);
    if (!def) continue;
    const { error } = await supabase.from("academy_email_templates").upsert(
      {
        stage_key: stageKey,
        label: def.label,
        subject: def.subject,
        body_md: def.body_md,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stage_key" }
    );
    if (error) throw new Error(`${stageKey}: ${error.message}`);
    console.log(`upserted ${stageKey}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
