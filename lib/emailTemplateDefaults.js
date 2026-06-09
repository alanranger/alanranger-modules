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
//   {{couponExpiryDate}}   Human-readable REWIND window end, e.g. "Sunday 16 June"

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
  { tag: "couponCode", desc: "'SAVE20' (day-plus-7) or 'REWIND20' (day-plus-20/30/60/90)." },
  { tag: "couponExpiryDate", desc: "Human-readable end of the 7-day REWIND20 window, e.g. 'Sunday 16 June'." },
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
  { tag: "newBadge", desc: "Badge just earned (paid-badge-earned)." },
  { tag: "remainingActionsList", desc: "Checklist lines toward next badge (points-safe)." },
  { tag: "sustainedActivityLine", desc: "Non-numeric sustained-activity line for Graduate/Master next badges." },
  { tag: "renewalDate", desc: "Formatted renewal date (paid-renewal-soon)." },
  { tag: "daysUntilRenewal", desc: "Days until membership renews." },
  { tag: "renewalProgressLine", desc: "Short progress recap for renewal email." },
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

You're halfway through your free trial of the Academy, with **7 days to go** — so this is the moment to turn a good start into real momentum.

Here's where you've got to so far: you've opened **{{modulesOpened}} modules**, which puts you **{{badgeGapPhrase}}** from earning your **{{nextBadge}}** badge. You're closer than you might think — and your coach has your next step ready: **{{nextModuleLabel}}**.

The members who get the most from the Academy treat the next week as the payoff for signing up. A simple way to use it:

- Work through your next few modules — your coach shows you the order, so there's no guesswork
- Take a couple of the short exams — they turn "I've read it" into "I know it", with a certificate for each
- Try one practice assignment on your next shoot — that's where the theory becomes muscle memory

Everything you build — your progress, badges, notes and scores — stays on your account if you continue. Full annual membership is **£{{annualPriceGbp}}/year** (less than a coffee a week), and your trial expires on **{{expiryDate}}**.

When you're ready to keep everything you've started:

**[→ Continue & upgrade]({{upgradeUrl}})** — picks up right where you left off, nothing to set up.

Or carry on exploring first: **[open your dashboard]({{dashboardUrl}})**.

Any questions, just reply — it comes straight to me.

Alan
`.trim();

const DAY_MINUS_1_BODY = `
Hi {{firstName}},

Your free trial of the Academy ends **tomorrow ({{expiryDate}})**. After that your access pauses — but your account stays exactly as it is, with everything you've built still on it.

Here's what you've got so far: you've opened **{{modulesOpened}} modules** and you're **{{badgeGapPhrase}}** from your **{{nextBadge}}** badge. If you continue, none of that resets — your progress, badges, notes and scores all carry on from right here, with your coach still showing you the next step.

If you continue, you keep:

- Your full library of modules, exams and practice assignments — with new ones added every month
- Your downloadable field checklists and the complete searchable ebook, yours to keep
- Robo-Ranger and direct Q&A with me, whenever you're stuck

Full annual membership is **£{{annualPriceGbp}}/year** — less than a coffee a week — and it keeps everything you've started moving forward instead of pausing.

**[→ Keep my access & upgrade]({{upgradeUrl}})** — picks up exactly where you are, nothing to set up.

Or take one last look around first: **[open your dashboard]({{dashboardUrl}})**.

Whatever you decide, thank you for giving it a proper go — and any questions, just reply. It comes straight to me.

Alan
`.trim();

// Shared CTA block for conversion emails (+7 SAVE20, +20/+30/+60/+90 REWIND20).
const CONVERSION_STRIPE_FIRST_CTA = `
**Do this next** — **[→ Upgrade now and save £{{save20DiscountGbp}}]({{upgradeUrl}})** with **{{couponCode}}** already applied — just **£{{save20PriceGbp}}** for your first year.

Once you've upgraded, **[log back into your dashboard]({{dashboardUrl}})** to pick up where you left off.
`.trim();

const DAY_PLUS_7_BODY = `
Hi {{firstName}},

Your free trial ended on **{{expiryDate}}**, so your full access has paused for now — but your account is still here, with everything you built still on it, exactly where you left off.

You'd got to **{{modulesOpened}} modules**, **{{badgeGapPhrase}}** from your **{{nextBadge}}** badge — so you were well underway. I'd hate for that to go to waste, so here's a hand to pick it back up:

For the next **{{daysLeftPhrase}}**, the code **{{couponCode}}** takes **£{{save20DiscountGbp}} off your first year** — bringing full annual membership down to just **£{{save20PriceGbp}}**. The moment you're back, your coach carries on from where you stopped.

Continuing gives you back:

- Your full library of modules, exams and practice assignments, growing every month
- Your field checklists and searchable ebook, yours to keep for good
- Robo-Ranger and direct Q&A with me whenever you need a hand

