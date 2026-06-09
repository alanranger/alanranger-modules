// Shared default email template bodies for academy trial/rewind campaigns.
//
// These are the single source of truth for the default subject + body_md that
// Phase 1b webhooks fall back to when academy_email_templates has no DB
// override for a given stage_key. The DB override columns (subject, body_md)
// win when they are non-null; otherwise renderStageEmail() uses the strings
// below.
//
// Body_md is a markdown-lite format (plain text + **bold** + lists) with
// {{merge_tag}} placeholders. See the MERGE_TAGS constant below for the
// supported tags. htmlFromMarkdown() in the webhooks converts \n -> <br>
// and **x** -> <strong>x</strong> for the HTML body.
//
// Tag inventory (resolved per send by the webhook):
//   {{firstName}}          first word of member.name or "there"
//   {{fullName}}           member.name or "there"
//   {{expiryDate}}         formatted trial end date (e.g. "Monday, 28 April 2026")
//   {{upgradeUrl}}         signed per-member checkout URL (trial stages)
//   {{dashboardUrl}}       signed per-member dashboard URL (rewind stages)
//   {{unsubUrl}}           per-member unsubscribe URL (rewind stages)
//   {{activityBlock}}      pre-rendered "Your activity so far" block or ""
//   {{daysUntilExpiry}}    integer days until trial_end_at
//   {{daysLeft}}           integer days left in SAVE20/REWIND window
//   {{daysWord}}           "day" or "days" agreeing with {{daysLeft}}
//   {{daysLeftPhrase}}     "**N day(s)**" (pre-bolded prose fragment)
//   {{daysLapsed}}         integer days since trial_end_at (rewind)
//   {{annualPriceGbp}}     "79"
//   {{save20PriceGbp}}     "59"
//   {{save20DiscountGbp}}  "20"
//   {{couponCode}}         "SAVE20" or "REWIND20"

const STAGE_KEYS = Object.freeze({
  TRIAL_WELCOME_NUDGE: "trial-welcome-nudge",
  TRIAL_PROGRESS_NUDGE: "trial-progress-nudge",
  TRIAL_STALLED: "trial-stalled",
  DAY_MINUS_7: "day-minus-7",
  DAY_MINUS_1: "day-minus-1",
  DAY_PLUS_7: "day-plus-7",
  DAY_PLUS_20: "day-plus-20",
  DAY_PLUS_30: "day-plus-30",
  DAY_PLUS_60: "day-plus-60",
  DAY_PLUS_90: "day-plus-90",
  PAID_QUIET: "paid-quiet",
  PAID_QUIET_45: "paid-quiet-45",
  PAID_QUIET_60: "paid-quiet-60",
  PAID_QUIET_90: "paid-quiet-90",
  PAID_BADGE_EARNED: "paid-badge-earned",
  PAID_MILESTONE: "paid-milestone",
  PAID_RENEWAL_SOON: "paid-renewal-soon",
});

