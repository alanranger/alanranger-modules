// scripts/populate-example-questions.js
// Populates all existing members with 4 example Q&A questions
// Run this once to seed example questions for all current members

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The 4 example questions from info@alanranger.com
const EXAMPLE_QUESTIONS = [
  {
    question: "What tripod do you recommend?",
    page_url: "https://www.alanranger.com/academy/photography-questions-answers",
    answer: "For tripods, I recommend lightweight carbon fiber models for travel, or sturdy aluminum for studio work. Look for features like quick-release plates and adjustable leg angles. I have detailed guides covering specific recommendations and technical details.\n\nRelated guides:\n- [Recommended Lightweight Tripods | Professional Guide](https://www.alanranger.com/blog-on-photography/recommended-travel-lightweight-tripods)\n- [Best Tripod for Landscape Photography Benro Mammoth + GD36PT](https://www.alanranger.com/blog-on-photography/best-tripod-for-landscape-photography)\n- [Handheld vs Tripod Stability Photography Assignment](https://www.alanranger.com/blog-on-photography/handheld-vs-tripod-stability-photography-assignment)\n- [Manfrotto Befree Tripod Review: A Compact Travel Companion](https://www.alanranger.com/blog-on-photography/manfrotto-befree-tripod-review)\n- [Tripods – Photographers Best Friend or Creativity Stifler ](https://www.alanranger.com/blog-on-photography/tripods-a-photographers-best-friend)\n- [The Perfect Travel Tripod: Benro Cyanbird Tripod Review](https://www.alanranger.com/blog-on-photography/the-perfect-travel-tripod-benro-cyanbird)",
    answered_at: "2026-01-06T14:51:07.849Z",
    answered_by: "Robo-Ranger",
    answer_source: "ai",
    status: "answered"
  },
  {
    question: "why do my pictures look blurry and not sharp",
    page_url: "https://www.alanranger.com/academy/photography-questions-answers",
    answer: "Soft photos usually come from three things: focus missing the subject, shutter speed being too slow, or small camera shake.\n\nTry this now:\n• Use single‑point AF (AF‑C for moving subjects).\n• Raise shutter speed: at least 1/(focal length); 1/500–1/1000 for motion.\n• Stabilise the camera: brace stance, enable IBIS/VR, or use a tripod.\n\nWant a full checklist and tests? Ask: \"show sharpness checklist\".\n\nRelated guides:\n- [08 What is FOCUS in Photography: Key Concepts Explained](https://www.alanranger.com/blog-on-photography/what-is-focus-in-photography)\n- [Camera Focus Plane Checklist Photography Guide - 1 Page](https://www.alanranger.com/blog-on-photography/camera-focus-plane)\n- [Movement and Intentional Blur Photography Assignment](https://www.alanranger.com/blog-on-photography/movement-and-intentional-blur-photography-assignment)\n- [Focus Modes and Tracking Photography Practice Assignment](https://www.alanranger.com/blog-on-photography/focus-modes-and-tracking)\n- [Depth of Field Checklist Photography Guide - 1 Page ](https://www.alanranger.com/blog-on-photography/depth-of-field-checklist)\n- [Long Exposure Photography Guide - 1 Page Field Checklist](https://www.alanranger.com/blog-on-photography/long-exposure-photography-guide)",
    answered_at: "2026-01-06T13:47:45.634Z",
    answered_by: "Robo-Ranger",
    answer_source: "ai",
    status: "answered"
  },
  {
    question: "What do you think about UV filters?",
    page_url: "https://www.alanranger.com/academy/photography-questions-answers",
    answer: "For filter, I recommend focusing on quality over quantity. Look for reputable brands with good warranties and user reviews. I have detailed guides covering specific recommendations and technical details.\n\nRelated guides:\n- [Filters Mastery ND GND Photography Practice Assignment](https://www.alanranger.com/blog-on-photography/filters-mastery-nd-gnd-photography)\n- [Kase Filters and Adobe Lightroom Queen Partner Deals |](https://www.alanranger.com/blog-on-photography/kase-filters-and-lightroom-queen-deals)\n- [Are camera UV filters worth it? Pros and cons explained](https://www.alanranger.com/blog-on-photography/are-camera-uv-filters-worth-it)\n- [Photographic Filters:Enhancing Your Photos with Kase Filters](https://www.alanranger.com/blog-on-photography/enhancing-your-photography-with-kase-filters)\n- [What do CAMERA LENS FILTERS DO: A Guide for Beginners](https://www.alanranger.com/blog-on-photography/what-do-camera-lens-filters-do)\n- [Do You Know Your Camera Filters? | Professional Guide](https://www.alanranger.com/blog-on-photography/know-your-camera-filters)",
    answered_at: "2026-01-06T11:46:31.473Z",
    answered_by: "Robo-Ranger",
    answer_source: "ai",
    status: "answered"
  },
  {
    question: "what is the best camera for a beginner",
    page_url: "https://www.alanranger.com/academy/photography-questions-answers",
    answer: "For beginners, I recommend starting with a mirrorless camera or DSLR with good auto modes. Look for cameras with built-in tutorials and scene modes to help you learn. I have detailed guides covering specific recommendations and technical details.\n\nRelated guides:\n- [14 FULL FRAME VS CROPPED SENSOR: Which Camera is best?](https://www.alanranger.com/blog-on-photography/full-frame-vs-cropped-sensor)\n- [Full Frame or Crop Sensor - Checklist Photography Guide](https://www.alanranger.com/blog-on-photography/full-frame-or-crop-sensor)\n- [Are Mirrorless Cameras Better Than DSLRs: A Comparison](https://www.alanranger.com/blog-on-photography/are-mirrorless-cameras-better-than-dslrs)\n- [Camera Maintenance – DSLR Sensor Cleaning | A Guide](https://www.alanranger.com/blog-on-photography/keeping-sensors-clean-sensor-cleaning)\n- [How Mirrorless Cameras Are Shaping Photography's Future](https://www.alanranger.com/blog-on-photography/how-mirrorless-cameras-are-shaping-photography)\n- [BEST CAMERA BAGS for Different Trips :  My 2024 Picks](https://www.alanranger.com/blog-on-photography/best-camera-bags-for-different-trips)",
    answered_at: "2026-01-06T09:21:49.049Z",
    answered_by: "Robo-Ranger",
    answer_source: "ai",
    status: "answered"
  }
];

