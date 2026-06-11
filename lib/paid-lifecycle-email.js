/**
 * Paid lifecycle email helpers: badge-earned crossing detection + renewal-soon.
 */

const {
  computeGateStatsFromRaw,
  mergeEngagementIntoStats,
  evaluateFullBadge,
  BADGE_SORT_RANK,
  fetchExamPassCountsForMember,
} = require("./admin-gate-stats");
const {
  JOURNEY_STAGES,
  GRADUATE_TARGETS,
  MASTER_TARGETS,
} = require("./academy-badge-gates");
const { buildMemberEmailSnapshot } = require("./member-email-snapshot");
const { DASHBOARD_URL, MODULE_MAP_URL } = require("./lifecycleEmailConfig");
const { getFoundationModuleMeta } = require("./foundation-module-meta");
const { FOUNDATION_MODULE_PATHS } = require("./academy-module-paths");

const DAY_MS = 86400000;
const WINDOW_DAYS = 14;
const ACTIVITY_TYPES = ["login", "member_login", "module_open", "exam_start", "exam_submit"];
const CELEBRATABLE_BADGES = new Set(["foundation", "practitioner", "certified", "graduate", "master"]);
const SUSTAINED_ACTIVITY_LINE =
  "Beyond the checklist above, the top badges come from actually *using* the Academy over time — logging in, revisiting modules, keeping your skills sharp — not just holding a membership. Keep showing up and the rest follows.";

function badgeLabel(key) {
  const stage = JOURNEY_STAGES.find((s) => s.key === key);
  return stage ? stage.label : key;
}

function nextBadgeKeyAfter(earnedKey) {
  const idx = JOURNEY_STAGES.findIndex((s) => s.key === earnedKey);
  const next = JOURNEY_STAGES[idx + 1];
  return next ? next.key : null;
}

function needsSustainedLine(nextKey) {
  return nextKey === "graduate" || nextKey === "master";
}

function buildFoundationLines(g) {
  const lines = [];
  if (!g.module01Opened) {
    lines.push("- Open Module 01: What Is Exposure In Photography (required first step)");
  }
  const modNeed = Math.max(0, (g.modulesTarget || 0) - (g.modulesOpened || 0));
  if (modNeed > 0) {
    lines.push(
      `- Open ${modNeed} more foundation module${modNeed === 1 ? "" : "s"} (${g.modulesOpened} of ${g.modulesTarget} done)`
    );
  }
  if (!g.activeDaysDegraded) {
    const dayNeed = Math.max(0, (g.activeDaysTarget || 0) - (g.activeDaysFirst14 || 0));
    if (dayNeed > 0) {
      lines.push(
        `- Be active on ${dayNeed} more day${dayNeed === 1 ? "" : "s"} in your first two weeks (${g.activeDaysFirst14} of ${g.activeDaysTarget} done)`
      );
    }
  }
  return lines;
}

function buildPractitionerLines(g) {
  const lines = [];
  const camNeed = Math.max(0, (g.cameraTarget || 0) - (g.cameraOpened || 0));
  const compNeed = Math.max(0, (g.compositionTarget || 0) - (g.compositionOpened || 0));
  const pdfNeed = Math.max(0, (g.pdfAssignmentsTarget || 0) - (g.pdfAssignmentsOpened || 0));
  const examNeed = Math.max(0, (g.examsPassedTarget || 0) - (g.examsPassed || 0));
  const compExamNeed = Math.max(0, (g.compositionExamsPassedTarget || 0) - (g.compositionExamsPassed || 0));
  if (camNeed > 0) {
    lines.push(
      `- Open ${camNeed} more camera module${camNeed === 1 ? "" : "s"} (${g.cameraOpened} of ${g.cameraTarget} done)`
    );
  }
  if (compNeed > 0) {
    lines.push(
      `- Open ${compNeed} more composition module${compNeed === 1 ? "" : "s"} (${g.compositionOpened} of ${g.compositionTarget} done)`
    );
  }
  if (pdfNeed > 0) {
    lines.push(
      `- Open ${pdfNeed} more practice assignment${pdfNeed === 1 ? "" : "s"} (${g.pdfAssignmentsOpened} of ${g.pdfAssignmentsTarget} done)`
    );
  }
  if (examNeed > 0) {
    lines.push(
      `- Pass ${examNeed} more foundation exam${examNeed === 1 ? "" : "s"} (${g.examsPassed} of ${g.examsPassedTarget} done)`
    );
  }
  if (compExamNeed > 0) {
    lines.push(
      `- Pass ${compExamNeed} more composition exam${compExamNeed === 1 ? "" : "s"} (${g.compositionExamsPassed} of ${g.compositionExamsPassedTarget} done)`
    );
  }
  return lines;
}

