# Castraferrum

Castraferrum is a UI that runs, watches and manages agent loops. A loop is a prompt, a cron schedule and a
repository. Each time the schedule fires, one new Claude Code session starts in that repository.

## How it works

```mermaid
flowchart TB
  ui["Browser: React UI<br/>web/"]

  subgraph node["Node server, one process on 127.0.0.1:7070"]
    http["HTTP API<br/>server/http/ (Fastify)"]
    ticker["Ticker, runs every 1 second<br/>server/scheduler/"]
    loopsvc["LoopService<br/>Start, Stop, edit"]
    sched["SchedulingService<br/>finds the loops that are due"]
    run["RunService<br/>controls one run from start to finish"]
    executor["ClaudeAgentExecutor<br/>server/adapters/executors/claude/"]
    bus["In-process event bus"]
    streams["LiveService, TranscriptService<br/>SSE streams through server/http/"]
  end

  db[("PostgreSQL in Docker<br/>loops, runs, logs, next_run_at")]

  subgraph machine["Same machine, with the Claude Code login"]
    session["Claude Code session<br/>one per run, cwd is the repository"]
    repo[/"Registered repository"/]
    jsonl[/"Session file<br/>~/.claude/projects/*/*.jsonl"/]
  end

  ui -- "1. create, Start" --> http
  http --> loopsvc
  ticker -- "2. every second" --> sched
  loopsvc -- "1. first run" --> run
  sched -- "2. run of a due loop" --> run
  run -- "3. insert the run<br/>5. store logs and result" --> db
  run -- "4. execute()" --> executor
  executor -- "4. Agent SDK" --> session
  session -- "edits, commits" --> repo
  session -- "writes" --> jsonl
  run -- "5. publish" --> bus
  bus -- "5" --> streams
  jsonl -- "6. follow the file" --> streams
  streams -- "5, 6. SSE" --> ui
```

Each number on an arrow is a step in this list:

1. The engineer creates a loop in the UI and presses Start. `LoopService` opens an execution (one Start-to-Stop
   span) and starts the first run.
2. Every second, the ticker calls `SchedulingService`. `SchedulingService` reads `next_run_at` from PostgreSQL,
   moves it forward and asks `RunService` for a run of each loop that is due.
3. `RunService` inserts the run. A database trigger rejects the insert when the loop is at `max_concurrent`, and
   `RunService` then records a `skipped` run. PostgreSQL holds this rule, so two ticks cannot both start a run.
4. `ClaudeAgentExecutor` starts Claude Code through the Agent SDK. The session works in the registered repository
   with the Claude Code login of the machine. The run ends when Claude Code exits.
5. `RunService` stores each log line and the final result in PostgreSQL and publishes an event for each change.
   `LiveService` sends those events to the browser over Server-Sent Events (SSE).
6. Claude Code writes its own session file. `TranscriptService` reads that file and streams it to the UI, so
   PostgreSQL holds no copy of the transcript.

The server is one Node process. At startup, `RecoveryService` marks each run that was still `running` as
`interrupted` and sets all loops to Stopped, so a person always starts them again. Each service calls interfaces
in `server/ports/`, and `server/compose.ts` is the only file that connects them to implementations. The details
are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Screens

![The Loops page (light)](design/ds/preview/shots/loops-overview-light.png)

![A running loop (dark)](design/ds/preview/shots/loop-running-dark.png)

The screens follow the design system in [design/ds/](design/ds/) ([SYSTEM.md](design/ds/SYSTEM.md), the
design-system page `design/ds/index.html` and the approved preview `design/ds/preview/`); see
[design/README.md](design/README.md).

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
repository on the Repos page (**Add a repo** opens a folder picker), then create a loop that uses it.

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
- [docs/USE-CASES.md](docs/USE-CASES.md): the use cases.
- [design/README.md](design/README.md): the design system and how a UI change starts from it.
- [docs/API.md](docs/API.md): the HTTP surface.
- [docs/adr/](docs/adr/): decision records.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on the code.