const MERGE_TAG_DOCS = Object.freeze([
  { tag: "firstName", desc: "First word of member.name, or 'there' if blank." },
  { tag: "fullName", desc: "member.name or 'there' if blank." },
  { tag: "expiryDate", desc: "Formatted trial end date, e.g. 'Monday, 28 April 2026'." },
  { tag: "upgradeUrl", desc: "Signed per-member upgrade checkout URL (trial stages)." },
  { tag: "dashboardUrl", desc: "Gated Academy dashboard (login gateway)." },
  { tag: "moduleMapUrl", desc: "Gated module map — browse all lessons (login gateway)." },
  { tag: "unsubUrl", desc: "Per-member re-engagement unsubscribe URL (rewind stages)." },
  { tag: "activityBlock", desc: "Pre-rendered 'Your activity so far' block, or '' if none." },
  { tag: "daysUntilExpiry", desc: "Integer days until trial end (Day -7 / soft reminder)." },
  { tag: "daysLeft", desc: "Integer days remaining in SAVE20 / REWIND20 window." },
  { tag: "daysWord", desc: "'day' or 'days', agrees with daysLeft." },
  { tag: "daysLeftPhrase", desc: "Pre-bolded prose fragment like '**7 days**'." },
  { tag: "daysLapsed", desc: "Integer days since trial ended (rewind stages)." },
  { tag: "annualPriceGbp", desc: "Annual membership price in GBP, e.g. '79'." },
  { tag: "save20PriceGbp", desc: "Discounted price after SAVE20/REWIND20, e.g. '59'." },
  { tag: "save20DiscountGbp", desc: "Discount amount in GBP, e.g. '20'." },
  { tag: "couponCode", desc: "'SAVE20' (day-plus-7) or 'REWIND20' (day-plus-20/30/60)." },
  { tag: "currentBadge", desc: "Member's current badge label from snapshot SSOT." },
  { tag: "modulesOpened", desc: "Canonical foundation modules opened (JSON opened-set count)." },
  { tag: "modulesOpenedPhrase", desc: "Pluralised phrase, e.g. '1 module' or '2 modules'." },
  { tag: "modulesToNextBadge", desc: "Modules still needed for the next badge gate (integer)." },
  { tag: "modulesToNextBadgePhrase", desc: "Pluralised phrase for modules to next badge." },
  { tag: "examsToNextBadge", desc: "Exams still needed for the next badge gate." },
  { tag: "badgeGapPhrase", desc: "Modules/exams gap to next badge, e.g. '2 modules and 1 exam' or 'almost at your next badge'." },
  { tag: "percentToNextBadge", desc: "Progress percentage toward next badge module target." },
  { tag: "nextBadge", desc: "Label of the next badge the member is working toward." },
  { tag: "nextModuleTitle", desc: "Canonical title of the next unopened foundation module." },
  { tag: "nextModuleUrl", desc: "Full URL of the next unopened module (not used as email hyperlink)." },
  { tag: "nextModuleRef", desc: "Global tile ref, e.g. #26." },
  { tag: "nextModuleSection", desc: "Section name, e.g. Composition Guides." },
  { tag: "nextModuleLabel", desc: "Composed signpost: #26 · Title (Section)." },
  { tag: "trialDayNumber", desc: "Trial day number (Europe/London calendar day from trial_start)." },
  { tag: "trialDaysRemaining", desc: "Days remaining until trial_end_at." },
  { tag: "daysSinceLastLogin", desc: "Whole days since last login event." },
]);

// ─────────────────────────────────────────────────────────────────────────
// Default subjects + bodies per stage
//
// Transcribed from the inline builders in api/admin/trial-expiry-reminder-
// webhook.js and api/admin/lapsed-trial-reengagement-webhook.js on
// 2026-04-20. Any copy change should be made by editing in the admin UI
// (which writes to academy_email_templates.body_md), NOT by editing this
// file. The strings here only apply when no DB override exists.
// ─────────────────────────────────────────────────────────────────────────

const DAY_MINUS_7_BODY = `
Hi {{firstName}},

You're halfway through your 14-day free trial of the **Alan Ranger Photography Academy** — **7 days to go**. This is the point where most members go from browsing to actually applying something, so the next week is where the Academy really starts to pay back the time you've put in.
{{activityBlock}}
**A suggested plan for your next 7 days**

1. **Read the four foundation modules** — Exposure Triangle, Aperture, Shutter Speed, and ISO. Together they unlock nearly every decision you'll make with your camera.
2. **Take the four matching exams** — they're quick, and they turn "I've read it" into "I know it", with a pass certificate for each.
3. **Try practice packs 7, 8, 9 and 10** — small structured shooting assignments that move the foundation skills from theory into your camera bag.
4. **Pick one field checklist** and take it on your next shoot — the value usually lands on the first real outing you use one.
5. **Ask one question** — drop something in Q&A or throw it at Robo-Ranger. Members who engage here tend to progress fastest.

**What Academy members have gone on to do**

Members who've stayed have gone on to **win photography competitions**, pick up **paid photography work** as side hustles or small businesses, earn **professional qualifications** like RPS Licentiate, and — most commonly of all — simply enjoy their cameras far more, coming home with photos they're genuinely proud of rather than feeling lost in settings and menus.

**Want to lock in annual access now?**

Full annual membership is **£{{annualPriceGbp}}/year** — that's less than a single coffee a week — and everything you've already built (progress, bookmarks, notes, quiz scores) stays on your account.

Click the personal link below and we'll take you straight to your Academy dashboard. If your session has expired, your email address will be pre-filled on the login screen, so all you need is your password:

{{upgradeUrl}}

Your trial expires on **{{expiryDate}}**. Whenever you're ready — and any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course
`.trim();

