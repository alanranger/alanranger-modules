# Updating squarespace-v2.2.html for Memberstack

## Quick Update Guide

Since `squarespace-v2.2.html` is a large file (~2600 lines), here are the key sections to update:

## Option 1: Replace Engine Reference (Recommended)

If `squarespace-v2.2.html` loads `engine.js` externally:

**Find:**
```html
<script src="src/engine.js"></script>
```

**Replace with:**
```html
<script src="src/engine-memberstack.js"></script>
```

## Option 2: Inline Code Updates

If the engine code is inline in `squarespace-v2.2.html`, update these sections:

### 1. Remove/Update Supabase Auth Initialization

**Find (around line 754-757):**
```javascript
const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_ANON_KEY = "...";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

**Keep for migration flow only** - Add comment:
```javascript
// Supabase client (legacy migration only)
const SUPABASE_URL = "https://dqrtcsvqsfgbqmnonkpt.supabase.co";
const SUPABASE_ANON_KEY = "...";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### 2. Replace getCurrentMember() with getExamIdentity()

**Find (around line 1153):**
```javascript
async function currentUser(){ 
  const { data:{user} } = await supabase.auth.getUser(); 
  return user; 
}
```

**Replace with:**
```javascript
// Memberstack identity check
async function getExamIdentity() {
  try {
    const r = await fetch("/api/exams/whoami", { credentials: "include" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

// Legacy Supabase user (migration only)
async function currentUserLegacy(){ 
  const { data:{user} } = await supabase.auth.getUser(); 
  return user; 
}
```

### 3. Update saveResultToDB() Function

**Find (around line 1215):**
```javascript
async function saveResultToDB(report){
  const user = await currentUser();
  // ... existing code using supabase.from('module_results')
}
```

**Replace with:**
```javascript
async function saveResultToDB(report){
  // Try Memberstack first
  const memberstackId = await getExamIdentity();
  if (memberstackId) {
    try {
      const payload = {
        module_id: report.moduleId,
        score_percent: report.percent,
        passed: report.pass,
        attempt: report.attempt || 1,
        details: report.details || null
      };
      
      const r = await fetch("/api/exams/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      
      if (r.ok) {
        showToast("Progress saved to your account.", "success");
        renderProgressBadge();
        return;
      }
    } catch (e) {
      console.error("[saveResultToDB] Memberstack save failed:", e);
    }
  }
  
  // Fallback to legacy (migration flow only)
  const user = await currentUserLegacy();
  if (!user) {
    // Queue for migration
    const email = document.getElementById('email').value.trim();
    if (!email) { 
      alert("Enter your email to save progress."); 
      return; 
    }
    localStorage.setItem('ar_pending_result', JSON.stringify(report));
    localStorage.setItem('ar_pending_email', email);
    await sendMagicLink(email);
    return;
  }
  
  // Legacy save to module_results
  const { count } = await supabase.from('module_results')
    .select('*', { count:'exact', head:true })
    .eq('user_id', user.id).eq('module_id', report.moduleId);

  const payload = {
    user_id: user.id,
    email: user.email || (document.getElementById('email').value.trim() || ''),
    module_id: report.moduleId,
    score_percent: report.percent,
    passed: report.pass,
    attempt: (count || 0) + 1,
    details: { misses: report.misses }
  };
  const { error } = await supabase.from('module_results').insert(payload);
  if (error){ 
    showToast("Save failed.", "error"); 
    console.error(error); 
  } else { 
    showToast("Progress saved to your account.", "success"); 
    renderProgressBadge(); 
  }
}
```

### 4. Update getLatestStatus() Function

**Find (around line 1206):**
```javascript
async function getLatestStatus(moduleId){
  const user = await currentUser(); if (!user) return null;
  const { data, error } = await supabase.from('module_results')
    .select('score_percent, passed, created_at').eq('user_id', user.id).eq('module_id', moduleId)
    .order('created_at', { ascending:false }).limit(1);
  if (error || !data?.length) return null;
  return data[0];
}
```

**Replace with:**
```javascript
async function getLatestStatus(moduleId){
  // Try Memberstack first
  const memberstackId = await getExamIdentity();
  if (memberstackId) {
    try {
      const r = await fetch(`/api/exams/status?moduleId=${encodeURIComponent(moduleId)}`, {
        credentials: "include"
      });
      if (r.ok) {
        const j = await r.json();
        return j.latest || null;
      }
    } catch (e) {
      console.error("[getLatestStatus] Memberstack fetch failed:", e);
    }
  }
  
  // Fallback to legacy
  const user = await currentUserLegacy(); 
  if (!user) return null;
  const { data, error } = await supabase.from('module_results')
    .select('score_percent, passed, created_at').eq('user_id', user.id).eq('module_id', moduleId)
    .order('created_at', { ascending:false }).limit(1);
  if (error || !data?.length) return null;
  return data[0];
}
```

### 5. Update Auth State Change Handler

**Find (around line 1306):**
```javascript
supabase.auth.onAuthStateChange(async (_event, session) => {
  // ... existing code
});
```

**Update to:**
```javascript
// Check Memberstack identity on load
(async () => {
  const memberstackId = await getExamIdentity();
  if (memberstackId) {
    setAuthUI({ email: memberstackId.email, id: memberstackId.memberstack_id });
    renderProgressBadge();
  }
})();

// Legacy Supabase auth (migration flow only)
supabase.auth.onAuthStateChange(async (_event, session) => {
  // Only process if in migration mode
  if (!isMigrating) return;
  
  // ... existing migration logic
});
```

### 6. Add Migration UI

Add this HTML where the sign-in form currently appears (only show if Memberstack user but no legacy link):

```html
<div id="migration-ui" style="display:none;" class="card" style="border-left:4px solid #f59e0b;">
  <h3>Import Previous Exam Progress</h3>
  <p>If you have previous exam results, you can import them here.</p>
  <button onclick="startMigration()" class="btn">Import previous exam progress</button>
</div>
```

Add migration functions:
```javascript
let isMigrating = false;

async function startMigration() {
  isMigrating = true;
  // Show legacy sign-in form
  document.getElementById('migration-ui').style.display = 'block';
}

async function migrateLegacyResults() {
  const user = await currentUserLegacy();
  if (!user) {
    showToast('Please complete the legacy sign-in first', 'warn');
    return;
  }
  
  try {
    const r = await fetch("/api/exams/migrate-legacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        supabase_user_id: user.id,
        legacy_email: user.email
      })
    });
    
    if (r.ok) {
      const result = await r.json();
      showToast(result.message || `Migrated ${result.copied} results`, 'success');
      await supabase.auth.signOut();
      isMigrating = false;
      renderProgressBadge();
    }
  } catch (e) {
    showToast('Migration failed', 'error');
  }
}
```

## Testing After Update

1. Logged into Academy → exam page should show Memberstack email
2. Complete exam → should save via `/api/exams/save`
3. Refresh → status should load from `/api/exams/status`
4. Migration flow → should work for legacy users

## Notes

- Keep all existing Supabase code for migration flow
- Memberstack is primary, Supabase is fallback/migration only
- Both systems can coexist during transition
