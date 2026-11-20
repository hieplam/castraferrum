# Remote access: evidence log

Every task of the remote-access plan appends a section here: commands and literal output only.

## R1

- `main` SHA: `31b5babb4fc4ddff1b26b00661cfdf669f21bfed` (31b5bab, release 0.9.0). Date of the runs: 2026-11-18.
- Environment: a cloud container with Node 24, a local Postgres 16 on `127.0.0.1:55432` (no docker), Chromium build
  1243 mapped to the pinned revision 1248, no WebKit, no Claude login. Baseline run: a detached worktree of `main`
  with `LOOPS_TEST_DATABASE_URL=.../loops_base_test` and its own e2e port. Task run: the branch, default
  `loops_test`, e2e port 7071.

### Baseline (`npm run verify` on `main`)

- exit code `1`, at the e2e step (`phone:check` and `uc-coverage` did not run).
- ratchets: `ratchets: ok`; rule-lint: `rule-lint: ok (rule lines 18, without a check 7, new 0)`
- unit: `Tests  1366 passed | 4 skipped (1370)` (`Test Files  98 passed | 1 skipped (99)`)
- contract: `Tests  276 passed (276)`
- api: `Tests  446 passed | 2 skipped (448)` (`Test Files  42 passed (42)`)
- api-smoke: `... sessionIds of execution #1 = 1, #2 = 1 ok`
- e2e: `45 failed`, `29 did not run`, `118 passed (13.8m)`. The 45 failures are limits of this container, not defects
  of `main`: 34 `[visual]` pixel diffs (Chromium 1243 instead of the pinned 1248 renders about 0.6 to 1 % off),
  6 `[webkit-phone]` (no WebKit), 2 `[iphone-lan]` (WebKit) and 3 `[chromium]` (UC-30 and UC-26 need a real Claude
  login; UC-19 runs the Claude executor). The list is below.
- Decision (standing rules, recorded by the coordinator): in this container the bar is like for like. Every step
  before e2e is green, the e2e failure list is the same as the baseline list with no new failing test, and the new
  tests pass. `phone:check` and `uc-coverage` run in CI and on the owner's machine.

### Red

- `npx vitest run --project unit server/config.test.ts` (credentials block, before `credentials()`):
  `Tests  8 failed | 33 passed (41)`, for example `--username and --password turn sign-in on, in the = form and the
  space form` (`auth` is `undefined`), the precedence case, the one-sided cases (a username alone must throw `--password is missing`),
  `USAGE lists both flags...`.
- After the config work, the D12 tests (before `signInLines` and the `main.ts` change):
  `npx vitest run --project unit server/config.test.ts`: `Tests  2 failed | 41 passed (43)`
  (`startup sign-in lines (remote-access spec D12)`: `signInLines` is not a function).
  `npx vitest run --project api tests/api/cli.test.ts tests/api/sign-in-startup.test.ts`: `Tests  2 failed | 7 passed (9)`,
  `AssertionError: expected [ …(3) ] to include 'Sign-in: on (user u)'` and, for `--remote` without credentials,
  `expected '' to be undefined` (no hint line after the warning). The three new `cli.test.ts` cases (exit 2 for
  `--username=u` alone, `--password` alone and a 7-character password) already passed on the config work.

### Green

- `npx vitest run --project unit server/config.test.ts`: `Tests  43 passed (43)`
- `npx vitest run --project api tests/api/cli.test.ts tests/api/sign-in-startup.test.ts`: `Tests  9 passed (9)`.
  A real server (`ServerProcess.launch({ args: ['--username=u', '--password=password1'] })`) prints
  `Sign-in: on (user u)`, and no output line contains `password1`; `--username=u` alone exits 2 with `--password is missing`.
- `tests/e2e/network.spec.ts` keeps its expectations: the warning text is unchanged and the hint is a separate line.
  Both tests pass in the run below.
- `npm run verify` on the branch (6c4bb67, the code of this pull request): exit code `1` at the e2e step, like the baseline.
  - ratchets: `ratchets: ok`; rule-lint: `rule-lint: ok (rule lines 18, without a check 7, new 0)`
  - unit: `Tests  1377 passed | 4 skipped (1381)` (`Test Files  98 passed | 1 skipped (99)`)
  - contract: `Tests  276 passed (276)`
  - api: `Tests  451 passed | 2 skipped (453)` (`Test Files  43 passed (43)`)
  - api-smoke: `... sessionIds of execution #1 = 1, #2 = 1 ok`
  - e2e: `45 failed`, `29 did not run`, `118 passed (13.3m)`. `diff` of the sorted failure lists (baseline against
    branch): no difference.

### Stub check

- A config that ignores the flags fails every case of the credentials block (the Red above).
- A `main.ts` that logs the whole config, or the password, fails `tests/api/sign-in-startup.test.ts`
  (`lines.filter((l) => l.includes('password1'))` must be empty).

### Ratchet

- unit 1366 to 1377 (+11), api 446 to 451 (+5), contract 276 to 276, e2e passed 118 to 118 with the same 45
  container failures.

### Decisions

- With credentials the server prints `Sign-in: on (user <name>)` on every host, loopback included, and not the
  phase 1 warning (it would be false with sign-in on). Without credentials beyond loopback it prints the unchanged
  warning and then `Set --username and --password to require sign-in.` on its own line, so the phase 1 e2e keeps
  its literal text. The lines come from `signInLines(host, auth)` in `server/config.ts`.

### Baseline e2e failure list (identical on the branch)