const DAY_MINUS_1_BODY = `
Hi {{firstName}},

Your 14-day free trial of the **Alan Ranger Photography Academy** ends **tomorrow ({{expiryDate}})**. After that, the modules, practice packs, exams and Robo-Ranger access pause — but your account stays put, with everything you've built still on it.
{{activityBlock}}
**Three quick wins before it ends**

1. **Take one exam** — 10 minutes each, and you walk away with a pass certificate whether you upgrade or not.
2. **Download one field checklist** — the one-page PDFs are yours to keep and will come on every shoot with you.
3. **Ask Robo-Ranger one question** — on gear, technique or next steps. Members tell us this is the moment it clicks how much time it saves them.

**Members-only resources you keep for the full year**

- **30 Assignment Practice Packs** — step-by-step field exercises built around Alan's frameworks
- **35 One-page Field Checklists** — print-ready PDFs for every shoot scenario
- **741-page Searchable eBook** — every module in one printable PDF, yours for life
- **Caring for Your Assets guides** — backup routines, sensor cleaning, camera maintenance
- **Applied Learning Library** — 22+ scenario-based guides (portraits, product, property, landscape, close-up & food) — expanding monthly
- **Royal Photographic Society Accreditation pathway** — 10-module route towards a formal qualification
- **All new modules, new exams and new features** released each month — included for the life of your membership, at no extra cost

**And everything else in the Academy continues too:**

- **60 training modules** — in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing
- **35 one-page field checklists** — print-ready PDFs for every shoot scenario
- **30 practice packs** — self-paced assignments built around Alan's frameworks and guidance
- **15 exams with downloadable certificates** — individual pass certificates with score details, plus a master certificate once you complete them all
- **741-page searchable eBook** — every module in a printable PDF, yours for life
- **Applied Learning Library** — 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)
- **Pro photographer toolkit** — exposure calculator, print size calculator, style quiz, Hue test
- **Robo-Ranger AI assistant** — on-demand answers on technique, gear and Academy content
- **Direct messaging & Q&A with Alan** — message Alan with questions and join the live Q&A sessions

**Lock it in before tomorrow**

Full annual membership is **£{{annualPriceGbp}}/year** — less than a single coffee a week — and everything you've already built (progress, bookmarks, notes, quiz scores) stays on your account.

Click the personal link below and we'll take you straight to your Academy dashboard. If your session has expired, your email address will be pre-filled on the login screen, so all you need is your password.

{{upgradeUrl}}

Your trial expires on **{{expiryDate}}**. Whenever you're ready — and any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course
`.trim();

const DAY_PLUS_7_BODY = `
Hi {{firstName}},

Your 14-day free trial of the **Alan Ranger Photography Academy** ended on **{{expiryDate}}**, so full access has now paused — but your account is still here with everything you'd built on it.
{{activityBlock}}
**Here's an offer to pick up where you left off**

Upgrade to full annual membership for **£{{annualPriceGbp}}/year**, and for the next {{daysLeftPhrase}} the code **{{couponCode}}** takes **£{{save20DiscountGbp}} off your first year** — bringing it down to just **£{{save20PriceGbp}}**. That's less than a single coffee a week for the whole year.

**Three quick wins the moment you're back in**

1. **Jump back into the module you last opened** — pick up where you left off, no hunting required.
2. **Download one field checklist** — the one-page PDFs are yours to take on your next shoot.
3. **Take the first 10-minute exam** — short, focused, with a pass certificate to show for it.

**Members-only resources you keep for the full year**

- **30 Assignment Practice Packs** — step-by-step field exercises built around Alan's frameworks
- **35 One-page Field Checklists** — print-ready PDFs for every shoot scenario
- **741-page Searchable eBook** — every module in one printable PDF, yours for life
- **Caring for Your Assets guides** — backup routines, sensor cleaning, camera maintenance
- **Applied Learning Library** — 22+ scenario-based guides (portraits, product, property, landscape, close-up & food) — expanding monthly
- **Royal Photographic Society Accreditation pathway** — 10-module route towards a formal qualification
- **All new modules, new exams and new features** released each month — included for the life of your membership, at no extra cost

**And everything else in the Academy unlocks again:**

- **60 training modules** — in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing
- **35 one-page field checklists** — print-ready PDFs for every shoot scenario
- **30 practice packs** — self-paced assignments built around Alan's frameworks and guidance
- **15 exams with downloadable certificates** — individual pass certificates with score details, plus a master certificate once you complete them all
- **741-page searchable eBook** — every module in a printable PDF, yours for life
- **Applied Learning Library** — 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)
- **Pro photographer toolkit** — exposure calculator, print size calculator, style quiz, Hue test
- **Robo-Ranger AI assistant** — on-demand answers on technique, gear and Academy content
- **Direct messaging & Q&A with Alan** — message Alan with questions and join the live Q&A sessions

**Upgrade in one click**

Click the personal link below and we'll take you straight to your Academy dashboard, with **{{couponCode}} already applied** in the upgrade modal. No codes to type in, no separate checkout page. If your session has expired, your email address will be pre-filled on the login screen, so all you need is your password.

{{upgradeUrl}}

{{couponCode}} only runs for {{daysLeftPhrase}} from today — after that the discount closes and annual membership returns to full price at £{{annualPriceGbp}}.

Any questions, just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course
`.trim();

