// /api/admin/members/[id].js
// GET: detailed member information for member detail page
// DELETE: remove member from Supabase cache + related analytics (not Memberstack)

const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function assertDeleteAuthorized(req, res) {
  const authKey = req.headers["x-ar-analytics-key"] || req.query.key;
  const expectedKey = process.env.AR_ANALYTICS_KEY;
  if (expectedKey && authKey === expectedKey) return true;

  const { checkAdminAccess } = require("../_auth");
  const { isAdmin, error: authError } = await checkAdminAccess(req);
  if (!isAdmin) {
    res.status(403).json({
      error:
        authError ||
        "Admin access required. Use an admin Memberstack session on this app (see ADMIN_EMAILS), or x-ar-analytics-key for server jobs.",
    });
    return false;
  }
  return true;
}

async function deleteMemberCascade(supabase, memberId, email) {
  const emailLower = (email || "").toLowerCase();
  const steps = [];

  const del = async (name, builder) => {
    const { error } = await builder;
    if (error) steps.push({ table: name, error: error.message });
    else steps.push({ table: name, ok: true });
  };

  await del("academy_events", supabase.from("academy_events").delete().eq("member_id", memberId));
  if (emailLower) {
    await del(
      "academy_events_by_email",
      supabase.from("academy_events").delete().ilike("email", emailLower)
    );
  }
  await del(
    "module_results_ms",
    supabase.from("module_results_ms").delete().eq("memberstack_id", memberId)
  );
  if (emailLower) {
    await del(
      "module_results_ms_by_email",
      supabase.from("module_results_ms").delete().eq("email", emailLower)
    );
  }
  await del(
    "academy_plan_events",
    supabase.from("academy_plan_events").delete().eq("ms_member_id", memberId)
  );
  await del(
    "exam_member_links",
    supabase.from("exam_member_links").delete().eq("memberstack_id", memberId)
  );
  await del(
    "academy_trial_history",
    supabase.from("academy_trial_history").delete().eq("member_id", memberId)
  );
  await del(
    "academy_annual_history",
    supabase.from("academy_annual_history").delete().eq("member_id", memberId)
  );
  await del("ms_members_cache", supabase.from("ms_members_cache").delete().eq("member_id", memberId));

  const failed = steps.filter((s) => s.error);
  return { steps, failed };
}

async function getMemberDetailPayload(supabase, memberId, query) {
  const { data: member, error: memberError } = await supabase
    .from("ms_members_cache")
    .select("*")
    .eq("member_id", memberId)
    .single();

  if (memberError || !member) return null;

  const plan = member.plan_summary || {};

  const { data: lastActivity } = await supabase
    .from("academy_events")
    .select("created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: moduleOpens } = await supabase
    .from("academy_events")
    .select("path, title, category, created_at")
    .eq("member_id", memberId)
    .eq("event_type", "module_open")
    .order("created_at", { ascending: false });

  const uniqueModules = new Set(moduleOpens?.map((m) => m.path) || []);
  const moduleCounts = {};
  moduleOpens?.forEach((open) => {
    const path = open.path;
    moduleCounts[path] = {
      title: open.title || path,
      category: open.category || null,
      count: (moduleCounts[path]?.count || 0) + 1,
      last_opened: open.created_at,
    };
  });

  const mostOpenedModules = Object.entries(moduleCounts)
    .map(([path, data]) => ({ path, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const { data: examStatsById } = await supabase
    .from("module_results_ms")
    .select("memberstack_id, email, passed")
    .eq("memberstack_id", memberId);

  const { data: examStatsByEmail } = member.email
    ? await supabase
        .from("module_results_ms")
        .select("memberstack_id, email, passed")
        .eq("email", member.email)
    : { data: [] };

  const examStats = [...(examStatsById || []), ...(examStatsByEmail || [])];
  const examStatsResult = {
    attempts: examStats.length,
    passed: examStats.filter((e) => e.passed).length,
    failed: examStats.filter((e) => !e.passed).length,
    pass_rate:
      examStats.length > 0
        ? Math.round((examStats.filter((e) => e.passed).length / examStats.length) * 100)
        : 0,
  };

  const { data: bookmarksFromEvents } = await supabase
    .from("academy_events")
    .select("path, title, created_at")
    .eq("member_id", memberId)
    .eq("event_type", "bookmark_add")
    .order("created_at", { ascending: false });

  const raw = member.raw || {};
  const json = raw?.json || raw?.data?.json || raw;
  const bookmarksFromJson = json?.bookmarks || [];
  const bookmarks =
    Array.isArray(bookmarksFromJson) && bookmarksFromJson.length > 0
      ? bookmarksFromJson.map((path) => ({
          path: typeof path === "string" ? path : path?.path || path,
          title: path?.title || null,
          created_at: path?.created_at || null,
        }))
      : bookmarksFromEvents || [];

  const activityPage = parseInt(query.activity_page, 10) || 1;
  const activityLimit = parseInt(query.activity_limit, 10) || 20;
  const activityOffset = (activityPage - 1) * activityLimit;

  const { data: recentActivity, count: activityCount } = await supabase
    .from("academy_events")
    .select("*", { count: "exact" })
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .range(activityOffset, activityOffset + activityLimit - 1);

  return {
    member_id: member.member_id,
    email: member.email,
    name: member.name,
    plan_name: plan.plan_name || "No Plan",
    plan_type: plan.plan_type || null,
    status: plan.status || "unknown",
    is_trial: plan.is_trial || false,
    is_paid: plan.is_paid || false,
    signed_up: member.created_at,
    last_seen: lastActivity?.created_at || null,
    photography_style: member.photography_style || null,
    photography_style_percentage: member.photography_style_percentage || null,
    photography_style_other_interests: member.photography_style_other_interests || null,
    photography_style_quiz_completed_at: member.photography_style_quiz_completed_at || null,
    engagement: {
      modules_opened_unique: uniqueModules.size,
      modules_opened_total: moduleOpens?.length || 0,
      most_opened_modules: mostOpenedModules,
      exams: examStatsResult,
      bookmarks_count: bookmarks.length,
      bookmarks: bookmarks,
    },
    recent_activity: recentActivity || [],
    activity_pagination: {
      page: activityPage,
      limit: activityLimit,
      total: activityCount || 0,
      totalPages: Math.ceil((activityCount || 0) / activityLimit),
    },
    raw: member.raw || {},
  };
}

module.exports = async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({
        error: "Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
      });
    }

    const { id } = req.query;
    const memberId = id;
    if (!memberId) {
      return res.status(400).json({ error: "Member ID required" });
    }

    if (req.method === "DELETE") {
      if (!(await assertDeleteAuthorized(req, res))) return;

      const { data: member, error: memberError } = await supabase
        .from("ms_members_cache")
        .select("member_id, email")
        .eq("member_id", memberId)
        .maybeSingle();

      if (memberError) {
        return res.status(500).json({ error: memberError.message });
      }

      const email = member?.email || "";
      const { steps, failed } = await deleteMemberCascade(supabase, memberId, email);

      if (failed.length > 0) {
        return res.status(500).json({
          success: false,
          error: "Some deletes failed",
          details: failed,
          steps,
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Removed from Supabase (cache, events, exams, plan events, trial/annual history). Memberstack is unchanged.",
        member_id: memberId,
        steps,
      });
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const payload = await getMemberDetailPayload(supabase, memberId, req.query);
    if (!payload) {
      return res.status(404).json({ error: "Member not found" });
    }
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[members/:id] Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
