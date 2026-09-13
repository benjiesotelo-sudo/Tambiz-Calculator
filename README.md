# Tambiz

Judging, results and individual grades for the annual Tambiz awarding in MGT1114 Business Plan 2, FEU Manila.

This repository holds two things:

| What | Where | Status |
|---|---|---|
| **The hosted Tambiz app** (Next.js, TypeScript, Postgres) | `src/`, deployed on Vercel | First working version |
| **The original single-file calculator** | `index.html` | Unchanged. It is the authority on the scoring rules and the fallback if the app is unavailable: open it in any browser. |

The coordinator's click-by-click guide is [`docs/how-to-run-an-event.md`](docs/how-to-run-an-event.md).

## What the app does

- **Coordinator** (admin): creates the year's event, imports the class roll and adviser list from Excel, creates groups and chooses their members from the roll, creates judge accounts, watches judging progress, closes judging, reads results and grades, and downloads the Excel workbook.
- **Judges**: sign in on a phone, pick Defense or Booth, pick a group, and score one category per screen with the maximum printed beside every box. A score above the maximum is refused with a message. Review lists every blank and error with a Go button, and “Mark group complete” stays locked until the sheet is clean. Defense judges also score each member. Scores are kept on the phone the moment they are typed and sent in the background.
- **Results**: every category percentage with its rank, the defense and booth halves, the overall score and rank, a top-10 leaderboard per category, and each student's member total, final grade and letter grade.

Scoring is a direct port of `index.html`; see `src/lib/scoring.ts`. Overall = Defense × 0.7 + Booth × 0.3, every category weighs the same within its half, and a final grade is rounded **up** to a whole number before its letter is looked up (84.5 → 85 → B+).

## Run it on your computer

Needs Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, the app uses PGlite (a real Postgres compiled to WebAssembly) stored in `.local-db/`, and fills it with a sample event the first time it starts.

Delete `.local-db/` to start again from the sample data.

### Sample sign-ins

The sample data creates one coordinator and three judges. Their passwords come from `SEED_ADMIN_PASSWORD` and `SEED_JUDGE_PASSWORD` when those are set (applied on every server start); otherwise the password is `tambiz-demo-2027`.

| Role | Email |
|---|---|
| Coordinator | `admin@tambiz.demo` |
| Judge | `judge1@tambiz.demo`, `judge2@tambiz.demo`, `judge3@tambiz.demo` |

**Change these passwords (Account → Change password) before any real student data goes in.** The sample event, groups, students and advisers are invented.

## Tests

```bash
npm test
```

- `tests/golden.test.ts`: the 14 reference answers taken from the original `index.html` (design research, `evidence/golden-rules.js`), plus the letter-grade rounding rule.
- `tests/crosscheck.test.ts`: runs the original scoring functions extracted from `index.html` on 40 random events and checks the new code gives identical percentages and ranks.

## Deploy to Vercel with Neon

1. **Create the database.** In Neon, create a project in the Singapore region (AWS ap-southeast-1). Copy the connection string (it starts `postgresql://` and ends `?sslmode=require`). In the project settings, cap autoscaling at 1 compute unit.
2. **Create the tables and the sample data.** On your computer, in this folder:
   ```bash
   DATABASE_URL="postgresql://…your connection string…" SEED_ADMIN_PASSWORD="a long coordinator password" SEED_JUDGE_PASSWORD="a long judge password" npm run db:setup
   ```
   It prints `Database ready (Postgres from DATABASE_URL): 4 accounts, 1 events.` Running it again is safe: it only adds missing tables and never duplicates the sample data. (The app also runs this set-up by itself on its first request, so this step is optional, but running it yourself shows any connection problem straight away.)
3. **Create the Vercel project.** In Vercel, choose Add New → Project, import this GitHub repository, and keep the detected framework (Next.js) and default build settings.
4. **Set the environment variables** (Project → Settings → Environment Variables, for Production and Preview):

   | Name | Value | Required |
   |---|---|---|
   | `DATABASE_URL` | The Neon connection string | **Yes.** Without it the deployed app runs on a temporary in-memory database that is wiped whenever Vercel restarts it. |
   | `SEED_ADMIN_PASSWORD` | Password for `admin@tambiz.demo` | Recommended. See “Changing the sample account passwords” below. |
   | `SEED_JUDGE_PASSWORD` | Password for the three sample judges (`judge1@`, `judge2@`, `judge3@tambiz.demo`) | Recommended. Same. |

   If you use Vercel's Neon integration instead of pasting the string, it creates `DATABASE_URL` for you. Turn off “create a database branch for every preview deployment”; the free plan allows only 10 branches.
5. **Deploy.** Press Deploy, open the address Vercel gives you, and sign in as the coordinator.
6. **Before real data:** change the coordinator password, remove or reset the sample judges, and create the real event.

### Changing the sample account passwords

`SEED_ADMIN_PASSWORD` and `SEED_JUDGE_PASSWORD` are applied every time the server starts, not only when the database is first filled:

1. In Vercel, change the variable's value (Project → Settings → Environment Variables).
2. Redeploy (Deployments → the latest one → Redeploy).
3. On its first request, the app compares each sample account's stored password with the variable. Where they differ, it stores the new password, clears any lockout, and signs that account out everywhere. The server log says which accounts changed.

While a variable is set, it wins: a password someone changed under **Account** is put back to the variable's value on the next server start. If you would rather people keep the passwords they choose, delete the variable and redeploy. Judge accounts created on the Judges tab are never touched by these variables.

### Database migrations

The schema is in `src/lib/schema.ts`. Every statement is idempotent (`CREATE TABLE IF NOT EXISTS`, and `ADD COLUMN IF NOT EXISTS` for future changes), and it runs automatically on each server start. To apply it by hand, run `DATABASE_URL=… npm run db:setup`.

### Emergency password reset

If the coordinator password is lost:

```bash
DATABASE_URL="postgresql://…" npm run reset-password -- admin@tambiz.demo "a new long password"
```

## Where things are

| Path | What |
|---|---|
| `src/lib/scoring.ts` | Every scoring rule, ported from `index.html` with line references |
| `src/lib/rubric.ts` | The default scoring sheet (maximums, weights, member fields, letter-grade bands). Each event stores its own copy. |
| `src/lib/db.ts` | The only module that talks to the database (Neon when `DATABASE_URL` is set, PGlite otherwise) |
| `src/lib/schema.ts` | Tables |
| `src/lib/repo.ts` | Shared reads, and the whole-event report used by results, grades and export |
| `src/lib/excel-import.ts`, `src/lib/excel-export.ts` | Class roll and adviser import; the workbook export (ExcelJS) |
| `src/components/ScoreSheet.tsx` | The judge scoring screen |
| `src/app/admin/actions.ts` | Every coordinator change, each checking the caller is the coordinator |
| `src/app/api/judge/sheet/route.ts` | Where judges' scores arrive; refuses anything above a maximum |

## Real student data

Real student names, numbers, emails and grades must never be committed to this repository. `.gitignore` blocks Excel and CSV files, `.env*.local` and the local database folder.
