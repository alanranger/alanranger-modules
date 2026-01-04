// /api/admin/progress.js
// Returns aggregated exam progress per member (one row per user)
// Aggregates module_results_ms into member-level progress with module breakdown

const { createClient } = require("@supabase/supabase-js");

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

module.exports = async (req, res) => {
  try {
    const { period = 'lifetime', sort = 'progress_asc', search = '' } = req.query;
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Build date filter for period (only affects activity metrics, not lifetime progress)
    // Progress (passed/15) is always lifetime, but attempts/last exam can be period-filtered
    const now = new Date();
    let periodStartDate = null;
    if (period !== 'lifetime') {
      if (period === '24h') {
        periodStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (period === '7d') {
        periodStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === '30d') {
        periodStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === '90d') {
        periodStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }
    }

    // Always fetch ALL exam results for lifetime progress calculation
    // We'll filter by period later for activity metrics only
    const { data: allExams, error: examError } = await supabase
      .from('module_results_ms')
      .select('memberstack_id, email, module_id, score_percent, passed, attempt, created_at');
    
    if (examError) throw examError;

    // Get member names from cache
    const { data: membersCache } = await supabase
      .from('ms_members_cache')
      .select('member_id, email, name');

    const memberNameMap = {};
    const memberEmailMap = {};
    membersCache?.forEach(m => {
      memberNameMap[m.member_id] = m.name;
      memberEmailMap[m.member_id] = m.email;
    });

    // Group exams by member_id + module_id
    const memberModuleMap = {};
    
    allExams?.forEach(exam => {
      const memberId = exam.memberstack_id;
      const moduleId = exam.module_id;
      const key = `${memberId}::${moduleId}`;
      
      if (!memberModuleMap[key]) {
        memberModuleMap[key] = {
          memberId,
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

    // Aggregate per member
    const memberProgressMap = {};
    
    Object.values(memberModuleMap).forEach(moduleData => {
      const memberId = moduleData.memberId;
      
      if (!memberProgressMap[memberId]) {
        memberProgressMap[memberId] = {
          member_id: memberId,
          email: memberEmailMap[memberId] || allExams.find(e => e.memberstack_id === memberId)?.email || null,
          name: memberNameMap[memberId] || null,
          modules: {},
          passedCount: 0,
          failedCount: 0,
          remainingCount: 15,
          totalAttempts: 0,
          lastExamAt: null,
          lastModulePassed: null
        };
      }
      
      const member = memberProgressMap[memberId];
      const moduleId = moduleData.moduleId;
      
      // Calculate module stats
      // Attempts = count of unique attempts (max attempt number, or count if not reliable)
      const attempts = moduleData.attempts.length > 0 ? Math.max(...moduleData.attempts) : 0;
      const bestScore = moduleData.scores.length > 0 ? Math.max(...moduleData.scores) : 0;
      const passed = moduleData.passed;
      
      member.modules[moduleId] = {
        moduleId,
        status: passed ? 'passed' : (attempts > 0 ? 'failed' : 'not_taken'),
        bestScore,
        attempts,
        lastAttemptAt: moduleData.lastAttemptAt?.toISOString() || null,
        firstPassedAt: moduleData.firstPassedAt?.toISOString() || null
      };
      
      if (passed) {
        member.passedCount++;
        member.remainingCount--;
        
        // Track last module passed
        if (!member.lastModulePassed || moduleData.firstPassedAt > new Date(member.lastModulePassed.passedAt)) {
          member.lastModulePassed = {
            moduleId,
            passedAt: moduleData.firstPassedAt.toISOString(),
            score: bestScore
          };
        }
      } else if (attempts > 0) {
        member.failedCount++;
        member.remainingCount--;
      }
      
      // For activity metrics, only count attempts/exams within the period
      // But progress (passed/15) is always lifetime
      const moduleAttemptsInPeriod = periodStartDate 
        ? allExams.filter(e => 
            e.memberstack_id === memberId && 
            e.module_id === moduleId &&
            new Date(e.created_at) >= periodStartDate
          ).length
        : (attempts || 0);
      
      if (moduleAttemptsInPeriod > 0) {
        member.totalAttempts += moduleAttemptsInPeriod;
      }
      
      // Track last exam date (period-filtered for activity metrics)
      if (periodStartDate) {
        // Only count exams in the period
        const periodExams = allExams.filter(e => 
          e.memberstack_id === memberId && 
          e.module_id === moduleId &&
          new Date(e.created_at) >= periodStartDate
        );
        if (periodExams.length > 0) {
          const latestPeriodExam = periodExams.reduce((latest, exam) => {
            return new Date(exam.created_at) > new Date(latest.created_at) ? exam : latest;
          });
          if (!member.lastExamAt || new Date(latestPeriodExam.created_at) > new Date(member.lastExamAt)) {
            member.lastExamAt = latestPeriodExam.created_at;
          }
        }
      } else {
        // Lifetime: use all exams
        if (!member.lastExamAt || moduleData.lastAttemptAt > new Date(member.lastExamAt)) {
          member.lastExamAt = moduleData.lastAttemptAt.toISOString();
        }
      }
    });

    // Convert to array and ensure all 15 modules are represented
    const result = Object.values(memberProgressMap).map(member => {
      // Ensure all 15 modules are in the modules array
      const modulesArray = ALL_MODULES.map(moduleId => {
        if (member.modules[moduleId]) {
          return member.modules[moduleId];
        }
        return {
          moduleId,
          status: 'not_taken',
          bestScore: null,
          attempts: 0,
          lastAttemptAt: null,
          firstPassedAt: null
        };
      });
      
      return {
        member_id: member.member_id,
        name: member.name,
        email: member.email,
        passedCount: member.passedCount,
        failedCount: member.failedCount,
        remainingCount: member.remainingCount,
        totalAttempts: member.totalAttempts,
        lastExamAt: member.lastExamAt,
        lastModulePassed: member.lastModulePassed,
        modules: modulesArray
      };
    });

    // Apply search filter
    let filtered = result;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = result.filter(m => 
        (m.name && m.name.toLowerCase().includes(searchLower)) ||
        (m.email && m.email.toLowerCase().includes(searchLower))
      );
    }

    // Apply sorting
    let sorted = filtered;
    if (sort === 'progress_asc') {
      sorted = filtered.sort((a, b) => a.passedCount - b.passedCount);
    } else if (sort === 'progress_desc') {
      sorted = filtered.sort((a, b) => b.passedCount - a.passedCount);
    } else if (sort === 'last_exam_desc') {
      sorted = filtered.sort((a, b) => {
        if (!a.lastExamAt && !b.lastExamAt) return 0;
        if (!a.lastExamAt) return 1;
        if (!b.lastExamAt) return -1;
        return new Date(b.lastExamAt) - new Date(a.lastExamAt);
      });
    } else if (sort === 'last_exam_asc') {
      sorted = filtered.sort((a, b) => {
        if (!a.lastExamAt && !b.lastExamAt) return 0;
        if (!a.lastExamAt) return 1;
        if (!b.lastExamAt) return -1;
        return new Date(a.lastExamAt) - new Date(b.lastExamAt);
      });
    } else if (sort === 'name_asc') {
      sorted = filtered.sort((a, b) => {
        const nameA = (a.name || a.email || '').toLowerCase();
        const nameB = (b.name || b.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
    } else if (sort === 'name_desc') {
      sorted = filtered.sort((a, b) => {
        const nameA = (a.name || a.email || '').toLowerCase();
        const nameB = (b.name || b.email || '').toLowerCase();
        return nameB.localeCompare(nameA);
      });
    }

    return res.status(200).json(sorted);
  } catch (error) {
    console.error('[progress] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
