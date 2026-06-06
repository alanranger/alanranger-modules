# Cursor Agent Handover — Academy Dashboard (Alan Ranger Photography)

**Last updated:** 2026-06-06  
**Repo:** `G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment`  
**GitHub remote:** `https://github.com/alanranger/alanranger-modules.git` (branch `main`)  
**Latest commit at handover:** `afc7ef9` — `Docs: comprehensive Cursor agent handover for Academy dashboard continuity`  
**Prior feature commit:** `7eb5a6a` — `fix: D 1.3.11 beacon helpers in module-progress IIFE scope`  
**Alan confirmation:** **B3 login bounce FIXED** after D 1.3.10 paste (fast return × 5+ passes).

Read this file **first**. Then read the Google Drive docs listed in §2.

**Google Drive mirror:** `C:/Users/alan/Google Drive/Claude shared resources/CURSOR-AGENT-HANDOVER-LATEST.md` (summary) — keep in sync with this file on major updates.

---

## 1. What this project is

Squarespace-hosted **Academy member dashboard** + **blog lesson widgets** + **Vercel API** (`alanranger-modules.vercel.app`) for exams, tracking, and admin analytics.

- **Memberstack** = auth + `getCurrentMember` / `getMemberJSON` / `updateMemberJSON`
- **Supabase** = exam results, events, engagement (`academy_events`, etc.)
- **Squarespace** = HTML snippets pasted into Code Injection + page Code Blocks (git commit alone does **not** go live)

---

## 2. Google Drive — Claude ↔ Cursor async workflow

**Root folder (Google Drive Desktop sync):**  
`C:/Users/alan/Google Drive/Claude shared resources/`

### Key files (read in order when onboarding)

| File | Purpose |
|------|---------|
| `_CLAUDE-CURSOR-WORKFLOW-2026-06-05.md` | **The loop** — how QUESTION/RESPONSE works, hard-won lessons |
| `_ACADEMY-DASHBOARD-DEFINITIVE-TEST-PLAN.md` | 3-stage test protocol (Cursor → Claude live → Alan) |
| `Claude Questions for Cursor/` | **INBOX** — Claude posts `QUESTION-YYYY-MM-DD-slug.md` (Drive folder id `1ErwYYRWT2VmWcfJZmBMZjuDKe2jpi-Ay`) |
| `Cursor Outputs for Claude/` | **OUTBOX** — Cursor posts `RESPONSE-<id>-LATEST.md` (Drive folder id `11K49OcIfO-iQoREWnAglOEMq7XgPdCuE`) |
| `RESPONSE-2026-06-06-claude-AvsB-RESOLVED-it-is-memberstack-network-redirect.md` | Decisive B-path diagnosis |
| STATUS file (Drive id `1H8YSsQAMDNDMly5-0uBeEWb3V515xvKW`) | **Lags** — trust actual RESPONSE files + live page, not STATUS alone |
| `docs/handoff/` (in repo) | Mirror of major RESPONSE files + this handover |

**Finding RESPONSE files:** Drive search title contains `RESPONSE-<question-id>`. Real answers have `answered_by: cursor`, commit hash, `status: complete`. Brief echo of question text can appear before sync — re-read if unsure.

### The magic phrases (Alan uses these)

| Alan says | Who acts | What happens |
|-----------|----------|--------------|
| **`check claude`** (in **Cursor**) | Cursor agent | Poll/read **INBOX** (`Claude Questions for Cursor/`), do the work, commit+push, write **RESPONSE** to OUTBOX |
| **`check claude`** (to **Claude** in claude.ai) | Claude | Read **OUTBOX** (`Cursor Outputs for Claude/`), verify live in browser, update test plan |
| **`export to google`** / **`export for claude`** | Cursor (AI GEO Audit repo only) | `npm run export:claude` — **not** in Academy repo; Academy uses manual RESPONSE `.md` files |

**Cursor polling:** Cursor may poll INBOX ~every 15 min, but Alan's explicit **"check claude"** in Cursor is the reliable trigger.

**Diagnosis-only questions:** Claude titles like `Request for analysis and Diagnosis by D0 AI: ...` with body lines `DIAGNOSIS ONLY. No file changes.` and `DO NOT return any edit file: blocks.` — analyse only, no repo edits.

**Superseded questions:** New QUESTION files may include `supersedes: <old-id>` — never assume an old pending question was picked up; trust RESPONSE files.

**CRITICAL:** A git push is **not** live for Squarespace snippets. Alan must **re-paste** HTML into Squarespace after every snippet change. Claude must **not** report "live" until browser-verified.

