// Script to run photography quiz migration on Supabase
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRjc3Zxc2ZnYnFtbm9ua3B0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk5MDgyNSwiZXhwIjoyMDcyNTY2ODI1fQ.TZEPWKNMqPXWCC3WDh11Xf_yzaw_hogdrkSYZe3PY1U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  try {
    console.log("Running photography quiz migration...\n");

    // Execute migration SQL statements
    const migrationSQL = `
      -- Add columns
      ALTER TABLE ms_members_cache
      ADD COLUMN IF NOT EXISTS photography_style TEXT,
      ADD COLUMN IF NOT EXISTS photography_style_percentage INTEGER,
      ADD COLUMN IF NOT EXISTS photography_style_description TEXT,
      ADD COLUMN IF NOT EXISTS photography_style_other_interests TEXT,
      ADD COLUMN IF NOT EXISTS photography_style_quiz_completed_at TIMESTAMPTZ;

      -- Add index
      CREATE INDEX IF NOT EXISTS idx_ms_members_cache_photography_style 
      ON ms_members_cache(photography_style);
    `;

    // Note: Supabase JS client doesn't support raw SQL execution directly
    // We need to use RPC or execute via SQL editor
    // For now, we'll verify the columns exist by checking the schema
    
    console.log("Migration SQL to execute:");
    console.log(migrationSQL);
    console.log("\n⚠️  Note: Supabase JS client doesn't support raw SQL execution.");
    console.log("Please run this SQL in Supabase SQL Editor:");
    console.log("\n" + "=".repeat(60));
    
    const fs = require('fs');
    const migrationFile = fs.readFileSync('./supabase-photography-quiz-migration.sql', 'utf8');
    console.log(migrationFile);
    
    console.log("\n" + "=".repeat(60));
    console.log("\nAlternatively, you can verify columns exist by querying:");
    
    // Try to verify by querying the table structure
    const { data, error } = await supabase
      .from('ms_members_cache')
      .select('photography_style')
      .limit(1);
    
    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log("\n❌ Columns do not exist yet. Please run the migration SQL in Supabase SQL Editor.");
      } else {
        console.log("\n⚠️  Error checking columns:", error.message);
        console.log("This might mean columns don't exist yet.");
      }
    } else {
      console.log("\n✅ Columns appear to exist (or query succeeded).");
      console.log("Migration may have already been run, or columns were added manually.");
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

runMigration();