${CONVERSION_STRIPE_FIRST_CTA}

{{couponCode}} only runs for **{{daysLeftPhrase}}** — after that annual membership returns to **£{{annualPriceGbp}}**. Any questions, just reply.

Alan
`.trim();

const DAY_PLUS_20_BODY = `
Hi {{firstName}},

It's been a few weeks since your Academy trial ended, and you didn't carry on — which is completely fine, life gets busy and trials slip by.

But here's where you'd got to: you opened **{{modulesOpened}} modules**, which had you **{{badgeGapPhrase}}** from your **{{nextBadge}}** badge. All of that is still saved on your account, exactly where you left it.

Here's what's waiting when you come back:

- **A personalised coach** that looks at where you are and tells you the single best next step — no more guessing. Yours is ready: **{{nextModuleLabel}}**
- **Badges and points to earn** as you progress, so you can actually see yourself improving instead of wondering if you are
- **The modules map** — every topic laid out so you can pick and mix what interests you, rather than follow a fixed order
- **Applied Learning** built on top of the foundation modules — taking the theory and turning it into real-world scenarios you can go out and shoot
- **The RPS Accreditation route** for anyone who wants to take it further and work towards a Royal Photographic Society distinction in photography
- **Every new module and improvement released over your next 12 months** — included, at no extra cost. The Academy keeps growing and you get all of it

And here's the honest value: for the next 7 days, **{{couponCode}}** brings your first year down from **£{{annualPriceGbp}} to just £{{save20PriceGbp}}** — barely £1 a week for a complete, coached online photography course with everything above. For what's inside, that's a genuine bargain.

${CONVERSION_STRIPE_FIRST_CTA}

Any questions, just reply — it comes straight to me.

Alan

Unsubscribe: {{unsubUrl}}
`.trim();

const DAY_PLUS_30_BODY = `
Hi {{firstName}},

It's been about a month since your Academy trial ended. No pressure at all — but I wanted to check in once more, because the door's still open and your progress is still exactly where you left it.

You'd opened **{{modulesOpened}} modules** and were **{{badgeGapPhrase}}** from your **{{nextBadge}}** badge.

In case it's slipped your mind, here's what you'd be coming back to:

- **A personalised coach** that tells you your single best next step — yours is ready at **{{nextModuleLabel}}**
- **Badges and points to earn** as you go, so progress is something you can see
- **The modules map** — pick and mix whatever topics interest you, in any order
- **Applied Learning** on top of the foundation modules — theory turned into real-world scenarios you can shoot
- **The RPS Accreditation route** towards a Royal Photographic Society distinction, if you want to go further
- **Every new module and improvement over your next 12 months** — included, at no extra cost

For the next 7 days, **{{couponCode}}** still brings your first year from **£{{annualPriceGbp}} down to £{{save20PriceGbp}}** — barely £1 a week for the whole thing.

${CONVERSION_STRIPE_FIRST_CTA}

Whatever you decide, no hard feelings — and any questions, just reply.

Alan

Unsubscribe: {{unsubUrl}}
`.trim();

const DAY_PLUS_60_BODY = `
Hi {{firstName}},

It's been a couple of months since your Academy trial, so I'll be straight with you: this is one of the last times I'll reach out about coming back with a discount.

Your account and everything you built are still here — **{{modulesOpened}} modules** opened, **{{badgeGapPhrase}}** from your **{{nextBadge}}** badge — but I don't want to keep landing in your inbox indefinitely. If the Academy's been at the back of your mind, now's the moment.

A reminder of what's inside:

- **A personalised coach** showing your best next step — yours is **{{nextModuleLabel}}**
- **Badges, points and a modules map** so you can see progress and pick your own path
- **Applied Learning and the RPS route** — real-world scenarios, and a path to a Royal Photographic Society distinction if you want it
- **Every new module and improvement over the next 12 months**, included

For the next 7 days, **{{couponCode}}** brings your first year from **£{{annualPriceGbp}} to £{{save20PriceGbp}}** — barely £1 a week.

${CONVERSION_STRIPE_FIRST_CTA}

Any questions, just reply.

Alan

P.S. {{couponCode}} closes for your account on {{couponExpiryDate}} — after that, annual membership returns to £{{annualPriceGbp}}.

Unsubscribe: {{unsubUrl}}
`.trim();

const DAY_PLUS_90_BODY = `
Hi {{firstName}},

This is the last email I'll send about your Academy trial — so I'll keep it short and honest.

Your account is still here, with the **{{modulesOpened}} modules** you opened and your progress towards your **{{nextBadge}}** badge still saved. After this, I'll stop reaching out and let you get on — but I didn't want the door to close without one final offer.

If you come back, here's what's waiting:

