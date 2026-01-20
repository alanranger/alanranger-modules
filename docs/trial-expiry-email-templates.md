# Trial Expiry Email Templates

This document shows all 4 email templates for trial expiry reminders.

## Email Schedule

1. **15 days before expiry** - Soft, friendly reminder
2. **7 days before expiry** - Harder reminder with more urgency
3. **1 day before expiry** - Final urgent reminder
4. **1 day after expiry** - Expired notification

All emails include a personalized Stripe checkout URL that takes members directly to checkout for the annual plan (£79/year).

---

## 1. 15-Day Soft Reminder

**Subject:** `📸 Friendly Reminder: Your Academy Trial Expires Soon`

**Body:**
```
Hi [Member Name],

Just a friendly heads-up that your 30-day trial with Alan Ranger Photography Academy will end on [Expiry Date] (15 days from now).

We hope you've been enjoying the Academy content so far! To continue your photography journey with full access to all modules, tutorials, and resources, you'll need to upgrade to an annual plan.

**Upgrade now for just £79/year and get:**
✅ 5 groups of key (10 Min) modules to learn photography
✅ 15 Key Camera Setting Modules
✅ 10 Essential Gear and Accessory Guides
✅ 10 Composition Guide Modules
✅ 10 Photography Genre Topic Guides
✅ 15 Practical Assignments
✅ 30 Practice Packs to support the key modules
✅ 35 1-Page Field Checklists
✅ 15 Exam modules with certification to test your knowledge and development
✅ Personalised dashboard so you can pick up where you left off (modules opened, bookmarks, recent activity)
✅ Exams + progress tracking included — module pass/fail, attempts, certificates, and clear progress visuals
✅ Modern login + better access control for a smoother experience across devices

**Upgrade your account:**
[Personalized Stripe Checkout URL]

No pressure - just wanted to make sure you're aware so you don't miss out on continuing your learning journey with us!

If you have any questions, please don't hesitate to contact us.

Best regards,
Alan Ranger Photography Academy

---
This is an automated friendly reminder. Your trial expires on [Expiry Date] (15 days remaining).
```

---

## 2. 7-Day Harder Reminder

**Subject:** `⏰ Your Academy Trial Expires in 7 Days - Upgrade to Continue Access`

**Body:**
```
Hi [Member Name],

**Your trial expires in 7 days**

Your 30-day trial with Alan Ranger Photography Academy will end on [Expiry Date].

**To continue enjoying full access to all Academy content, you'll need to upgrade to an annual plan.**

**What happens if you don't upgrade?**
- Your trial access will expire on [Expiry Date]
- You'll lose access to all Academy modules, content, and resources
- You'll need to sign up for an annual plan (£79) to regain access

**Upgrade now for just £79/year and get:**
✅ 5 groups of key (10 Min) modules to learn photography
✅ 15 Key Camera Setting Modules
✅ 10 Essential Gear and Accessory Guides
✅ 10 Composition Guide Modules
✅ 10 Photography Genre Topic Guides
✅ 15 Practical Assignments
✅ 30 Practice Packs to support the key modules
✅ 35 1-Page Field Checklists
✅ 15 Exam modules with certification to test your knowledge and development
✅ Personalised dashboard so you can pick up where you left off (modules opened, bookmarks, recent activity)
✅ Exams + progress tracking included — module pass/fail, attempts, certificates, and clear progress visuals
✅ Modern login + better access control for a smoother experience across devices

**Upgrade your account now:**
[Personalized Stripe Checkout URL]

Don't miss out on continuing your photography journey with us!

If you have any questions or need help with the upgrade process, please contact us.

Best regards,
Alan Ranger Photography Academy

---
This is an automated reminder. Your trial expires on [Expiry Date] (7 days remaining).
```

---

## 3. 1-Day Final Reminder

**Subject:** `⚠️ URGENT: Your Academy Trial Expires Tomorrow - Upgrade Now`

