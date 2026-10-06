# Academy layout architecture — dashboard + Modules Map (2026-05-31)

**Last updated:** 2026-05-31  
**Live verified:** Alan confirmed visually correct after paste of **H 1.4.38** + **FP 1.0.53**  
**URLs:** `/academy/dashboard`, `/academy/online-photography-course`

---

## Current live snippet versions

| Block | Version | Squarespace paste location |
|-------|---------|----------------------------|
| Header **H** | **1.4.38** | Settings → Code Injection → **Header** |
| Strip **S** | **1.3.74** | `/academy/dashboard` → Code block **1** |
| Dashboard **D** | **1.3.45** | `/academy/dashboard` → Code block **2** |
| Foundation **FP** | **1.0.53** | `/academy/online-photography-course` → page Code block |
| Bookmark **B** | **1.3.16** | Blog/article template |
| Footer router **F** | **v4.3.3** (live) | Site-wide footer injection — **not** upgraded to v4.3.4 yet |

Canonical paste files: `alanranger-modules/Squarespace Snippets/` (mirrored at repo root `Squarespace Snippets/`).

---

## Problem summary (what was broken)

### Dashboard (`/academy/dashboard`)

1. **Phantom top gap / scroll-through** — empty band above the black header where page content showed while scrolling.
2. **Sticky behaviour** — both black header and “Your Journey” strip were fixed; Alan wanted **header only** fixed, strip in normal scroll flow.
3. **ACADEMY pill overlap** — white/gold `#arp-academy-pill` (from footer router v4.3.3) overlapped the custom header after the offset fix.

### Modules Map (`/academy/online-photography-course`)

1. **Large empty black gap** above the “Photography Course Modules Map” banner.
2. **Root cause (multi-layer):**
   - Site-wide header injection mounted `#ar-academy-header-container` into `#page` before the foundation block relocated it.
   - `__arAcademyLayout.syncLayout()` called `clearFixedLayout(header)` — undoing foundation `position: fixed`.
   - Foundation `bootAppShell()` called `__arAcademyLayout.schedule()` — re-triggering dashboard layout sync on a non-dashboard page.
   - Orphan Squarespace page sections + SQSP chrome padding above the foundation hub block.

---

## Fix map (which file owns what)

| Symptom | Owner snippet | Fix |
|---------|---------------|-----|
| Dashboard phantom 71px offset | **H 1.4.35**, **S 1.3.74** | `getSqspNavOffset()` → `0` on `html.ar-academy` (SQSP nav hidden; no 71px fallback) |
| Dashboard header-only sticky | **H 1.4.34**, **S 1.3.73** | Pin-stack: black header fixed; journey strip scrolls in document flow |
| Dashboard pill overlap | **H 1.4.36** | CSS hides `#arp-academy-pill` on `html.ar-dashboard-pin-stack` |
| Foundation duplicate header mount | **H 1.4.37** | Skip `mountAcademyHeaderContainer()` on foundation path — page owns placement |
| Foundation header cleared by sync | **H 1.4.38** | `applyFoundationHeaderLayout()` in `syncLayout()` when `html.ar-fp-live-shell` |
| Foundation gap CSS + chrome hide | **H 1.4.38** + **FP 1.0.53** | Fixed header flush top; hide orphan `.page-section`; hub `padding-top: var(--ar-fp-header-height)` |
| Foundation schedule undoing fixed header | **FP 1.0.53** | `bootAppShell()` **does not** call `__arAcademyLayout.schedule()` |
| Foundation header placement | **FP 1.0.53** | `relocateHeaderAboveHub()` → `#siteWrapper` first child; `collapseFoundationLayoutGap()` |

---

## Runtime globals and HTML classes

### Shared layout API (header injection)

```javascript
globalThis.__arAcademyLayout.schedule()  // debounced layout sync
globalThis.__arAcademyLayout.syncLayout()
```

- **Dashboard:** `html.ar-dashboard-pin-stack` — header fixed, strip in flow, `--ar-sqsp-nav-offset: 0`.
- **Foundation:** `html.ar-fp-live-shell` — foundation page live shell; header stays fixed via `applyFoundationHeaderLayout()`.
- **Edit mode:** `html.ar-fp-edit-mode` — Squarespace editor; all sections forced expanded; no gap suppression.

### Dashboard pill (footer, not header)

- **`#arp-academy-pill`** is injected by **footer router v4.3.3** (`ARP Academy — Editor-Safe Routing + UI Suppression`).
- Lives in `Academy/academy-stable-routing-ui-suppression-v4.3.3.html` (also embedded in `global-footer-injection-REVISED-v1.9.2.txt`).
- **Decision (2026-05-31):** leave site-wide footer on **v4.3.3** — full merged footer edit is high-risk. Dashboard pill hidden via **H 1.4.36** CSS until a surgical v4.3.4 router swap is done.
- **v4.3.4 extract:** `Academy/academy-stable-routing-ui-suppression-v4.3.4.html` removes pill entirely (optional future deploy).

---

## Two-layer header on Modules Map

Foundation page uses **both**:

1. **Site-wide H injection** — member welcome, logout, MS reader, `__arAcademyLayout`, foundation-aware `syncLayout`.
2. **FP page block** — creates/places `#ar-academy-header-container` (Modules Map title, back link, reviews badge) via fallback template + `mountAcademyHeader()`.

**Rule:** H 1.4.37+ must **not** auto-mount header on `/academy/online-photography-course`; FP owns DOM placement.

---

## Verification checklist (post-paste)

### Dashboard

- [ ] Hard refresh while logged in
- [ ] No empty band above black header when scrolling
- [ ] Black header stays fixed; “Your Journey” strip scrolls away with page content
- [ ] No white/gold ACADEMY pill overlapping header (hidden, not removed from footer yet)
- [ ] DevTools: `html` has `ar-dashboard-pin-stack`; header `top: 0`

### Modules Map

- [ ] Hard refresh while logged in
- [ ] Black banner flush to viewport top (no large empty gap)
- [ ] `#ar-foundation-hub` → `data-ar-fp-version="FP 1.0.53"`
- [ ] DevTools: `html` has `ar-fp-live-shell`
- [ ] `#ar-academy-header-container` computed: `position: fixed; top: 0px`
- [ ] No visible orphan `.page-section` above foundation block

---

## Pitfalls for future agents

1. **H alone does not fix foundation gap** — FP page block must also be pasted (1.0.53+).
2. **Do not re-add** `__arAcademyLayout.schedule()` inside foundation `bootAppShell()` — it re-invokes dashboard `clearFixedLayout`.
3. **`watchAcademyHeaderHeight()`** still schedules layout on resize — on foundation, H 1.4.38 re-applies fixed layout via `applyFoundationHeaderLayout()`; watch for regressions on resize.
4. **Build script drift:** `scripts/build-foundation-page-snippet.mjs` may lag the live FP snippet — always verify `data-ar-fp-version` on the generated file before paste; backport layout changes into the build script after FP edits.
5. **Git push ≠ live** — Alan must paste into Squarespace.

---

## Related docs

- `docs/handoff/FOUNDATION-PAGE-HANDOVER-LATEST.md` — FP content, collapsibles, trial/paid zones
- `docs/handoff/CURSOR-AGENT-HANDOVER.md` — paste map, Claude loop, version stamps
- `CHANGELOG.md` — version changelog entries
