# Bookmark Buttons Integration Guide

## Overview

The Bookmark Buttons snippet adds three action buttons to Academy blog/article pages:
1. **Bookmark this page** - Saves the current page to the user's Academy Dashboard bookmarks
2. **Back to Modules** - Links to the main modules page
3. **Back to Dashboard** - Links to the Academy Dashboard

## File Location

**Snippet File**: `academy-bookmark-buttons-squarespace-snippet-v1.html`

## Deployment

### Where to Add

This snippet is added to blog posts that have the **"Sign up to free online photography course" snippet** (Myers snippet injection). It appears automatically on those pages.

### Squarespace Setup

1. Go to Squarespace → **Settings** → **Advanced** → **Code Injection**
2. Or add to individual blog post pages via **Code Block**
3. Copy the entire contents of `academy-bookmark-buttons-squarespace-snippet-v1.html`
4. Paste into the code block or code injection area

## How It Works

### Widget Positioning

The widget automatically positions itself:
- **Preferred**: After the first `<h1>` tag on the page
- **Fallback**: At the top of `<main>`, `<#page>`, or `<body>` if no H1 is found

### Visibility Protection

The snippet includes CSS that forces visibility even when Squarespace applies fade-in animations or opacity rules:
- Uses `!important` flags to override Squarespace styles
- Prevents the widget from "flashing then vanishing" during page load

### Bookmark Functionality

1. **Click Detection**: When "Bookmark this page" is clicked
2. **Memberstack Integration**: Waits for Memberstack DOM to load (up to 8 seconds)
3. **Data Retrieval**: Gets current member's JSON data from Memberstack
4. **Bookmark Storage**: 
   - Adds current page (title + URL) to bookmarks array
   - Enforces 20 bookmark maximum (keeps most recent 20)
   - Saves back to Memberstack
5. **Visual Feedback**: Button changes to green with "Bookmarked!" text

### Technical Details

- **MutationObserver**: Watches for DOM changes to ensure widget stays positioned correctly
- **Prevents Duplicate Runs**: Uses `window.__arBookmarkWidgetInit` flag
- **Handles Nested JSON**: Safely handles different Memberstack JSON structures
- **Auto-cleanup**: MutationObserver disconnects after 15 seconds to prevent performance issues

## Button URLs

- **Back to Modules**: `https://www.alanranger.com/academy/online-photography-course`
- **Back to Dashboard**: `https://www.alanranger.com/academy/dashboard`

## Styling

- **Button Color**: Orange (#E57200) - matches Academy brand
- **Hover Effect**: Slight brightness reduction (95%)
- **Active State**: Slight translateY for tactile feedback
- **Bookmark Success**: Changes to green (#28a745) when bookmarked

## Integration with Dashboard

Bookmarks saved via this snippet appear in the **"Bookmarks & Recent Activity"** tile on the Academy Dashboard (`academy-dashboard-squarespace-snippet-v1.html`).

The dashboard displays:
- Up to 20 bookmarks
- Bookmark title and URL
- "View all" link to see complete list

## Troubleshooting

### Widget Not Appearing

1. Check that the snippet is properly added to the page
2. Verify Memberstack is loaded (check browser console)
3. Check for JavaScript errors in console
4. Ensure the page has an H1 or main element for positioning

### Bookmark Not Saving

1. Verify user is logged into Memberstack
2. Check browser console for errors
3. Verify Memberstack DOM is available (`window.$memberstackDom`)
4. Check that member JSON structure is accessible

### Widget Disappears After Load

- The CSS includes `!important` flags to prevent Squarespace from hiding it
- If it still disappears, check for conflicting CSS rules
- Verify the `#ar-bookmark-widget` styles are being applied

## Version History

- **v1.0** (2026-01-14): Initial implementation
  - Bookmark functionality
  - Back to Modules button
  - Back to Dashboard button
  - Auto-positioning after H1
  - Squarespace visibility protection

## Related Files

- `academy-dashboard-squarespace-snippet-v1.html` - Displays saved bookmarks
- `academy-event-tracker-snippet.js` - Event tracking for bookmark analytics
- `EVENT_TRACKING_INTEGRATION.md` - Event tracking integration guide

## Notes

- Maximum 20 bookmarks per account (enforced automatically)
- Bookmarks are stored in Memberstack member JSON under `bookmarks` array
- Each bookmark contains: `{ title: string, url: string }`
- The widget is "snippet-loader safe" - works even if injected multiple times
