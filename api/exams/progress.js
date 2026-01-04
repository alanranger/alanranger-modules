// /api/exams/progress.js
// Returns aggregated exam progress for current user (all 15 modules)
// Similar to admin progress but scoped to authenticated member

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight, getMemberstackToken, getMemberstackMemberId } = require("./_cors");

// All 15 modules in order
const ALL_MODULES = [
  'module-01-exposure',
  'module-02-aperture',
  'module-03-shutter',
  'module-04-iso',
  'module-05-manual',
  'module-06-metering',
  'module-07-bracketing',
  'module-08-focusing',
  'module-09-dof',
  'module-10-drange',
  'module-11-wb',
  'module-12-drive',
  'module-13-jpeg-raw',
  'module-14-sensors',
  'module-15-focal'
];

// Module display names
const MODULE_NAMES = {
  'module-01-exposure': 'Exposure',
  'module-02-aperture': 'Aperture',
  'module-03-shutter': 'Shutter',
  'module-04-iso': 'ISO',
  'module-05-manual': 'Manual',
  'module-06-metering': 'Metering',
  'module-07-bracketing': 'Bracketing',
  'module-08-focusing': 'Focusing',
  'module-09-dof': 'DoF',
  'module-10-drange': 'DRange',
  'module-11-wb': 'WB',
  'module-12-drive': 'Drive',
  'module-13-jpeg-raw': 'JPEG/RAW',
  'module-14-sensors': 'Sensors',
  'module-15-focal': 'Focal'
};

