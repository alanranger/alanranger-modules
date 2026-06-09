// api/admin/lapsed-trial-reengagement-webhook.js
// Win-back (REWIND20) re-engagement webhook. Called daily by Vercel Cron
// (08:00 + 09:00 UTC with London-hour gate) for day-plus-20/30/60 rungs.
// Identifies members whose trial ended 20–180 days ago, never converted,
// and emails them a personal £20-off offer valid for 7 days from send.
//
// Cadence (days since trial expiry):
//   Attempt 1:  day 20 (earliest)           — REWIND20 coupon, 7-day window
//   Attempt 2:  10 days after attempt 1     — day 30 in the natural flow
//   Attempt 3:  30 days after attempt 2     — day 60 in the natural flow
//   Max 3 attempts ever; an unsubscribe click opts the member out forever.
//
// The SAVE20 grace-period coupon covers days 0–7 post-expiry via a separate
// Zap; REWIND20 only kicks in once SAVE20 is well in the rear-view mirror.
//
// Query parameters:
//   secret       — matches ORPHANED_WEBHOOK_SECRET (same as trial-expiry-reminder)
//   sendEmail    — false|0|no|off for dry-run (returns candidates only)
//   testEmail    — send a single test email to the given address (member must
//                  exist in academy_trial_history; still respects sendEmail=false)
//   limit        — cap the number of members processed per run (default 500)
//
// Response:
//   { success, candidates_found, candidates_eligible, emails_sent,
//     emails_failed, emails_deferred, email_results, time_budget_exhausted }

const { createClient } = require("@supabase/supabase-js");
const { LIFECYCLE_BCC } = require("../../lib/lifecycleEmailConfig");
const nodemailer = require("nodemailer");
const { logEmailEvent, stageKeyForRewind } = require("../../lib/emailEvents");
const { STAGE_KEYS } = require("../../lib/emailTemplateDefaults");
const { renderStageEmail } = require("../../lib/emailTemplateRenderer");
const { buildWinbackMergeVars, REWIND_CAMPAIGN } = require("../../lib/winback-email-vars");
const { htmlFromMarkdown, plainTextFromMarkdown } = require("../../lib/emailHtml");
const { memberAlreadySent } = require("../../lib/emailStageTriggers");
const {
  generateUnsubToken,
  buildUnsubUrl,
  buildPersonalUpgradeUrl,
  DASHBOARD_URL: PLAIN_DASHBOARD_URL,
} = require("../../lib/reengage-link");
const { isWinbackExhausted } = require("../../lib/winback-exhaustion");
const { getStageByKey } = require("../../lib/emailStages");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const EMAIL_FROM = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
const EMAIL_SMTP_HOST = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
const EMAIL_SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || "587", 10);

