# Zapier Setup Instructions - Trial Expiry Reminders

**Status:** 3 of 4 Zaps Active (1-Day Final Reminder pending - Zapier free plan limit reached)

This guide will walk you through setting up 4 separate Zaps in Zapier to send automated trial expiry reminder emails.

## Prerequisites

- Zapier account (free tier works - each Zap only needs 2 steps)
- Access to your Zapier dashboard
- **Note:** Free plan has 5 Zap limit - currently all slots used

---

## Overview

You'll create **4 separate Zaps**, one for each reminder stage:

1. **Zap 1:** 15-Day Soft Reminder ✅ **ACTIVE**
2. **Zap 2:** 7-Day Harder Reminder ✅ **ACTIVE**
3. **Zap 3:** 1-Day Final Reminder ⏸️ **PENDING** (Zapier limit reached)
4. **Zap 4:** 1-Day After Expiry (Expired Notification) ✅ **ACTIVE**

**Current Status:**
- ✅ Zap 1: "Academy 15 days left trial reminder" - Running
- ✅ Zap 2: "Academy - 7-Day Final Trial Reminder" - Running
- ⏸️ Zap 3: **NOT CREATED** - Need to free up a Zap slot or upgrade plan
- ✅ Zap 4: "Academy - 1-day after trial expiry" - Running

**Action Required:** Review in next 2 weeks to complete Zap 3 (1-Day Final Reminder - highest priority for conversions)

Each Zap follows the same pattern:
- **Step 1:** Schedule Trigger (runs daily)
- **Step 2:** Webhook Action (calls our endpoint)

---

## Zap 1: 15-Day Soft Reminder

### Step 1: Create New Zap

1. Log into Zapier
2. Click **"+ Create Zap"** button
3. Name your Zap: **"Academy Trial - 15 Day Reminder"**

### Step 2: Set Up Trigger

1. In the **Trigger** section, search for **"Schedule"**
2. Select **"Schedule by Zapier"**
3. Click **"Continue"**
4. Choose **"Every Day"** as the trigger interval
5. Set the time (recommended: **9:00 AM** or **10:00 AM** UK time)
6. Click **"Continue"**
7. Click **"Test trigger"** to verify it works
8. Click **"Continue"**

### Step 3: Set Up Action

1. In the **Action** section, search for **"Webhooks"**
2. Select **"Webhooks by Zapier"**
3. Choose **"GET"** as the method
4. Click **"Continue"**
5. Fill in the webhook details:
   - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=15`
   - **Method:** `GET` (should already be selected)
   - Leave all other fields as default
6. Click **"Continue"**
7. Click **"Test action"** to verify it works
   - You should see a response with `success: true`
   - Check the response to see if any members were found
8. Click **"Continue"**

### Step 4: Turn On Zap

1. Review your Zap settings
2. Click **"Turn on Zap"** (toggle in top right)
3. Your Zap is now active!

---

## Zap 2: 7-Day Harder Reminder

### Step 1: Create New Zap

1. Click **"+ Create Zap"** button
2. Name your Zap: **"Academy Trial - 7 Day Reminder"**

### Step 2: Set Up Trigger

1. Search for **"Schedule"**
2. Select **"Schedule by Zapier"**
3. Click **"Continue"**
4. Choose **"Every Day"**
5. Set the time (recommended: **9:00 AM** or **10:00 AM** UK time - same as Zap 1 is fine)
6. Click **"Continue"**
7. Click **"Test trigger"**
8. Click **"Continue"**

### Step 3: Set Up Action

1. Search for **"Webhooks"**
2. Select **"Webhooks by Zapier"**
3. Choose **"GET"** as the method
4. Click **"Continue"**
5. Fill in the webhook details:
   - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=7`
   - **Method:** `GET`
6. Click **"Continue"**
7. Click **"Test action"**
8. Click **"Continue"**

### Step 4: Turn On Zap

1. Review your Zap settings
2. Click **"Turn on Zap"**
3. Your Zap is now active!

---

## Zap 3: 1-Day Final Reminder

### Step 1: Create New Zap

1. Click **"+ Create Zap"** button
2. Name your Zap: **"Academy Trial - 1 Day Final Reminder"**

### Step 2: Set Up Trigger

1. Search for **"Schedule"**
2. Select **"Schedule by Zapier"**
3. Click **"Continue"**
4. Choose **"Every Day"**
5. Set the time (recommended: **9:00 AM** or **10:00 AM** UK time)
6. Click **"Continue"**
7. Click **"Test trigger"**
8. Click **"Continue"**

### Step 3: Set Up Action