module.exports = async (req, res) => {
  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) return;

  // Set CORS headers for all responses
  setCorsHeaders(res);

  try {
    // Initialize Memberstack admin (gracefully handle if key is missing)
    let memberstack = null;
    try {
      if (process.env.MEMBERSTACK_SECRET_KEY) {
        memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
      }
    } catch (e) {
      console.warn("[progress] Memberstack admin init failed (non-critical):", e.message);
    }
    
    // Try token-based auth first (gracefully handle failures)
    let memberId = null;
    
    const token = getMemberstackToken(req);
    if (token && memberstack) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        memberId = id;
        console.log("[progress] Token verification successful, member ID:", memberId);
      } catch (e) {
        console.warn("[progress] Token verification failed (non-critical):", e.message);
        // Fall through to member ID fallback
      }
    }
    
    // Fallback: Use member ID header
    if (!memberId) {
      memberId = getMemberstackMemberId(req);
      if (memberId) {
        console.log("[progress] Using member ID from header:", memberId);
      }
    }
    
    if (!memberId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all exam results for this member by memberstack_id
    let { data: allExams, error: examError } = await supabase
      .from('module_results_ms')
      .select('module_id, score_percent, passed, attempt, created_at, email')
      .eq('memberstack_id', memberId)
      .order('created_at', { ascending: false });

    // EMAIL FALLBACK: If no results by memberstack_id, try email
    if ((!allExams || allExams.length === 0) && !examError) {
      console.log("[progress] No results by memberstack_id, trying email fallback...");
      
      // Get email from member cache
      let memberEmail = null;
      try {
        const { data: memberCache } = await supabase
          .from('ms_members_cache')
          .select('email')
          .eq('member_id', memberId)
          .single();
        
        if (memberCache && memberCache.email) {
          memberEmail = memberCache.email;
          console.log("[progress] Found email from cache:", memberEmail);
        }
      } catch (e) {
        console.warn("[progress] Member cache lookup failed:", e.message);
      }
      
      // If we have email, query by email
      if (memberEmail) {
        const { data: emailExams, error: emailError } = await supabase
          .from('module_results_ms')
          .select('module_id, score_percent, passed, attempt, created_at, email')
          .eq('email', memberEmail)
          .order('created_at', { ascending: false });
        
        if (emailError) {
          console.error("[progress] Email query error:", emailError);
        } else if (emailExams && emailExams.length > 0) {
          console.log(`[progress] Found ${emailExams.length} results by email fallback`);
          allExams = emailExams;
          examError = null;
        }
      }
    }

    if (examError) {
      console.error("[progress] Supabase error:", examError);
      return res.status(500).json({ error: examError.message });
    }

    // Group exams by module_id
    const memberModuleMap = {};
    
    allExams?.forEach(exam => {
      const moduleId = exam.module_id;
      const key = moduleId;
      
      if (!memberModuleMap[key]) {
        memberModuleMap[key] = {
          moduleId,
          attempts: [],
          scores: [],
          passed: false,
          firstPassedAt: null,
          lastAttemptAt: null
        };
      }
      
      memberModuleMap[key].attempts.push(exam.attempt || 1);
      memberModuleMap[key].scores.push(exam.score_percent);
      
      if (exam.passed) {
        memberModuleMap[key].passed = true;
        const examDate = new Date(exam.created_at);
        if (!memberModuleMap[key].firstPassedAt || examDate < memberModuleMap[key].firstPassedAt) {
          memberModuleMap[key].firstPassedAt = examDate;
        }
      }
      
      const examDate = new Date(exam.created_at);
      if (!memberModuleMap[key].lastAttemptAt || examDate > memberModuleMap[key].lastAttemptAt) {
        memberModuleMap[key].lastAttemptAt = examDate;
      }
    });

    // Build modules array (ensure all 15 are present)
    const modules = ALL_MODULES.map(moduleId => {
      const moduleData = memberModuleMap[moduleId];
      
      if (moduleData) {
        const attempts = Math.max(...moduleData.attempts);
        const bestScore = Math.max(...moduleData.scores);
        const passed = moduleData.passed;
        
        return {
          moduleId,
          label: moduleId.match(/module-(\d+)-/)?.[1]?.padStart(2, '0') || moduleId.replace('module-', '').substring(0, 2),
          name: MODULE_NAMES[moduleId] || moduleId,
          status: passed ? 'passed' : (attempts > 0 ? 'failed' : 'not_taken'),
          bestScore,
          attempts,
          lastAttemptAt: moduleData.lastAttemptAt?.toISOString() || null,
          firstPassedAt: moduleData.firstPassedAt?.toISOString() || null
        };
      }
      
      return {
        moduleId,
        label: moduleId.match(/module-(\d+)-/)?.[1]?.padStart(2, '0') || moduleId.replace('module-', '').substring(0, 2),
        name: MODULE_NAMES[moduleId] || moduleId,
        status: 'not_taken',
        bestScore: null,
        attempts: 0,
        lastAttemptAt: null,
        firstPassedAt: null
      };
    });

    // Calculate summary
    const passedCount = modules.filter(m => m.status === 'passed').length;
    const failedCount = modules.filter(m => m.status === 'failed').length;
    const totalAttempts = modules.reduce((sum, m) => sum + (m.attempts || 0), 0);
    
    // Find last exam date
    let lastExamAt = null;
    modules.forEach(m => {
      if (m.lastAttemptAt && (!lastExamAt || new Date(m.lastAttemptAt) > new Date(lastExamAt))) {
        lastExamAt = m.lastAttemptAt;
      }
    });

    // Get member info from cache (optional - for name/email)
    let memberName = null;
    let memberEmail = null;
    try {
      const { data: memberCache } = await supabase
        .from('ms_members_cache')
        .select('name, email')
        .eq('member_id', memberId)
        .single();
      
      if (memberCache) {
        memberName = memberCache.name;
        memberEmail = memberCache.email;
      }
    } catch (e) {
      // Ignore - member cache lookup is optional
    }

    return res.status(200).json({
      summary: {
        name: memberName,
        email: memberEmail,
        passedCount,
        failedCount,
        remainingCount: 15 - passedCount - failedCount,
        totalAttempts,
        lastExamAt
      },
      modules
    });
  } catch (e) {
    console.error("[progress] Error:", e);
    return res.status(500).json({ error: e.message || "Internal server error" });
  }
};
