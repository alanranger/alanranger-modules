# Q&A Testing Instructions

## Test Page Setup

1. **Open test page**: `test-qa-page.html` in your browser
2. **Update Memberstack App ID**: Replace `YOUR_MEMBERSTACK_APP_ID` in the script tag with your actual Memberstack App ID
3. **Deploy API**: Ensure the latest API code is deployed to Vercel

## Test Accounts

- **Trial Member**: info@alanranger.com / password: Ipswich1968
- **Annual Member**: marketing@alanranger.com / password: ipswich1968

## Test Scenarios

### Test 1: Guest Access (Not Logged In)
1. Open test page without logging in
2. **Expected**:
   - Post button is disabled
   - Textarea shows "Please sign in to ask a question"
   - List shows "Please sign in to view your questions"
   - No questions are visible

### Test 2: Member A Posts Question
1. Log in as **info@alanranger.com**
2. Post a question: "What is ISO and how does it affect my photos?"
3. **Expected**:
   - Question appears in "My Questions" list
   - Status shows "AI Suggested"
   - Question is visible immediately after posting

### Test 3: Member Isolation
1. While logged in as **info@alanranger.com**, note the question you posted
2. Log out
3. Log in as **marketing@alanranger.com**
4. **Expected**:
   - **info@alanranger.com** question is NOT visible
   - Only **marketing@alanranger.com** questions (if any) are visible
   - Can post a new question from marketing account

### Test 4: Member B Posts Question
1. While logged in as **marketing@alanranger.com**
2. Post a question: "How do I use aperture priority mode?"
3. **Expected**:
   - Question appears in "My Questions" list
   - Only marketing account questions are visible
   - info@alanranger.com question remains hidden

### Test 5: Switch Back to Member A
1. Log out from marketing account
2. Log in as **info@alanranger.com** again
3. **Expected**:
   - Original question from info account is visible
   - marketing@alanranger.com question is NOT visible
   - Member isolation is maintained

### Test 6: API Authentication (Manual)
1. Open browser DevTools → Network tab
2. Try to access API directly: `https://alanranger-modules.vercel.app/api/academy-qa-questions?limit=25`
3. **Expected**: Returns 401 Unauthorized (if not logged in)

## Automated Test Script

Run the automated test script:
```bash
npm run test:qa-functionality
```

**Note**: The automated tests verify unauthenticated access returns 401, but full member isolation testing requires manual browser testing with actual Memberstack sessions.

## Checklist

- [ ] Guest cannot see questions
- [ ] Guest cannot post questions
- [ ] Member A sees only their questions
- [ ] Member B sees only their questions
- [ ] Member A cannot see Member B's questions
- [ ] Member B cannot see Member A's questions
- [ ] Status pills display correctly (AI Suggested, Closed, Queued)
- [ ] No email addresses are displayed anywhere
- [ ] Questions are sorted newest first

## Issues to Report

If any test fails, note:
- Which test failed
- Browser console errors
- Network tab responses
- Expected vs actual behavior
