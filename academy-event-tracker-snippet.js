/**
 * Academy Event Tracking Snippet
 * Add this to your Squarespace Academy tracking scripts
 * 
 * This helper function sends events to the admin analytics dashboard
 */

// Configuration - Update these values
const ACADEMY_EVENT_API_URL = 'https://your-domain.vercel.app/api/academy/event';
// Note: AR_ANALYTICS_KEY should be set server-side or use a public key
// For client-side, you may want to proxy through your own endpoint

/**
 * Track an Academy event
 * @param {Object} eventData - Event data object
 * @param {string} eventData.event_type - Type of event (module_open, bookmark_add, etc.)
 * @param {string} eventData.member_id - Memberstack member ID
 * @param {string} [eventData.email] - User email
 * @param {string} [eventData.path] - Module/page path
 * @param {string} [eventData.title] - Page/module title
 * @param {string} [eventData.category] - Module category (camera, gear, etc.)
 * @param {string} [eventData.session_id] - Session ID for deduplication
 * @param {Object} [eventData.meta] - Additional metadata
 */
async function trackAcademyEvent(eventData) {
  // Don't track in editor/preview mode
  if (window.location.pathname.includes('/config') || 
      window.location.pathname.includes('/backend') ||
      window.location.search.includes('nochrome') ||
      window.location.search.includes('frame')) {
    return;
  }

  // Validate required fields
  if (!eventData || !eventData.event_type) {
    console.warn('[Academy Event] Missing event_type');
    return;
  }

  try {
    const response = await fetch(ACADEMY_EVENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ar-analytics-key': 'YOUR_ANALYTICS_KEY' // Set this or use server-side proxy
      },
      body: JSON.stringify(eventData),
      // Don't wait for response - fire and forget
      keepalive: true
    });

    if (!response.ok) {
      console.warn('[Academy Event] Failed to track:', await response.text());
    }
  } catch (error) {
    // Fail silently - don't break user experience
    console.debug('[Academy Event] Tracking error (silent):', error.message);
  }
}

/**
 * Helper: Track module open event
 * Use this when a module page is opened
 */
function trackModuleOpen(path, title, category, memberId, email, isFirstOpen) {
  trackAcademyEvent({
    event_type: 'module_open',
    member_id: memberId,
    email: email,
    path: path,
    title: title,
    category: category,
    meta: {
      source: 'academy-module-tracker',
      first_open: isFirstOpen || false
    }
  });
}

/**
 * Helper: Track bookmark add event
 */
function trackBookmarkAdd(path, title, category, memberId, email) {
  trackAcademyEvent({
    event_type: 'bookmark_add',
    member_id: memberId,
    email: email,
    path: path,
    title: title,
    category: category
  });
}

/**
 * Helper: Track bookmark remove event
 */
function trackBookmarkRemove(path, memberId) {
  trackAcademyEvent({
    event_type: 'bookmark_remove',
    member_id: memberId,
    path: path
  });
}

/**
 * Helper: Track exam start event
 */
function trackExamStart(moduleId, modulePath, moduleTitle, category, memberId, email, attempt) {
  trackAcademyEvent({
    event_type: 'exam_start',
    member_id: memberId,
    email: email,
    path: modulePath,
    title: moduleTitle,
    category: category,
    meta: {
      module_id: moduleId,
      attempt: attempt
    }
  });
}

/**
 * Helper: Track exam submit event
 */
function trackExamSubmit(moduleId, modulePath, moduleTitle, category, memberId, email, score, passed, attempt) {
  trackAcademyEvent({
    event_type: 'exam_submit',
    member_id: memberId,
    email: email,
    path: modulePath,
    title: moduleTitle,
    category: category,
    meta: {
      module_id: moduleId,
      score_percent: score,
      passed: passed,
      attempt: attempt
    }
  });
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.trackAcademyEvent = trackAcademyEvent;
  window.trackModuleOpen = trackModuleOpen;
  window.trackBookmarkAdd = trackBookmarkAdd;
  window.trackBookmarkRemove = trackBookmarkRemove;
  window.trackExamStart = trackExamStart;
  window.trackExamSubmit = trackExamSubmit;
}