- [chromium] › tests/e2e/claude.spec.ts:98:1 › UC-30: a run waiting for a background task - the agent runs a background command then ends the turn; the run keeps going until Claude Code wakes the agent; the summary is the text after that; the process exits gracefully @UC-30
- [chromium] › tests/e2e/repo.spec.ts:41:3 › repo + Claude executor (phase 2) › UC-19: register a repo - name auto-filled from the folder; a missing folder / duplicate path / duplicate name -> error at the field, nothing written to the DB @UC-19
- [chromium] › tests/e2e/transcript.spec.ts:30:3 › real Claude transcript (haiku) › UC-26: open the screen of a running Claude run -> the transcript appears gradually, every entry <= 2 seconds after the line timestamp; tool call, result, final text; a second tab sees it too @UC-26
- [iphone-lan] › tests/e2e/acceptance.iphone.spec.ts:43:5 › acceptance on an iPhone 13 over the LAN, dark system theme › G9: a normal session works end to end on an iPhone 13 through the LAN address (dark first) @acceptance
- [iphone-lan] › tests/e2e/acceptance.iphone.spec.ts:43:5 › acceptance on an iPhone 13 over the LAN, light system theme › G9: a normal session works end to end on an iPhone 13 through the LAN address (light first) @acceptance
- [visual] › tests/visual/ds/form.visual.ts:171:3 › desktop editor against the preview › a new loop and the schedule kinds
- [visual] › tests/visual/ds/form.visual.ts:392:3 › phone editor against the preview › new, every day, weekdays, errors, the repo sheet
- [visual] › tests/visual/ds/frame.visual.ts:161:3 › phone frame, Settings and Not found against the preview › settings, Vietnamese settings and not found
- [visual] › tests/visual/ds/frame.visual.ts:62:3 › desktop frame, Settings and Not found against the preview › settings and not found
- [visual] › tests/visual/ds/gate.visual.ts:57:3 › desktop gate pages against the preview › gate-queue
- [visual] › tests/visual/ds/gate.visual.ts:66:3 › desktop gate pages against the preview › gate-failed
- [visual] › tests/visual/ds/gate.visual.ts:81:3 › phone gate pages against the preview › phone-gate-queue
- [visual] › tests/visual/ds/gate.visual.ts:91:3 › phone gate pages against the preview › phone-gate-failed
- [visual] › tests/visual/ds/goal-cards.visual.ts:53:3 › desktop goal cards against the preview › card-two-way
- [visual] › tests/visual/ds/goal-cards.visual.ts:63:3 › desktop goal cards against the preview › card-one-way
- [visual] › tests/visual/ds/goal-cards.visual.ts:78:3 › phone goal cards against the preview › phone-card-two-way
- [visual] › tests/visual/ds/goal-cards.visual.ts:88:3 › phone goal cards against the preview › phone-card-one-way
- [visual] › tests/visual/ds/goals.visual.ts:57:3 › desktop goals page against the preview › goal-rows
- [visual] › tests/visual/ds/goals.visual.ts:73:3 › phone goals page against the preview › phone-goal-rows
- [visual] › tests/visual/ds/loop.visual.ts:252:3 › phone loop page against the preview › running, help, menu, Stop confirmation
- [visual] › tests/visual/ds/loop.visual.ts:87:3 › desktop loop page against the preview › running, waiting, last run failed, stopped, server down, never started, archived
- [visual] › tests/visual/ds/loops.visual.ts:218:3 › phone Loops page against the preview › first launch
- [visual] › tests/visual/ds/loops.visual.ts:69:3 › desktop Loops page against the preview › first launch, load error
- [visual] › tests/visual/ds/probe.visual.ts:120:5 › phone probe pages against the preview › phone-probe-blocked
- [visual] › tests/visual/ds/probe.visual.ts:120:5 › phone probe pages against the preview › phone-probe-complete
- [visual] › tests/visual/ds/probe.visual.ts:120:5 › phone probe pages against the preview › phone-probe-held
- [visual] › tests/visual/ds/probe.visual.ts:120:5 › phone probe pages against the preview › phone-probe-waiting
- [visual] › tests/visual/ds/probe.visual.ts:131:3 › phone probe pages against the preview › phone-run-held
- [visual] › tests/visual/ds/probe.visual.ts:82:5 › desktop probe pages against the preview › probe-blocked
- [visual] › tests/visual/ds/probe.visual.ts:82:5 › desktop probe pages against the preview › probe-complete
- [visual] › tests/visual/ds/probe.visual.ts:82:5 › desktop probe pages against the preview › probe-held
- [visual] › tests/visual/ds/probe.visual.ts:82:5 › desktop probe pages against the preview › probe-waiting
- [visual] › tests/visual/ds/probe.visual.ts:94:3 › desktop probe pages against the preview › run-held
- [visual] › tests/visual/ds/repos.visual.ts:127:3 › desktop Repos page against the preview › list (English and Vietnamese), loading, delete, delete refused
- [visual] › tests/visual/ds/repos.visual.ts:283:3 › phone Repos page against the preview › list, the folder picker, delete
- [visual] › tests/visual/ds/run.visual.ts:110:3 › desktop run page against the preview › ended runs: missing transcript, succeeded, copied, failed, timed out, cancelled, interrupted
- [visual] › tests/visual/ds/run.visual.ts:237:3 › phone run page against the preview › running with its transcript, succeeded
- [visual] › tests/visual/ds/scoreboard.visual.ts:51:3 › desktop scoreboard against the preview › scoreboard
- [visual] › tests/visual/ds/scoreboard.visual.ts:66:3 › phone scoreboard against the preview › phone-scoreboard
- [webkit-phone] › tests/e2e/phone.spec.ts:179:3 › the live log on a phone when Start answers late › the first log line shows after a start request that takes 1.5 s
- [webkit-phone] › tests/e2e/phone.spec.ts:204:3 › the phone frame › a Shift held on the machine does not open a link in a second page
- [webkit-phone] › tests/e2e/phone.spec.ts:211:3 › the phone frame › the folder picker: every control uses the UI font, and Cancel starts on the gutter
- [webkit-phone] › tests/e2e/phone.spec.ts:237:3 › the phone frame › the editor: Cancel starts on the gutter, like the labels under it
- [webkit-phone] › tests/e2e/phone.spec.ts:245:3 › the phone frame › the large title of every tab root keeps the same top space, with or without a top action
- [webkit-phone] › tests/e2e/phone.spec.ts:92:3 › the console on a phone › UC-34: create, start, live log, transcript, stop from the list and register a repo, all by touch with no sideways scrolling @UC-34

### Secret scan

- The GitGuardian check of the pull request flagged a test title of the first branch commit (c1772c0) as a
  `Generic CLI Secret` (`server/config.test.ts`, the title of the one-sided credentials case). It is no secret: the
  only fixture values are `password1` and `seven77`. The title now reads `a username alone or a password alone is a
  usage error that names the missing flag`; the squash merge carries only the new text.

## R2

- `main` SHA: `324f8e0` (R1 merged as pull request 453). Date of the runs: 2026-11-18. Same container as R1 (Node 24, local
  Postgres 16, Chromium 1243 mapped to 1248, no WebKit, no Claude login), default `loops_test`, e2e port 7071.
- Baseline (the R2 claim comment on issue 57, from the R1 run): unit `1380 passed | 4 skipped`, api `451 passed | 2 skipped`,
  contract `276`, e2e like for like against the 45 container failures of R1. API table: 45 routes; `API_ERROR_CODES`: 27.

### Red

- `npx vitest run --project unit server/services/auth-service.test.ts`: `FAIL |unit| server/services/auth-service.test.ts`,
  `Error: Cannot find module '../adapters/crypto/node-secrets' imported from .../server/services/auth-service.test.ts`,
  `Tests  no tests`.
