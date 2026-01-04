# Event Tracking Integration Guide

## Overview

The Academy Admin Analytics Dashboard tracks events via the `/api/academy/event` endpoint. This guide shows how to integrate event tracking into your Squarespace scripts.

## Quick Start

Add this helper function to your Squarespace tracking script:

```javascript
// Academy Event Tracking Helper
async function trackAcademyEvent(eventData) {
  const API_URL = 'https://your-domain.vercel.app/api/academy/event';
  const ANALYTICS_KEY = 'your_ar_analytics_key'; // Set in Vercel env vars
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ar-analytics-key': ANALYTICS_KEY
      },
      body: JSON.stringify(eventData)
    });
    
    if (!response.ok) {
      console.warn('[Academy Event] Failed to track:', await response.text());
    }
  } catch (error) {
    console.error('[Academy Event] Error:', error);
    // Fail silently - don't break user experience
  }
}
```

## Event Types

Allowed event types:
- `module_open` - When a user opens a module page
- `bookmark_add` - When a user bookmarks a module
- `bookmark_remove` - When a user removes a bookmark
- `exam_start` - When a user starts an exam
- `exam_submit` - When a user submits an exam
- `login` - When a user logs in
- `page_view` - General page view (optional)

## Integration Examples

### 1. Track Module Opens

Add to your module page tracking script (where you currently update `arAcademy.modules.opened`):

```javascript
// After successfully tracking module open in Memberstack
if (opened[path]) {
  // Update lastAt (existing logic)
  opened[path].lastAt = new Date().toISOString();
  
  // Track event for analytics
  trackAcademyEvent({
    event_type: 'module_open',
    member_id: memberId,
    email: memberEmail,
    path: path,
    title: document.title || 'Module',
    category: MODULE_CATEGORY_MAP[path] || null,
    meta: {
      source: 'academy-module-tracker',
      first_open: !opened[path].at
    }
  });
}
```

### 2. Track Bookmark Events

Add to your bookmark functionality:

```javascript
function addBookmark(modulePath, moduleTitle) {
  // Your existing bookmark logic...
  
  // Track event
  trackAcademyEvent({
    event_type: 'bookmark_add',
    member_id: memberId,
    email: memberEmail,
    path: modulePath,
    title: moduleTitle,
    category: MODULE_CATEGORY_MAP[modulePath] || null
  });
}

function removeBookmark(modulePath) {
  // Your existing bookmark logic...
  
  // Track event
  trackAcademyEvent({
    event_type: 'bookmark_remove',
    member_id: memberId,
    path: modulePath
  });
}
```

### 3. Track Exam Events

Add to your exam submission script:

```javascript
// When exam starts
trackAcademyEvent({
  event_type: 'exam_start',
  member_id: memberId,
  email: memberEmail,
  path: currentModulePath,
  title: currentModuleTitle,
  category: currentCategory,
  meta: {
    module_id: moduleId,
    attempt: attemptNumber
  }
});

// When exam is submitted (in your save.js success callback)
trackAcademyEvent({
  event_type: 'exam_submit',
  member_id: memberId,
  email: memberEmail,
  path: modulePath,
  title: moduleTitle,
  category: category,
  meta: {
    module_id: moduleId,
    score_percent: scorePercent,
    passed: passed,
    attempt: attemptNumber
  }
});
```

## Important Notes

1. **Fail Silently**: Event tracking should never break the user experience. Always wrap in try/catch and fail silently.

2. **Rate Limiting**: The endpoint has rate limiting (100 requests/minute per IP). For high-traffic scenarios, consider batching events.

3. **Member ID**: Always include `member_id` when available. Use `null` for anonymous events.

4. **Path Normalization**: Use the same `normalizePath()` function you use for module tracking to ensure consistency.

5. **Meta Field**: Use the `meta` field for additional context (scores, attempt numbers, etc.). Keep it as an object.

## Testing

Test event tracking in browser console:

```javascript
// Test module open event
trackAcademyEvent({
  event_type: 'module_open',
  member_id: 'ms_test_123',
  email: 'test@example.com',
  path: '/blog-on-photography/what-is-exposure-in-photography',
  title: 'What is Exposure in Photography',
  category: 'camera'
});
```

Then check the admin dashboard at `/academy/admin/activity` to see the event.

## Deployment Checklist

- [x] Database migration applied
- [x] Environment variables set in Vercel
- [ ] Event tracking integrated into Squarespace scripts
- [ ] Test events sent and verified in admin dashboard
- [ ] Monitor for errors in Vercel logs
