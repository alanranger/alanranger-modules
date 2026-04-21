// Direct migration execution using Supabase client
// This uses the Supabase Management API if available
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function executeMigration() {
  const migrationSQL = `
    ALTER TABLE ms_members_cache
    ADD COLUMN IF NOT EXISTS photography_style TEXT,
    ADD COLUMN IF NOT EXISTS photography_style_percentage INTEGER,
    ADD COLUMN IF NOT EXISTS photography_style_description TEXT,
    ADD COLUMN IF NOT EXISTS photography_style_other_interests TEXT,
    ADD COLUMN IF NOT EXISTS photography_style_quiz_completed_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_ms_members_cache_photography_style 
    ON ms_members_cache(photography_style);

    COMMENT ON COLUMN ms_members_cache.photography_style IS 'Primary photography style from quiz (e.g., "Landscape Photographer")';
    COMMENT ON COLUMN ms_members_cache.photography_style_percentage IS 'Percentage match for primary style (0-100)';
    COMMENT ON COLUMN ms_members_cache.photography_style_description IS 'Description of the photography style';
    COMMENT ON COLUMN ms_members_cache.photography_style_other_interests IS 'Comma-separated list of other photography interests with percentages';
    COMMENT ON COLUMN ms_members_cache.photography_style_quiz_completed_at IS 'Timestamp when the quiz was completed';
  `;

  console.log("Migration SQL:");
  console.log(migrationSQL);
  console.log("\n⚠️  The Supabase JS client doesn't support raw SQL execution.");
  console.log("Please use the MCP apply_migration tool or run this in Supabase SQL Editor.");
}

executeMigration();