function buildCertifiedLines(g) {
  const lines = [];
  if (g.requiresConversion) {
    lines.push("- Complete your paid membership conversion (required for Certified)");
  }
  const fExamNeed = Math.max(0, (g.examsPassedTarget || 0) - (g.examsPassed || 0));
  const cExamNeed = Math.max(0, (g.compositionExamsPassedTarget || 0) - (g.compositionExamsPassed || 0));
  const camNeed = Math.max(0, (g.cameraTarget || 0) - (g.cameraOpened || 0));
  const compNeed = Math.max(0, (g.compositionTarget || 0) - (g.compositionOpened || 0));
  const poolNeed = Math.max(0, (g.assignmentsAndPacksPoolTarget || 0) - (g.assignmentsAndPacksPool || 0));
  if (fExamNeed > 0) {
    lines.push(
      `- Pass ${fExamNeed} more foundation exam${fExamNeed === 1 ? "" : "s"} (${g.examsPassed} of ${g.examsPassedTarget} done)`
    );
  }
  if (cExamNeed > 0) {
    lines.push(
      `- Pass ${cExamNeed} more composition exam${cExamNeed === 1 ? "" : "s"} (${g.compositionExamsPassed} of ${g.compositionExamsPassedTarget} done)`
    );
  }
  if (camNeed > 0) {
    lines.push(
      `- Open ${camNeed} more camera module${camNeed === 1 ? "" : "s"} (${g.cameraOpened} of ${g.cameraTarget} done)`
    );
  }
  if (compNeed > 0) {
    lines.push(
      `- Open ${compNeed} more composition module${compNeed === 1 ? "" : "s"} (${g.compositionOpened} of ${g.compositionTarget} done)`
    );
  }
  if (poolNeed > 0) {
    lines.push(
      `- Open ${poolNeed} more assignment${poolNeed === 1 ? "" : "s"} or practice pack${poolNeed === 1 ? "" : "s"} (${g.assignmentsAndPacksPool} of ${g.assignmentsAndPacksPoolTarget} done)`
    );
  }
  if (g.appliedLearningOpened != null) {
    const alNeed = Math.max(0, (g.appliedLearningTarget || 0) - g.appliedLearningOpened);
    if (alNeed > 0) {
      lines.push(
        `- Open ${alNeed} more applied learning module${alNeed === 1 ? "" : "s"} (${g.appliedLearningOpened} of ${g.appliedLearningTarget} done)`
      );
    }
  }
  return lines;
}

function buildLongevityChecklistLines(g, targets) {
  const rows = [
    { label: "applied learning module", cur: g.appliedLearningOpened, tgt: targets.appliedLearning },
    { label: "practice pack", cur: g.practicePacksOpened, tgt: targets.practicePacks },
    { label: "PDF assignment", cur: g.pdfAssignmentsOpened, tgt: targets.pdfAssignments },
    { label: "active month", cur: g.distinctActiveMonthsAllTime, tgt: targets.activeMonths },
  ];
  const lines = [];
  rows.forEach((row) => {
    if (row.cur == null) return;
    const need = Math.max(0, row.tgt - row.cur);
    if (need <= 0) return;
    lines.push(
      `- Open ${need} more ${row.label}${need === 1 ? "" : "s"} (${row.cur} of ${row.tgt} done)`
    );
  });
  return lines;
}