async function populateExampleQuestions() {
  try {
    // Get all members from cache
    const { data: members, error: membersError } = await supabase
      .from('ms_members_cache')
      .select('member_id, email, name')
      .not('member_id', 'is', null);

    if (membersError) {
      throw new Error(`Failed to fetch members: ${membersError.message}`);
    }

    if (!members || members.length === 0) {
      console.log('No members found in cache.');
      return;
    }

    console.log(`Found ${members.length} members. Populating example questions...`);

    let totalInserted = 0;
    let totalSkipped = 0;

    for (const member of members) {
      // Check if member already has example questions
      const { data: existingExamples } = await supabase
        .from('academy_qa_questions')
        .select('id')
        .eq('member_id', member.member_id)
        .eq('is_example', true)
        .limit(1);

      if (existingExamples && existingExamples.length > 0) {
        console.log(`  Skipping ${member.email || member.member_id} - already has example questions`);
        totalSkipped++;
        continue;
      }

      // Insert all 4 example questions for this member
      const questionsToInsert = EXAMPLE_QUESTIONS.map(q => ({
        question: q.question + ' (example)',
        page_url: q.page_url,
        member_id: member.member_id,
        member_email: member.email || null,
        member_name: member.name || null,
        answer: q.answer,
        answered_at: q.answered_at,
        answered_by: q.answered_by,
        answer_source: q.answer_source,
        status: q.status,
        is_example: true,
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('academy_qa_questions')
        .insert(questionsToInsert);

      if (insertError) {
        console.error(`  Error inserting questions for ${member.email || member.member_id}:`, insertError.message);
      } else {
        console.log(`  ✓ Added 4 example questions for ${member.email || member.member_id}`);
        totalInserted += 4;
      }
    }

    console.log(`\n✅ Complete!`);
    console.log(`   - Questions inserted: ${totalInserted}`);
    console.log(`   - Members skipped (already have examples): ${totalSkipped}`);
    console.log(`   - Total members processed: ${members.length}`);

  } catch (error) {
    console.error('Error populating example questions:', error);
    process.exit(1);
  }
}

// Run the script
populateExampleQuestions();