1. Search for **"Webhooks"**
2. Select **"Webhooks by Zapier"**
3. Choose **"GET"** as the method
4. Click **"Continue"**
5. Fill in the webhook details:
   - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=1`
   - **Method:** `GET`
6. Click **"Continue"**
7. Click **"Test action"**
8. Click **"Continue"**

### Step 4: Turn On Zap

1. Review your Zap settings
2. Click **"Turn on Zap"**
3. Your Zap is now active!

---

## Zap 4: 1-Day After Expiry (Expired Notification)

### Step 1: Create New Zap

1. Click **"+ Create Zap"** button
2. Name your Zap: **"Academy Trial - Expired Notification"**

### Step 2: Set Up Trigger

1. Search for **"Schedule"**
2. Select **"Schedule by Zapier"**
3. Click **"Continue"**
4. Choose **"Every Day"**
5. Set the time (recommended: **9:00 AM** or **10:00 AM** UK time)
6. Click **"Continue"**
7. Click **"Test trigger"**
8. Click **"Continue"**

### Step 3: Set Up Action

1. Search for **"Webhooks"**
2. Select **"Webhooks by Zapier"**
3. Choose **"GET"** as the method
4. Click **"Continue"**
5. Fill in the webhook details:
   - **URL:** `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=-1`
   - **Method:** `GET`
   - **Note:** The `-1` means 1 day AFTER expiry
6. Click **"Continue"**
7. Click **"Test action"**
8. Click **"Continue"**

### Step 4: Turn On Zap

1. Review your Zap settings
2. Click **"Turn on Zap"**
3. Your Zap is now active!

---

## Testing Your Zaps

### Manual Test

You can manually test each Zap by:

1. Going to your Zap in Zapier
2. Clicking **"Run"** or **"Test"** button
3. Checking the webhook response:
   - Look for `success: true`
   - Check `expiring_trials_found` to see how many members were found
   - Check `emails_sent` to see how many emails were sent

### Test with Specific Email

You can also test with a specific email address by adding `&testEmail=your-email@example.com` to the webhook URL:

```
https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=7&testEmail=info@alanranger.com
```

This will send a test email to that address regardless of their trial expiry date.

---

## Monitoring Your Zaps

### Check Zap History

1. Go to your Zapier dashboard
2. Click on any Zap
3. View the **"History"** tab to see when it ran and the results

### Check Email Delivery

- All emails are sent with `info@alanranger.com` in the BCC field
- Check your inbox to verify emails are being sent
- Check Vercel logs if emails aren't being sent (see troubleshooting below)

---

## Troubleshooting

### Zap Not Running

- **Check Zap Status:** Make sure the Zap is turned ON (toggle in top right)
- **Check Schedule:** Verify the schedule is set correctly
- **Check Zapier Limits:** Free tier has task limits - check if you've hit them

### No Emails Being Sent

- **Check Webhook Response:** Look at the Zap history to see the webhook response
- **Check `expiring_trials_found`:** If this is 0, no members match the criteria
- **Check `emails_sent`:** If this is 0 but `expiring_trials_found` > 0, there may be an email configuration issue
- **Check Vercel Logs:** Look for errors in the function logs

### Wrong Members Receiving Emails

- **Check `daysAhead` Parameter:** Verify the URL has the correct `daysAhead` value
- **Check Trial Expiry Dates:** The endpoint uses Supabase cache - verify member data is up to date
- **Run Refresh:** You may need to run the `/api/admin/refresh` endpoint to update member cache

### Webhook Errors

- **Check URL:** Verify the URL is correct and includes the `daysAhead` parameter
- **Check Method:** Must be `GET` (not POST)
- **Check Vercel Status:** Verify your Vercel deployment is live

---

## Quick Reference: All Webhook URLs

| Reminder | daysAhead | URL |
|----------|-----------|-----|
| 15-Day Soft | 15 | `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=15` |
| 7-Day Harder | 7 | `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=7` |
| 1-Day Final | 1 | `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=1` |
| Expired (1 day after) | -1 | `https://alanranger-modules.vercel.app/api/admin/trial-expiry-reminder-webhook?daysAhead=-1` |

---

## Best Practices

1. **Schedule Time:** Set all Zaps to run at the same time (e.g., 9:00 AM UK time) for consistency
2. **Monitor Daily:** Check Zap history daily for the first week to ensure everything is working
3. **Test First:** Use the `testEmail` parameter to test with your own email before going live
4. **Keep Zaps On:** Don't pause Zaps unless you're troubleshooting - they only run when members match criteria
5. **Update Cache:** If member data seems stale, run `/api/admin/refresh` to update the Supabase cache

---

## Support

If you encounter issues:

1. Check the Zap history for error messages
2. Check Vercel function logs for backend errors
3. Test the webhook URL directly in a browser to see the response
4. Verify environment variables are set correctly in Vercel

---

## Next Steps

Once all 4 Zaps are set up and tested:

1. ✅ Verify all Zaps are turned ON
2. ✅ Test each Zap manually
3. ✅ Check that test emails are received
4. ✅ Monitor for the first few days
5. ✅ Check `info@alanranger.com` inbox for BCC copies of all sent emails

Your trial expiry reminder system is now fully automated! 🎉