function buildRemainingActionsList(breakdown, nextBadgeKey) {
  if (!breakdown || !nextBadgeKey) return "";
  if (nextBadgeKey === "foundation") return buildFoundationLines(breakdown.foundation).join("\n");
  if (nextBadgeKey === "practitioner") return buildPractitionerLines(breakdown.practitioner).join("\n");
  if (nextBadgeKey === "certified") return buildCertifiedLines(breakdown.certified).join("\n");
  if (nextBadgeKey === "graduate") return buildLongevityChecklistLines(breakdown.graduate, GRADUATE_TARGETS).join("\n");
  if (nextBadgeKey === "master") return buildLongevityChecklistLines(breakdown.master, MASTER_TARGETS).join("\n");
  return "";
}

function isPaidMember(plan = {}) {
  if (plan.is_paid) return true;
  return plan.plan_type === "annual" || plan.plan_type === "monthly";
}

function isActiveTrialPlan(plan = {}, nowMs = Date.now()) {
  if (plan.plan_type !== "trial" && !plan.is_trial) return false;
  const end = plan.expiry_date || plan.trial_end_at;
  if (!end) return true;
  return new Date(end).getTime() > nowMs;
}

async function fetchLongevityFields(supabase, memberId) {
  const { countBreadthFromMemberJson, countDistinctActiveMonths } = require("./academy-longevity-stats");
  const { data: events } = await supabase
    .from("academy_events")
    .select("event_type, created_at")
    .eq("member_id", memberId)
    .in("event_type", ACTIVITY_TYPES)
    .order("created_at", { ascending: true })
    .limit(2000);
  const { data: memberRow } = await supabase.from("ms_members_cache").select("raw").eq("member_id", memberId).maybeSingle();
  const rawJson = memberRow?.raw?.json || {};
  const breadth = countBreadthFromMemberJson(rawJson);
  const evts = events || [];
  return {
    distinctActiveMonthsAllTime: countDistinctActiveMonths(evts),
    appliedLearningOpened: breadth.appliedLearningOpened,
    practicePacksOpened: breadth.practicePacksOpened,
    pdfAssignmentsOpened: breadth.pdfAssignmentsOpened,
    lastActivityAt: evts.length ? evts[evts.length - 1].created_at : null,
  };
}

async function fetchFirst14ActiveDays(supabase, memberId, trialStartAt) {
  if (!trialStartAt) return { activeDays: 0, engagementDegraded: true };
  const start = new Date(trialStartAt);
  if (Number.isNaN(start.getTime())) return { activeDays: 0, engagementDegraded: true };
  const end = new Date(start.getTime() + WINDOW_DAYS * DAY_MS);
  const { data } = await supabase
    .from("academy_events")
    .select("created_at")
    .eq("member_id", memberId)
    .in("event_type", ACTIVITY_TYPES)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  const days = new Set();
  (data || []).forEach((row) => {
    if (row.created_at) days.add(row.created_at.slice(0, 10));
  });
  return { activeDays: days.size, engagementDegraded: false };
}

async function buildFullBadgeContext(supabase, memberId) {
  const { data: memberRow } = await supabase
    .from("ms_members_cache")
    .select("email, name, raw, plan_summary, created_at")
    .eq("member_id", memberId)
    .maybeSingle();
  if (!memberRow?.email) return null;

  const plan = memberRow.plan_summary || {};
  const { data: trial } = await supabase
    .from("academy_trial_history")
    .select("trial_start_at, trial_end_at, converted_at")
    .eq("member_id", memberId)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const trialStartAt = trial?.trial_start_at || plan.trial_start_at || memberRow.created_at;
  const hasConverted = Boolean(trial?.converted_at || plan.converted_at || isPaidMember(plan));
  const [examCounts, longevity, activeWindow] = await Promise.all([
    fetchExamPassCountsForMember(supabase, memberId, memberRow.email),
    fetchLongevityFields(supabase, memberId),
    fetchFirst14ActiveDays(supabase, memberId, trialStartAt),
  ]);

  const stats = mergeEngagementIntoStats(
    computeGateStatsFromRaw(
      memberRow.raw,
      examCounts.foundationExamsPassed,
      examCounts.compositionExamsPassed
    ),
    longevity
  );
  const evaluation = evaluateFullBadge(stats, activeWindow.activeDays, activeWindow.engagementDegraded, {
    hasConverted,
    lastActivityAt: longevity.lastActivityAt,
    nowMs: Date.now(),
  });

  const snapshot = await buildMemberEmailSnapshot(supabase, memberId);
  if (!snapshot) return null;

  return {
    snapshot,
    evaluation,
    breakdown: evaluation.breakdown,
    badges: evaluation.badges,
    email: memberRow.email,
    plan,
  };
}

