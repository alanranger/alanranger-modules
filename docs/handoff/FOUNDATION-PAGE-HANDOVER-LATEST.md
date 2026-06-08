# Foundation / Modules Map page — handover (FP 1.0.43)

**Last updated:** 2026-06-08  
**Repo:** `G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment`  
**Live URL:** `https://www.alanranger.com/academy/online-photography-course/`  
**Git:** `a96ace3` on `main` (FP 1.0.42 committed); **FP 1.0.43 divider copy is local-only until commit + paste**

---

## Source of truth (never hand-edit the snippet)

| What | Path |
|------|------|
| **Build script** | `scripts/build-foundation-page-snippet.mjs` |
| **Generated paste file** | `Squarespace Snippets/academy-foundation-page-squarespace-snippet-v1.html` |
| **Module paths** | `lib/academy-module-paths.js` |
| **Module meta (tooltips)** | `lib/academy-module-meta-descriptions.js` (built via `scripts/build-module-meta-descriptions.mjs`) |
| **Applied + RPS catalog** | `lib/academy-applied-rps-catalog.js` |

**Regenerate after any FP change:**

```bash
cd "G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment"
node scripts/build-foundation-page-snippet.mjs
```

This also runs badge-gate sync into strip + foundation page. Verify first line comment and `data-ar-fp-version` on `#ar-foundation-hub` match the bumped stamp.

**Squarespace paste:** paste `academy-foundation-page-squarespace-snippet-v1.html` into the **Modules Map page** Code Block (not the dashboard blocks). Hard refresh after paste. Git push alone does **not** go live.

---

## Current version: FP 1.0.43

Verify on live page: `#ar-foundation-hub` → `data-ar-fp-version="FP 1.0.43"`.

### Version history (this arc)

| Version | Summary |
|---------|---------|
| **1.0.36–38** | Removed “Leave a review” button; Elfsight Google reviews badge in sticky header (clickable, live counts) |
| **1.0.39–40** | Collapsible top panels + map sections; unified top-left chevron + hide/show |
| **1.0.41** | One members divider; Exams + Practice Packs + Checklists converted to collapsible map sections |
| **1.0.42** | All four members-only sections use identical progress labels: `N/total opened` (trial: `Paid only · 0/N opened`) |
| **1.0.43** | Divider copy: **Paid Members-only modules & resources** / annual membership subline |

---

## Page structure (DOM order)

1. **Headline panel** — expanded by default (`data-fp-top-collapse="headline"`)
2. **How-it-works panel** — expanded by default
3. **Foundation course intro** (static panel, not collapsible)
4. **5 Foundation map sections** — only `foundation-0` (15 camera settings) expanded by default
5. **Divider**
6. **Exams & Certificates** — collapsible, collapsed; **trial-accessible** (stays above members divider)
7. **Members zone divider** — gold banner:
   - Label: `Paid Members-only modules & resources`
   - Sub: `Practice packs, checklists, Applied Learning and RPS — included with annual membership`
8. **Practice Packs** — collapsible, collapsed, `ar-fp-paid-zone`
9. **1-Page Field Checklists** — collapsible, collapsed, `ar-fp-paid-zone`
10. **Applied Learning Library** — collapsible, collapsed, `ar-fp-paid-zone`
11. **RPS distinctions** — collapsible, collapsed, `ar-fp-paid-zone`
12. **Support and resources** + **FAQs** — not collapsible

---

## Collapse behaviour

- **Toggle pattern (all collapsibles):** top-left chevron + `hide me` / `show me` (same as dashboard journey strip style)
- **Persistence:** `sessionStorage` key `ar-fp-collapse-v1`
- **Edit mode:** `html.ar-fp-edit-mode` forces all sections expanded (Squarespace editor safety — do not break)
- **Classes:** shared `ar-fp-collapsible__*` on top panels and map sections

---

## Trial vs paid

| Zone | Trial access | Tile locks |
|------|--------------|------------|
| Foundation modules | Yes | No |
| Exams | Yes | No |
| Practice Packs, Checklists, Applied, RPS | No | `data-fp-paid="1"` + `is-paid-locked` on trial |

**Progress meta (members-only sections):**

- Paid: `N/total opened` (green)
- Trial: `Paid only · 0/N opened` (red via `.ar-fp-paid-zone.is-trial-locked .ar-fp-map-section__progress`)

Logic: `formatMapSectionProgress()` + `updateMapSectionProgress(..., trialLocked)` in generated snippet JS.

---

## Header (FP-only scope)

- Self-contained sticky header in snippet (`#ar-academy-header-container` via fallback template)
- Title: **Photography Course Modules Map**
- Elfsight badge: `#ar-fp-header-reviews-badge` (display + link to Google review URL)
- **Dashboard header snippet (H) is separate** — do not conflate FP header changes with H block unless explicitly requested

---

## APIs used on load

| Endpoint | Purpose |
|----------|---------|
| `GET .../api/academy/engagement-summary?window=all` | Badges, trial state, applied opens |
| `GET .../api/exams/progress` | Exam grid + `N/15 passed` on exams section |
| Memberstack `getCurrentMember` / `getMemberJSON` | Opens map, trial detection |

---

## Pitfalls

1. **Do not edit** `academy-foundation-page-squarespace-snippet-v1.html` directly — always rebuild from script
2. **Two divider labels** were merged in 1.0.41 — do not reintroduce “Paid Members Only — Resources” as a separate panel
3. **Exams stay above** the members divider (Alan confirmed trial-accessible)
4. **British English**, hyphens not em dashes in visible copy (subtitle may use em dash where Alan specified verbatim)
5. **Complexity ≤15** per function (Alan’s rule)
6. **Commit only when Alan asks** unless processing a Claude BUILD question

---

## Claude handoff (recent, all processed)

| Question | Response |
|----------|----------|
| foundation-reviews-remove-leave-button-move-badge-to-header | FP 1.0.36–38 |
| foundation-collapsible-sections | FP 1.0.39 |
| foundation-collapsible-consistency-and-zone-divider | FP 1.0.40 |
| foundation-paid-zone-consistency-fix + exams addendum | FP 1.0.41 |
| (Alan feedback) consistent progress labels | FP 1.0.42 |
| (Alan feedback) divider copy | FP 1.0.43 |

Inbox status at handover: **0 pending**. Run `check claude` to poll.

---

## Verification checklist (post-paste)

**Trial account:**

- [ ] Divider reads “Paid Members-only modules & resources” + annual membership subline
- [ ] All four members sections show `Paid only · 0/N opened` in red
- [ ] Paid tiles locked; Exams section expandable and usable
- [ ] Only “15 camera settings” expanded among Foundation sections

**Paid account:**

- [ ] All four members sections show `0/N opened` (or higher if opened)
- [ ] Tiles clickable

**Editor:** Squarespace edit mode shows all sections expanded