- `npx vitest run --project api tests/api/auth-api.test.ts`: `Tests  13 failed (13)`; the first case
  `GET /api/loops without a cookie answers 401 UNAUTHENTICATED` fails with `AssertionError: expected 200 to be 401`
  (a server composed with credentials answers 200), the table case with `expected 45 to be greater than or equal to 48`,
  the login cases with `expected 404 to be 204`.

### Green

- `npx vitest run --project unit server/services/auth-service.test.ts server/adapters/crypto`: `Tests  16 passed (16)`
  (login success and failure, both digests compared on a wrong username, the limit: 5 failures then
  `tooManyAttempts` with `retryAfterSec` 900, 300, 1, refused even with the right password, cleared by a success,
  reset after 15 wound minutes, per client; expiry after 30 wound days; logout; the client key from `CF-Connecting-IP`
  only for a loopback socket; no credentials gives `notConfigured`).
- `npx vitest run --project api tests/api/auth-api.test.ts tests/api/api-surface.test.ts tests/api/health.test.ts`:
  `Tests  68 passed (68)`. Every route row of `docs/API.md` (48) called on a real listen with `fetch` and no cookie
  answers 401 `UNAUTHENTICATED` with a JSON body, SSE rows included; the routes that do not are exactly
  `GET /api/health`, `GET /api/auth/session`, `POST /api/auth/login`. With the cookie `GET /api/loops` is 200 and
  `/api/events` opens with `:ok`. The cookie is
  `castra_session=<43 chars>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`, plus `; Secure` only with
  `X-Forwarded-Proto: https`. Without credentials `/api/loops` is 200 and login and logout are 404 `AUTH_NOT_CONFIGURED`.
- `tests/api/api-surface.test.ts`: `reads the API table ... + 3 sign-in routes` expects 48 rows and passes; every new
  code is asserted by a test.
- `npm run arch`: `dependency-cruiser: 0 violations`, `arch-fixtures: 25/25 violations caught`.
- `npm run verify` on the branch (1b9181f, the code of this pull request), second run: exit code `1` at the e2e step, like the baseline.
  - design:states `states with shots: 142/142`; lang-scan `baseline check: ok`; ratchets `ratchets: ok`;
    rule-lint `rule-lint: ok (rule lines 18, without a check 7, new 0)`
  - unit: `Tests  1397 passed | 4 skipped (1401)` (`Test Files  100 passed | 1 skipped (101)`)
  - contract: `Tests  276 passed (276)`
  - api: `Tests  467 passed | 2 skipped (469)`
  - api-smoke: `... sessionIds of execution #1 = 1, #2 = 1 ok`
  - e2e: `45 failed`, `29 did not run`, `118 passed (11.2m)`. `diff` of the sorted failure lists (the R1 baseline list
    against this run): no difference.
- The first `npm run verify` run stopped at the api step on one test outside this task:
  `tests/api/goal-card-start.test.ts > ... with the gate on, the manifest PR ends at needs_ratification ...`
  (`"state": "failed"` instead of `"needs_ratification"`, `failed_step` `scope`), `Tests  1 failed | 466 passed | 2 skipped (469)`.
  The file alone passed 7 runs in a row (`Tests  10 passed (10)`), and the second full run passed it. Filed as issue 456
  (sub-issue of issue 55), with its evidence and Verify block. Both runs are recorded here (standing rule: a run skewed by
  something outside the task is re-run once and both runs are kept).

### Stub check

- A guard that only checks that a cookie is present (`!sessionToken(...)` instead of `!auth.session(...)`):
  `Tests  3 failed | 10 passed (13)`: `a session ends after 30 wound days`, `logout answers 204, clears the cookie and
  ends the session; without a session it is 401`, `a made-up or malformed cookie is no session`.
- A guard skipped on the SSE routes: `Tests  1 failed | 12 passed (13)`, the table case:
  `expected [ 'GET /api/events', …(5) ] to deeply equal [ 'GET /api/health', …(2) ]`.
- No limiter: unit `Tests  5 failed | 9 passed (14)` (the sixth-attempt case among them), api
  `Tests  2 failed | 11 passed (13)` (`the sixth failure answers 429 TOO_MANY_ATTEMPTS ...` and the loopback case).
- A new code without a test (`SESSION_LOCKED` added to `API_ERROR_CODES`): `tests/api/api-surface.test.ts`
  `Tests  1 failed | 50 passed (51)`, `expected [ 'SESSION_LOCKED' ] to deeply equal []`.

### Ratchet