const REWIND_BODY = `
Hi {{firstName}},

It's been around {{daysLapsed}} days since your **Alan Ranger Photography Academy** trial ended — and you didn't end up joining. That's completely fine; people pick up free trials all the time and life gets in the way.
{{activityBlock}}
But I wanted to reach out with one honest reason to give the Academy another look: **it has grown a lot since your trial**, and for the next **7 days only** I'd like to offer you **£{{save20DiscountGbp}} off your first year** of annual membership with the code **{{couponCode}}** — £{{annualPriceGbp}} down to **£{{save20PriceGbp}}** for a full 12 months.

**Three quick wins the moment you're back in**

1. **Jump back into the module you last opened** — we'll take you right back to where you stopped.
2. **Download one field checklist** — the one-page PDFs are yours to keep and take on every shoot.
3. **Take one 10-minute exam** — short, focused, with a pass certificate you keep whether you upgrade or not.

**Members-only resources you keep for the full year**

- **30 Assignment Practice Packs** — step-by-step field exercises built around Alan's frameworks
- **35 One-page Field Checklists** — print-ready PDFs for every shoot scenario
- **741-page Searchable eBook** — every module in one printable PDF, yours for life
- **Caring for Your Assets guides** — backup routines, sensor cleaning, camera maintenance
- **Applied Learning Library** — 22+ scenario-based guides (portraits, product, property, landscape, close-up & food) — expanding monthly
- **Royal Photographic Society Accreditation pathway** — 10-module route towards a formal qualification
- **All new modules, new exams and new features** released each month — included for the life of your membership, at no extra cost

**And everything else in the Academy unlocks again:**

- **60 training modules** — in-depth articles with practical examples, graphics and example images across settings, composition, gear, genres and post-processing
- **35 one-page field checklists** — print-ready PDFs for every shoot scenario
- **30 practice packs** — self-paced assignments built around Alan's frameworks and guidance
- **15 exams with downloadable certificates** — individual pass certificates plus a master certificate when you complete them all
- **741-page searchable eBook** — every module in a printable PDF, yours for life
- **Applied Learning Library** — 22+ scenario-based guides across portraits, product, landscape, close-up and more (expanding monthly)
- **Pro photographer toolkit** — Exposure Calculator, Print Size Calculator, Photography Style Quiz, Colour IQ / Hue Test
- **Robo-Ranger AI assistant** — on-demand answers on technique, gear and Academy content
- **Direct messaging & Q&A with Alan** — message Alan with questions and join the live Q&A sessions
- **New modules and exams planned through 2026** — the syllabus is actively growing, not frozen
- **RPS Accreditation pathway (coming soon)** — routes to Licentiate and Associate with resources to support your panel

**What Academy members have gone on to do**

I don't want to oversell this, but I think it's worth saying plainly: Academy members have gone on to **win photography competitions**, launch **paid photography work** as side hustles or small businesses, earn **professional qualifications and accreditations**, and — most commonly of all — simply enjoy their cameras far more, coming home with photos they're genuinely proud of rather than feeling lost in settings and menus.

Twelve months is usually long enough for a committed learner to make a real leap forward in their photography — and at £{{save20PriceGbp}} for the entire year, that's a little over £1 a week for everything listed above.

**Ready to come back?**

Click the personal link below — we'll take you straight to your Academy dashboard with the upgrade offer already open and **{{couponCode}} applied**, no codes to type. If you're not still signed in, your email address will be pre-filled on the login screen, so all you need is your password:

{{dashboardUrl}}

**This personal offer is open for 7 days from today.** After that, {{couponCode}} closes for your account and annual membership returns to the standard £{{annualPriceGbp}}/year.

Any questions — technical, creative, or "is this right for me at all?" — just reply to this email.

Best regards,
Alan Ranger
Alan Ranger Photography Academy
https://www.alanranger.com/online-photography-course

---
If you'd prefer not to receive any more re-engagement emails from the Academy, you can unsubscribe in one click:
{{unsubUrl}}
`.trim();

