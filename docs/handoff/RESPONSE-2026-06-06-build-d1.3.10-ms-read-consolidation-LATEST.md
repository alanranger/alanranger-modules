# RESPONSE — D 1.3.10 complete (MS read flood fix — dashboard + articles)

**Date:** 2026-06-06  
**Repo:** `alanranger-academy-assesment` → `alanranger-modules` `main`  
**Status:** **LIVE — bounce fixed (Alan confirmed)**

---

## Root cause

Per-item / per-timer / per-mutation code called `getMemberJSON()` and `getCurrentMember()` independently. On **article pages**, the bookmark widget made it worse:

- `resolveMemberIdentity`: JSON + up to 5× `getMemberExtended` (each = member + JSON)
- `kickMemberStrip` × 3 per kick
- `MutationObserver` re-kicking for 15s on every DOM mutation

Visiting a module article flooded Memberstack; fast return to dashboard hit MS while still recovering → Network Error → login bounce.

---

## Fix: `globalThis.__arMsReader`

One deduped `getCurrentMember` + `getMemberJSON` **bundle per page load**, shared across all snippets via idempotent init.

| Snippet | Version | Role |
|---------|---------|------|
| **Header H** | **1.4.4** | Inits `__arMsReader` early on Academy pages |
| **Dashboard D** | **1.3.10** | All cube/pack/checklist loops + auth + bookmarks panel use cache |
| **Strip S** | **1.3.34** | `init()` one bundle; assignment persist reuses cache |
| **Bookmark B** | **1.3.4** | Inits reader on **blog articles**; single bundle for lesson strip + bookmark save |

---

## Paste table (all four)

| Block | File | Where |
|-------|------|--------|
| **Header H 1.4.4** | `academy-header-elements-squarespace-snippet-v1.html` | Code Injection → **Header** |
| **Strip S 1.3.34** | `academy-do-next-strip-squarespace-snippet-v1.html` | Dashboard → Code block **1** |
| **Dashboard D 1.3.10** | `academy-dashboard-squarespace-snippet-v1.html` | Dashboard → Code block **2** |
| **Bookmark B 1.3.4** | `academy-bookmark-buttons-squarespace-snippet-v1.html` | Blog/article template injection |

Verify stamp: **`H 1.4.4 · S 1.3.34 · D 1.3.10 · B 1.3.4`**

---

## Expected network

| Page | Before | After |
|------|--------|-------|
| Dashboard load | ~78 paired reads | **~1–2** pairs |
| Article / module lesson | dozens | **~1–2** pairs |
| Fast return × 5 | login bounce | stay on dashboard |

---

## Tests

```
npm run test:auth-hydrate          → PASS
node scripts/test-dashboard-bounce-scenarios.mjs → 4/4 PASS
```

---

## Git commits (baseline)

| Commit | Description |
|--------|-------------|
| `0387920` | D 1.3.9 session-cached access |
| `5e000d5` | D 1.3.10 dashboard MS consolidation |
| `7b0fc0b` | D 1.3.10 complete — header + strip + bookmark |
| `9f7fed1` | Baseline rollback + audit/test helpers |
