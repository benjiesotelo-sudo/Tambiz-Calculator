<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

- `index.html` is the original single-file calculator and the authority on scoring. Never edit it; `tests/crosscheck.test.ts` extracts its functions to check `src/lib/scoring.ts`.
- Any scoring change must keep `npm test` green (golden cases + cross-check). Rules are listed with `index.html` line numbers in `src/lib/scoring.ts`, which also records where the coordinator's decisions deliberately differ (blanks never zero, `round2` everywhere, ties by overall, only submitted sheets count via `countingSheets`, an absent member's unscored fields are zero); golden tests name the old answer for each difference.
- The app is deliberately small (captain's cut-back, 17 September 2026): one workbook in, seven coordinator tabs (`src/components/EventNav.tsx`), two files out. Do not add screens, files to prepare, or student/adviser sign-ins without the captain's say-so.
- The workbook's columns are named only in `src/lib/data-workbook.ts`; the importer, the template and "Download current data" all read that list. `src/lib/data-upload.ts` never deletes a person and never writes a score table; `tests/upload.test.ts` holds that line.
- `event.released_at` now means "the email file was downloaded": from then nothing may change (`src/lib/locks.ts`). Judge passwords are never stored readable; they are shown once (`SignInSlips`). Email wording lives only in `src/lib/messages.ts`.
- Every coordinator table is the one spreadsheet table `src/components/DataGrid.tsx` (browser-free logic and types in `src/lib/grid.ts`). Saves go through `src/app/admin/table-actions.ts`, which applies the same rules as the forms and returns only the changed rows; row shapes live in `src/lib/tables.ts`. Judge screens do not use it.
- All database access goes through `src/lib/db.ts`: Neon when `DATABASE_URL` is set, PGlite in `.local-db/` otherwise; Vercel previews ignore `DATABASE_URL` unless `TAMBIZ_PREVIEW_DATABASE=1`. Schema changes go in `src/lib/schema.ts`, must stay idempotent (it runs on every cold start) and additive, because the live database may get them before the code that uses them.
- `.env.local` in a worktree can hold the live Neon `DATABASE_URL`, and `next dev`/`next build` load it. Run locally with `DATABASE_URL= DATABASE_URL_POOLED= npx next dev` (an empty value is never overridden) and never against Neon without the captain's say-so.
- Every page, server action and API route checks the caller's role itself (`requireAdmin` / `requireJudge` in `src/lib/auth.ts`); do not rely on middleware.
- Groups are known by name alone (captain's decision, 15 September 2026): uniqueness is `tgroup.name_key` per event, and messages name the clashing group. `tgroup.code` is a legacy nullable column kept only for stored values; never read, write or show it.
- Scores above a criterion's maximum are refused (client `checkScore`, server `refuseReason` in `src/lib/sheet.ts`), never clamped.
- Real student data must never be committed; `.gitignore` blocks `.xlsx`, `.csv` and `data/` directories, so do not name source folders `data`.
- Look and feel (captain's premium finish, 18 September 2026): the palette, spacing scale, radii and rules (gold at most once per screen, green only on what is pressed, the alert colour only for trouble, motion off under `prefers-reduced-motion`) are the tokens and header comment of `src/app/globals.css`; brand images live in `src/assets/brand/` (the orange IABF crest only on the white sign-in card). The Data tab uploads through `src/app/api/admin/events/[id]/upload/route.ts`, which runs the same `uploadWorkbookFile` as the `uploadWorkbook` action and streams real progress.
- Coordinator guide: the illustrated manual in `docs/manual/` (HTML source, images, PDF; rebuild steps in its README); a change to a screen or rule means updating it too. `docs/how-to-run-an-event.md` only points there. Deployment: `README.md`. Its pictures use invented data only; the private copy with account details lives outside the repository.
- MIT covers the code, not the marks: the FEU and IABF images in `src/assets/brand/` are FEU's (`NOTICE`).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
