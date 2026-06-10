# Cert 2 — staged build: **actual repo files changed**

Handoff `RESPONSE-*.md` files live in Google Drive (`Cursor Outputs for Claude/`) — they are **not** the source of truth for code. This file lists **real paths in `alanranger-modules`** that changed per stage.

**Canonical repo:** https://github.com/alanranger/alanranger-modules

---

## Stage 1 — exam module registry ✅

| File | Purpose |
|------|---------|
| `lib/academy-exam-modules.js` | Track registry: `foundation` (15, orange) + `composition_creative` (15, gold) |
| `alanranger-academy-assesment/lib/academy-exam-modules.js` | Mirror copy (wrapper repo; push parked) |

**Commit:** `4f725bd`

---

## Stage 2 — progress API ✅

| File | Purpose |
|------|---------|
| `api/exams/progress.js` | Multi-track response: `tracks.foundation`, `tracks.composition_creative`; legacy `summary`/`modules` = Foundation |

**Commit:** `5cd64ea` · Live: `GET https://alanranger-modules.vercel.app/api/exams/progress`

---

## Stage 3 — dashboard exams tile ✅ (re-paste required)

| File | Squarespace paste |
|------|-------------------|
| `Squarespace Snippets/academy-dashboard-squarespace-snippet-v1.html` | **`/academy/dashboard` → code block 2 (Dashboard D)** |
| `lib/academy-dashboard-catalog.js` | Server-side only (audit script) — **no SQ paste** |
| `scripts/audit-dashboard-links.mjs` | Server-side only |

**Stamp:** **D 1.3.29** (header comment in snippet)

**Commits:** `28e7269` (Stage 3 body), version stamp in follow-up commit

---

## Stage 4 — modules map exams section ❌ not started

| File | Squarespace paste |
|------|-------------------|
| `Squarespace Snippets/academy-foundation-page-squarespace-snippet-v1.html` | **`/academy/online-photography-course/` → Foundation page block** |

Waiting: Alan live-verifies Stage 3 dashboard, then Claude releases Stage 4.

---

## Stage 5 — do-next strip ❌ not started

| File | Squarespace paste |
|------|-------------------|
| `Squarespace Snippets/academy-do-next-strip-squarespace-snippet-v1.html` | **`/academy/dashboard` → code block 1 (Strip S)** |

---

## Exams page (already live — separate from stages 3–5)

| File | Squarespace paste |
|------|-------------------|
| `squarespace-exams-page-LATEST.html` | Exams page block 1 (Foundation) |
| `squarespace-exams-cert2-LATEST.html` | Exams page block 2 (Cert 2) — second code block on `/academy/photography-exams-certification` |
| `modules/c2-*.json` (×15) | GitHub Pages JSON (not pasted) |

---

## Local paths (Dropbox)

```
G:\Dropbox\alan ranger photography\Website Code\Academy\alanranger-academy-assesment\alanranger-modules\
```

Open snippets folder:

```
...\alanranger-modules\Squarespace Snippets\
```

Duplicate copy (same files, for convenience):

```
...\alanranger-academy-assesment\Squarespace Snippets\
```
