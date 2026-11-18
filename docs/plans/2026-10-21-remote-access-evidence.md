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
