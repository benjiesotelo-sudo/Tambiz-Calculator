<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

- `index.html` is the original single-file calculator and the authority on scoring. Never edit it; `tests/crosscheck.test.ts` extracts its functions to check `src/lib/scoring.ts`.
- Any scoring change must keep `npm test` green (golden cases + cross-check). Rules are listed with `index.html` line numbers in `src/lib/scoring.ts`, which also records where the coordinator's decisions deliberately differ (blanks never zero, `round2` everywhere, ties by overall); golden tests name the old answer for each difference.
- All database access goes through `src/lib/db.ts`: Neon when `DATABASE_URL` is set, PGlite in `.local-db/` otherwise; Vercel previews ignore `DATABASE_URL` unless `TAMBIZ_PREVIEW_DATABASE=1`. Schema changes go in `src/lib/schema.ts`, must stay idempotent (it runs on every cold start) and additive, because the live database may get them before the code that uses them.
- `.env.local` in a worktree can hold the live Neon `DATABASE_URL`, and `next dev`/`next build` load it. Run locally with `DATABASE_URL= DATABASE_URL_POOLED= npx next dev` (an empty value is never overridden) and never against Neon without the captain's say-so.
- Every page, server action and API route checks the caller's role itself (`requireAdmin` / `requireJudge` in `src/lib/auth.ts`); do not rely on middleware.
- Scores above a criterion's maximum are refused (client `checkScore`, server `refuseReason` in `src/lib/sheet.ts`), never clamped.
- Real student data must never be committed; `.gitignore` blocks `.xlsx`, `.csv` and `data/` directories, so do not name source folders `data`.
- Coordinator how-to: `docs/how-to-run-an-event.md`. Deployment: `README.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
