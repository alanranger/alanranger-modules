# Copy-paste prompt for a new Cursor chat

Copy everything inside the fenced block below into a **new Cursor chat** to continue Academy work without losing context.

---

```
You are continuing Alan Ranger Photography Academy front-end work (Squarespace snippets + build scripts). Read these files IN ORDER before changing anything:

1. docs/handoff/CURSOR-AGENT-HANDOVER.md — master handover (dashboard + Claude loop + paste map)
2. docs/handoff/FOUNDATION-PAGE-HANDOVER-LATEST.md — Modules Map page (FP 1.0.43)
3. CHANGELOG.md — top entries for recent versions

Repo: G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment
Remote: https://github.com/alanranger/alanranger-modules.git (branch main)
Latest commit: a96ace3 (FP 1.0.42). Local uncommitted: FP 1.0.43 divider text + handover docs — verify git status first.

## What we are building

Squarespace HTML snippets for the member Academy:
- Dashboard (/academy/dashboard): Header H, Strip S, Dashboard D, Bookmark B on blog articles
- Modules Map (/academy/online-photography-course): Foundation page FP (separate self-contained snippet)
- Vercel API at alanranger-modules.vercel.app for exams, tracking, engagement

Git push deploys API only. Snippets require Alan to manually paste into Squarespace + hard refresh.

## Current snippet stamps (repo — verify after paste on live site)

| Block | Version | Paste location |
|-------|---------|----------------|
| FP | 1.0.43 | Modules Map page Code Block |
| H | 1.4.33 | Settings → Code Injection → Header |
| S | 1.3.56 | /academy/dashboard Code block 1 |
| D | 1.3.27 | /academy/dashboard Code block 2 |
| B | 1.3.16 | Blog/article template |

Foundation page: ALWAYS edit scripts/build-foundation-page-snippet.mjs then run `node scripts/build-foundation-page-snippet.mjs` — never hand-edit the generated HTML.

## Foundation page state (FP 1.0.43)

- Collapsible everything with identical top-left chevron + "hide me"/"show me"
- Defaults: headline + hiw expanded; only "15 camera settings" expanded; all else collapsed
- Exams: trial-accessible, ABOVE members divider, collapsible
- ONE gold divider: "Paid Members-only modules & resources" / annual membership subline
- Below divider: Practice Packs → Checklists → Applied Learning → RPS (all collapsible, trial-locked tiles)
- Progress labels unified: N/total opened (trial: Paid only · 0/N opened)
- Google reviews badge in FP header (Elfsight); no separate "Leave a review" strip
- sessionStorage: ar-fp-collapse-v1; edit mode forces all expanded

## Dashboard state (recent)

- D 1.3.27: catalog metrics stacked under progress gauge (tiles-help row)
- S 1.3.56 / H 1.4.33: journey strip aligned to dashboard column
- B 1.3.16: "Browse the Modules" CTA label
- Auth: __arMsReader consolidation + session cache (B3 login bounce fixed — do not regress)

## Claude ↔ Cursor workflow

When Alan says "check claude":
1. Read C:/Users/alan/Google Drive/Claude shared resources/Claude Questions for Cursor/ for QUESTION-*.md with status: pending
2. Implement, write RESPONSE-*-LATEST.md to Cursor Outputs for Claude/
3. Move question to processed/, run: node "G:/Dropbox/alan ranger photography/Website Code/Chat AI Bot/scripts/claude-cursor-handoff/update-handoff-manifest.mjs"
4. BUILD questions: commit + push via GitKraken MCP (not shell git write)
5. Give Alan a paste table with expected version stamps

Inbox was empty at last handover (2026-06-08).

## Rules

- Minimize scope; match existing code style; complexity ≤15 per function
- British English; hyphens not em dashes in visible UI copy unless Alan quotes exact text
- Only commit when Alan explicitly asks (unless Claude BUILD handoff says commit+push)
- Never commit .env, supabase/.temp/, debug PNGs
- Do not use ROLLBACK-* files as paste targets

## Likely next tasks

- Commit + push FP 1.0.43 if Alan wants it in git
- Confirm Alan has pasted FP 1.0.43 live and visually verify trial vs paid labels
- Process new Claude inbox questions when they arrive
- Dashboard backlog (verify live with Alan): G3 garbled icons, D4 abstract PDF cube, cube open tracking end-to-end

Start by confirming git status and whether Alan needs paste instructions or new feature work.
```
