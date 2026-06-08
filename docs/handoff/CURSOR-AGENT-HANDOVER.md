# Cursor Agent Handover — Academy (Alan Ranger Photography)

**Last updated:** 2026-06-08  
**Repo:** `G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment`  
**GitHub remote:** `https://github.com/alanranger/alanranger-modules.git` (branch `main`)  
**Latest commit:** `a96ace3` — Foundation FP 1.0.42 (members zone + collapsibles + progress labels)  
**Local uncommitted:** FP 1.0.43 divider copy + handover doc updates — run `git status` first  

Read this file **first**. Then read:

- **`docs/handoff/FOUNDATION-PAGE-HANDOVER-LATEST.md`** — Modules Map page (FP) — **required for FP work**
- **`docs/handoff/NEW-CHAT-START-PROMPT.md`** — copy-paste block for a fresh Cursor chat
- Google Drive `_CLAUDE-CURSOR-WORKFLOW-2026-06-05.md` if the Claude loop is unclear

**Google Drive mirror:** `C:/Users/alan/Google Drive/Claude shared resources/CURSOR-AGENT-HANDOVER-LATEST.md`

---

## 1. What this project is

Squarespace-hosted **Academy member dashboard**, **Modules Map (Foundation) page**, **blog lesson widgets**, + **Vercel API** (`alanranger-modules.vercel.app`) for exams, tracking, and admin analytics.

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
| **Foundation FP** | `Squarespace Snippets/academy-foundation-page-squarespace-snippet-v1.html` | `/academy/online-photography-course/` page → Code Block |
| **Header H** | `Squarespace Snippets/academy-header-elements-squarespace-snippet-v1.html` | Settings → Code Injection → **Header** |
| **Strip S** | `Squarespace Snippets/academy-do-next-strip-squarespace-snippet-v1.html` | `/academy/dashboard` page → Code block **1** |
| **Dashboard D** | `Squarespace Snippets/academy-dashboard-squarespace-snippet-v1.html` | `/academy/dashboard` page → Code block **2** |
| **Bookmark B** | `Squarespace Snippets/academy-bookmark-buttons-squarespace-snippet-v1.html` | Blog/article template (module lessons) |
| Exams page | `Squarespace Snippets/squarespace-v2.2.html` | Exams & Certification page block |
| Login | `Squarespace Snippets/academy-login-squarespace-snippet-v1.html` | Login page |

**Foundation page:** edit `scripts/build-foundation-page-snippet.mjs` only, then `node scripts/build-foundation-page-snippet.mjs`. See `docs/handoff/FOUNDATION-PAGE-HANDOVER-LATEST.md`.

**Live version stamp** (dashboard): check `#ar-academy-header-snippet-version` under logo — must match pasted H/S/D/B.  
**Foundation:** check `#ar-foundation-hub` → `data-ar-fp-version` (e.g. `FP 1.0.43`).

### Current repo versions (2026-06-08 — verify stamp matches after paste)

| Block | Version | Notes |
|-------|---------|-------|
| Foundation FP | **1.0.43** | Modules Map; collapsibles + one members divider; **1.0.43 may be uncommitted** |
| Header H | **1.4.33** | Stamp sync with D 1.3.27 layout |
| Strip S | **1.3.56** | Journey strip column align |
| Dashboard D | **1.3.27** | Catalog gauge / stats under progress |
| Bookmark B | **1.3.16** | "Browse the Modules" label |

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

## 5. Open / deferred work (verify live with Alan)

### Foundation page (FP)

| Task | Status |
|------|--------|
| Paste **FP 1.0.43** live | Alan action — confirm `data-ar-fp-version` on live page |
| Commit FP 1.0.43 + handover docs | Pending unless Alan asks |
| Visual verify trial vs paid progress labels | Post-paste checklist in `FOUNDATION-PAGE-HANDOVER-LATEST.md` |

### Dashboard (from earlier arc)

| ID | Task | Notes |
|----|------|-------|
| **G3** | Garbled panel header icons | Verify live |
| **D4** | Abstract assignment cube 56 → PDF not blog | `/s/Abstract-photography-Assignment.pdf` |
| **C** | Cube open → orange persistence + admin beacons | `npm run test:tile-open-beacon` |

**B3 login bounce:** FIXED (D 1.3.10 / `__arMsReader`) — do not regress MS call flooding.

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
├── Squarespace Snippets/
│   ├── academy-foundation-page-squarespace-snippet-v1.html   # FP — generated
│   ├── academy-header-elements-squarespace-snippet-v1.html   # H
│   ├── academy-do-next-strip-squarespace-snippet-v1.html     # S
│   ├── academy-dashboard-squarespace-snippet-v1.html         # D
│   ├── academy-bookmark-buttons-squarespace-snippet-v1.html  # B
│   ├── squarespace-v2.2.html                               # Exams page
│   └── academy-login-squarespace-snippet-v1.html           # Login
├── scripts/
│   ├── build-foundation-page-snippet.mjs                   # FP source of truth
│   └── build-module-meta-descriptions.mjs
├── lib/
│   ├── academy-module-paths.js
│   ├── academy-module-meta-descriptions.js
│   └── academy-applied-rps-catalog.js
├── docs/handoff/
│   ├── CURSOR-AGENT-HANDOVER.md                            # THIS FILE
│   ├── FOUNDATION-PAGE-HANDOVER-LATEST.md
│   └── NEW-CHAT-START-PROMPT.md
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

## 11. Git commit history (recent)

```
a96ace3 Foundation FP 1.0.42: unified members zone, collapsibles, progress labels
bdb74f2 Rename Foundation entry CTAs to Browse the Modules; trial-aware FAQ
… (see git log for dashboard arc: D 1.3.10 bounce fix, ghost mode, etc.)
```

**Uncommitted at 2026-06-08 handover:** FP 1.0.43 divider copy, handover MD updates.

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

1. Read **`docs/handoff/NEW-CHAT-START-PROMPT.md`** (or Alan pastes that block into chat)
2. Read **`FOUNDATION-PAGE-HANDOVER-LATEST.md`** if touching FP
3. Run `git status` — confirm FP 1.0.43 commit state

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