- **A personalised coach** with your next step ready: **{{nextModuleLabel}}**
- **Badges, points and a modules map** to track progress and choose your own topics
- **Applied Learning and the RPS route** — theory turned into real shoots, and a path to a Royal Photographic Society distinction
- **Every new module and improvement over the next 12 months**, included at no extra cost

For the next 7 days, **{{couponCode}}** gives you **£{{save20DiscountGbp}} off your first year** one last time — **£{{annualPriceGbp}} down to £{{save20PriceGbp}}**, barely £1 a week. After that the offer closes and I won't email about it again.

${CONVERSION_STRIPE_FIRST_CTA}

Either way, thank you for giving the Academy a try — it was good to have you, and the door's always open even without the discount.

Alan

P.S. This is genuinely the final reminder — {{couponCode}} closes on {{couponExpiryDate}} and I won't be in touch about it again.

Unsubscribe: {{unsubUrl}}
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

const PAID_BADGE_EARNED_BODY = `
Hi {{firstName}},

Well done — you've just earned your **{{newBadge}}** badge. That's real, measurable progress in your photography, and worth a moment to notice.

Here's the thing though: because the Academy doesn't make you work in a rigid order, you may be closer to your *next* badge than you'd expect — you've probably already ticked off some of what it needs without realising.

**To earn your {{nextBadge}} badge, here's what's left:**

{{remainingActionsList}}

And for some members, one or two of those is all that stands between them and the badge *after* that, too — progress isn't linear, so a couple of actions can take you further than you'd think.

{{sustainedActivityLine}}

Your coach has the best next step lined up: **{{nextModuleLabel}}**.

**[→ Open your dashboard]({{dashboardUrl}})** — see your progress and your next step.

**[→ Browse all modules]({{moduleMapUrl}})** — or choose whatever you fancy.

Keep going — you're doing brilliantly.

Alan
`.trim();

const PAID_RENEWAL_SOON_BODY = `
Hi {{firstName}},

A friendly heads-up: your annual Academy membership is due to renew on **{{renewalDate}}**, which is about **{{daysUntilRenewal}} days** away. Nothing for you to do — it'll renew automatically — but I never like these things to be a surprise, so here's your notice.

Mostly, though, I wanted to say thank you. You've been a member for a year, and in that time you've:

- Reached **{{currentBadge}}** level
- {{renewalProgressLine}}

That's a year of genuinely showing up for your photography, and it's been good to have you in the Academy.

The year ahead brings new modules and improvements at no extra cost, and your coach is ready with your next step whenever you are: **{{nextModuleLabel}}**.

**[→ Open your dashboard]({{dashboardUrl}})** — pick up where you left off.

If you've any questions about your membership or renewal, just reply — it comes straight to me.

Thanks for a great year,

Alan
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
    subject: "You're halfway — here's how to make the next 7 days count",
    body_md: DAY_MINUS_7_BODY,
  }),
  [STAGE_KEYS.DAY_MINUS_1]: Object.freeze({
    label: "Day -1 · Final-day reminder",
    subject: "Your trial ends tomorrow — here's how to keep your progress",
    body_md: DAY_MINUS_1_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_7]: Object.freeze({
    label: "Day +7 · SAVE20 recovery",
    subject: "Your trial's ended — but {{couponCode}} is yours for {{daysLeft}} more {{daysWord}}",
    body_md: DAY_PLUS_7_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_20]: Object.freeze({
    label: "Day +20 · REWIND20 attempt 1",
    subject: "{{couponCode}} — £{{save20DiscountGbp}} off to pick up where you left off",
    body_md: DAY_PLUS_20_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_30]: Object.freeze({
    label: "Day +30 · REWIND20 attempt 2",
    subject: "Still here whenever you're ready — £{{save20DiscountGbp}} off your first year",
    body_md: DAY_PLUS_30_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_60]: Object.freeze({
    label: "Day +60 · REWIND20 attempt 3",
    subject: "This offer won't stay open indefinitely — £{{save20DiscountGbp}} off",
    body_md: DAY_PLUS_60_BODY,
  }),
  [STAGE_KEYS.DAY_PLUS_90]: Object.freeze({
    label: "Day +90 · Final win-back",
    subject: "Last chance to come back with {{couponCode}}",
    body_md: DAY_PLUS_90_BODY,
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
    subject: "You've earned your {{newBadge}} badge 🎉",
    body_md: PAID_BADGE_EARNED_BODY,
  }),
  [STAGE_KEYS.PAID_MILESTONE]: Object.freeze({
    label: "Paid milestone (deprecated)",
    subject: "[DEPRECATED] Milestone reached",
    body_md: PLACEHOLDER_GENERIC,
  }),
  [STAGE_KEYS.PAID_RENEWAL_SOON]: Object.freeze({
    label: "Paid renewal soon",
    subject: "Your Academy membership renews in {{daysUntilRenewal}} days — a quick note",
    body_md: PAID_RENEWAL_SOON_BODY,
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