let emailTransporter = null;
if (EMAIL_FROM && EMAIL_PASSWORD) {
  // Pooled SMTP connection: reuse a single TLS session across all sends in
  // one invocation. Without this Gmail spends ~1.2s on TLS handshake per
  // email; with pooling the second send onwards is ~200ms. 20x speedup.
  emailTransporter = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    secure: EMAIL_SMTP_PORT === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Campaign configuration
// ─────────────────────────────────────────────────────────────────────────
const CAMPAIGN = {
  reachBackDays: 180,        // candidates: trials ended within the last 180 days
  // Attempt cadence expressed two ways:
  //   firstAttemptMinDaysSinceExpiry = 20 (must be at least 20 days post-expiry)
  //   attemptGapDays = gaps between consecutive attempts for the same member
  //     Attempt 2 fires >=10 days after attempt 1 (so ~day 30)
  //     Attempt 3 fires >=30 days after attempt 2 (so ~day 60)
  // Anyone in the backlog naturally paces themselves through the 3 attempts.
  // Minimum days-since-trial-expiry for each attempt (indexed by send_count).
  // Matches the product spec: send 1 on day 20, send 2 on day 30, send 3 on day 60.
  attemptMinDaysSinceExpiry: [20, 30, 60],
  // Minimum gap between consecutive sends (null = first send, no prior to gap from).
  // Both the expiry threshold AND the gap must be satisfied for attempts 2/3.
  attemptGapDays: [null, 10, 30],
  get firstAttemptMinDaysSinceExpiry() { return this.attemptMinDaysSinceExpiry[0]; },
  maxSends: 3,
  windowDays: REWIND_CAMPAIGN.windowDays,
  annualPriceGbp: REWIND_CAMPAIGN.annualPriceGbp,
  discountGbp: REWIND_CAMPAIGN.discountGbp,
  discountedPriceGbp: REWIND_CAMPAIGN.discountedPriceGbp,
  couponCode: REWIND_CAMPAIGN.couponCode,
  defaultLimit: 500,
};

// Leave headroom below Vercel's maxDuration (configured to 60s in vercel.json)
// so the function always has time to flush the final stamp + return cleanly.
const TIME_BUDGET_MS = 55000;

// ─────────────────────────────────────────────────────────────────────────
// Activity fetching (mirrors trial-expiry-reminder-webhook.js)
// ─────────────────────────────────────────────────────────────────────────
// These helpers are duplicated between the two webhooks on purpose — each
// webhook is a self-contained Vercel function, and extracting to a shared
// module would couple their deploy lifecycles. If you edit one, edit the
// other to match.

function countDistinctLoginSessions(loginEvents) {
  if (!loginEvents || loginEvents.length === 0) return 0;
  const WINDOW_MS = 30 * 60 * 1000;
  const ascending = [...loginEvents].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  let sessions = 0;
  let lastTs = 0;
  for (const ev of ascending) {
    const ts = new Date(ev.created_at).getTime();
    if (!lastTs || ts - lastTs > WINDOW_MS) sessions += 1;
    lastTs = ts;
  }
  return sessions;
}

function classifyModulePath(path) {
  if (!path) return "other";
  if (path.startsWith("/blog-on-photography/")) return "module";
  if (path.startsWith("/s/") && path.toLowerCase().endsWith(".pdf")) return "practice_pack";
  return "other";
}

async function fetchMemberActivity(memberId) {
  if (!supabase || !memberId) return null;
  try {
    const since = new Date(Date.now() - 365 * 86400000).toISOString();
    const [eventsResp, examsResp] = await Promise.all([
      supabase
        .from("academy_events")
        .select("event_type, path, title, created_at")
        .eq("member_id", memberId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("module_results_ms")
        .select("module_id, created_at")
        .eq("memberstack_id", memberId)
        .limit(100),
    ]);
    const events = eventsResp?.data || [];
    const exams = examsResp?.data || [];
    const logins = events.filter((e) => e.event_type === "login");
    const moduleOpens = events.filter((e) => e.event_type === "module_open");

    const uniqueModules = new Map();
    const uniquePracticePacks = new Map();
    for (const ev of moduleOpens) {
      const key = ev.title || ev.path;
      if (!key) continue;
      const kind = classifyModulePath(ev.path);
      if (kind === "module" && !uniqueModules.has(key)) uniqueModules.set(key, ev);
      else if (kind === "practice_pack" && !uniquePracticePacks.has(key)) uniquePracticePacks.set(key, ev);
    }

    const uniqueExamIds = new Set(
      exams.map((e) => e.module_id).filter(Boolean)
    );
    return {
      last_login_at: logins[0]?.created_at || null,
      login_count: countDistinctLoginSessions(logins),
      modules_opened_count: uniqueModules.size,
      modules_opened_list: Array.from(uniqueModules.keys()).slice(0, 5),
      practice_packs_count: uniquePracticePacks.size,
      practice_packs_list: Array.from(uniquePracticePacks.keys()).slice(0, 3),
      exams_attempted_count: uniqueExamIds.size,
    };
  } catch (err) {
    console.warn(`[lapsed-trial-reengagement] activity lookup failed for ${memberId}: ${err.message}`);
    return null;
  }
}

function formatLastLoginLine(activity) {
  if (!activity.last_login_at) return null;
  const when = new Date(activity.last_login_at).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `- Last signed in during your trial: **${when}**`;
}

function formatLoginCountLine(activity) {
  if (!activity.login_count || activity.login_count <= 0) return null;
  const noun = activity.login_count === 1 ? "sign-in" : "sign-ins";
  return `- ${activity.login_count} ${noun} during your trial`;
}

function formatModulesLine(activity) {
  if (!activity.modules_opened_count || activity.modules_opened_count <= 0) return null;
  const list = activity.modules_opened_list || [];
  const preview = list.slice(0, 3).join(", ");
  const more = list.length > 3 ? "…" : "";
  const tail = preview ? ` (${preview}${more})` : "";
  return `- **${activity.modules_opened_count} of 60 modules** explored${tail}`;
}

function formatPracticePacksLine(activity) {
  const count = activity.practice_packs_count;
  if (typeof count !== "number" || count <= 0) return null;
  return `- **${count} of 30 practice packs** downloaded`;
}

function formatExamsLine(activity) {
  const count = activity.exams_attempted_count || 0;
  if (count <= 0) return null;
  return `- **${count} of 15 exams** attempted`;
}

function formatActivityBlock(activity) {
  if (!activity) return "";
  const lines = [
    formatLastLoginLine(activity),
    formatLoginCountLine(activity),
    formatModulesLine(activity),
    formatPracticePacksLine(activity),
    formatExamsLine(activity),
  ].filter(Boolean);
  if (!lines.length) return "";
  return `\n**What you built during your trial (still saved to your account)**\n\n${lines.join("\n")}\n`;
}

// ─────────────────────────────────────────────────────────────────────────
// Members-only list + quick wins
// ─────────────────────────────────────────────────────────────────────────

const MEMBERS_ONLY_BULLETS = [
  "**30 Assignment Practice Packs** — step-by-step field exercises built around Alan's frameworks",
  "**35 One-page Field Checklists** — print-ready PDFs for every shoot scenario",
  "**741-page Searchable eBook** — every module in one printable PDF, yours for life",
  "**Caring for Your Assets guides** — backup routines, sensor cleaning, camera maintenance",
  "**Applied Learning Library** — 22+ scenario-based guides (portraits, product, property, landscape, close-up & food) — expanding monthly",
  "**Royal Photographic Society Accreditation pathway** — 10-module route towards a formal qualification"
];

const MEMBERS_ONLY_FUTURE_LINE =
  "**All new modules, new exams and new features** released each month — included for the life of your membership, at no extra cost";

function renderMembersOnlyList() {
  return [...MEMBERS_ONLY_BULLETS, MEMBERS_ONLY_FUTURE_LINE]
    .map((b) => "- " + b)
    .join("\n");
}

const REWIND_QUICK_WINS = [
  "**Jump back into the module you last opened** — we'll take you right back to where you stopped.",
  "**Download one field checklist** — the one-page PDFs are yours to keep and take on every shoot.",
  "**Take one 10-minute exam** — short, focused, with a pass certificate you keep whether you upgrade or not."
];

function renderRewindQuickWins() {
  return REWIND_QUICK_WINS.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Email content
// ─────────────────────────────────────────────────────────────────────────

const FEATURE_BULLETS = [
  "**60 training modules** — in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing",
  "**35 one-page field checklists** — print-ready PDFs for every shoot scenario",
  "**30 practice packs** — self-paced assignments built around Alan's frameworks and guidance",
  "**15 exams with downloadable certificates** — individual pass certificates plus a master certificate when you complete them all",
  "**741-page searchable eBook** — every module in a printable PDF, yours for life",
  "**Applied Learning Library** — 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)",
  "**Pro photographer toolkit** — Exposure Calculator, Print Size Calculator, Photography Style Quiz, Colour IQ / Hue Test",
  "**Robo-Ranger AI assistant** — on-demand answers on technique, gear and Academy content",
  "**Direct messaging & Q&A with Alan** — message Alan with questions and join the live Q&A sessions",
  "**New modules and exams planned through 2026** — the syllabus is actively growing, not frozen",
  "**RPS Accreditation pathway (coming soon)** — routes to Licentiate and Associate with resources to support your panel",
];

function renderFeatureList() {
  return FEATURE_BULLETS.map((b) => "- " + b).join("\n");
}

function buildSubject(attempt) {
  if (attempt === 1) return "Your Academy trial — £20 off to come back and pick up where you left off";
  if (attempt === 2) return "Still thinking it over? £20 off your Academy annual membership (7 days)";
  return "Final offer — £20 off your Academy annual membership (7 days only)";
}

function buildReengagementBody({ memberName, dashboardUrl, unsubUrl, daysLapsed, activity }) {
  const greeting = memberName ? `Hi ${memberName.split(" ")[0]},` : "Hi there,";
  const activityBlock = formatActivityBlock(activity);
  return `
${greeting}

It's been around ${daysLapsed} days since your **Alan Ranger Photography Academy** trial ended — and you didn't end up joining. That's completely fine; people pick up free trials all the time and life gets in the way.
${activityBlock}
But I wanted to reach out with one honest reason to give the Academy another look: **it has grown a lot since your trial**, and for the next **7 days only** I'd like to offer you **£${CAMPAIGN.discountGbp} off your first year** of annual membership with the code **${CAMPAIGN.couponCode}** — £${CAMPAIGN.annualPriceGbp} down to **£${CAMPAIGN.discountedPriceGbp}** for a full 12 months.

**Three quick wins the moment you're back in**

${renderRewindQuickWins()}

**Members-only resources you keep for the full year**

${renderMembersOnlyList()}

**And everything else in the Academy unlocks again:**

${renderFeatureList()}

**What Academy members have gone on to do**

I don't want to oversell this, but I think it's worth saying plainly: Academy members have gone on to **win photography competitions**, launch **paid photography work** as side hustles or small businesses, earn **professional qualifications and accreditations**, and — most commonly of all — simply enjoy their cameras far more, coming home with photos they're genuinely proud of rather than feeling lost in settings and menus.

Twelve months is usually long enough for a committed learner to make a real leap forward in their photography — and at £${CAMPAIGN.discountedPriceGbp} for the entire year, that's a little over £1 a week for everything listed above.

**Ready to come back?**

Click the personal link below — we'll take you straight to your Academy dashboard with the upgrade offer already open and **${CAMPAIGN.couponCode} applied**, no codes to type. If you're not still signed in, your email address will be pre-filled on the login screen, so all you need is your password:

${dashboardUrl}

**This personal offer is open for 7 days from today.** After that, ${CAMPAIGN.couponCode} closes for your account and annual membership returns to the standard £${CAMPAIGN.annualPriceGbp}/year.

Any questions — technical, creative, or "is this right for me at all?" — just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course

---
If you'd prefer not to receive any more re-engagement emails from the Academy, you can unsubscribe in one click:
${unsubUrl}
  `.trim();
}

function resolveRewindStageKey(attempt) {
  if (attempt === 1) return STAGE_KEYS.DAY_PLUS_20;
  if (attempt === 2) return STAGE_KEYS.DAY_PLUS_30;
  if (attempt === 3) return STAGE_KEYS.DAY_PLUS_60;
  return null;
}

async function buildRewindMergeVars({ member, memberId, daysLapsed, upgradeUrl, dashboardUrl, unsubUrl, sendAtMs }) {
  const vars = await buildWinbackMergeVars(supabase, {
    memberId,
    member,
    sendAtMs,
    unsubUrl,
    daysLapsed,
  });
  return {
    ...vars,
    upgradeUrl: upgradeUrl || vars.upgradeUrl,
    dashboardUrl: dashboardUrl || vars.dashboardUrl,
  };
}

async function buildEmailContent({ member, memberId, daysLapsed, attempt, upgradeUrl, dashboardUrl, unsubUrl, sendAtMs, activity }) {
  const stageKey = resolveRewindStageKey(attempt);
  if (stageKey) {
    try {
      const vars = await buildRewindMergeVars({
        member,
        memberId,
        daysLapsed,
        upgradeUrl,
        dashboardUrl,
        unsubUrl,
        sendAtMs,
      });
      const rendered = await renderStageEmail(supabase, stageKey, vars);
      if (rendered?.subject && rendered?.body) {
        return { subject: rendered.subject, body: rendered.body, html: htmlFromMarkdown(rendered.body) };
      }
    } catch (err) {
      console.warn(`[lapsed-trial-reengagement] template render failed for ${stageKey}, falling back to inline:`, err.message);
    }
  }
  const subject = buildSubject(attempt);
  const body = buildReengagementBody({
    memberName: member.name || null,
    dashboardUrl,
    unsubUrl,
    daysLapsed,
    activity,
  });
  return { subject, body, html: htmlFromMarkdown(body) };
}

// ─────────────────────────────────────────────────────────────────────────
// Candidate selection
// ─────────────────────────────────────────────────────────────────────────

function buildCandidateWindow() {
  const now = Date.now();
  const DAY = 86400000;
  return {
    // Upper bound: earliest a trial can have ended and still be a REWIND20
    // candidate. Must be at least firstAttemptMinDaysSinceExpiry days ago.
    maxEnd: new Date(now - CAMPAIGN.firstAttemptMinDaysSinceExpiry * DAY).toISOString(),
    minEnd: new Date(now - CAMPAIGN.reachBackDays * DAY).toISOString(),
    now,
  };
}

async function fetchTrialRowsByMemberIds(memberIds) {
  if (!memberIds.length) return [];
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select(
      "member_id, trial_end_at, converted_at, reengagement_send_count, reengagement_last_sent_at, reengagement_opted_out, reengagement_unsub_token"
    )
    .in("member_id", memberIds)
    .order("trial_end_at", { ascending: false });
  if (error) throw error;
  const latest = new Map();
  (data || []).forEach((row) => {
    if (!latest.has(row.member_id)) latest.set(row.member_id, row);
  });
  return Array.from(latest.values());
}

async function fetchTrialRows(windowBounds, limit, backlogOpts = {}) {
  // Pull candidates from academy_trial_history. Per-attempt pacing is applied
  // in code (passesResendGate) so the SQL stays simple and indexable.
  let query = supabase
    .from("academy_trial_history")
    .select(
      "member_id, trial_end_at, converted_at, reengagement_send_count, reengagement_last_sent_at, reengagement_opted_out, reengagement_unsub_token"
    )
    .is("converted_at", null)
    .eq("reengagement_opted_out", false)
    .gte("trial_end_at", windowBounds.minEnd)
    .lte("trial_end_at", windowBounds.maxEnd);
  if (backlogOpts.sendCountEq != null && !Number.isNaN(backlogOpts.sendCountEq)) {
    query = query.eq("reengagement_send_count", backlogOpts.sendCountEq);
  }
  const { data, error } = await query
    .order("trial_end_at", { ascending: backlogOpts.backlogRun === true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

function daysBetweenMs(laterMs, earlierIso) {
  if (!earlierIso) return Infinity;
  const earlier = new Date(earlierIso).getTime();
  if (!Number.isFinite(earlier)) return Infinity;
  return Math.floor((laterMs - earlier) / 86400000);
}

function passesResendGate(row, nowMs) {
  const count = row.reengagement_send_count || 0;
  if (count >= CAMPAIGN.maxSends) return false;
  const daysSinceExpiry = daysBetweenMs(nowMs, row.trial_end_at);
  const expiryThreshold = CAMPAIGN.attemptMinDaysSinceExpiry[count];
  if (daysSinceExpiry < expiryThreshold) return false;
  // Attempts 2 and 3 must ALSO wait the minimum gap since the previous send,
  // so a member who got attempt 1 slightly early (e.g. legacy 8-day rule)
  // isn't re-mailed until both conditions are met.
  const requiredGap = CAMPAIGN.attemptGapDays[count];
  if (requiredGap && daysBetweenMs(nowMs, row.reengagement_last_sent_at) < requiredGap) {
    return false;
  }
  return true;
}

async function fetchMemberContact(memberId) {
  const { data, error } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name")
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) {
    console.warn(`[lapsed-trial-reengagement] member lookup failed for ${memberId}:`, error.message);
    return null;
  }
  return data || null;
}

function daysBetween(fromIso, now) {
  const ms = now - new Date(fromIso).getTime();
  return Math.floor(ms / 86400000);
}

// ─────────────────────────────────────────────────────────────────────────
// Per-member send pipeline
// ─────────────────────────────────────────────────────────────────────────

async function reserveSendSlot(row, windowBounds, token) {
  const prevCount = row.reengagement_send_count || 0;
  const nowIso = new Date(windowBounds.now).toISOString();
  const expiresIso = new Date(windowBounds.now + CAMPAIGN.windowDays * 86400000).toISOString();
  const update = {
    reengagement_last_sent_at: nowIso,
    reengagement_expires_at: expiresIso,
    reengagement_send_count: prevCount + 1,
  };
  if (!row.reengagement_sent_at) update.reengagement_sent_at = nowIso;
  if (!row.reengagement_unsub_token) update.reengagement_unsub_token = token;

  const { data, error } = await supabase
    .from("academy_trial_history")
    .update(update)
    .eq("member_id", row.member_id)
    .eq("reengagement_send_count", prevCount)
    .select("member_id")
    .maybeSingle();
  if (error || !data) {
    return { reserved: false, prevCount };
  }
  return { reserved: true, prevCount };
}

async function rollbackSendSlot(memberId, prevCount) {
  await supabase
    .from("academy_trial_history")
    .update({ reengagement_send_count: prevCount })
    .eq("member_id", memberId);
}

async function deliverEmail({ member, content }) {
  if (!emailTransporter) {
    return { sent: false, error: "Email not configured" };
  }
  try {
    const info = await emailTransporter.sendMail({
      from: `"Alan Ranger Photography Academy" <${EMAIL_FROM}>`,
      to: member.email,
      bcc: LIFECYCLE_BCC,
      subject: content.subject,
      text: plainTextFromMarkdown(content.body),
      html: content.html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[lapsed-trial-reengagement] send failed for ${member.email}:`, err.message);
    return { sent: false, error: err.message };
  }
}

const CORRECTED_RESEND_TAG = "corrected_resend_2026-06-09";

async function correctedResendAlreadySent(supabase, memberId, stageKey) {
  const { count } = await supabase
    .from("academy_email_events")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("stage_key", stageKey)
    .eq("event_detail", CORRECTED_RESEND_TAG)
    .eq("status", "sent")
    .eq("dry_run", false);
  return (count || 0) > 0;
}

async function processCandidate(row, windowBounds, sendEmail, opts = {}) {
  const contact = await fetchMemberContact(row.member_id);
  if (!contact?.email) {
    return { skipped: true, reason: "no email on file", member_id: row.member_id };
  }
  const token = row.reengagement_unsub_token || generateUnsubToken();
  const attempt = (row.reengagement_send_count || 0) + 1;
  const daysLapsed = daysBetween(row.trial_end_at, windowBounds.now);
  // Per-member signed link: scoped to the REWIND20 personal 7-day window so
  // the token expires at the same moment the coupon does. Pre-fills email on
  // login and force-opens the upgrade modal when a session is already active.
  const windowExpiresAtMs = windowBounds.now + CAMPAIGN.windowDays * 86400000;
  const upgradeUrl = buildPersonalUpgradeUrl(row.member_id, contact.email, windowExpiresAtMs);
  const dashboardUrl = PLAIN_DASHBOARD_URL;
  const unsubUrl = buildUnsubUrl(token);
  const activity = await fetchMemberActivity(row.member_id);
  const content = await buildEmailContent({
    member: contact,
    memberId: row.member_id,
    daysLapsed,
    attempt,
    upgradeUrl,
    dashboardUrl,
    unsubUrl,
    sendAtMs: windowBounds.now,
    activity,
  });

  if (!sendEmail) {
    return {
      skipped: true,
      dry_run: true,
      member_id: row.member_id,
      email: contact.email,
      name: contact.name,
      attempt,
      days_lapsed: daysLapsed,
      preview: content,
      upgrade_url: upgradeUrl,
      dashboard_url: dashboardUrl,
      unsub_url: unsubUrl,
    };
  }

  const stageKey = stageKeyForRewind(attempt);
  const correctedResend = !!opts.correctedResend;
  if (sendEmail && stageKey && correctedResend) {
    if (await correctedResendAlreadySent(supabase, row.member_id, stageKey)) {
      return {
        skipped: true,
        reason: "corrected_resend_already_sent",
        stage_key: stageKey,
        member_id: row.member_id,
        email: contact.email,
      };
    }
  } else if (sendEmail && stageKey && (await memberAlreadySent(supabase, row.member_id, stageKey))) {
    return {
      skipped: true,
      reason: "already_sent",
      stage_key: stageKey,
      member_id: row.member_id,
      email: contact.email,
    };
  }

  let reserve = null;
  if (sendEmail && !correctedResend) {
    reserve = await reserveSendSlot(row, windowBounds, token);
    if (!reserve.reserved) {
      return {
        skipped: true,
        reason: "concurrent_reserve_failed",
        member_id: row.member_id,
        email: contact.email,
        attempt,
      };
    }
  }

  const result = await deliverEmail({
    member: contact,
    content: correctedResend
      ? {
          ...content,
          subject: `[CORRECTED] ${content.subject}`,
        }
      : content,
  });
  if (result.sent) {
    if (stageKey) {
      await logEmailEvent(supabase, {
        member_id: row.member_id,
        email: contact.email,
        stage_key: stageKey,
        status: "sent",
        messageId: result.messageId,
        subject: correctedResend ? `[CORRECTED] ${content.subject}` : content.subject,
        dryRun: false,
        eventDetail: correctedResend ? CORRECTED_RESEND_TAG : null,
      });
    }
  } else if (sendEmail && reserve?.reserved) {
    await rollbackSendSlot(row.member_id, reserve.prevCount);
    if (stageKey) {
      await logEmailEvent(supabase, {
        member_id: row.member_id,
        email: contact.email,
        stage_key: stageKey,
        status: "failed",
        error: result.error,
        subject: content.subject,
        dryRun: false,
      });
    }
  }
  return {
    member_id: row.member_id,
    email: contact.email,
    name: contact.name,
    attempt,
    days_lapsed: daysLapsed,
    sent: result.sent,
    messageId: result.messageId || null,
    error: result.error || null,
    stage_key: stageKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Request handler
// ─────────────────────────────────────────────────────────────────────────

function isNineAmLondon() {
  const hourStr = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    hour12: false,
  });
  return Number.parseInt(hourStr, 10) === 9;
}

function isWinbackRewindLive() {
  return ["day-plus-20", "day-plus-30", "day-plus-60"].some(
    (key) => getStageByKey(key)?.enabled === true
  );
}

function shouldSendEmail(req) {
  const v = req.query?.sendEmail;
  if (v === undefined || v === null || String(v).trim() === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "false" || s === "0" || s === "no" || s === "off");
}

function parseLimit(req) {
  const raw = parseInt(req.query?.limit || "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return CAMPAIGN.defaultLimit;
  return Math.min(raw, CAMPAIGN.defaultLimit);
}

function parseBacklogParams(req) {
  const rawBatch = parseInt(req.query?.batchSize || "", 10);
  const rawCount = parseInt(req.query?.sendCountEq ?? "", 10);
  const backlogRaw = String(req.query?.backlogRun || "").toLowerCase();
  const correctedRaw = String(req.query?.correctedResend || "").toLowerCase();
  const backlogRun = ["1", "true", "yes", "on"].includes(backlogRaw);
  const correctedResend = ["1", "true", "yes", "on"].includes(correctedRaw);
  const memberIdsRaw = String(req.query?.memberIds || "").trim();
  const memberIds = memberIdsRaw
    ? memberIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  return {
    backlogRun,
    correctedResend,
    memberIds,
    sendCountEq: Number.isFinite(rawCount) ? rawCount : null,
    batchSize: Number.isFinite(rawBatch) && rawBatch > 0 ? rawBatch : null,
  };
}

async function fetchBrokenLinkMemberIds() {
  const { data, error } = await supabase
    .from("academy_email_events")
    .select("member_id")
    .eq("stage_key", "day-plus-30")
    .eq("status", "sent")
    .eq("dry_run", false)
    .gte("sent_at", "2026-06-09T12:00:00+00")
    .lt("sent_at", "2026-06-09T13:30:00+00");
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.member_id))];
}

// Accept either the Vercel Cron `authorization: Bearer CRON_SECRET` header
// (auto-set by Vercel on scheduled invocations), the existing
// `?secret=ORPHANED_WEBHOOK_SECRET` param / `x-webhook-secret` header, or
// warn-and-allow when no secret is provided (backward compat for manual
// tests and legacy Zaps). Matches trial-expiry-reminder-webhook so both
// campaigns behave identically.
function authorize(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"] || "";
    if (authHeader === `Bearer ${cronSecret}`) return { ok: true };
  }
  const secret = process.env.ORPHANED_WEBHOOK_SECRET;
  if (!secret) return { ok: true };
  const provided = req.query?.secret || req.headers["x-webhook-secret"];
  if (!provided) {
    console.log("[lapsed-trial-reengagement] auth=open (no secret provided; allowing for backwards compatibility)");
    return { ok: true };
  }
  if (provided !== secret) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

async function runTestMode(req, res, sendEmail) {
  const testEmail = req.query.testEmail;
  const { data: cache, error: cacheErr } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name")
    .eq("email", testEmail)
    .maybeSingle();
  if (cacheErr || !cache?.member_id) {
    return res.status(400).json({ success: false, error: `Test email ${testEmail} not found in ms_members_cache` });
  }
  const { data: trial } = await supabase
    .from("academy_trial_history")
    .select("member_id, trial_end_at, converted_at, reengagement_send_count, reengagement_last_sent_at, reengagement_opted_out, reengagement_unsub_token")
    .eq("member_id", cache.member_id)
    .order("trial_start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trial) {
    return res.status(400).json({ success: false, error: `No trial history row for ${testEmail}` });
  }
  const windowBounds = buildCandidateWindow();
  const result = await processCandidate(trial, windowBounds, sendEmail);
  return res.status(200).json({
    success: true,
    test_mode: true,
    send_email: sendEmail,
    result,
  });
}

// EMERGENCY: set true to block ALL live win-back bulk sends (local backlog + Vercel cron).
// Single-recipient testEmail previews still work. Remove after corrected backlog approved.
const WINBACK_SENDS_HARD_STOP = true;

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const auth = authorize(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const sendEmail = shouldSendEmail(req);
  const testEmail = req.query.testEmail;
  const isSingleRecipientTest =
    testEmail !== undefined && testEmail !== null && String(testEmail).trim() !== "";

  if (WINBACK_SENDS_HARD_STOP && sendEmail && !isSingleRecipientTest) {
    console.log("[lapsed-trial-reengagement] HARD STOP — live sends blocked");
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: "winback_sends_hard_stop",
      timestamp: new Date().toISOString(),
    });
  }

  const backlog = parseBacklogParams(req);
  if (req.query.testEmail) {
    return runTestMode(req, res, sendEmail);
  }

  if (sendEmail && !isSingleRecipientTest && !backlog.backlogRun && !backlog.correctedResend && !isNineAmLondon()) {
    const londonHour = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    });
    console.log(
      `[lapsed-trial-reengagement] Bulk send skipped — London hour is ${londonHour}, not 9`
    );
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: "outside_london_nine_am_window",
      london_hour: Number.parseInt(londonHour, 10),
      timestamp: new Date().toISOString(),
    });
  }

  if (sendEmail && !isSingleRecipientTest && !isWinbackRewindLive()) {
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: "winback_rewind_ladder_disabled",
      timestamp: new Date().toISOString(),
    });
  }

  const windowBounds = buildCandidateWindow();
  const limit = backlog.batchSize
    ? Math.min(Math.max(backlog.batchSize * 2, 40), CAMPAIGN.defaultLimit)
    : parseLimit(req);

  try {
    let rows;
    if (backlog.correctedResend) {
      const targetIds = backlog.memberIds?.length
        ? backlog.memberIds
        : await fetchBrokenLinkMemberIds();
      rows = await fetchTrialRowsByMemberIds(targetIds);
    } else {
      rows = await fetchTrialRows(windowBounds, limit, backlog);
    }
    let eligible = backlog.correctedResend
      ? rows.filter((r) => !r.converted_at && !r.reengagement_opted_out)
      : rows.filter((r) => passesResendGate(r, windowBounds.now));
    if (backlog.correctedResend && backlog.memberIds?.length) {
      const targetIds = new Set(backlog.memberIds);
      eligible = eligible.filter((r) => targetIds.has(r.member_id));
    }
    const runOpts = { correctedResend: backlog.correctedResend };
    const runOutcome = await runCampaignBatch(eligible, windowBounds, sendEmail, backlog.batchSize, runOpts);
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      send_email: sendEmail,
      backlog_run: backlog.backlogRun,
      corrected_resend: backlog.correctedResend,
      send_count_eq: backlog.sendCountEq,
      batch_size: backlog.batchSize,
      window: {
        reach_back_days: CAMPAIGN.reachBackDays,
        first_attempt_min_days_since_expiry: CAMPAIGN.firstAttemptMinDaysSinceExpiry,
        attempt_gap_days: CAMPAIGN.attemptGapDays,
        max_sends_per_member: CAMPAIGN.maxSends,
      },
      candidates_found: rows.length,
      candidates_eligible: eligible.length,
      emails_sent: runOutcome.sent,
      emails_failed: runOutcome.failed,
      emails_deferred: runOutcome.deferred,
      time_budget_exhausted: runOutcome.timeBudgetExhausted,
      email_results: backlog.batchSize ? undefined : runOutcome.results,
    });
  } catch (err) {
    console.error("[lapsed-trial-reengagement] fatal:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

async function runCampaignBatch(eligible, windowBounds, sendEmail, batchSize, runOpts = {}) {
  const results = [];
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  let timeBudgetExhausted = false;
  const startTs = Date.now();
  const maxAttempts = batchSize ? batchSize * 3 : eligible.length;

  for (let i = 0; i < eligible.length && i < maxAttempts; i += 1) {
    const row = eligible[i];
    if (batchSize && sendEmail && sent >= batchSize) break;
    if (batchSize && !sendEmail && results.length >= batchSize) break;
    if (sendEmail && Date.now() - startTs > TIME_BUDGET_MS) {
      timeBudgetExhausted = true;
      deferred = eligible.length - results.length;
      results.push({
        skipped: true,
        reason: "time budget exhausted — will process on the next Zap run",
        member_id: row.member_id,
      });
      break;
    }
    const outcome = await processCandidate(row, windowBounds, sendEmail, runOpts);
    results.push(outcome);
    if (outcome.sent) sent++;
    else if (!outcome.skipped) failed++;
  }

  return { results, sent, failed, deferred, timeBudgetExhausted };
}

// Exposed purely for scripts/email-defaults-parity.js to verify the refactored
// buildEmailContent still produces byte-identical output to the original
// inline builders. Do not import from runtime code.
module.exports.__testing__ = {
  buildEmailContent,
  buildRewindMergeVars,
  resolveRewindStageKey,
};