### RESPONSE file format (Cursor writes these)

- Path: `C:/Users/alan/Google Drive/Claude shared resources/Cursor Outputs for Claude/RESPONSE-YYYY-MM-DD-slug-LATEST.md`
- Must include: version numbers, commit hash, **paste table** (filename → Squarespace location), test results
- Also copy/summarise into `docs/handoff/` in the repo when significant

### QUESTION file format (Claude writes these)

- Path: `Claude Questions for Cursor/QUESTION-YYYY-MM-DD-slug.md`
- Frontmatter: `status: pending`, `priority`, `repos: [Academy]`
- Diagnosis-only questions include: `DIAGNOSIS ONLY. No file changes.`

---

## 3. Squarespace paste map (use FILENAMES — not "block 1/2" alone)

| Alan's name | File | Squarespace location |
|-------------|------|----------------------|
| **Header H** | `academy-header-elements-squarespace-snippet-v1.html` | Settings → Code Injection → **Header** |
| **Strip S** | `academy-do-next-strip-squarespace-snippet-v1.html` | `/academy/dashboard` page → Code block **1** |
| **Dashboard D** | `academy-dashboard-squarespace-snippet-v1.html` | `/academy/dashboard` page → Code block **2** |
| **Bookmark B** | `academy-bookmark-buttons-squarespace-snippet-v1.html` | Blog/article template (module lessons) |
| Exams page | `squarespace-v2.2.html` | Exams & Certification page block |
| Login | `academy-login-squarespace-snippet-v1.html` | Login page |

**Live version stamp** (under logo on dashboard): check `#ar-academy-header-snippet-version` — must match pasted versions.

### Current repo versions (2026-06-06 — verify stamp matches after paste)

| Block | Version | Notes |
|-------|---------|-------|
| Header H | **1.4.4** | Inits `globalThis.__arMsReader` on Academy pages |
| Strip S | **1.3.35** | Tile-open beacon after `window.open` |
| Dashboard D | **1.3.11** | Session cache + MS reader + cube beacons |
| Bookmark B | **1.3.5** | Lesson module-open beacon + MS reader on articles |

*(Header HTML stamp text may lag comment header — always bump **both** when releasing.)*

---

## 4. Architecture — auth & Memberstack (why the bounce happened)

### Timeline of fixes

| Version | What | Status |
|---------|------|--------|
| D 1.3.6 (`ac4ae5e`) | Stable rollback baseline — Applied Learning OK, **B3 still failed** | Reference only |
| D 1.3.7–1.3.7.2 | Auth retry, whoami, `[AR-AUTH]` trace, persistent `ar-auth-trace` | Diagnosis |
| D 1.3.8 | MS network shield, nav shield, header bounce-back | Partial — B3 still failed live |
| **D 1.3.9** | Session-cached access (`accessConfirmed` in `ar-dashboard-session-v1`, 4h TTL) | Shipped |
| **D 1.3.10** | `__arMsReader` — one MS read pair per page | **Fixed B3** (Alan confirmed) |
| **D 1.3.11** | Cube open beacons → `/api/academy/track-tile-open` | In repo; paste status check with Alan |

### Decisive finding (Claude A vs B — RESOLVED)

**Verdict: B** — Memberstack redirects on **Network Error**, not our guard.

- Failing run: `ar-auth-trace` shows `guard-entry` with `aboutToRedirectTo: null` (guard **deferred correctly**) + **3× `ms-error: Network Error`**
- Passing run: same guard behaviour, **zero** Network Errors
- Fast return (~2s after article) reliably bounced; slow return passed
- Root cause after deeper analysis: **~78 MS API calls** per dashboard load + article widget flooding MS → network failures → MS logout redirect

See: `RESPONSE-2026-06-06-claude-AvsB-RESOLVED-it-is-memberstack-network-redirect.md` in Google Drive OUTBOX.

### Key runtime globals

```javascript
globalThis.__arMsReader.fetchBundle(ms, { force?, useCache? })
// → { member, rawJson, memberJson } — ONE pair per page load, deduped

sessionStorage['ar-dashboard-session-v1']  // { id, at, accessConfirmed, hasAccess, planCount, email }
sessionStorage['ar-auth-trace']            // persistent redirect diagnosis log
```

**Auth guard entry points (dashboard):** `runDashboardAccessGuard`, `tryBootFromSessionCache`, `scheduleBackgroundMemberHydrate` — see dashboard snippet ~lines 3136–6700.

