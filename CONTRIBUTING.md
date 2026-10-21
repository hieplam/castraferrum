# Contributing

## Language rule

Everything in the repository is English: code, identifiers, comments, tests, documentation, commit messages,
pull request titles and bodies, issues. Vietnamese appears in exactly one place, the Vietnamese UI texts in
`shared/i18n/vi.ts` (and the schedule sentences that go with them); tests that check Vietnamese output read their
expectations from that file. The scanner `node scripts/lang-scan.mjs` counts Vietnamese lines per folder and runs
inside `npm run verify` against the baseline in `scripts/lang-baseline.json`. The numbers may only go down: if a
change lowers them, lower the baseline in the same pull request.

## Workflow

1. Work on a branch, one concern per branch; do not commit to `main`.
2. Run `npm ci` and make sure Postgres is up (`docker compose up -d`).
3. Make the change. A new behaviour starts with a failing test, and a bug fix starts with a test that shows the
   bug.
4. Run `npm run verify`. It must exit 0 before you open a pull request. A Playwright run needs `npm run build`
   first because the e2e server serves `dist/web`.
5. Open a pull request with a `## Verify` section that states the red command and output, the green command and
   output, and why an empty implementation would fail it. Squash-merge when green.

Rules worth knowing:

- Never lower a test count (unit, contract, API, e2e) or `uc-coverage` (32/32). A change that adds a use case
  adds a row to [docs/USE-CASES.md](docs/USE-CASES.md), an e2e test tagged `@UC-NN` and raises `--min` in the
  `verify` script.
- Adding or changing an API route or error code updates [docs/API.md](docs/API.md) in the same pull request;
  `tests/api/api-surface.test.ts` fails otherwise.
- New code goes in the right layer ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Changing a layer rule means
  changing the table, `.dependency-cruiser.cjs` and adding a deliberately violating file to
  `tests/arch-fixtures/` carrying the rule marker that `scripts/arch-lib.mjs` documents, in the same pull request.
- A schema change goes through `npm run db:generate`; commit the generated SQL.
- Never run `docker compose down -v` or remove the volume `loop_console_pg`: it holds real loop history.
- Do not run `docker compose up` from a second checkout against a running console: it recreates the container.

## Tests that need a real Claude login

Most tests are hermetic. These call the real Claude Code with the haiku model at low effort, in a temporary
directory named `lc-real-claude-*`, and cost a few cents:

- the e2e tests for UC-22 (real Claude run) and UC-26 / UC-27 (transcripts of a running and a finished run),
  which run as part of `npm run test:e2e`; Claude Code must be installed and logged in;
- the real-Claude cases of the executor contract and `claude-agent-executor.real.test.ts`, which only run with
  `LC_REAL_CLAUDE=1`, for example
  `LC_REAL_CLAUDE=1 npx vitest run --project unit server/adapters/executors/claude/claude-agent-executor.real.test.ts`.

Everything else uses a fake `query`, an in-memory repository, a mock executor or a fake Claude
(`lc-fake-claude-*` directories) and needs no login.

## Where things are

See the folder table in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Unit tests sit next to the code as
`*.test.ts`; tests that need the database or a browser live in `tests/`.