- unit 1380 to 1397 (+17), api 451 to 467 (+16), contract 276 to 276, e2e passed 118 to 118 with the same 45
  container failures. API table rows 45 to 48 (the three rows of spec section 5); `API_ERROR_CODES` 27 to 31
  (`UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, `AUTH_NOT_CONFIGURED`).

### Decisions

Made by the standing rules of the epic; the spec leaves them open.

- The four sign-in codes are HTTP-layer codes (`AUTH_STATUS` and `authError` in `server/http/errors.ts`, listed in
  `API_ERROR_CODES`), not domain codes: the service returns a result (`ok`, `invalid`, `tooManyAttempts` with
  `retryAfterSec`, `notConfigured`) and only the HTTP layer knows statuses and cookies. `STATUS_OF` is unchanged.
- The limit is a sliding window: a client with 5 failures in the last 15 minutes is refused until the oldest of them
  leaves the window (`Retry-After` = those seconds, at least 1). A refused attempt is not counted, and the right
  password is refused too while the client is held, otherwise the limit would not slow a guesser.
- The guard covers every `/api/*` path, also one that matches no route (401, not 404), so an unknown path tells a
  client without a session nothing. The test-mode routes stay open (spec D5); they exist only in test mode.
- `POST /api/auth/logout` is a protected route (spec D5 lists only three public routes): without a session it answers
  401 `UNAUTHENTICATED`. Its row lists `AUTH_NOT_CONFIGURED` only, as in spec section 5, because every protected route
  can answer `UNAUTHENTICATED` (the sentence under the table says so).
- Without credentials, login and logout answer 404 `AUTH_NOT_CONFIGURED` before the body is validated, and
  `GET /api/auth/session` answers `{ required: false, signedIn: false }`.
- `CF-Connecting-IP` and `X-Forwarded-Proto` are read from their first comma-separated value. The `Secure` flag follows
  `X-Forwarded-Proto` from any client, as D3 says; a client that forges it only makes its own cookie stricter.
- The login body accepts a username of 1 to 256 and a password of 1 to 1024 characters; anything else is
  `VALIDATION_FAILED`, so a huge body never reaches the digests.
- The API-table parser moved from `tests/api/api-surface.test.ts` to `tests/support/api-table.ts` so that
  `tests/api/auth-api.test.ts` reads the same rows; the surface test reads 48 rows with it.

### Secret scan

- The GitGuardian check of the pull request flagged two test fixtures of the first branch commit (198fee6): a
  `Generic Password` in `server/services/auth-service.test.ts` (the wrong-password fixture) and a `Username Password`
  in `tests/api/auth-api.test.ts` (the wrong-login body). They are no secrets: they are made-up wrong passwords of the
  tests. The fixtures now read `password2` and `password3` next to `password1`; the squash merge carries only the new text.

## R3

- `main` SHA: `ffaf10e` (R2 merged as pull request 457). Date of the runs: 2026-11-18. Same container as R1 and R2
  (Node 24, local Postgres 16, no WebKit, no Claude login), default `loops_test`, e2e port 7071.
- Browser of the new shots: Playwright's Chromium build 1243 (the pinned revision 1248 cannot be downloaded here; 1243
  is mapped to it). The 20 new shots were rendered in this container by the repository's own tool
  (`npm run design:shots -- --only <the ten sign-in ids>`); no existing shot was re-shot. If the owner's machine
  (Chromium 1248) renders them a few pixels differently, re-shoot the ten sign-in ids there with the same command.
- Design-system gap: issue 459 (label `design-system`, template "Design system gap"): the sign-in screen is the one
  screen outside the app frame, the brand outside the top bar, and "Signed in as" in the top bar. Closed by the owner's
  approval (R4, issue 59) and the build (R5, issue 60), as its "Done when" list says. It is not a sub-issue of the
  phase: it blocks no task (the system is extended in this pull request, by the standing rule).

### Red

- `npm run design:states` on `main`: `states with shots: 142/142`, exit code `0` (N = 142).
- After the ten rows in `design/ds/STATES.md` and the ten entries in `design/ds/preview/states.js`, before shooting:
  exit code `1`, `states with shots: 142/152`, naming each missing shot:
  `missing: signin — light shot missing; dark shot missing`, the same for `phone-signin`, `signin-error`,
  `phone-signin-error`, `signin-locked`, `phone-signin-locked`, `signin-topbar`, `phone-signin-topbar`, `vi-signin`,
  `phone-vi-signin`.

### Green

- (1) `npm run design:states`: `states with shots: 152/152`, exit code `0` (N + 10).
- `npm run design:shots -- --dry --only <the ten sign-in ids>`: `drawn 10 states x 2 themes, 0 problems` (every
  required test id visible with its count, no class outside `components.css`, no literal inline style).
- (2) `git diff --stat main -- design/ds/preview/shots`: only the 20 added files of the ten sign-in states
  (`signin-*`, `vi-signin-*`, and their phone forms `phone-signin-*`, `phone-vi-signin-*`), no existing shot changed.
- (3) `npx vitest run --project unit shared/i18n tests/tools/ds-catalogue.test.ts tests/tools/ds-docs.test.ts
  tests/tools/design-states.test.ts tests/tools/i18n-counts.test.ts tests/tools/design-lint.test.ts`:
  `Tests  37 passed (37)`; the key-set test passes with the 12 new keys (`settings.account` and 11 `signin.*`) in `en`
  and `vi`, none empty, the same `{x}` parameters.
- `npm run design:lint`: `unknown classes: 0`, `literal styles: 0`, `css violations: 0`.
- (4) `npm run verify` on the branch (43d223b, the preview of this pull request): exit code `1` at the e2e step, like
  the baseline (the like-for-like bar of R1 for this container).
  - design:states `states with shots: 152/152`; lang-scan `baseline check: ok`; ratchets `ratchets: ok`;
    rule-lint `rule-lint: ok (rule lines 18, without a check 7, new 0)`
  - unit: `Tests  1397 passed | 4 skipped (1401)`
  - contract: `Tests  276 passed (276)`
  - api: `Tests  467 passed | 2 skipped (469)`
  - api-smoke: `... sessionIds of execution #1 = 1, #2 = 1 ok`
  - e2e: `45 failed`, `29 did not run`, `118 passed (10.5m)`. `diff` of the sorted failure lists (the R1 baseline list
    against this run): no difference.
- (5) The pull request body links every new light shot and lists the D-UI decisions below.

### Stub check

- Rows without shots fail `design:states` (the Red above: exit code `1`, `142/152`).
- A key only in `en` (`signin.signOut` removed from `vi.ts`): `shared/i18n/i18n.test.ts > has one key set` fails
  (`Tests  1 failed | 2 passed (3)`), and the typecheck fails with `TS2741: Property '"signin.signOut"' is missing`.
  An empty Vietnamese text (`signin.invalid` set to a space): `has no empty string` fails,
  `vi has empty strings: expected [ 'signin.invalid' ] to deeply equal []`.
- CSS leak: every state of the preview was shot twice in this container, once with the branch's `components.css` and
  once with `main`'s (copies of `design/ds`, `npm run design:shots -- --design <copy>`, both exit code `0`, 304 images
  each). The 284 images of the 142 existing states are byte-identical between the two runs: the new rules touch no
  existing screen. Without the new rules 18 of the 20 sign-in images differ (the two `phone-signin-topbar` images use
  only existing classes and are identical), so the sign-in screen depends on its CSS. The branch run is byte-identical
  to the 20 committed shots.

### Ratchet

- Preview states 142 to 152 (+10; the plan asks for + 8 or more). Shots 284 to 304. Catalogue classes of spec 4.5
  +4 (`.signin`, `.signin-form`, `.signin-brand`, `.topbar-user`), component families 19 to 20 (Sign-in).
  i18n keys +12 in each language.

### Decisions

Made by the standing rules of the epic and the design-system rule of CLAUDE.md; the spec leaves them open. R4 is the
owner's gate: the owner approves the preview and the system addition together (no entry in `design/APPROVED.md` here).

- D-UI 1. The sign-in screen is drawn outside the app frame: no top bar, tab bar or navigation bar, since nothing behind
  it is reachable before sign-in. The system had no rule for such a screen, so it gained a Sign-in family
  (`.signin`, `.signin-form`, `.signin-brand`, `.topbar-user`, reading only existing tokens: no colour, size or token is
  new), drawn on `design/ds/index.html`, listed in spec 4.5 of the UI uplift and described in `SYSTEM.md` (issue 459).
- D-UI 2. The form is one column at most `--size-dialog` wide: the brand, the `h1` (`.page-title`), a `.page-desc`,
  a `.card.is-pad` with the fields and `.btn.primary.lg.block`, then a `.note` saying the credentials are the ones the
  console was started with. Desktop: centred on the page. Phone: `--space-10` under the safe area at the top, so the
  keyboard does not cover the fields.
- D-UI 3. Errors belong to the form, not to a field, and never say which field was wrong (the server does not either):
  wrong credentials is a `.banner.is-err` at the top of the card with the username kept and the password cleared; too
  many attempts is a `.banner.is-warn` (nothing typed is wrong, the console asks to wait) with the wait in whole
  minutes, rounded up from `Retry-After` (690 s gives 12 minutes in the sample), the count joined to its unit by a
  no-break space, and Sign in disabled.
- D-UI 4. Signed in, desktop: the end of the top bar shows "Signed in as <name>" (`.topbar-user`, the name bold) and
  Sign out as a `.btn.sm`, after the connection and the theme button. Phone: the top bar is hidden by the system, so
  Settings starts with an Account group (an existing `.cell` with the same sentence and Sign out as a `.btn`), like the
  phone-only This device group. `phone-signin-topbar` therefore draws Settings, not the Loops list; its state entry
  carries `phoneRequires` (a small addition to `states.js`: a phone state takes its base's `phoneRequires` when the
  control moves to another page on the phone).
- D-UI 5. Neither the top-bar user nor the Account group shows when the console asks for no sign-in; the existing
  states are unchanged.
- The phone states use the `phone-*` form of `design/ds/` (the plan's "Update 2026-10-21"), so the plan's
  `signin-phone`, `signin-error-phone` and `signin-topbar-phone` are `phone-signin`, `phone-signin-error` and
  `phone-signin-topbar`, and Green (2) lists `phone-signin-*` and `phone-vi-signin-*` next to `signin-*` and
  `vi-signin-*`. Two phone states were added beyond the plan's eight: `phone-signin-locked` and `phone-vi-signin`
  (spec D13 asks for English and Vietnamese on the phone too, and the longest text is the too-many-attempts banner).
- New test ids, listed under Test ids of `SYSTEM.md` for R5: `signin-form`, `signin-username`, `signin-password`,
  `signin-submit`, `signin-error` (with `data-code`), `topbar-user`, `topbar-signout`, `settings-account`,
  `settings-signout`. The top bar and Settings use their own ids, so a page never renders one id twice.
- Text: 12 keys in `shared/i18n/en.ts` and `vi.ts` (`settings.account`, `signin.title`, `signin.desc`,
  `signin.username`, `signin.password`, `signin.submit`, `signin.invalid`, `signin.locked.one`, `signin.locked.other`,
  `signin.note`, `signin.signedInAs`, `signin.signOut`); the Vietnamese text is only in `vi.ts`. The sample user is
  `owner`, a word, not a person.
- `design/README.md` needs no change: it describes the preview and the system in general, and the new family and
  states live in `SYSTEM.md` and `STATES.md`.

## Issue 456 (flaky gate-on case of goal-card-start)

- `main` SHA of the runs: `423cf0f` (release 0.10.0); rebased on `e633896` (release 0.12.0) before the merge, then
  `npx vitest run tests/tools/fake-gh.test.ts tests/api/goal-card-start.test.ts server/services/gate-service.test.ts`:
  `Tests  62 passed (62)`. Date: 2026-11-19. Local Windows machine, lane database `loops_flake456_test`, e2e port 7456.
- Cause, measured: the background tick runs the gate and the goal-card ingest at the same time
  (`Promise.all` in `server/compose.ts`). Each fake `gh` call reads the one world file, changes it and writes it with
  `writeFileSync`, which empties the file first. The gate's `gh pr view` (the merged check in `attempts`, before any
  step) read an empty world: `fake-gh: Unexpected end of JSON input`, exit 1. The throw reached `endFailed` with
  `run.current = 'scope'`, so the job ended `failed` at `scope` and wrote no step row.
- 16 parallel fake `gh` calls on `main` (scratch script): `{"failed":1,"firstError":"fake-gh: Unexpected end of JSON input","callsLogged":9}`.
- Decision (standing rule "a test is flaky: fix the root cause"): the fix is in the test support, because the race is in
  the fake `gh` and the real `gh` has no shared file. Each fake `gh` call holds `<world>.lock` from its read to its
  write. No retry, no longer sleep, no looser assertion.
- Decision: the gate now writes a `fail` row (text and stderr) for a throw outside a step. Before, such a job had no
  row, so the record and the test could not show why it failed.

### Red

- Injection of the found cause (scratch diff, not committed): `pr view` starts 800 ms late and `issue list` keeps the
  world file empty for 1500 ms during its write. Old fake `gh`:
  `npx vitest run --project api tests/api/goal-card-start.test.ts -t "gate on"` ->
  `AssertionError: gate_steps: []: expected [ { state: 'failed', …(2) } ] to deeply equal [ { …(3) } ]`,
  `Tests  1 failed | 9 skipped (10)`.
- Same, with the new row of `endFailed`: `"output_tail": "gh pr view failed: exit 1\nfake-gh: Unexpected end of JSON input"`.
- `npx vitest run --project unit tests/tools/fake-gh.test.ts -t "parallel"`, 3 runs on the old fake `gh`: each failed,
  with `SyntaxError: Unexpected non-whitespace character after JSON`, `expected [ 1, 2, 3, 4, 5 ] to deeply equal [ 1, 2, 3, 4, 5, 6, 7, 8 ]`
  and `"err": "fake-gh: Unexpected end of JSON input"`.

### Green

- Same injection, new fake `gh`: `Tests  1 passed | 9 skipped (10)`, 2 runs.
- `npx vitest run --project unit tests/tools/fake-gh.test.ts`: `Tests  16 passed (16)`, 3 runs.
- Gate tests (`server/services/gate*`, `tests/api/gate*`, the fake `gh` test): `Tests  192 passed (192)`.
- `npm run verify`, 3 runs one after another, each exit 0. Each run: unit `Tests  1382 passed | 3 skipped (1385)`,
  contract `Tests  276 passed (276)`, api `Tests  451 passed | 2 skipped (453)` (no failure of
  `goal-card-start.test.ts`), e2e `192 passed`.

### Stub check

- The lock removed (the old `tests/support/fake-gh.mjs`) with the new gate row: the injection gives the recorded
  failure again (`failed` at `scope`, `fake-gh: Unexpected end of JSON input`), and the parallel test fails 3 of 3.

### Ratchet

- Flaky failures of `goal-card-start.test.ts` in full verify runs: 1 -> 0 (3 runs).

## R5

- `main` SHA: `a37516e` (R4 merged as pull request 464). Date of the runs: 2026-11-19. Same container as R1 (Node 24, local
  Postgres 16, Chromium 1243 mapped to 1248, no WebKit, no Claude login), default `loops_test`, e2e port 7071.
- Baseline (the R5 claim comment on issue 60): unit `1397 passed | 4 skipped`, api `467 passed | 2 skipped`, contract `276`,
  e2e like for like against the 45 container failures of R1 (`118 passed`).

### Red

The tests were written first and committed alone (4d73185), then run on the build of `main`:

- `npm run build` then `npx playwright test --project=chromium tests/e2e/signin.spec.ts`: `3 failed`. Both `@UC-40` cases
  (desktop and phone) fail at `expect(locator).toBeVisible() failed`, `Locator: getByTestId('signin-form')`,
  `Error: element(s) not found`: a server started with credentials shows no sign-in screen. The no-credentials case fails
  at `expect(page).toHaveURL(expected) failed`, `Expected pattern: /\/settings$/`,
  `Received string: "http://127.0.0.1:7071/signin?next=%2Fsettings"` (no route leads on from `/signin`).
- `npx playwright test --project=visual tests/visual/ds/signin.visual.ts`: `2 failed`, `2 did not run`; both views fail at
  `Locator: getByTestId('signin-form')`, `Error: element(s) not found`: no sign-in screen to compare.

### Green

- `npx playwright test --project=chromium tests/e2e/signin.spec.ts`: `3 passed (10.2s)`. On a `ServerProcess` launched
  with credentials, on the desktop (1440x900) and on a 390x844 touch view: `/loops/new` shows the sign-in screen at
  `/signin?next=%2Floops%2Fnew` with no top bar and no tab bar; a wrong password gives 401 and the `signin.invalid` text of
  `en.ts` (`data-code` `INVALID_CREDENTIALS`), the username kept, the password cleared; the right one gives 204 and returns
  to `/loops/new`; a loop created through the page's own session shows in the list within 2 seconds (live update);
  Sign out (the top bar on the desktop, the Account group of Settings on the phone) returns to sign-in and the page's own
  `fetch('/api/loops')` then answers 401; five more failures answer 401 and the sixth 429, with
  `signin.locked.other` for 15 minutes and Sign in disabled. On the shared e2e server (no credentials) there is no sign-in
  screen, no `topbar-user`, no `topbar-signout`, no `settings-account`, and `/signin?next=%2Fsettings` leads to `/settings`.
- `npx playwright test --project=visual tests/visual/ds/signin.visual.ts`: `4 passed (14.5s)`; the report of the run:
  `"pairs": 20, "worstRatio": 0.00006` (`MAX_RATIO` 0.001). Every sign-in screen pair (`signin`, `signin-error`,
  `signin-locked`, `vi-signin` and their phone twins, light and dark) is `0` off; `signin-topbar` is top bar `0`, page
  `0.00006` (light) and `0.00005` (dark); `phone-signin-topbar` page `0` and tab bar `0`.
- Unit: `npx vitest run --project unit web/data/auth.test.ts web/api/http-loops-api.test.ts web/api/sse-live-events.test.ts`:
  `Tests  17 passed (17)`.
- `npm run verify` on the branch (86795cf): exit code `1` at the e2e step, like the baseline.
  - design:states `states with shots: 152/152`; lang-scan `baseline check: ok`; arch `dependency-cruiser: 0 violations`,
    `arch-fixtures: 25/25 violations caught`; ratchets `ratchets: ok` (`unknown classes: 0`, `native title: 0`,
    `literal styles: 0`); rule-lint `rule-lint: ok (rule lines 18, without a check 7, new 0)`
  - unit: `Tests  1411 passed | 4 skipped (1415)`
  - contract: `Tests  276 passed (276)` (`memory: 129 passed · postgres: 129 passed`)
  - api: `Tests  467 passed | 2 skipped (469)`
  - api-smoke: `... sessionIds of execution #1 = 1, #2 = 1 ok`
  - e2e: `45 failed`, `29 did not run`, `125 passed (10.1m)`. `diff` of the sorted failure lists (the R1 baseline list
    against this run): no difference. The 7 new tests (3 e2e, 4 visual) pass; none needs WebKit.
- `npm run phone:check -- --max 0`: `phone overflow: 0/12`.
- `npm run uc-coverage -- --min 39` on that report: `UCs with a green e2e: 35/40`,
  `Missing: UC-19 UC-26 UC-27 UC-30 UC-34` (the container failures of the baseline list: no Claude login, no WebKit),
  `Below the ratchet floor: 35 < 39`. The same container gives `34/39` on `main` with the same five missing; on a machine
  with WebKit and a Claude login the count is 40/40.
- The first `npm run verify` run (6a31000) stopped at the unit step: `tests/tools/uc-coverage.test.ts`
  `Tests  4 failed` (`expected [...] to have a length of 39 but got 40`, `expected 'UCs with a green e2e: 2/40 ...' to
  contain 'UCs with a green e2e: 2/39'`). The test pins the number of use cases of `docs/USE-CASES.md`; it now pins 40
  (UC-19 to UC-40 as the last 22), which is the new use case, not a weaker check.

### Stub check

- No redirect (`mustSignIn` always false): `npx playwright test --project=chromium tests/e2e/signin.spec.ts -g desktop`
  `1 failed`, `Locator: getByTestId('signin-form')`, `Error: element(s) not found`.
- A Sign out that only clears the client state (the mutation skips `POST /api/auth/logout`): `1 failed`,
  `Expected: 401`, `Received: 200` at `tests/e2e/signin.spec.ts:101` (the page's own `GET /api/loops`).
- Missing CSS (the `.signin` and `.signin-form` rules removed from `design/ds/components.css`):
  `signin-light · sign-in screen: 16.19 % off (77397/478080 px)`, `signin-dark · sign-in screen: 16.85 % off`,
  `signin-error-light · sign-in screen: 14.72 % off`, and every other sign-in pair above `MAX_RATIO`.

### Ratchet

- uc-coverage 39/39 to 40/40 on a full machine (here 34/39 to 35/40, the same five container misses); the verify floor
  `--min` 38 to 39. Unit 1397 to 1411 (+14), api 467 to 467, contract 276 to 276, e2e passed 118 to 125 (+3 e2e, +4 visual)
  with the same 45 container failures; visual sign-in pairs 0 to 20.

### Decisions

Made by the standing rules of the epic; the spec leaves them open.

- **UC number.** The spec and the plan call sign-in UC-35, but `docs/USE-CASES.md` gave UC-35 to UC-39 to the gate and the
  goal loop after the spec was written. The IDs are stable, so sign-in is UC-40 (`@UC-40`); the plan's
  `UCs with a green e2e: 35/35` and `--min 35` no longer fit the tree, and the equivalent is 40/40 with the floor raised
  by one (38 to 39). The plan's R5 section carries a note; R6 will take the next free number for the tunnel.
- **Visual test path.** The plan's update note moved the screen to the kit of the new UI and its compare to
  `tests/visual/ds/`, so the test is `tests/visual/ds/signin.visual.ts` (run with
  `npx playwright test --project=visual tests/visual/ds/signin.visual.ts`), not `tests/visual/signin.visual.ts`.
- **App and preview.** The app matched every one of the 20 approved shots (worst 0.00006), so the preview needed no
  correction and `design/APPROVED.md` no new entry. The kit gained no class: `Input` takes `type="password"` and an
  `autoComplete` of `username` or `current-password`, and `Banner` takes `data-*` attributes (the error code).
- **When the session ends in the web.** A 401 `UNAUTHENTICATED` from any query or mutation marks the session ended in
  the cache at once (no second request). A lost live connection asks `GET /api/auth/session` again; only an answer of
  `signedIn: false` shows the sign-in screen, and an unreachable server changes nothing (the frame shows the lost
  connection, as before). Until the session is known the guard draws nothing, so the app never flashes behind sign-in.
- **The live connection.** It closes while signed out (it would only be refused) and opens again at once after sign-in,
  as a fresh start (`connecting`, then `open`), so the frame shows neither the lost nor the Reconnected banner; the data of
  the signed-out user leaves the cache.
- **`next`.** Only a path of this console is followed (it starts with one `/`, has no backslash, is not `/signin`);
  anything else leads to `/`, so the sign-in link cannot send the browser to another site.
- **The wait.** The minutes count down from the `Retry-After` of the 429 (the header, else `details.retryAfterSec`),
  rounded up, at least 1; Sign in is enabled again when the wait is over. An empty field is not sent: it takes the focus.
- **Tests.** Each view of the e2e and of the visual test has its own server, because the attempt limit of one would lock
  the other; the visual locked state winds the server clock 210 seconds after the fifth failure, so `Retry-After` is 690
  seconds, the preview's 12 minutes. The test password is `password1` and the wrong ones `password2` to `password7`.

### CI

- The `lang-scan` job of the pull request fails on a commit of `main`, not of this branch:
  `(commit message):3  [coupling/issue-ref]` on commit `a37516efeb9ecce2eb85f1c9379864f573f4a8ee`, the squash commit of
  R4, whose body closes issue 59 and issue 459 on one line (the second issue reference is the hit). The same command fails on `main` itself. Filed as issue 466 (sub-issue of issue 55) with its
  evidence and Verify block; it blocks the merge of this task.

## R6c

Task R6c retires the home path in the repository (decisions D18 and D19, ADR 0006). It changes nothing on the real
machine: stopping nginx and win-acme is task R6d.

- **Red.** After the new case `proxy_set_header CF-Connecting-IP ""` was added to `tests/tools/nginx-config.test.ts`:
  `npx vitest run --project unit tests/tools/nginx-config.test.ts` printed `Tests  1 failed | 16 passed (17)`.
- **Readers of `goals/local-name.json`.** A search of the whole tree (scripts, tests, workflows, docs) found these.
  - `scripts/local-name-goal-run.mjs` (a comment): updated to the new path.
  - `docs/plans/2026-11-19-local-name-evidence.md` and the plan of phase 3: records of what ran on 2026-11-19. They
    stay as written.
  - No test and no script parses the file. `goal:check` reads only the manifest that its argument names, and
    `goals/verify/` is the only folder that the merge gate lists.
- **Decision (standing rule: the system has no rule for the case).** The file keeps its checks and gets a `"retired"`
  key that names ADR 0006. The key is a record for a reader. No tool reads it.
- **Privacy of the home address (same lane).** Real addresses of the owner's network were in three committed evidence
  logs. Each is replaced; git history is not rewritten.
  - `docs/plans/2026-10-21-lan-access-evidence.md`, lines 62 and 69: now `<pc-ip>`.
  - `docs/plans/2026-10-21-ui-uplift-evidence.md`, line 2358: now `<device-ip>`.
  - `docs/plans/2026-11-01-goal-driven-loop-evidence.md`, line 2837, found by a search of the whole tree: now `<device-ip>`.
  - Every other `192.168.` address in the tree is a sample (`192.168.1.x` in tests, the README, the design preview and
    the nip.io facts of the local-name spec) and stays.
- **Green.**
  1. `npx vitest run --project unit tests/tools/nginx-config.test.ts`: `Tests  17 passed (17)`.
  2. `ls goals/local-name.json` fails (`No such file or directory`), and `goals/retired/local-name.json` exists.
  3. `grep -c "ADR 0006"` prints 1 for `README.md`, 1 for the local-name spec and 3 for ADR 0005.
  4. `npm run verify`: unit `1475 passed | 3 skipped`, api `276 passed`, tool tests `472 passed | 2 skipped`, e2e
     `199 passed`, `1 failed`, `1 skipped`. The failed case was `goal-number.spec.ts:102` (G11), with
     `SyntaxError: Unexpected end of JSON input` at `tests/support/fake-gh-kit.ts:125`: the test read the fake `gh`
     world file while another process wrote it. Other lanes ran on the machine at the same time. Run two of the
     same spec alone: `3 passed`. Both runs are recorded here, as the standing rule asks. The cause is a race of the
     test against its own fake, so it is filed as a follow-up outside this epic if it comes back.
- **Ratchet.** Unit count: 1475 passed with this task, 1474 on `main` (the task adds exactly one case, the new
  directive, and removes none).

## R6a

The tunnel in the console: `--cloudflare`, the `cloudflared` runner, health `tunnel`, UC-41 (goals G5 and the unit part of
G9). Lane R6a, test database `loops_r6a_test`, e2e port 7191.

### Red

The tests were written first (the first commit of the branch, `f9799b5` after the rebase) and run before the code. The e2e Red ran in a second worktree at that
commit, so the code of the next commits could not change it.

```text
$ npx vitest run --project unit server/adapters/tunnel
Error: Failed to resolve import "./cloudflared-runner" from "server/adapters/tunnel/cloudflared-runner.test.ts"
 Test Files  1 failed (1)
      Tests  no tests

$ npx vitest run --project unit server/config.test.ts -t cloudflare
 FAIL  ... --cloudflare, npm_config_cloudflare and LOOPS_CLOUDFLARE each set the token, in that order
UsageError: unknown flag --cloudflare
 FAIL  ... --cloudflare without credentials is a usage error: a tunnel needs --username and --password
AssertionError: expected [Function] to throw error including 'a tunnel needs --username and --passw…' but got 'unknown flag --cloudflare'
      Tests  5 failed | 1 passed | 49 skipped (55)

$ npm run build && npx playwright test --project=chromium tests/e2e/tunnel.spec.ts
  ✘  1 [chromium] › tests\e2e\tunnel.spec.ts:42:1 › @UC-41 through the tunnel: ...
    Error: expect(received).toBe(expected)   Expected: "connected"   Received: undefined
  ✘  2 [chromium] › tests\e2e\tunnel.spec.ts:123:1 › @UC-41 a tunnel without credentials: ...
    Expected substring: "a tunnel needs --username and --password"   Received string: "unknown flag --cloudflare
  ✘  3 [chromium] › tests\e2e\tunnel.spec.ts:135:1 › @UC-41 a wrong token: ...
    Error: expect(received).toBe(expected)   Expected: "down"   Received: undefined
  3 failed
```

`/api/health` had no `tunnel` field (`undefined`), so nothing ran a tunnel and nothing answered on the proxy port.

### Green

```text
$ npx vitest run --project unit server/adapters/tunnel
 ✓ is off before start
 ✓ gives the token only in TUNNEL_TOKEN: not in the arguments, not in LOOPS_CLOUDFLARE of the child
 ✓ reports connecting, then connected when /ready answers 200
 ✓ forwards each line with the prefix [cloudflared] and never the token or a part of it longer than 8 characters
 ✓ after an exit: down, then starts again after 1, 2 and 4 seconds of a wound clock
 ✓ stop() ends the child in 5 seconds, and it is not started again
 ✓ a program that does not exist (ENOENT): start() rejects with the winget install command
 ✓ replaces the token and each part of it longer than 8 characters, and keeps the rest of the line
      Tests  8 passed (8)

$ npx vitest run --project unit server/config.test.ts
      Tests  55 passed (55)

$ npx playwright test --project=chromium tests/e2e/tunnel.spec.ts tests/e2e/smoke.spec.ts
  ✓  1 [chromium] › tests\e2e\smoke.spec.ts:4:1 › the home page opens from the build, server + DB alive @smoke (909ms)
  ✓  2 [chromium] › tests\e2e\tunnel.spec.ts:42:1 › @UC-41 through the tunnel: a phone signs in, starts a loop and sees it live; the tunnel stops with the console (10.0s)
  ✓  3 [chromium] › tests\e2e\tunnel.spec.ts:123:1 › @UC-41 a tunnel without credentials: startup exits 2 with the D8 message (3.4s)
  ✓  4 [chromium] › tests\e2e\tunnel.spec.ts:135:1 › @UC-41 a wrong token: the console stays up, reports the tunnel down and prints the error of cloudflared (6.0s)
  4 passed (31.3s)
```

```text
$ npm run verify
 Test Files  106 passed | 1 skipped (107)
      Tests  1489 passed | 3 skipped (1492)          (unit)
      Tests  276 passed (276)                        (contract)
      Tests  472 passed | 2 skipped (474)            (api)
  1 skipped
  203 passed (20.1m)                                 (e2e and visual)
> node scripts/uc-coverage.mjs --min 41
UCs with a green e2e: 42/42
EXIT=0
```

During the e2e part of this run, another lane took the heavy slot (its owner file said `G11fix`), so two heavy runs
overlapped for some minutes. The run passed with no failure, so it needed no second run.

### Stub check

- A runner that never starts the child: the e2e Red above (no runner) leaves health without `tunnel` and the proxy port
  closed, so test 1 fails at its first step.
- The token as an argument (`... 'run', '--token', <token>` added in the runner): `Tests  5 failed | 3 passed (8)`, with
  `× gives the token only in TUNNEL_TOKEN: not in the arguments, not in LOOPS_CLOUDFLARE of the child`. The fake also
  refuses arguments after `run`.
- No restart logic (the call to `#restart()` deleted): `Tests  1 failed | 7 passed (8)`, with
  `× after an exit: down, then starts again after 1, 2 and 4 seconds of a wound clock`.

### Ratchet

- `uc-coverage`: 41/41 on `main` (41 use case ids, UC-41 not written) to 42/42; the verify floor `--min` 40 to 41.
- Unit 1474 to 1489 (+15: 8 runner cases, 6 config cases, 1 health case). The count on `main` is the count of this
  branch minus the 15 new cases; the other test files are the same as on `main`.
  After the rebase on task R6c (which adds 1 case), the same count is 1475 on `main` to 1490.
- e2e passed 200 to 203 (+3, the three `@UC-41` tests); contract 276 to 276; api 472 to 472.

### Decisions

Made by the standing rules of the epic; the spec leaves them open.

- **The Playwright command.** The plan writes `npx playwright test --project chromium tests/e2e/tunnel.spec.ts`. In this
  tree that form fails before any test: `Error: Project(s) "tests/e2e/tunnel.spec.ts" not found`. The equivalent
  `--project=chromium` runs the same file and proves the same goal (standing rule: a plan command that no longer fits).
- **`localhost` and the `Secure` cookie.** The e2e opens `http://localhost:<proxy port>`. Chromium kept the `Secure`
  cookie there (`context.cookies()` gives `[['castra_session', true]]`), so the fake needed no HTTPS certificate.
- **`ok` of health.** `tunnel` does not change `ok`: a tunnel that is `down` keeps health at 200, because `ok` tells the
  web whether the database answers, and a restart of the console must not wait on the tunnel.
- **Backoff after a connection.** The wait starts again at 1 second after the state reaches `connected`. A connector that
  never connects (a wrong token) goes 1, 2, 4, 8, 16, then every 30 seconds, as D9 says.
- **Redaction.** The runner replaces the whole token and each part of it longer than 8 characters by `***`, the same
  limit that the check `token-hidden` of task R6b uses.
- **The child's environment.** The runner removes `LOOPS_CLOUDFLARE` from the environment of `cloudflared`, so the token
  is only in `TUNNEL_TOKEN` (D9).
- **Startup order.** `main.ts` starts the tunnel after `listen` and after the startup lines, and prints `Tunnel: <state>`
  at each change. `ENOENT` prints `Cannot start the tunnel: cloudflared was not found: install it with winget install
  --id Cloudflare.cloudflared, ...`, shuts down and exits 1. Shutdown stops the tunnel first.
- **Test servers.** `ServerProcess`, the Playwright web server and `api-smoke` set `LOOPS_CLOUDFLARE` to empty, because the
  server loads the developer's `.env`. After task R6d that file holds the real token, and a test must never start the
  real tunnel.
- **The fake leaves with its parent.** `tests/support/fake-cloudflared.mjs` exits when its parent process is gone, so a test
  that kills the console leaves no process. The real `cloudflared` does not do this (see the finding below).

### Found

- Issue 507 (sub-issue of issue 55, blocks R6d and R7): `scripts/restart-console.ps1` stops the console with
  `Stop-Process -Force`, so the console cannot stop its `cloudflared` child, and goal G8 fails after a restart. Read from
  the code, not verified on the machine.
