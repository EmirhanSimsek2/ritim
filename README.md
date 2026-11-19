# Ritim

A full-stack personal study, day-planning, habit, and daily reflection tracker built for an Electrical & Electronics Engineering semester on **React 19**, **TypeScript**, **Cloudflare Workers**, and **Cloudflare D1 (SQLite)**.

> **Live Interactive Preview (No Login Required):** [ritim-habit-tracker.sotm-proje-merkezi.workers.dev/onizleme](https://ritim-habit-tracker.sotm-proje-merkezi.workers.dev/onizleme)  
> *Note: The application UI is in Turkish, designed for a personal academic workflow. The `/onizleme` preview route runs entirely in-memory with sample data and resets on reload.*

## Features

- **Day View (`Günüm`)**: Log study sessions (duration, topic, method, self-rated focus, learning outcome, attempted/correct questions, obstacles) and untimed/timed non-study activities, plus sleep intervals, morning/evening mood & energy, book reading, and daily learnings (*"Bugün neler öğrendim?"*).
- **Focus Timer (`Odaklan`)**: Persistent stopwatch and 25-minute Pomodoro timer synced through account state, with direct saving into study logs or scheduled plan blocks.
- **Day Planner (`Gün planı`)**: Agenda and interactive hourly timeline with drag/resize blocks, 15-minute keyboard adjustments, day templates, overdue backlog (*"Geçmişten kalanlar"*), atomic block rescheduling (`planMoves`), and completion outcomes.
- **Goal Periods (`Hedeflerim`)**: Weekly total or daily-schedule study targets per course, daily reading/sleep targets, and immutable historical goal periods (`goalHistory`).
- **Habit Tracker (`Alışkanlıklar`)**: Build/break habits with cue, environment, minimum step, schedule revisions (`reviseSchedule`), pause ranges, daily status logging, and weekly reviews.
- **Weekly Overview & Courses (`Haftalık bakış`, `Dersler & takvim`)**: Weekly study breakdown, focus/question accuracy stats, habit matrix, weekly learnings roll-up, course totals, and syllabus exam tracking.
- **Backup & Appearance**: Full JSON export, chunked transactional backup import, and 6 color palettes with dark/light/system modes.

## Tech Stack & Engineering Highlights

- **Frontend**: React 19, TypeScript (`strict: true`), Vite, Zod, `lucide-react`, PWA manifest & custom responsive CSS.
- **Backend**: Cloudflare Workers (`worker/index.ts`, `worker/import.ts`) + Cloudflare D1 (`migrations/`).
- **Optimistic Concurrency**: Diff-based patches (`src/lib/patch.ts`) and atomic `D1.batch()` revision checks (`HTTP 409` conflict protection) prevent stale tabs from overwriting newer data.
- **Shared Validation**: Identical Zod schemas validate data on the client, API boundaries, and staged backup imports.
- **Testing**: 107 automated unit and Worker/D1 integration tests using Node's native `--experimental-strip-types --test` runner and an in-memory `node:sqlite` D1 adapter.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details on the data model, revision locking, chunked import pipeline, and security model.

## Project Structure

```text
├── src/                  # React UI, components, CSS themes, and pure domain logic (src/lib/)
├── worker/               # Cloudflare Worker API router and staged backup importer
├── migrations/           # D1 SQLite schema migrations
├── public/               # PWA manifest, app icons, pre-paint theme script, CSP headers
├── tests/                # Unit & Worker/D1 integration tests (*.test.mjs) + sqlite-d1 helper
├── scripts/              # Utility scripts (login key hash generator, SVG-to-PNG icon generator)
├── docs/                 # Technical architecture notes
├── wrangler.example.jsonc
└── .dev.vars.example
```

> **Course Configuration:** Semester courses are currently defined in `COURSES` inside [`src/lib/model.ts`](src/lib/model.ts) alongside the term anchor in [`src/lib/exams.ts`](src/lib/exams.ts).

## Local Development

### Prerequisites
- Node.js **24+** (uses `--experimental-strip-types` and `node:sqlite` for tests)
- npm

### 1. Install dependencies & run checks

```bash
npm install
npm test
npm run build
```

`npm run build` runs `tsc --noEmit` followed by `vite build`.

### 2. Configure local Worker environment

1. Copy templates:
   ```bash
   cp wrangler.example.jsonc wrangler.jsonc
   cp .dev.vars.example .dev.vars
   ```
2. Generate a personal login key and write its SHA-256 digest to `.dev.vars`:
   ```bash
   node scripts/generate-login-key.mjs --write-local
   ```
3. Apply local D1 migrations and start the Worker dev server:
   ```bash
   npx wrangler d1 migrations apply ritim-db --local
   npm run dev
   ```
   Open `http://127.0.0.1:5174` (or `http://127.0.0.1:5174/onizleme` for the no-login demo).

## Deploying to Cloudflare

1. Create a D1 database (`npx wrangler d1 create ritim-db`) and fill in `account_id` and `database_id` in your local `wrangler.jsonc` (gitignored).
2. Apply remote migrations:
   ```bash
   npx wrangler d1 migrations apply ritim-db --remote
   ```
3. Set the production login key hash secret:
   ```bash
   npx wrangler secret put LOGIN_KEY_HASH
   ```
4. Build and deploy:
   ```bash
   npm run deploy
   ```

## License

[MIT](LICENSE)
