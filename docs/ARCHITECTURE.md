# Architecture

Ritim is a single-owner full-stack web application deployed as static React assets paired with a Cloudflare Worker API backed by Cloudflare D1 (SQLite).

## System Overview

```text
React 19 + TypeScript SPA (dist/)
   │
   │  JSON patches, chunked backup import, cookie auth (/api/*)
   ▼
Cloudflare Worker (worker/index.ts, worker/import.ts)
   │
   │  Atomic D1 batches + shared Zod validation (src/lib/*.ts)
   ▼
Cloudflare D1 / SQLite (migrations/0001_initial.sql, 0002_habits.sql)
```

- **Frontend (`src/`)**: React 19, TypeScript, Vite, Lucide icons, and custom CSS themes (6 palettes with light/dark/system modes applied pre-paint via `public/theme.js`).
- **Backend (`worker/`)**: Handles authentication (`/api/login`, `/api/logout`, `/api/session`), state sync (`GET/PUT /api/state`), and staged backup imports (`/api/import/*`). All non-`/api/*` routes fall back to the SPA `ASSETS` fetcher.
- **Database (`migrations/`)**: Stores configuration/revision metadata in `tracker_meta`, study/activity logs in `tracker_entries`, daily records (sleep, reading, mood/energy, planner blocks, plan moves, daily learnings) in `tracker_days`, habit logs in `tracker_habit_days`, sessions/rate-limits in `sessions` and `login_attempts`, and staged imports in `import_*` tables.

## Key Engineering Decisions

### 1. Diff-Based Patches & Optimistic Concurrency Control
Instead of overwriting the entire state blob on every edit, `getPatch()` (`src/lib/patch.ts`) computes a minimal diff (`config`, `entries`, `days`, `habitDays`) capped at 35 record mutations per request.

On `PUT /api/state`, the Worker assigns a `mutation` UUID and executes a single `env.DB.batch(...)`:
1. Increments `revision` in `tracker_meta` only if `revision = ?` matches the client's base revision, storing `last_mutation`.
2. Guards every subsequent `INSERT` / `UPDATE` / `DELETE` statement in the batch with `WHERE EXISTS (SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)`.
3. Returns HTTP `409` if `result[0].meta.changes === 0`, preventing silent overwrites across open tabs or devices.

### 2. Shared Validation & Future-Date Guards
Zod schemas in `src/lib/model.ts`, `src/lib/timeline.ts`, and `src/lib/patch.ts` run both on the client and inside the Worker. In addition to structural validation, `PUT /api/state` enforces domain invariants:
- Sleep intervals are validated with `getSleepError()`.
- Past goal periods in `goalHistory` are protected against retroactive mutation (`protectGoalHistory()`).
- Future dates (`date > today()`) accept only `planned` timeline blocks; study/activity entries, habit logs, daily journals, reading logs, and daily learnings on future dates are rejected with HTTP `400`.
- Additive day fields (`blocks`, `planMoves`, `learnings`) omitted by older open clients are preserved from D1 rather than cleared.

### 3. Chunked Backup Import Within Worker Limits
Restoring large JSON backups (`src/lib/import-backup.ts`, `src/lib/import-chunks.ts`, `worker/import.ts`) splits entries, days, and habit days by byte budget into staged `/api/import/*` requests (`import_jobs`, `import_entries`, `import_days`, `import_habit_days`). During final confirmation, `stagedSleepError()` pages through staged days within bounded payload sizes and query counts before atomically swapping the live tables.

### 4. Authentication & Security Headers
- Single-owner login uses a high-entropy key (`32–200` chars) compared via SHA-256 and a constant-time equality check against the `LOGIN_KEY_HASH` secret.
- Login attempts are rate-limited per IP in 15-minute buckets (`429` after 10 failed attempts).
- Sessions use `HttpOnly; SameSite=Strict` cookies (with `Secure` on HTTPS), paired with same-origin checks on state-mutating `/api/*` requests and strict CSP headers in `public/_headers`.

## Verification Strategy

Unit and integration tests (`npm test`) run directly via Node's native test runner (`--experimental-strip-types --test`) with no external test framework. Worker and import tests use `tests/helpers/sqlite-d1.mjs`, which wraps Node's built-in `node:sqlite` and enforces D1 query-count budgets (`maxQueries`) across the real SQL migrations.