async function getCelebratedBadgeRank(supabase, memberId) {
  const { data } = await supabase
    .from("academy_email_events")
    .select("event_detail, status")
    .eq("member_id", memberId)
    .eq("stage_key", "paid-badge-earned")
    .in("status", ["sent", "skipped"])
    .eq("dry_run", false);
  let maxRank = -1;
  (data || []).forEach((row) => {
    if (!row.event_detail) return;
    const rank = BADGE_SORT_RANK[row.event_detail];
    if (rank != null && rank > maxRank) maxRank = rank;
  });
  return maxRank;
}

function findBadgeCrossing(badges, celebratedRank) {
  const earned = badges.filter((b) => b.earned && CELEBRATABLE_BADGES.has(b.key));
  const newlyCrossed = earned.filter((b) => (BADGE_SORT_RANK[b.key] ?? -1) > celebratedRank);
  if (!newlyCrossed.length) return null;
  newlyCrossed.sort((a, b) => (BADGE_SORT_RANK[b.key] ?? 0) - (BADGE_SORT_RANK[a.key] ?? 0));
  return {
    emailBadgeKey: newlyCrossed[0].key,
    allCrossedKeys: newlyCrossed.map((b) => b.key).sort((a, b) => BADGE_SORT_RANK[a] - BADGE_SORT_RANK[b]),
  };
}

async function buildPaidBadgeMergeVars(ctx, newBadgeKey) {
  const nextKey = nextBadgeKeyAfter(newBadgeKey);
  const remainingActionsList = nextKey ? buildRemainingActionsList(ctx.breakdown, nextKey) : "";
  const showSustained = nextKey && needsSustainedLine(nextKey);
  const sustainedActivityLine = showSustained ? SUSTAINED_ACTIVITY_LINE : "";

  return {
    firstName: ctx.snapshot.firstName,
    fullName: ctx.snapshot.fullName,
    newBadge: badgeLabel(newBadgeKey),
    nextBadge: nextKey ? badgeLabel(nextKey) : "",
    remainingActionsList,
    sustainedActivityLine,
    nextModuleLabel: ctx.snapshot.nextModuleLabel || getFoundationModuleMeta(FOUNDATION_MODULE_PATHS[0]).label,
    dashboardUrl: DASHBOARD_URL,
    moduleMapUrl: MODULE_MAP_URL,
    currentBadge: badgeLabel(newBadgeKey),
  };
}

async function renewalAlreadySent(supabase, memberId, periodEndIso) {
  const { count } = await supabase
    .from("academy_email_events")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("stage_key", "paid-renewal-soon")
    .eq("event_detail", periodEndIso)
    .eq("status", "sent")
    .eq("dry_run", false);
  return (count || 0) > 0;
}

function parseRenewalContext(plan, nowMs = Date.now()) {
  if (plan.plan_type !== "annual") return null;
  if (plan.payment_mode && plan.payment_mode !== "RECURRING") return null;
  if (plan.cancel_at_period_end === true) return null;
  const endRaw = plan.current_period_end || plan.expiry_date;
  if (!endRaw) return null;
  const endMs = new Date(endRaw).getTime();
  if (!Number.isFinite(endMs) || endMs <= nowMs) return null;
  const daysUntilRenewal = Math.round((endMs - nowMs) / DAY_MS);
  return {
    periodEndIso: new Date(endMs).toISOString(),
    renewalDate: new Date(endMs).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    daysUntilRenewal,
  };
}

