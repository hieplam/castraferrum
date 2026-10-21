# Castraferrum

Castraferrum is a local web UI that runs and watches agent loops. A loop is a prompt, a cron schedule and a
repository: every time the schedule fires, the console starts one fresh Claude Code session in that repository,
streams its log and transcript to the browser, and keeps the history (runs, session ids, cost, summaries) in
PostgreSQL. Start and Stop are the only controls; when the server restarts, every loop stops and nothing runs
again until a person presses Start.

## Requirements

- Node 24 or newer (`node --version`).
- Docker (Docker Desktop on Windows and macOS) for PostgreSQL only.
- Claude Code installed and logged in on the same machine. The console uses that login; it never uses an
  `ANTHROPIC_API_KEY`.

## Quickstart

```bash
npm ci
docker compose up -d
npm run build
npm start
```

Then open <http://127.0.0.1:7070>. `npm ci` also downloads Chromium for the Playwright tests (about 150 MB the
first time). `docker compose up -d` starts Postgres on `127.0.0.1:55432` with the databases `loops` (real use)
and `loops_test` (tests). To serve on another port, set `LOOPS_PORT` before `npm start`:

```bash
LOOPS_PORT=7170 npm start      # PowerShell: $env:LOOPS_PORT = '7170'; npm start
```

The server does not start by itself: leave the `npm start` window open while you use the UI. The UI is served
from `dist/web`, so rerun `npm run build` after pulling new code. The first thing to do in the UI is register a
repository on the Repo page (the **Browse...** button picks a folder), then create a loop that uses it.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Real server: API and the built UI (`dist/web`) on `127.0.0.1:7070`, database `loops` |
| `npm run dev` | API with `tsx watch` on 7070 plus the Vite dev server on `127.0.0.1:5180` (proxies `/api`) |
| `npm run build` | Build the UI into `dist/web` |
| `npm run verify` | The full gate: typecheck, language scan baseline, `arch`, unit, contract, API, `api-smoke`, build, e2e, `uc-coverage --min 32` |
| `npm run typecheck` | Strict `tsc` for server, shared and tests, and for the UI |
| `npm run arch` | Layer rules: prints `dependency-cruiser: N violations` (must be 0) and `arch-fixtures: k/k violations caught` |
| `npm test` | All Vitest projects |
| `npm run test:unit` | Unit tests that sit next to the code and in `tests/tools` |
| `npm run test:contract` | The repository contract suite on the in-memory double and on Postgres, and the executor contract suite |
| `npm run test:api` | API tests against the real composition and Postgres `loops_test` |
| `npm run api-smoke` | Starts the real `server/main.ts`, walks the whole life cycle over HTTP, kills and restarts it |
| `npm run test:e2e` | Playwright: starts its own server on `127.0.0.1:7071` from the build (run `npm run build` first) |
| `npm run uc-coverage -- --min k` | Counts the use cases with a green e2e test (k/32) from `reports/e2e.json`; exits 1 below `k` |
| `npm run design:compare` | Real app next to the approved reference screens, with per-region pixel diffs |
| `npm run design:shots` / `design:states` | Regenerate and check the reference screens |
| `npm run db:generate` | Generate a SQL migration from `server/adapters/postgres/schema.ts` (commit the result) |
| `npm run bench:transcript` | Timing of the transcript reader on large files |
| `node scripts/lang-scan.mjs` | Language and coupling scanner behind the baseline in `scripts/lang-baseline.json` |
| `scripts/restart-console.ps1` | Windows helper: stop loops, rebuild, restart the server, start the same loops again |

## Configuration

Defaults work with no configuration. To change ports copy `.env.example` to `.env`; compose, the server, Vitest
and Playwright all read it.

| Variable | Default | Meaning |
|---|---|---|
| `LOOPS_PORT` | 7070 | API and UI port |
| `LOOPS_PG_PORT` | 55432 | Postgres port on the host |
| `LOOPS_E2E_PORT` | 7071 | Port of the e2e server |
| `DATABASE_URL` | derived from `LOOPS_PG_PORT` | Use when Postgres is elsewhere |
| `LOOPS_TEST_DATABASE_URL` | derived from `LOOPS_PG_PORT` | Test database |
| `LOOPS_COMPOSE_PROJECT` | `loop-console` | Docker Compose project name |
| `LOOPS_PG_CONTAINER` | `loop_console_pg` | Name of the Postgres container |
| `LOOPS_PG_VOLUME` | `loop_console_pg` | Name of the Postgres data volume (the default holds real loop history) |

`LOOPS_TEST_MODE=1` works only with a database whose name ends in `_test`. Several checkouts can run tests in
parallel on one container if each one sets its own `LOOPS_TEST_DATABASE_URL` and `LOOPS_E2E_PORT`.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, flows, persistence, tests.
- [docs/USE-CASES.md](docs/USE-CASES.md): the 32 use cases.
- [docs/API.md](docs/API.md): the HTTP surface.
- [docs/adr/](docs/adr/): decision records.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on the code.
