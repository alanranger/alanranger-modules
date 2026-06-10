// scripts/email-defaults-parity.js
//
// One-shot parity test: verifies lib/emailTemplateDefaults.js produces the
// exact same subject + body strings as the inline builders currently used in
// api/admin/trial-expiry-reminder-webhook.js and api/admin/lapsed-trial-
// reengagement-webhook.js.
//
// Run with:
//   node scripts/email-defaults-parity.js
//
// Exits non-zero if any stage's default drifts from the inline output. Safe
// to delete after Phase 1b has landed and the inline builders have been
// removed.

const {
  DEFAULTS,
  STAGE_KEYS,
  renderTemplate,
} = require("../lib/emailTemplateDefaults");

// ─── Constants mirrored from the webhooks ────────────────────────────────
const ACADEMY_ANNUAL_PRICE_GBP = 79;
const SAVE20_DISCOUNT_GBP = 20;
const SAVE20_PRICE_GBP = ACADEMY_ANNUAL_PRICE_GBP - SAVE20_DISCOUNT_GBP;

// ─── Inline rendering helpers (copy of webhook code) ─────────────────────
const MEMBERS_ONLY_BULLETS = [
  "**30 Assignment Practice Packs** \u2014 step-by-step field exercises built around Alan's frameworks",
  "**35 One-page Field Checklists** \u2014 print-ready PDFs for every shoot scenario",
  "**741-page Searchable eBook** \u2014 every module in one printable PDF, yours for life",
  "**Caring for Your Assets guides** \u2014 backup routines, sensor cleaning, camera maintenance",
  "**Applied Learning Library** \u2014 22+ scenario-based guides (portraits, product, property, landscape, close-up & food) \u2014 expanding monthly",
  "**Royal Photographic Society Accreditation pathway** \u2014 10-module route towards a formal qualification",
];
const MEMBERS_ONLY_FUTURE_LINE =
  "**All new modules, new exams and new features** released each month \u2014 included for the life of your membership, at no extra cost";

function renderMembersOnlyList() {
  return [...MEMBERS_ONLY_BULLETS, MEMBERS_ONLY_FUTURE_LINE]
    .map((b) => "- " + b)
    .join("\n");
}

const FEATURE_BULLETS_TRIAL = [
  "**60 training modules** \u2014 in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing",
  "**35 one-page field checklists** \u2014 print-ready PDFs for every shoot scenario",
  "**30 practice packs** \u2014 self-paced assignments built around Alan's frameworks and guidance",
  "**15 exams with downloadable certificates** \u2014 individual pass certificates with score details, plus a master certificate once you complete them all",
  "**741-page searchable eBook** \u2014 every module in a printable PDF, yours for life",
  "**Applied Learning Library** \u2014 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)",
  "**Pro photographer toolkit** \u2014 exposure calculator, print size calculator, style quiz, Hue test",
  "**Robo-Ranger AI assistant** \u2014 on-demand answers on technique, gear and Academy content",
  "**Direct messaging & Q&A with Alan** \u2014 message Alan with questions and join the live Q&A sessions",
];
function renderFeatureListTrial() {
  return FEATURE_BULLETS_TRIAL.map((b) => "- " + b).join("\n");
}

const FEATURE_BULLETS_REWIND = [
  "**60 training modules** \u2014 in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing",
  "**35 one-page field checklists** \u2014 print-ready PDFs for every shoot scenario",
  "**30 practice packs** \u2014 self-paced assignments built around Alan's frameworks and guidance",
  "**15 exams with downloadable certificates** \u2014 individual pass certificates plus a master certificate when you complete them all",
  "**741-page searchable eBook** \u2014 every module in a printable PDF, yours for life",
  "**Applied Learning Library** \u2014 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)",
  "**Pro photographer toolkit** \u2014 Exposure Calculator, Print Size Calculator, Photography Style Quiz, Colour IQ / Hue Test",
  "**Robo-Ranger AI assistant** \u2014 on-demand answers on technique, gear and Academy content",
  "**Direct messaging & Q&A with Alan** \u2014 message Alan with questions and join the live Q&A sessions",
  "**New modules and exams planned through 2026** \u2014 the syllabus is actively growing, not frozen",
  "**RPS Accreditation pathway (coming soon)** \u2014 routes to Licentiate and Associate with resources to support your panel",
];
function renderFeatureListRewind() {
  return FEATURE_BULLETS_REWIND.map((b) => "- " + b).join("\n");
}