const GATED_CTA_BLOCK = `
**[→ Open your dashboard]({{dashboardUrl}})** — your coach picks up where you left off and shows you the next step to earn your {{nextBadge}} badge.

**[→ Browse all modules]({{moduleMapUrl}})** — see every lesson in one place and choose whatever topic you fancy next.
`.trim();

const TRIAL_WELCOME_NUDGE_BODY = `
Hi {{firstName}},

You joined the Academy a couple of days ago, so this is just a quick, friendly nudge from me to help you make a strong start.

Here's the honest truth from teaching thousands of photographers: the ones who get the most from this don't try to do everything at once. They start with **one module** — and that single step is what turns "I signed up for something" into "I'm actually learning."

So if you haven't opened your first lesson yet, no worries at all. **{{nextModuleLabel}}** is a great place to begin — open your dashboard and your coach will take you straight there. It takes about 10 minutes, and by the end you'll understand the single most important setting on your camera.

${GATED_CTA_BLOCK}

That's your first rung on the ladder — and the Academy guides you from there, one step at a time.

Any questions, just reply — it comes straight to me.

Alan
`.trim();

const TRIAL_PROGRESS_NUDGE_BODY = `
Hi {{firstName}},

I noticed you've already started exploring the Academy — that's brilliant, and it's exactly how the photographers who get the most from this begin.

You've opened **{{modulesOpenedPhrase}}** so far, which puts you just **{{modulesToNextBadgePhrase}}** away from earning your **{{nextBadge}}** badge. You're closer than you might think.

When you're ready, **{{nextModuleLabel}}** is a great next step — open your dashboard and your coach will take you straight there.

${GATED_CTA_BLOCK}

No rush, and no pressure — go at your own pace. The whole point of the Academy is that it guides you through in order, and everything you complete stays with you. Each module is one more rung climbed.

And if anything's unclear or you're not sure what to tackle next, just reply — it comes straight to me. You're not doing this alone.

Alan
`.trim();

const TRIAL_STALLED_BODY = `
Hi {{firstName}},

I know how it goes — life gets busy, the week disappears, and the thing you meant to come back to slips down the list. No judgement at all; it happens to all of us.

I just wanted to gently remind you that your Academy trial is still open, and everything's exactly where you left it. There's no rush and nothing to catch up on — you can pick up in a couple of minutes whenever it suits you.

The easiest way back in is your next step — **{{nextModuleLabel}}** is waiting for you. Open your dashboard and your coach will take you straight there.

${GATED_CTA_BLOCK}

That's it. One short lesson and you're moving again. And remember the whole idea of the Academy is that it guides you — you never have to work out what to do next on your own.

If something's getting in the way, or you're not sure where to start, just reply to this email and tell me. It comes straight to me, and I'm happy to help you find your feet.

Alan
`.trim();

const PAID_QUIET_BODY = `
Hi {{firstName}},

I was just looking through the Academy and noticed you haven't been in for a little while — so I wanted to check in, properly, as the person behind it.

First off: thank you for being a member. That genuinely means a lot, and I don't take it for granted.

I know life fills up, and the things we care about get crowded out for a bit — that's completely normal. But I'd hate for you to drift away from your photography when you've already invested in getting better at it. Everything you've built is still here, exactly where you left it — you're currently at **{{currentBadge}}** level, and you're only **{{badgeGapPhrase}}** away from earning your **{{nextBadge}}** badge.

If it's been a while since you looked, you might find a few things have moved on: the Academy now works as a proper coached path — your coach shows you exactly what to do next, tracks your progress, and you earn badges as you work from the foundations through to mastering your camera. Even just logging back in earns you points towards your next badge — so you're moving forward the moment you return.

When you're ready, **{{nextModuleLabel}}** is a great next step — open your dashboard and your coach will take you straight there.

${GATED_CTA_BLOCK}

And if something's stopped you — the content isn't landing, you're not sure what to do next, you've hit a wall with your camera, or life's just been busy — **I'd really like to know.** Just reply and tell me. I read every message myself.

You're a valued member, and you're not on your own with this.

Alan
`.trim();