**Do NOT re-add** uncommitted D 1.3.12–1.3.20 auth/beacon bundles from old experiments. **Do NOT use** older rollback `e25fc87` (yellow placeholders).

### Stable rollback file

`academy-dashboard-ROLLBACK-v1.3.6-ac4ae5e-2026-06-05.html` — commit `ac4ae5e`. Use for Applied Learning regression only; B3 known broken on this build.

---

## 5. Open / deferred work (post-bounce-fix)

From definitive test plan + conversation — **verify live status with Alan before assuming done:**

| ID | Task | Notes |
|----|------|-------|
| **G3** | Garbled panel header icons | D 1.3.7 used HTML entities; verify live |
| **D4** | Abstract assignment cube 56 → PDF not blog | `/s/Abstract-photography-Assignment.pdf` |
| **C** | Cube open → orange persistence | Baseline MS JSON tracking works; D 1.3.11 adds server beacons — verify end-to-end in admin engagement |
| **Tracking** | Beacon + key-matching checklist | `npm run test:tile-open-beacon`; API `track-tile-open.js` |

**Deferred intentionally during bounce fix:** full cube-tracking admin verification until B3 passed (now passed).

**Test plan context note:** `_ACADEMY-DASHBOARD-DEFINITIVE-TEST-PLAN.md` still lists bounce fix as "active change" and defers beacons — update that file when starting the next verification pass (G3, D4, C/beacons). B3 is now **PASS** per Alan.

---

## 6. Strip / gates / live verification (Claude uses these)

**Live gate state (do-next strip):** `window.__arDoNextStrip.gateStats` on `/academy/dashboard` — Claude verifies proximity counts here, not just RESPONSE text (miscounts have happened).

**Gate config objects (strip):** `FOUNDATION_GATE`, `PRACTITIONER_GATE`, `CERTIFIED_GATE` — thresholds live in named config; never hardcode duplicates.

**Journey data:** single `JOURNEY_STAGES` array in strip snippet.

**Module paths:** `lib/academy-module-paths.js` — synced into strip via `// SYNC:` comments.

**Admin preview mode (writes nothing):**  
`https://www.alanranger.com/academy/dashboard?ar_preview=1&state=trial|annual&trialdays=&modules=&activedays=&exams=`

**Claude live verification:** Chrome tools on `https://www.alanranger.com/academy/dashboard` — Alan must be logged in; if on `/academy/login`, ask Alan to log back in. Session times out.

**change_log discipline:** only add `activation_change_log` rows after Alan verifies member-facing change live and signs off.

---

## 7. Cursor agent rules (mandatory)

