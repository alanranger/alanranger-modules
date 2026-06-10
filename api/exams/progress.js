// /api/exams/progress.js
// Multi-track exam progress (Foundation + Composition & Creative) from registry.

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");
const { setCorsHeaders, handlePreflight, getMemberstackToken, getMemberstackMemberId } = require("./_cors");
const { getTrack, getTrackKeys } = require("../../lib/academy-exam-modules");

function buildMemberModuleMap(allExams) {
  const memberModuleMap = {};
  allExams?.forEach((exam) => {
    const moduleId = exam.module_id;
    if (!memberModuleMap[moduleId]) {
      memberModuleMap[moduleId] = {
        moduleId,
        attempts: [],
        scores: [],
        passed: false,
        firstPassedAt: null,
        lastAttemptAt: null,
      };
    }
    memberModuleMap[moduleId].attempts.push(exam.attempt || 1);
    memberModuleMap[moduleId].scores.push(exam.score_percent);
    if (exam.passed) {
      memberModuleMap[moduleId].passed = true;
      const examDate = new Date(exam.created_at);
      if (!memberModuleMap[moduleId].firstPassedAt || examDate < memberModuleMap[moduleId].firstPassedAt) {
        memberModuleMap[moduleId].firstPassedAt = examDate;
      }
    }
    const examDate = new Date(exam.created_at);
    if (!memberModuleMap[moduleId].lastAttemptAt || examDate > memberModuleMap[moduleId].lastAttemptAt) {
      memberModuleMap[moduleId].lastAttemptAt = examDate;
    }
  });
  return memberModuleMap;
}

function buildTrackProgress(trackKey, memberModuleMap) {
  const track = getTrack(trackKey);
  if (!track) return null;

  const modules = track.modules.map((mod) => {
    const moduleData = memberModuleMap[mod.moduleId];
    const label = String(mod.order).padStart(2, "0");
    const base = {
      moduleId: mod.moduleId,
      label,
      name: mod.shortName || mod.name,
      order: mod.order,
    };

    if (moduleData) {
      const attempts = Math.max(...moduleData.attempts);
      return {
        ...base,
        status: moduleData.passed ? "passed" : (attempts > 0 ? "failed" : "not_taken"),
        bestScore: Math.max(...moduleData.scores),
        attempts,
        lastAttemptAt: moduleData.lastAttemptAt?.toISOString() || null,
        firstPassedAt: moduleData.firstPassedAt?.toISOString() || null,
      };
    }

    return {
      ...base,
      status: "not_taken",
      bestScore: null,
      attempts: 0,
      lastAttemptAt: null,
      firstPassedAt: null,
    };
  });

  const passedCount = modules.filter((m) => m.status === "passed").length;
  const failedCount = modules.filter((m) => m.status === "failed").length;
  const totalAttempts = modules.reduce((sum, m) => sum + (m.attempts || 0), 0);
  let lastExamAt = null;
  modules.forEach((m) => {
    if (m.lastAttemptAt && (!lastExamAt || new Date(m.lastAttemptAt) > new Date(lastExamAt))) {
      lastExamAt = m.lastAttemptAt;
    }
  });

  return {
    trackKey: track.key,
    label: track.label,
    dashboardLabel: track.dashboardLabel,
    total: track.total,
    theme: track.theme,
    summary: {
      passedCount,
      failedCount,
      remainingCount: track.total - passedCount - failedCount,
      totalAttempts,
      lastExamAt,
    },
    modules,
  };
}

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  try {
    let memberstack = null;
    try {
      if (process.env.MEMBERSTACK_SECRET_KEY) {
        memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
      }
    } catch (e) {
      console.warn("[progress] Memberstack admin init failed (non-critical):", e.message);
    }

    let memberId = null;
    const token = getMemberstackToken(req);
    if (token && memberstack) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        memberId = id;
      } catch (e) {
        console.warn("[progress] Token verification failed (non-critical):", e.message);
      }
    }
    if (!memberId) {
      memberId = getMemberstackMemberId(req);
    }
    if (!memberId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    let { data: allExams, error: examError } = await supabase
      .from("module_results_ms")
      .select("module_id, score_percent, passed, attempt, created_at, email")
      .eq("memberstack_id", memberId)
      .order("created_at", { ascending: false });

    if ((!allExams || allExams.length === 0) && !examError) {
      let memberEmail = null;
      try {
        const { data: memberCache } = await supabase
          .from("ms_members_cache")
          .select("email")
          .eq("member_id", memberId)
          .single();
        if (memberCache?.email) memberEmail = memberCache.email;
      } catch (e) {
        console.warn("[progress] Member cache lookup failed:", e.message);
      }
      if (memberEmail) {
        const { data: emailExams, error: emailError } = await supabase
          .from("module_results_ms")
          .select("module_id, score_percent, passed, attempt, created_at, email")
          .eq("email", memberEmail)
          .order("created_at", { ascending: false });
        if (emailError) {
          console.error("[progress] Email query error:", emailError);
        } else if (emailExams?.length) {
          allExams = emailExams;
          examError = null;
        }
      }
    }

    if (examError) {
      console.error("[progress] Supabase error:", examError);
      return res.status(500).json({ error: examError.message });
    }

    const memberModuleMap = buildMemberModuleMap(allExams);
    const trackOrder = getTrackKeys();
    const tracks = {};
    trackOrder.forEach((key) => {
      tracks[key] = buildTrackProgress(key, memberModuleMap);
    });

    let memberName = null;
    let memberEmail = null;
    try {
      const { data: memberCache } = await supabase
        .from("ms_members_cache")
        .select("name, email")
        .eq("member_id", memberId)
        .single();
      if (memberCache) {
        memberName = memberCache.name;
        memberEmail = memberCache.email;
      }
    } catch (e) {
      // optional
    }

    const foundation = tracks.foundation;
    const legacySummary = foundation ? {
      name: memberName,
      email: memberEmail,
      passedCount: foundation.summary.passedCount,
      failedCount: foundation.summary.failedCount,
      remainingCount: foundation.summary.remainingCount,
      totalAttempts: foundation.summary.totalAttempts,
      lastExamAt: foundation.summary.lastExamAt,
    } : { name: memberName, email: memberEmail };

    return res.status(200).json({
      trackOrder,
      tracks,
      summary: legacySummary,
      modules: foundation ? foundation.modules : [],
    });
  } catch (e) {
    console.error("[progress] Error:", e);
    return res.status(500).json({ error: e.message || "Internal server error" });
  }
};