function buildRenewalProgressLine(snapshot) {
  const mods = snapshot.modulesOpened || 0;
  if (mods >= 3) return `Explored ${mods} modules and made real progress through the course`;
  return "Made real progress through the modules";
}

async function buildPaidRenewalMergeVars(ctx, renewal) {
  return {
    firstName: ctx.snapshot.firstName,
    fullName: ctx.snapshot.fullName,
    renewalDate: renewal.renewalDate,
    daysUntilRenewal: renewal.daysUntilRenewal,
    currentBadge: ctx.snapshot.currentBadgeLabel || ctx.snapshot.currentBadge,
    renewalProgressLine: buildRenewalProgressLine(ctx.snapshot),
    nextModuleLabel: ctx.snapshot.nextModuleLabel,
    dashboardUrl: DASHBOARD_URL,
  };
}

async function listPaidBadgeEligible(supabase, contactable, nowMs = Date.now()) {
  const out = [];
  for (const memberId of contactable) {
    const ctx = await buildFullBadgeContext(supabase, memberId);
    if (!ctx || !ctx.snapshot.isPaid || ctx.snapshot.isActiveTrial) continue;
    const celebratedRank = await getCelebratedBadgeRank(supabase, memberId);
    const crossing = findBadgeCrossing(ctx.badges, celebratedRank);
    if (!crossing) continue;
    out.push({
      memberId,
      snapshot: ctx.snapshot,
      badgeContext: ctx,
      newBadgeKey: crossing.emailBadgeKey,
      allCrossedKeys: crossing.allCrossedKeys,
    });
  }
  return out;
}

async function listRenewalSoonEligible(supabase, contactable, nowMs = Date.now()) {
  const out = [];
  for (const memberId of contactable) {
    const { data: row } = await supabase
      .from("ms_members_cache")
      .select("plan_summary")
      .eq("member_id", memberId)
      .maybeSingle();
    const plan = row?.plan_summary || {};
    if (!isPaidMember(plan) || isActiveTrialPlan(plan, nowMs)) continue;
    const renewal = parseRenewalContext(plan, nowMs);
    if (!renewal || renewal.daysUntilRenewal !== 14) continue;
    if (await renewalAlreadySent(supabase, memberId, renewal.periodEndIso)) continue;
    const ctx = await buildFullBadgeContext(supabase, memberId);
    if (!ctx) continue;
    out.push({ memberId, snapshot: ctx.snapshot, badgeContext: ctx, renewal });
  }
  return out;
}

async function recordBadgeCelebrations(supabase, opts) {
  const { memberId, email, allCrossedKeys, emailedKey, messageId, subject, dryRun } = opts;
  for (const key of allCrossedKeys) {
    await supabase.from("academy_email_events").insert({
      member_id: memberId,
      email,
      stage_key: "paid-badge-earned",
      status: key === emailedKey ? "sent" : "skipped",
      message_id: key === emailedKey ? messageId : null,
      subject: key === emailedKey ? subject : `[badge_jump] ${badgeLabel(key)}`,
      event_detail: key,
      dry_run: dryRun,
      error: key === emailedKey ? null : "suppressed_same_run_higher_badge",
    });
  }
}

module.exports = {
  SUSTAINED_ACTIVITY_LINE,
  buildRemainingActionsList,
  buildFullBadgeContext,
  buildPaidBadgeMergeVars,
  buildPaidRenewalMergeVars,
  listPaidBadgeEligible,
  listRenewalSoonEligible,
  recordBadgeCelebrations,
  getCelebratedBadgeRank,
  findBadgeCrossing,
  parseRenewalContext,
  renewalAlreadySent,
  badgeLabel,
  needsSustainedLine,
};
