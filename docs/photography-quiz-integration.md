# Photography Style Quiz Integration Guide

This guide explains how to integrate the Photography Style Quiz with the Academy dashboard and Supabase.

## Overview

The Photography Style Quiz allows users to discover their photography style. Results are saved to Supabase and displayed on the Membership Status tile in the user dashboard.

## Components Created

1. **Quiz HTML** (`public/photography-style-quiz.html`)
   - Interactive quiz with 6 questions
   - Saves results to Supabase automatically
   - Removed email button (not working)

2. **API Endpoint** (`api/academy/save-quiz-result.js`)
   - Saves quiz results to `ms_members_cache` table
   - Stores: style title, percentage, description, other interests, completion timestamp

3. **Member Data API** (`api/academy/member-data.js`)
   - Fetches member data including photography style

4. **Component Example** (`components/MembershipStatusTile.js`)
   - Reference component showing how to display quiz results
   - Includes button to take quiz
   - Displays result if completed

5. **Database Migration** (`supabase-photography-quiz-migration.sql`)
   - Adds photography style fields to `ms_members_cache` table

## Setup Steps

### 1. Run Database Migration

Run the SQL migration in Supabase SQL Editor:

```sql
-- See: supabase-photography-quiz-migration.sql
```

This adds the following columns to `ms_members_cache`:
- `photography_style` (TEXT) - Primary style (e.g., "Landscape Photographer")
- `photography_style_percentage` (INTEGER) - Percentage match (0-100)
- `photography_style_description` (TEXT) - Style description
- `photography_style_other_interests` (TEXT) - Other interests with percentages
- `photography_style_quiz_completed_at` (TIMESTAMPTZ) - Completion timestamp

### 2. Deploy API Endpoints

The API endpoints are already created:
- `/api/academy/save-quiz-result` - POST endpoint to save results
- `/api/academy/member-data` - GET endpoint to fetch member data

Ensure these are deployed to Vercel.

### 3. Update Quiz Page

The quiz HTML is already updated to:
- Save results to Supabase when completed
- Get `memberId` from URL parameter or Memberstack
- Show success message when saved
- Removed email button

**Quiz URL Format:**
```
https://www.alanranger.com/which-photography-style-is-right-for-you?memberId={memberId}
```

### 4. Integrate into Dashboard

Use the `MembershipStatusTile` component as a reference. The component:

1. **Shows Quiz Button** if user hasn't completed quiz:
   ```jsx
   <a href={`https://www.alanranger.com/which-photography-style-is-right-for-you?memberId=${memberId}`}>
     Take Photography Personality Quiz
   </a>
   ```

2. **Displays Result** if quiz is completed:
   ```jsx
   <div>
     <h3>Your Photography Style Is:</h3>
     <p>{photographyStyle}</p>
   </div>
   ```

3. **Fetches Data** from `/api/academy/member-data?memberId={memberId}`

## Data Structure

### Quiz Result Saved to Supabase

```json
{
  "photography_style": "Landscape Photographer",
  "photography_style_percentage": 50,
  "photography_style_description": "You're inspired by nature...",
  "photography_style_other_interests": "Portrait Photographer: 17%, Street Photographer: 17%...",
  "photography_style_quiz_completed_at": "2026-01-20T18:00:00.000Z"
}
```

### Available Photography Styles

- Portrait Photographer
- Landscape Photographer
- Macro Photographer
- Street Photographer
- Wildlife Photographer
- Still Life Photographer

## Testing

1. **Test Quiz Save:**
   - Access quiz with `?memberId=mem_xxx` parameter
   - Complete quiz
   - Check Supabase for saved result
   - Verify success message appears

2. **Test Dashboard Display:**
   - Load dashboard with member who completed quiz
   - Verify photography style is displayed
   - Verify button shows for members who haven't completed

3. **Test Memberstack Integration:**
   - Access quiz without `memberId` parameter
   - Quiz should try to get member from Memberstack
   - If successful, save result
   - If not, show message about logging in

## Troubleshooting

### Quiz Result Not Saving

- Check browser console for errors
- Verify `memberId` is in URL or available from Memberstack
- Check API endpoint logs in Vercel
- Verify Supabase migration was run

### Result Not Displaying on Dashboard

- Verify member data includes `photography_style` field
- Check API endpoint `/api/academy/member-data` returns correct data
- Verify component is fetching and displaying the field

### Memberstack Integration Issues

- Ensure `window.$memberstackDom` is loaded
- Check Memberstack SDK is initialized
- Verify member is logged in

## Next Steps

1. ✅ Run database migration
2. ✅ Deploy API endpoints
3. ⏸️ Integrate `MembershipStatusTile` component into user dashboard
4. ⏸️ Test end-to-end flow
5. ⏸️ Update quiz page on Squarespace with new code

## Files Modified/Created

- ✅ `public/photography-style-quiz.html` - Updated to save results
- ✅ `api/academy/save-quiz-result.js` - New endpoint
- ✅ `api/academy/member-data.js` - New endpoint
- ✅ `components/MembershipStatusTile.js` - Reference component
- ✅ `supabase-photography-quiz-migration.sql` - Database migration
- ✅ `docs/photography-quiz-integration.md` - This guide