const PAID_QUIET_45_BODY = `
Hi {{firstName}},

It's been a few weeks now since you were last in the Academy, and I wanted to reach out again — not to nag, just because I genuinely don't like the thought of you losing momentum with your photography.

Here's the thing worth remembering: you've already done the hard part. You're at **{{currentBadge}}** level, and you're just **{{badgeGapPhrase}}** away from your **{{nextBadge}}** badge. That progress doesn't expire — it's sitting there waiting for you to pick it back up.

The Academy is built to make coming back easy. Your coach remembers exactly where you got to and shows you the single next thing to do — no scrolling, no deciding, no "where was I?" And remember, even logging in earns you points toward that next badge, so the moment you're back, you're already moving again.

**{{nextModuleLabel}}** is still your natural next step — open your dashboard and your coach will take you straight there.

${GATED_CTA_BLOCK}

If there's a reason you've paused — something wasn't clicking, you got stuck, or you're just not sure it's for you right now — please do hit reply and tell me honestly. I'd far rather hear from you and help than have you quietly drift off.

Still glad to have you with us,

Alan
`.trim();

const PAID_QUIET_60_BODY = `
Hi {{firstName}},

It's been a couple of months since you last logged in, so I want to be straight with you — because you're a paying member and you deserve honesty, not just another reminder.

You signed up to get better at photography, and I'd hate for that goal to quietly slip away. You're still at **{{currentBadge}}** level with only **{{badgeGapPhrase}}** to go for your **{{nextBadge}}** badge — genuinely not far. But progress only happens when you're actually in there, and right now you're missing out on something you're paying for.

So let me make it as easy as possible. **{{nextModuleLabel}}** is ready when you are — open your dashboard and your coach will take you straight there. Just logging back in earns you points toward your next badge, so you'll feel the progress straight away:

${GATED_CTA_BLOCK}

But I also want to ask directly: **is the Academy still working for you?** If something's missing, if the content isn't what you hoped, or if you're stuck and frustrated — tell me. Just reply. I read every message personally, and either I'll help you get unstuck, or at the very least I'll understand what we could do better. Your honest feedback is genuinely valuable to me.

Either way, I'm glad you're here,

Alan
`.trim();

const PAID_QUIET_90_BODY = `
Hi {{firstName}},

It's been about three months since you were last in the Academy, and this is the last time I'll nudge you about it — I don't want to fill your inbox, and I respect your time too much for that.

But I didn't want to let it go without one honest, personal message. You joined because you wanted to grow as a photographer, and everything you started is still here: you're at **{{currentBadge}}** level, just **{{badgeGapPhrase}}** from your **{{nextBadge}}** badge. None of it has gone anywhere. Your coach still knows exactly where you left off and will pick up the moment you return — and even logging back in earns you points toward that next badge.

If there's any spark of "I really did mean to get back to this," **{{nextModuleLabel}}** is still there for you — open your dashboard and your coach will take you straight there:

${GATED_CTA_BLOCK}

And if the truth is that now isn't the right time, or the Academy isn't what you need right now — that's completely okay, and I'd be grateful to know. A one-line reply telling me why would genuinely help me make it better for the next person. I read every one myself.

Whatever you decide, thank you for having been part of it — and the door stays open whenever you're ready.

Alan
`.trim();

const PLACEHOLDER_GENERIC = `
Hi {{firstName}},

[PLACEHOLDER — copy not signed off for this stage yet]

{{activityBlock}}
{{upgradeUrl}}
`.trim();

