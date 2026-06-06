# Restore point — D 1.3.10 bounce fix (2026-06-06)

**Git baseline:** `9f7fed1` on `main` (`alanranger-modules`)

## Live snippet versions (paste set)

| Block | Version | File |
|-------|---------|------|
| Header | H 1.4.4 | `academy-header-elements-squarespace-snippet-v1.html` |
| Strip | S 1.3.34 | `academy-do-next-strip-squarespace-snippet-v1.html` |
| Dashboard | D 1.3.10 | `academy-dashboard-squarespace-snippet-v1.html` |
| Bookmark | B 1.3.4 | `academy-bookmark-buttons-squarespace-snippet-v1.html` |

## What this baseline fixes

- **B3 login bounce** on fast return from module articles to dashboard
- **~78 → ~1–2** Memberstack API read pairs per page load
- Session-cached access (D 1.3.9) + shared `__arMsReader` bundle (D 1.3.10)

## Rollback HTML (pre-bounce-fix reference)

`academy-dashboard-ROLLBACK-v1.3.6-ac4ae5e-2026-06-05.html` — commit `ac4ae5e`, 5 Jun 2026. Applied Learning worked; B3 still failed.

## Verification commands

```bash
npm run test:auth-hydrate
node scripts/test-dashboard-bounce-scenarios.mjs
```

## Handoff docs

- `docs/handoff/RESPONSE-2026-06-06-build-d1.3.9-session-cached-access-LATEST.md`
- `docs/handoff/RESPONSE-2026-06-06-build-d1.3.10-ms-read-consolidation-LATEST.md`

## Next work (post-baseline)

- G3 tile header icons
- D4 Abstract assignment cube → PDF
- Cube tracking checklist
