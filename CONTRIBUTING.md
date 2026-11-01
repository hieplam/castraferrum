# Contributing

## Language rule

Everything in the repository is English: code, identifiers, comments, tests, documentation, commit messages,
pull request titles and bodies, issues. Vietnamese appears in exactly one place, the Vietnamese UI texts in
`shared/i18n/vi.ts` (and the schedule sentences that go with them); tests that check Vietnamese output read their
expectations from that file. The scanner `node scripts/lang-scan.mjs` counts Vietnamese lines per folder and runs
inside `npm run verify` against the baseline in `scripts/lang-baseline.json`. The numbers may only go down: if a
change lowers them, lower the baseline in the same pull request.

The rule is enforced three ways. Git hooks in `.githooks/` (set up by `npm ci`, which runs the `prepare` script) refuse a
commit whose staged file names, added lines or message contain Vietnamese. CI runs `node scripts/lang-scan.mjs --history --coupling`
over every commit and, on pull requests, `--pr-event` over the title, body and branch name. No folder is skipped. The only exceptions are the locale file and, for the `--history` check only, the
exact (blob, line, kind) entries of file contents and (commit, line, kind) entries of commit messages listed in
`scripts/lang-history-allowlist.json`, each named by its full SHA, which pin the known hits in old commits.

## Design system

Every UI change, however small, is designed from the design system first: the system in `design/ds/`
(`SYSTEM.md`, `tokens.css`, `components.css`, the design-system page `index.html` and the preview). Use existing
tokens and components only. A
missing component, state, token or rule is an issue labelled `design-system` (template "Design system gap"), opened
before the feature is built; the system is extended first, with the owner's approval in `design/APPROVED.md`, or the
feature waits for that issue. From task U0 of epic #63 on, `npm run ratchets` runs in `verify` and CI: it fails on empty or missing tokens, on
contrast below the minimum, on literal values in the design-system CSS, on classes the system does not define, on
native `title` tooltips and on a drop in the number of e2e assertions. The limits live in `scripts/ratchets.json` and
may only move in the good direction. The pull request template asks which components a UI change used.

## Workflow

1. Work on a branch, one concern per branch; do not commit to `main`.
2. Run `npm ci` and make sure Postgres is up (`docker compose up -d`).
3. Make the change. A new behaviour starts with a failing test, and a bug fix starts with a test that shows the
   bug.
4. Run `npm run verify` locally. It must exit 0 before you open a pull request. CI runs only the checks that need no
   Claude login and no browser (language scan, `typecheck`, `arch`, `test:unit`, `build`, `test:contract`); the full
   `verify`, with the real-Claude e2e tests, stays local. A Playwright run needs `npm run build`
   first because the e2e server serves `dist/web`.
5. Open a pull request with a `## Verify` section that states the red command and output, the green command and
   output, and why an empty implementation would fail it. Squash-merge when green.

## Releases

Releases are cut by [release-please](https://github.com/googleapis/release-please) (`.github/workflows/release-please.yml`).
It reads the squash-merged commit messages on `main`, so a pull request title must follow
[Conventional Commits](https://www.conventionalcommits.org/): `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, and
`feat!: ...` or a `BREAKING CHANGE:` footer for a breaking change. Only `feat`, `fix` and breaking changes trigger a release.
release-please keeps an open release pull request that bumps `package.json`, `.release-please-manifest.json` and
`CHANGELOG.md`; merging it tags the release and publishes the GitHub release.

The project stays below 1.0.0: while the version is `0.x.y`, a breaking change bumps the minor (`0.1.0` to `0.2.0`),
a `feat` bumps the minor and a `fix` bumps the patch (`0.1.0` to `0.1.1`). Leaving 0.x is a deliberate decision,
made by merging a pull request whose commit carries a `Release-As: 1.0.0` footer.

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