const DEFAULTS = Object.freeze({
  [STAGE_KEYS.TRIAL_WELCOME_NUDGE]: Object.freeze({
    label: "Trial welcome nudge (0 modules)",
    subject: "Your first 10 minutes (this is where it clicks)",
    body_md: TRIAL_WELCOME_NUDGE_BODY,
  }),
  [STAGE_KEYS.TRIAL_PROGRESS_NUDGE]: Object.freeze({
    label: "Trial progress nudge",
    subject: "You've made a great start — here's your next step",
    body_md: TRIAL_PROGRESS_NUDGE_BODY,
  }),
  [STAGE_KEYS.TRIAL_STALLED]: Object.freeze({
    label: "Trial stalled",
    subject: "Still here whenever you're ready",
    body_md: TRIAL_STALLED_BODY,
  }),
  [STAGE_KEYS.DAY_MINUS_7]: Object.freeze({
    label: "Day -7 · Mid-trial check-in",
    subject: "You're Halfway Through Your Free Trial — 7 Days Left",
    body_md: DAY_MINUS_7_BODY,
  }),
  [STAGE_KEYS.DAY_MINUS_1]: Object.freeze({
    label: "Day -1 · Final-day reminder",
    subject: "Your Academy trial ends tomorrow — keep everything you've built",
    body_md: DAY_MINUS_1_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_7]: Object.freeze({
    label: "Day +7 · SAVE20 recovery",
    subject: "Your Academy trial ended — {{couponCode}} is yours for {{daysLeft}} more {{daysWord}}",
    body_md: DAY_PLUS_7_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_20]: Object.freeze({
    label: "Day +20 · REWIND20 attempt 1",
    subject: "Your Academy trial — £{{save20DiscountGbp}} off to come back and pick up where you left off",
    body_md: REWIND_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_30]: Object.freeze({
    label: "Day +30 · REWIND20 attempt 2",
    subject: "Still thinking it over? £{{save20DiscountGbp}} off your Academy annual membership (7 days)",
    body_md: REWIND_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_60]: Object.freeze({
    label: "Day +60 · REWIND20 attempt 3",
    subject: "Final offer — £{{save20DiscountGbp}} off your Academy annual membership (7 days only)",
    body_md: REWIND_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_90]: Object.freeze({
    label: "Day +90 · Final win-back",
    subject: "[PLACEHOLDER] Still thinking about the Academy?",
    body_md: PLACEHOLDER_GENERIC,
  }),
  [STAGE_KEYS.PAID_QUIET]: Object.freeze({
    label: "Paid quiet · 30–44d",
    subject: "Everything alright?",
    body_md: PAID_QUIET_BODY,
  }),
  [STAGE_KEYS.PAID_QUIET_45]: Object.freeze({
    label: "Paid quiet · 45–59d",
    subject: "Your camera misses you (and so does your coach)",
    body_md: PAID_QUIET_45_BODY,
  }),
  [STAGE_KEYS.PAID_QUIET_60]: Object.freeze({
    label: "Paid quiet · 60–89d",
    subject: "Is the Academy still right for you?",
    body_md: PAID_QUIET_60_BODY,
  }),
  [STAGE_KEYS.PAID_QUIET_90]: Object.freeze({
    label: "Paid quiet · 90d+ (final)",
    subject: "Before you drift away completely…",
    body_md: PAID_QUIET_90_BODY,
  }),
  [STAGE_KEYS.PAID_BADGE_EARNED]: Object.freeze({
    label: "Paid badge earned",
    subject: "[PLACEHOLDER] You've earned {{currentBadge}}!",
    body_md: PLACEHOLDER_GENERIC,
  }),
  [STAGE_KEYS.PAID_MILESTONE]: Object.freeze({
    label: "Paid milestone",
    subject: "[PLACEHOLDER] Milestone reached — {{modulesOpened}} modules",
    body_md: PLACEHOLDER_GENERIC,
  }),
  [STAGE_KEYS.PAID_RENEWAL_SOON]: Object.freeze({
    label: "Paid renewal soon",
    subject: "[PLACEHOLDER] Your Academy year — look how far you've come",
    body_md: PLACEHOLDER_GENERIC,
  }),
});

// Simple {{tag}} substitution. Missing tags are left as-is so editors can
// spot typos in the preview pane. Null/undefined values render as empty
// strings so activity-block-style optional content doesn't leave "undefined".
function renderTemplate(source, vars) {
  if (typeof source !== "string") return "";
  return source.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (!vars || !Object.hasOwn(vars, key)) return match;
    const value = vars[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

function getDefault(stageKey) {
  return DEFAULTS[stageKey] || null;
}

function listStageKeys() {
  const { EMAIL_STAGES } = require("./emailStages");
  return EMAIL_STAGES.map((s) => s.key);
}

module.exports = {
  STAGE_KEYS,
  MERGE_TAG_DOCS,
  DEFAULTS,
  renderTemplate,
  getDefault,
  listStageKeys,
};
