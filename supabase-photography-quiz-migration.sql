-- Migration: Add photography style quiz result fields to ms_members_cache table
-- Run this in Supabase SQL Editor

ALTER TABLE ms_members_cache
ADD COLUMN IF NOT EXISTS photography_style TEXT,
ADD COLUMN IF NOT EXISTS photography_style_percentage INTEGER,
ADD COLUMN IF NOT EXISTS photography_style_description TEXT,
ADD COLUMN IF NOT EXISTS photography_style_other_interests TEXT,
ADD COLUMN IF NOT EXISTS photography_style_quiz_completed_at TIMESTAMPTZ;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_ms_members_cache_photography_style 
ON ms_members_cache(photography_style);

-- Add comment to document the fields
COMMENT ON COLUMN ms_members_cache.photography_style IS 'Primary photography style from quiz (e.g., "Landscape Photographer")';
COMMENT ON COLUMN ms_members_cache.photography_style_percentage IS 'Percentage match for primary style (0-100)';
COMMENT ON COLUMN ms_members_cache.photography_style_description IS 'Description of the photography style';
COMMENT ON COLUMN ms_members_cache.photography_style_other_interests IS 'Comma-separated list of other photography interests with percentages';
COMMENT ON COLUMN ms_members_cache.photography_style_quiz_completed_at IS 'Timestamp when the quiz was completed';
