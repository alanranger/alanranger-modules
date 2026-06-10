# Live exams page export

**Exported:** 2026-06-10  
**Source URL:** https://www.alanranger.com/academy/photography-exams-certification  
**Canonical files:**

| File | Purpose |
|------|---------|
| `squarespace-exams-page-LIVE.html` | Timestamped live snapshot |
| `squarespace-exams-page-LATEST.html` | Same content — use this name when linking docs |

## What this is

The full Squarespace **code block** pasted on the photography exams page (`#ar-modgrid` monolith): HTML, CSS, and inline JavaScript. Paste this entire file into the Squarespace code block to restore production.

**Not included:** Squarespace theme chrome, header, footer, Memberstack global embed (those live outside the code block).

## Supersedes (do not paste these for new work)

- `squarespace-v2.2.html` — Memberstack migration base; **PDF paths still partially legacy**
- `Exams Module/code block exams page.txt` — pre-Memberstack Supabase magic-link era
- `Exams Module/exams-page-FIXED-AR-SB-20251225.html` — AR_SB init guard only; still legacy auth

## Live vs `squarespace-v2.2.html` (high level)

| Feature | v2.2 (repo) | LIVE (exported) |
|---------|-------------|-----------------|
| Save results | `POST /api/exams/save` → `module_results_ms` | Same |
| Grid status | `getLatestStatusViaMemberstack` | Same |
| Module PDFs | Still uses `supabase.auth` + `module_results` in places | Uses API + Memberstack identity |
| Master cert/transcript | Partial legacy | `fetchExamResultsForIdentity`, `ensureCertificateIdentity` |
| Legacy migration button | Present | Present |

## Backend (unchanged — Vercel + Supabase)

- **Save:** `POST /api/exams/save` → `module_results_ms`
- **Status (PDFs + modal):** `GET /api/exams/status?moduleId=…`
- **Dashboard tiles:** `GET /api/exams/progress`
- **Legacy link:** `POST /api/exams/migrate` (`module_results` → `module_results_ms`)

## Workflow

1. Edit **`squarespace-exams-page-LATEST.html`** in git (or branch from it).
2. Paste into Squarespace code block on `/academy/photography-exams-certification`.
3. Re-export from live after any Squarespace-only hotfix so git stays truth.
