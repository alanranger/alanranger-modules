# Q&A API Test Suite

## Overview

This test suite validates the Q&A API endpoint end-to-end:
1. Creates a test question via POST
2. Retrieves questions via GET
3. Verifies data in Supabase
4. Tests CORS preflight (OPTIONS)

## Prerequisites

1. **Environment Variables** (in `.env.local`):
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. **API Deployment**:
   - The API route must be deployed to Vercel
   - Or run locally: `npm run dev` (then test against `http://localhost:3000`)

## Running Tests

### Test against Vercel (recommended):
```bash
API_BASE_URL=https://alanranger-modules.vercel.app npm run test:qa
```

### Test against local dev server:
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run tests
npm run test:qa
```

Or set the environment variable:
```bash
# Windows PowerShell
$env:API_BASE_URL="http://localhost:3000"; npm run test:qa

# Linux/Mac
API_BASE_URL=http://localhost:3000 npm run test:qa
```

## Test Output

The test will:
- ✅ Show green checkmarks for passed tests
- ❌ Show red X's for failed tests
- ⚠️ Show warnings for skipped tests
- Automatically clean up test data after completion

## Expected Results

When the API is properly deployed and working:

```
✓ OPTIONS returned 204 status
✓ CORS header present
✓ CORS origin matches request origin
✓ POST request succeeded (status 200)
✓ Response contains data object
✓ Question text matches
✓ GET request succeeded (status 200)
✓ At least one question returned
✓ Test question found in results
✓ Supabase query succeeded
```

## UI Testing

To test the UI snippet:

1. Open `test-qa-ui.html` in a browser
2. The page will automatically:
   - Load existing questions from the API
   - Allow posting new questions (without Memberstack login for testing)
   - Display questions in the UI

Or paste the snippet from `academy-questions-answers-squarespace-snippet-v1.html` into a Squarespace Code Block.

## Troubleshooting

### "fetch failed" or "ECONNREFUSED"
- Make sure the API is deployed to Vercel, OR
- Start the local dev server with `npm run dev`

### "405 Method Not Allowed"
- The route might not be deployed yet
- Wait for Vercel deployment to complete
- Check Vercel dashboard for deployment status

### "Response structure" shows wrong endpoint
- The route might not be deployed
- Check that `pages/api/academy/qa/questions.js` exists
- Verify the file was committed and pushed to GitHub

### CORS errors
- Verify `ALLOWED_ORIGINS` in the API route includes your test origin
- Check that OPTIONS requests return 204