1. **Every snippet change** = bump version in file header comment + changelog line + update header stamp (H/S/D/B) when relevant.
2. **`git commit` + `git push`** to `alanranger-modules` `main` after each logical fix (one version = one commit).
3. **Write RESPONSE** to Google Drive OUTBOX + update `docs/handoff/` for significant builds.
4. **Never commit** `.env`, credentials, temp debug HTML, `supabase/.temp/`.
5. **Scope tightly** — state what must NOT change (gate logic, strip styling, unrelated blocks).
6. **Tracking sacred** — record on actual click/open only, never on render.
7. **Single source of truth** — paths in `lib/academy-module-paths.js`; gates in named config objects in strip.
8. **British English.** No em dashes in visible/paste content.
9. **Complexity limit** — keep functions ≤15 cyclomatic complexity (Alan's rule).
10. **Only commit when Alan asks** — unless completing an explicit "build X, commit/push" instruction (as in bounce-fix arc).

---

## 8. Testing

### Stage 1 — Cursor (pre-paste, in repo)

```bash
cd "G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment"

npm run test:gates
npm run test:modules
npm run test:auth-hydrate
node scripts/test-dashboard-bounce-scenarios.mjs
npm run test:tile-open-beacon          # D 1.3.11 beacons
node scripts/test-dashboard-cube-clicks.mjs   # if present
npm run audit:module-cubes
```

Playwright uses Chromium from AI GEO Audit project's `node_modules` (path hardcoded in test scripts).

### Stage 2 — Claude (post-paste, live)

Alan pastes → tells Claude **"check claude"** → Claude runs `_ACADEMY-DASHBOARD-DEFINITIVE-TEST-PLAN.md` sections A–G on live site (real clicks, not synthetic `.click()` for opens).

**B3 test (the bounce):** module tile → article → Back to Dashboard within ~2s × **5** — must NOT land on `/academy/login`.

**Trace check:** DevTools → Application → Session Storage → `ar-auth-trace` — look for `session-cache-render`, no rogue login redirects.

### Stage 3 — Alan (~3 min human subset)

See test plan § STAGE 3 (AL1–AL7).

---

## 9. Repo layout (high-signal paths)

```
alanranger-academy-assesment/
├── academy-header-elements-squarespace-snippet-v1.html   # H
├── academy-do-next-strip-squarespace-snippet-v1.html     # S
├── academy-dashboard-squarespace-snippet-v1.html         # D (8600+ lines)
├── academy-bookmark-buttons-squarespace-snippet-v1.html  # B
├── api/
│   ├── exams/          # whoami, progress, save, CORS
│   └── academy/        # track-page-view, track-tile-open, track-login
├── lib/                # module paths, badge gates, cube-open helpers
├── scripts/            # regression tests, audit tools
├── docs/handoff/       # RESPONSE mirrors + THIS FILE
├── RESTORE_POINT_2026-06-06-D-1.3.10.md
├── CHANGELOG.md
├── QUICK_REFERENCE.md
└── pages/academy/admin/  # Next.js admin dashboard (Vercel)
```

**Vercel:** pushes to `main` auto-deploy API routes. Snippets still need Squarespace paste.

**Supabase project:** used by exams API + events (see `QUICK_REFERENCE.md` tables).

---

## 10. API endpoints (tracking)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/academy/track-page-view` | Lesson page views (bookmark widget) |
| `POST /api/academy/track-tile-open` | Module/PDF/pack/checklist opens (beacon, `keepalive`) |
| `GET /api/exams/whoami` | Cookie-based member identity fallback |
| `GET /api/exams/progress` | Exam progress (header `X-Memberstack-Id`) |

---

## 11. Git commit history (bounce-fix arc)

```
afc7ef9 Docs: comprehensive Cursor agent handover
7eb5a6a fix: D 1.3.11 beacon helpers in module-progress IIFE scope
0d2369d Add test:tile-open-beacon script
de125c3 Dashboard D 1.3.11: cube open-tracking beacons + track-tile-open API
ff545e3 Docs: restore point + handoff MDs + changelog
9f7fed1 Baseline rollback + audit/test helpers
7b0fc0b D 1.3.10 complete: __arMsReader articles + strip
5e000d5 D 1.3.10: dashboard MS consolidation
0387920 D 1.3.9: session-cached access
72e102b D 1.3.8: MS network bounce shield
```

---

## 12. Pitfalls (do not repeat)

1. **Assuming git push = live** — always give Alan a paste table.
2. **Flooding Memberstack** — never loop `getMemberJSON()` per cube/tile/timer; use `__arMsReader`.
3. **Trusting headless `.click()` for PDF opens** — use real navigation tests for Stage 2.
4. **Using block numbers without filenames** — strip/dashboard block order has confused people before.
5. **Old rollback `academy-dashboard-ROLLBACK-v1.3.6.html` (e25fc87)** — yellow placeholders; wrong baseline.
6. **Nested `alanranger-modules/` folder** in repo — stale clone at ancient commit; **ignore it**; real remote is parent repo.
7. **Memberstack gated-content redirect setting** — may still fire before our scripts on some pages; note in RESPONSE if bounce recurs.

---

## 13. First actions for a new Cursor agent

When Alan says **"check claude"**:

1. List/read pending files in `C:/Users/alan/Google Drive/Claude shared resources/Claude Questions for Cursor/`
2. Read `_CLAUDE-CURSOR-WORKFLOW-2026-06-05.md` if unclear on process
3. Implement scoped fix in repo
4. Run Stage 1 tests
5. Bump versions, commit, push `main`
6. Write `RESPONSE-*-LATEST.md` to OUTBOX + update `docs/handoff/` if needed
7. Tell Alan exactly which files to re-paste

When Alan gives a direct build request (no Claude question):

1. Read this handover + relevant snippet changelog headers
2. Minimise scope
3. Same version/commit/RESPONSE discipline if the fix is part of the Claude loop

---

## 14. Contact / ownership

- **Alan** — pastes snippets, runs Stage 3, confirms live
- **Claude (claude.ai)** — live verification, QUESTION files, engagement dashboard specs
- **Cursor (D0)** — repo edits, tests, commits, RESPONSE files

**Mission:** Reliable member dashboard — correct auth, accurate module/exam tracking, engagement data for admin cohort metrics, no false logouts.