const FINAL_DAY_QUICK_WINS = [
  "**Take one exam** \u2014 10 minutes each, and you walk away with a pass certificate whether you upgrade or not.",
  "**Download one field checklist** \u2014 the one-page PDFs are yours to keep and will come on every shoot with you.",
  "**Ask Robo-Ranger one question** \u2014 on gear, technique or next steps. Members tell us this is the moment it clicks how much time it saves them.",
];
function renderFinalDayQuickWins() {
  return FINAL_DAY_QUICK_WINS.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

const SAVE20_QUICK_WINS = [
  "**Jump back into the module you last opened** \u2014 pick up where you left off, no hunting required.",
  "**Download one field checklist** \u2014 the one-page PDFs are yours to take on your next shoot.",
  "**Take the first 10-minute exam** \u2014 short, focused, with a pass certificate to show for it.",
];
function renderSave20QuickWins() {
  return SAVE20_QUICK_WINS.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

const REWIND_QUICK_WINS = [
  "**Jump back into the module you last opened** \u2014 we'll take you right back to where you stopped.",
  "**Download one field checklist** \u2014 the one-page PDFs are yours to keep and take on every shoot.",
  "**Take one 10-minute exam** \u2014 short, focused, with a pass certificate you keep whether you upgrade or not.",
];
function renderRewindQuickWins() {
  return REWIND_QUICK_WINS.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

// Sample activity block strings (pre-rendered, as if formatActivityBlock ran).
// Two variants reflect the trial vs rewind headings.
function sampleTrialActivityBlock() {
  return "\n**Your Academy activity so far**\n\n- **Last logged in** 2 days ago\n- You've logged in **6 times** during your trial\n- **3 modules** viewed\n- **2 of 30 practice packs** used so far\n- **1 of 15 exams** attempted so far\n";
}
function sampleRewindActivityBlock() {
  return "\n**What you built during your trial (still saved to your account)**\n\n- **Last logged in** 35 days ago\n- You've logged in **4 times** during your trial\n- **2 modules** viewed\n- No exams attempted yet \u2014 each one is short and comes with its own certificate\n";
}

// ─── Inline builders (copied from webhooks for parity comparison) ────────
function inlineSevenDayReminder(member, expiryDateStr, upgradeUrl, activityBlock) {
  const subject = "You're Halfway Through Your Free Trial \u2014 7 Days Left";
  const firstName = (member.name || "").split(" ")[0] || "there";
  const body = `
Hi ${firstName},

You're halfway through your 14-day free trial of the **Alan Ranger Photography Academy** \u2014 **7 days to go**. This is the point where most members go from browsing to actually applying something, so the next week is where the Academy really starts to pay back the time you've put in.
${activityBlock}
**A suggested plan for your next 7 days**

1. **Read the four foundation modules** \u2014 Exposure Triangle, Aperture, Shutter Speed, and ISO. Together they unlock nearly every decision you'll make with your camera.
2. **Take the four matching exams** \u2014 they're quick, and they turn "I've read it" into "I know it", with a pass certificate for each.
3. **Try practice packs 7, 8, 9 and 10** \u2014 small structured shooting assignments that move the foundation skills from theory into your camera bag.
4. **Pick one field checklist** and take it on your next shoot \u2014 the value usually lands on the first real outing you use one.
5. **Ask one question** \u2014 drop something in Q&A or throw it at Robo-Ranger. Members who engage here tend to progress fastest.

**What Academy members have gone on to do**

Members who've stayed have gone on to **win photography competitions**, pick up **paid photography work** as side hustles or small businesses, earn **professional qualifications** like RPS Licentiate, and \u2014 most commonly of all \u2014 simply enjoy their cameras far more, coming home with photos they're genuinely proud of rather than feeling lost in settings and menus.

**Want to lock in annual access now?**

Full annual membership is **\u00a3${ACADEMY_ANNUAL_PRICE_GBP}/year** \u2014 that's less than a single coffee a week \u2014 and everything you've already built (progress, bookmarks, notes, quiz scores) stays on your account.

Click the personal link below and we'll take you straight to your Academy dashboard. If your session has expired, your email address will be pre-filled on the login screen, so all you need is your password:

${upgradeUrl}

Your trial expires on **${expiryDateStr}**. Whenever you're ready \u2014 and any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course
  `.trim();
  return { subject, body };
}

function inlineFinalDayReminder(member, expiryDateStr, upgradeUrl, activityBlock) {
  const subject = "Your Academy trial ends tomorrow \u2014 keep everything you've built";
  const firstName = member.name ? member.name.split(" ")[0] : "there";
  const body = `
Hi ${firstName},

Your 14-day free trial of the **Alan Ranger Photography Academy** ends **tomorrow (${expiryDateStr})**. After that, the modules, practice packs, exams and Robo-Ranger access pause \u2014 but your account stays put, with everything you've built still on it.
${activityBlock}
**Three quick wins before it ends**

${renderFinalDayQuickWins()}

**Members-only resources you keep for the full year**

${renderMembersOnlyList()}

**And everything else in the Academy continues too:**

${renderFeatureListTrial()}

**Lock it in before tomorrow**

Full annual membership is **\u00a3${ACADEMY_ANNUAL_PRICE_GBP}/year** \u2014 less than a single coffee a week \u2014 and everything you've already built (progress, bookmarks, notes, quiz scores) stays on your account.

Click the personal link below and we'll take you straight to your Academy dashboard. If your session has expired, your email address will be pre-filled on the login screen, so all you need is your password.

${upgradeUrl}

Your trial expires on **${expiryDateStr}**. Whenever you're ready \u2014 and any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course
  `.trim();
  return { subject, body };
}

function inlineExpiredWithCoupon(member, expiryDateStr, upgradeUrl, daysLeftInGrace, activityBlock) {
  const daysWord = daysLeftInGrace === 1 ? "day" : "days";
  const daysLeftPhrase = `**${daysLeftInGrace} ${daysWord}**`;
  const subject = `Your Academy trial ended \u2014 SAVE20 is yours for ${daysLeftInGrace} more ${daysWord}`;
  const firstName = (member.name || "").split(" ")[0] || "there";
  const body = `
Hi ${firstName},

Your 14-day free trial of the **Alan Ranger Photography Academy** ended on **${expiryDateStr}**, so full access has now paused \u2014 but your account is still here with everything you'd built on it.
${activityBlock}
**Here's an offer to pick up where you left off**

Upgrade to full annual membership for **\u00a3${ACADEMY_ANNUAL_PRICE_GBP}/year**, and for the next ${daysLeftPhrase} the code **SAVE20** takes **\u00a3${SAVE20_DISCOUNT_GBP} off your first year** \u2014 bringing it down to just **\u00a3${SAVE20_PRICE_GBP}**. That's less than a single coffee a week for the whole year.

**Three quick wins the moment you're back in**

${renderSave20QuickWins()}

**Members-only resources you keep for the full year**

${renderMembersOnlyList()}

**And everything else in the Academy unlocks again:**

${renderFeatureListTrial()}

**Upgrade in one click**

Click the personal link below and we'll take you straight to your Academy dashboard, with **SAVE20 already applied** in the upgrade modal. No codes to type in, no separate checkout page. If your session has expired, your email address will be pre-filled on the login screen, so all you need is your password.

${upgradeUrl}

SAVE20 only runs for ${daysLeftPhrase} from today \u2014 after that the discount closes and annual membership returns to full price at \u00a3${ACADEMY_ANNUAL_PRICE_GBP}.

Any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course
  `.trim();
  return { subject, body };
}

function inlineRewindBody(member, daysLapsed, dashboardUrl, unsubUrl, activityBlock) {
  const greeting = member.name ? `Hi ${member.name.split(" ")[0]},` : "Hi there,";
  const annualPriceGbp = 79;
  const discountGbp = 20;
  const discountedPriceGbp = 59;
  const couponCode = "REWIND20";
  return `
${greeting}

It's been around ${daysLapsed} days since your **Alan Ranger Photography Academy** trial ended \u2014 and you didn't end up joining. That's completely fine; people pick up free trials all the time and life gets in the way.
${activityBlock}
But I wanted to reach out with one honest reason to give the Academy another look: **it has grown a lot since your trial**, and for the next **7 days only** I'd like to offer you **\u00a3${discountGbp} off your first year** of annual membership with the code **${couponCode}** \u2014 \u00a3${annualPriceGbp} down to **\u00a3${discountedPriceGbp}** for a full 12 months.

**Three quick wins the moment you're back in**

${renderRewindQuickWins()}

**Members-only resources you keep for the full year**

${renderMembersOnlyList()}

**And everything else in the Academy unlocks again:**

${renderFeatureListRewind()}

**What Academy members have gone on to do**

I don't want to oversell this, but I think it's worth saying plainly: Academy members have gone on to **win photography competitions**, launch **paid photography work** as side hustles or small businesses, earn **professional qualifications and accreditations**, and \u2014 most commonly of all \u2014 simply enjoy their cameras far more, coming home with photos they're genuinely proud of rather than feeling lost in settings and menus.

Twelve months is usually long enough for a committed learner to make a real leap forward in their photography \u2014 and at \u00a3${discountedPriceGbp} for the entire year, that's a little over \u00a31 a week for everything listed above.

**Ready to come back?**

Click the personal link below \u2014 we'll take you straight to your Academy dashboard with the upgrade offer already open and **${couponCode} applied**, no codes to type. If you're not still signed in, your email address will be pre-filled on the login screen, so all you need is your password:

${dashboardUrl}

**This personal offer is open for 7 days from today.** After that, ${couponCode} closes for your account and annual membership returns to the standard \u00a3${annualPriceGbp}/year.

Any questions \u2014 technical, creative, or "is this right for me at all?" \u2014 just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course

---
If you'd prefer not to receive any more re-engagement emails from the Academy, you can unsubscribe in one click:
${unsubUrl}
  `.trim();
}

// ─── Parity checks ───────────────────────────────────────────────────────
function diffFirstDifference(a, b) {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i++) {
    if (a[i] !== b[i]) {
      const start = Math.max(0, i - 40);
      const end = Math.min(limit, i + 40);
      return {
        index: i,
        inline: `${JSON.stringify(a.slice(start, end))}`,
        rendered: `${JSON.stringify(b.slice(start, end))}`,
      };
    }
  }
  if (a.length !== b.length) {
    return {
      index: limit,
      note: `lengths differ (inline=${a.length}, rendered=${b.length})`,
      inline_tail: JSON.stringify(a.slice(limit, limit + 120)),
      rendered_tail: JSON.stringify(b.slice(limit, limit + 120)),
    };
  }
  return null;
}

function report(name, expected, actual) {
  if (expected === actual) {
    console.log(`\u2713 ${name}: PARITY`);
    return true;
  }
  console.error(`\u2717 ${name}: DRIFT`);
  const diff = diffFirstDifference(expected, actual);
  if (diff) console.error(`  first diff:`, diff);
  return false;
}

function runTests() {
  const member = { name: "SHASHI BECK", email: "t@example.com" };
  const memberNoName = { name: null, email: "x@example.com" };
  const expiryDateStr = "Monday, 28 April 2026";
  const upgradeUrl = "https://example.com/upgrade?t=abc";
  const dashboardUrl = "https://example.com/dashboard?ar_rewind=abc";
  const unsubUrl = "https://example.com/unsub?token=xyz";
  const trialActivity = sampleTrialActivityBlock();
  const rewindActivity = sampleRewindActivityBlock();

  const checks = [];

  // Day -7
  {
    const inline = inlineSevenDayReminder(member, expiryDateStr, upgradeUrl, trialActivity);
    const def = DEFAULTS[STAGE_KEYS.DAY_MINUS_7];
    const vars = {
      firstName: "SHASHI",
      expiryDate: expiryDateStr,
      upgradeUrl,
      activityBlock: trialActivity,
      annualPriceGbp: ACADEMY_ANNUAL_PRICE_GBP,
    };
    const actualSubj = renderTemplate(def.subject, vars);
    const actualBody = renderTemplate(def.body_md, vars);
    checks.push(report("day-minus-7 subject", inline.subject, actualSubj));
    checks.push(report("day-minus-7 body", inline.body, actualBody));
  }

  // Day -1
  {
    const inline = inlineFinalDayReminder(member, expiryDateStr, upgradeUrl, trialActivity);
    const def = DEFAULTS[STAGE_KEYS.DAY_MINUS_1];
    const vars = {
      firstName: "SHASHI",
      expiryDate: expiryDateStr,
      upgradeUrl,
      activityBlock: trialActivity,
      annualPriceGbp: ACADEMY_ANNUAL_PRICE_GBP,
    };
    checks.push(report("day-minus-1 subject", inline.subject, renderTemplate(def.subject, vars)));
    checks.push(report("day-minus-1 body", inline.body, renderTemplate(def.body_md, vars)));
  }

  // Day +7 SAVE20 (7 days left in window)
  {
    const daysLeft = 7;
    const inline = inlineExpiredWithCoupon(member, expiryDateStr, upgradeUrl, daysLeft, trialActivity);
    const def = DEFAULTS[STAGE_KEYS.DAY_PLUS_7];
    const daysWord = daysLeft === 1 ? "day" : "days";
    const vars = {
      firstName: "SHASHI",
      expiryDate: expiryDateStr,
      upgradeUrl,
      activityBlock: trialActivity,
      annualPriceGbp: ACADEMY_ANNUAL_PRICE_GBP,
      save20PriceGbp: SAVE20_PRICE_GBP,
      save20DiscountGbp: SAVE20_DISCOUNT_GBP,
      couponCode: "SAVE20",
      daysLeft,
      daysWord,
      daysLeftPhrase: `**${daysLeft} ${daysWord}**`,
    };
    checks.push(report("day-plus-7 subject", inline.subject, renderTemplate(def.subject, vars)));
    checks.push(report("day-plus-7 body", inline.body, renderTemplate(def.body_md, vars)));
  }

  // Day +7 SAVE20 (1 day left - singular)
  {
    const daysLeft = 1;
    const inline = inlineExpiredWithCoupon(member, expiryDateStr, upgradeUrl, daysLeft, trialActivity);
    const def = DEFAULTS[STAGE_KEYS.DAY_PLUS_7];
    const daysWord = "day";
    const vars = {
      firstName: "SHASHI",
      expiryDate: expiryDateStr,
      upgradeUrl,
      activityBlock: trialActivity,
      annualPriceGbp: ACADEMY_ANNUAL_PRICE_GBP,
      save20PriceGbp: SAVE20_PRICE_GBP,
      save20DiscountGbp: SAVE20_DISCOUNT_GBP,
      couponCode: "SAVE20",
      daysLeft,
      daysWord,
      daysLeftPhrase: `**${daysLeft} ${daysWord}**`,
    };
    checks.push(report("day-plus-7 subject (1 day)", inline.subject, renderTemplate(def.subject, vars)));
    checks.push(report("day-plus-7 body (1 day)", inline.body, renderTemplate(def.body_md, vars)));
  }

  // Rewind attempt 1 (Day +20)
  {
    const daysLapsed = 22;
    const inline = inlineRewindBody(member, daysLapsed, dashboardUrl, unsubUrl, rewindActivity);
    const def = DEFAULTS[STAGE_KEYS.DAY_PLUS_20];
    const vars = {
      firstName: "SHASHI",
      dashboardUrl,
      unsubUrl,
      activityBlock: rewindActivity,
      daysLapsed,
      annualPriceGbp: 79,
      save20PriceGbp: 59,
      save20DiscountGbp: 20,
      couponCode: "REWIND20",
    };
    checks.push(report(
      "day-plus-20 subject",
      "Your Academy trial \u2014 \u00a320 off to come back and pick up where you left off",
      renderTemplate(def.subject, vars),
    ));
    checks.push(report("day-plus-20 body", inline, renderTemplate(def.body_md, vars)));
  }

  // Rewind attempt 2 (Day +30) — same body, different subject
  {
    const def = DEFAULTS[STAGE_KEYS.DAY_PLUS_30];
    const vars = {
      firstName: "SHASHI",
      dashboardUrl,
      unsubUrl,
      activityBlock: rewindActivity,
      daysLapsed: 33,
      annualPriceGbp: 79,
      save20PriceGbp: 59,
      save20DiscountGbp: 20,
      couponCode: "REWIND20",
    };
    checks.push(report(
      "day-plus-30 subject",
      "Still thinking it over? \u00a320 off your Academy annual membership (7 days)",
      renderTemplate(def.subject, vars),
    ));
  }

  // Rewind attempt 3 (Day +60)
  {
    const def = DEFAULTS[STAGE_KEYS.DAY_PLUS_60];
    const vars = {
      firstName: "SHASHI",
      dashboardUrl,
      unsubUrl,
      activityBlock: rewindActivity,
      daysLapsed: 63,
      annualPriceGbp: 79,
      save20PriceGbp: 59,
      save20DiscountGbp: 20,
      couponCode: "REWIND20",
    };
    checks.push(report(
      "day-plus-60 subject",
      "Final offer \u2014 \u00a320 off your Academy annual membership (7 days only)",
      renderTemplate(def.subject, vars),
    ));
  }

  // Greeting with no name (rewind)
  {
    const daysLapsed = 22;
    const inline = inlineRewindBody(memberNoName, daysLapsed, dashboardUrl, unsubUrl, rewindActivity);
    const def = DEFAULTS[STAGE_KEYS.DAY_PLUS_20];
    const vars = {
      firstName: "there",
      dashboardUrl,
      unsubUrl,
      activityBlock: rewindActivity,
      daysLapsed,
      annualPriceGbp: 79,
      save20PriceGbp: 59,
      save20DiscountGbp: 20,
      couponCode: "REWIND20",
    };
    checks.push(report("day-plus-20 body (no name)", inline, renderTemplate(def.body_md, vars)));
  }

  const failed = checks.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`\n${failed} defaults-vs-inline check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} defaults-vs-inline parity checks passed.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Integration parity: runs the refactored buildEmailContent in each webhook
// (with no Supabase override available, so it falls back to defaults) and
// verifies the output matches the inline builders. Catches any drift in
// how buildTrialMergeVars / buildRewindMergeVars compute merge tags.
// ─────────────────────────────────────────────────────────────────────────

async function runWebhookIntegrationTests() {
  // Dummy env vars so the webhook modules load without complaining.
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role";
  process.env.MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY || "sk_dummy";
  process.env.EMAIL_FROM = process.env.EMAIL_FROM || "test@example.com";

  // Stub the Supabase client used by the webhooks so it always returns null
  // overrides (simulating an empty academy_email_templates row).
  const originalCreateClient = require("@supabase/supabase-js").createClient;
  require("@supabase/supabase-js").createClient = () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  });

  let trialWebhook;
  let lapsedWebhook;
  try {
    trialWebhook = require("../api/admin/trial-expiry-reminder-webhook");
    lapsedWebhook = require("../api/admin/lapsed-trial-reengagement-webhook");
  } catch (err) {
    console.error("\u2717 webhook modules failed to load:", err.message);
    require("@supabase/supabase-js").createClient = originalCreateClient;
    process.exit(1);
  }
  require("@supabase/supabase-js").createClient = originalCreateClient;

  const trialT = trialWebhook.__testing__;
  const lapsedT = lapsedWebhook.__testing__;
  if (!trialT || !lapsedT) {
    console.error("\u2717 webhook __testing__ exports missing");
    process.exit(1);
  }

  const member = { name: "SHASHI BECK", email: "t@example.com" };
  const memberNoName = { name: null, email: "x@example.com" };
  const expiryDate = "Monday, 28 April 2026";
  const upgradeUrl = "https://example.com/upgrade?t=abc";
  const dashboardUrl = "https://example.com/dashboard?ar_rewind=abc";
  const unsubUrl = "https://example.com/unsub?token=xyz";

  // Both the webhook path and the inline test helpers call (or receive) an
  // activity block string. formatActivityBlock(null) returns "", and the
  // inline helpers also substitute "" when given "". So passing null/"" both
  // sides gives us a clean parity comparison that doesn't depend on the
  // exact wording of the activity lines.
  const emptyActivity = "";

  const checks = [];

  // Day -7 via webhook
  {
    const actual = await trialT.buildEmailContent(member, 7, expiryDate, upgradeUrl, null, 7);
    const expected = inlineSevenDayReminder(member, expiryDate, upgradeUrl, emptyActivity);
    checks.push(report("webhook day-minus-7 subject", expected.subject, actual.subject));
    checks.push(report("webhook day-minus-7 body", expected.body, actual.body));
  }

  // Day -1 via webhook
  {
    const actual = await trialT.buildEmailContent(member, 1, expiryDate, upgradeUrl, null, 1);
    const expected = inlineFinalDayReminder(member, expiryDate, upgradeUrl, emptyActivity);
    checks.push(report("webhook day-minus-1 subject", expected.subject, actual.subject));
    checks.push(report("webhook day-minus-1 body", expected.body, actual.body));
  }

  // Day +7 SAVE20 via webhook (daysUntilExpiry=-7 -> daysLeft=7)
  {
    const actual = await trialT.buildEmailContent(member, -7, expiryDate, upgradeUrl, null, -7);
    const expected = inlineExpiredWithCoupon(member, expiryDate, upgradeUrl, 7, emptyActivity);
    checks.push(report("webhook day-plus-7 subject", expected.subject, actual.subject));
    checks.push(report("webhook day-plus-7 body", expected.body, actual.body));
  }

  // Day +7 SAVE20 with 1 day left (daysUntilExpiry=-13 -> daysLeft=1)
  {
    const actual = await trialT.buildEmailContent(member, -13, expiryDate, upgradeUrl, null, -13);
    const expected = inlineExpiredWithCoupon(member, expiryDate, upgradeUrl, 1, emptyActivity);
    checks.push(report("webhook day-plus-7 (1 day left) subject", expected.subject, actual.subject));
    checks.push(report("webhook day-plus-7 (1 day left) body", expected.body, actual.body));
  }

  // Day +20 REWIND (attempt=1)
  {
    const actual = await lapsedT.buildEmailContent({
      member, daysLapsed: 22, attempt: 1, dashboardUrl, unsubUrl, activity: null,
    });
    const expectedBody = inlineRewindBody(member, 22, dashboardUrl, unsubUrl, emptyActivity);
    checks.push(report(
      "webhook day-plus-20 subject",
      "Your Academy trial \u2014 \u00a320 off to come back and pick up where you left off",
      actual.subject,
    ));
    checks.push(report("webhook day-plus-20 body", expectedBody, actual.body));
  }

  // Day +30 REWIND (attempt=2)
  {
    const actual = await lapsedT.buildEmailContent({
      member, daysLapsed: 33, attempt: 2, dashboardUrl, unsubUrl, activity: null,
    });
    checks.push(report(
      "webhook day-plus-30 subject",
      "Still thinking it over? \u00a320 off your Academy annual membership (7 days)",
      actual.subject,
    ));
  }

  // Day +60 REWIND (attempt=3)
  {
    const actual = await lapsedT.buildEmailContent({
      member, daysLapsed: 63, attempt: 3, dashboardUrl, unsubUrl, activity: null,
    });
    checks.push(report(
      "webhook day-plus-60 subject",
      "Final offer \u2014 \u00a320 off your Academy annual membership (7 days only)",
      actual.subject,
    ));
  }

  // Rewind with no member name
  {
    const actual = await lapsedT.buildEmailContent({
      member: memberNoName, daysLapsed: 22, attempt: 1, dashboardUrl, unsubUrl, activity: null,
    });
    const expected = inlineRewindBody(memberNoName, 22, dashboardUrl, unsubUrl, emptyActivity);
    checks.push(report("webhook day-plus-20 body (no name)", expected, actual.body));
  }

  // Non-canonical stage (daysAhead=3 -> soft reminder, should use inline fallback)
  {
    const actual = await trialT.buildEmailContent(member, 3, expiryDate, upgradeUrl, null, 3);
    // The soft reminder isn't in the DB templates, so it falls back to the
    // inline builder. We just assert the subject matches the soft-reminder
    // subject to confirm the fallback routed correctly.
    checks.push(report(
      "webhook non-canonical subject falls back to soft",
      "Your Academy trial \u2014 a gentle heads-up",
      actual.subject,
    ));
  }

  const failed = checks.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`\n${failed} webhook-integration check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} webhook-integration parity checks passed.`);
}

async function main() {
  runTests();
  await runWebhookIntegrationTests();
  console.log("\n\u2713 All parity tests passed.");
}

main().catch((err) => {
  console.error("Unexpected test failure:", err);
  process.exit(1);
});