**Body:**
```
Hi [Member Name],

**URGENT: Only 24 hours left!**

Your 30-day trial with Alan Ranger Photography Academy will end **tomorrow ([Expiry Date])**.

**This is your final reminder** - if you don't upgrade today, you will lose access to:
- All Academy modules and content
- Exclusive photography tutorials and guides
- Community support and resources
- Everything you've been learning

**Upgrade now for just £79/year and keep your access:**
[Personalized Stripe Checkout URL]

**What you'll get:**
✅ 5 groups of key (10 Min) modules to learn photography
✅ 15 Key Camera Setting Modules
✅ 10 Essential Gear and Accessory Guides
✅ 10 Composition Guide Modules
✅ 10 Photography Genre Topic Guides
✅ 15 Practical Assignments
✅ 30 Practice Packs to support the key modules
✅ 35 1-Page Field Checklists
✅ 15 Exam modules with certification to test your knowledge and development
✅ Personalised dashboard so you can pick up where you left off (modules opened, bookmarks, recent activity)
✅ Exams + progress tracking included — module pass/fail, attempts, certificates, and clear progress visuals
✅ Modern login + better access control for a smoother experience across devices

**Don't wait - upgrade now before you lose access tomorrow!**

If you have any questions or need help with the upgrade process, please contact us immediately.

Best regards,
Alan Ranger Photography Academy

---
This is an automated final reminder. Your trial expires tomorrow ([Expiry Date]).
```

---

## 4. 1-Day After Expiry (Expired Notification)

**Subject:** `⚠️ Your Academy Trial Has Expired - Restore Access Now`

**Body:**
```
Hi [Member Name],

**Your 30-day trial with Alan Ranger Photography Academy has expired.**

Your trial access ended on [Expiry Date], and you've now lost access to all Academy content, modules, and resources.

**Don't worry - you can restore your access immediately!**

Upgrade to an annual plan (£79/year) and you'll instantly regain full access to:

**Academy Content:**
✅ 5 groups of key (10 Min) modules to learn photography
✅ 15 Key Camera Setting Modules
✅ 10 Essential Gear and Accessory Guides
✅ 10 Composition Guide Modules
✅ 10 Photography Genre Topic Guides
✅ 15 Practical Assignments
✅ 30 Practice Packs to support the key modules
✅ 35 1-Page Field Checklists
✅ 15 Exam modules with certification to test your knowledge and development

**Plus Academy Features:**
✅ Personalised dashboard so you can pick up where you left off (modules opened, bookmarks, recent activity)
✅ Exams + progress tracking included — module pass/fail, attempts, certificates, and clear progress visuals
✅ Modern login + better access control for a smoother experience across devices

**Restore your access now:**
[Personalized Stripe Checkout URL]

This is your last chance to continue your photography journey with us at the annual membership rate.

If you have any questions or need help, please contact us.

Best regards,
Alan Ranger Photography Academy

---
This is an automated notification. Your trial expired on [Expiry Date].
```

---

## Zapier Setup

You'll need **4 separate Zaps**, one for each reminder:

### Zap 1: 15-Day Soft Reminder
- **Trigger:** Schedule (Daily at [time])
- **Action:** Webhook
  - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=15`
  - **Method:** GET

### Zap 2: 7-Day Harder Reminder
- **Trigger:** Schedule (Daily at [time])
- **Action:** Webhook
  - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=7`
  - **Method:** GET

### Zap 3: 1-Day Final Reminder
- **Trigger:** Schedule (Daily at [time])
- **Action:** Webhook
  - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=1`
  - **Method:** GET

### Zap 4: 1-Day After Expiry
- **Trigger:** Schedule (Daily at [time])
- **Action:** Webhook
  - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=-1`
  - **Method:** GET

---

## Notes

- All emails are sent with `info@alanranger.com` in the BCC field for your records
- All emails include personalized Stripe checkout URLs that take members directly to checkout
- The endpoint handles both finding members AND sending emails (2-step Zapier requirement)
- Each Zap runs daily and the endpoint filters members based on the `daysAhead` parameter
