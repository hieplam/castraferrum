# Plan: local network access and phone layout (phase 1)

- Date: 2026-10-21
- Spec: [../specs/2026-10-21-lan-access.md](../specs/2026-10-21-lan-access.md) (goals G1 to G6, decisions D1 to D8)
- Evidence log: `docs/plans/2026-10-21-lan-access-evidence.md` (created by L0; every task appends a section
  headed `## L<k>` with its before and after numbers: commands and literal output only)

## How to read this plan

- **One task, one pull request.** The pull request carries the code, the tests and the task's evidence section.
  Its body contains `Closes #<task issue>` and a `## Verify` section that states Red, Green and Stub check with
  their results. Squash-merge it yourself (`CLAUDE.md`, "Workflow").
- **Order:** tasks run one at a time, in order. Each task issue is "blocked by" the one before it.
- **Verify blocks are the contract.** Write the tests first, run Red and keep its literal output. A task is done
  only when every Green command has been run and its output matches. "The suite is green" alone never counts.
- **Never decrease** (checked in every task against the numbers L0 records): unit, contract, api and e2e test
  counts, and `uc-coverage`. The desktop visual tests keep their threshold.
- **Suite stays green:** every task ends with `npm run verify` exit 0 in its worktree. Any Playwright run needs
  `npm run build` first because the e2e server serves `dist/web`.
- **The running console is off limits.** Never stop, restart or kill the process on `127.0.0.1:7070`, and never
  kill Node processes by name. Tests start their own servers on 7071 or on free ports (`tests/support/server-process.ts`).
  Never run `docker compose up` from a worktree, and never `docker compose down -v`.
- **Windows firewall:** the first test that listens on `0.0.0.0` may make Windows show an "allow access" dialog
  for `node.exe`. The test does not need the answer, because traffic from the machine to its own address is not
  filtered. Leave the dialog for the owner.

## Task overview

| Task | What | Goals |
|---|---|---|
| L0 | Baseline numbers and the phone overflow check (`npm run phone:check`) | G4, all (baseline) |
| L1 | Command-line flags `--host`, `--port`, `--help` | G3 |
| L2 | Listen on the chosen host; print the network URLs and the warning; UC-33 | G1, G2, G5 |
| L3 | Phone layout preview (390x844 states, light and dark) | G4 |
| L4 | Owner approval of the phone preview | G4, G6 |
| L5 | Phone layout in the app; UC-34 | G4 |
| L6 | Owner acceptance from a real phone | G5, G6 |

---

## L0 - Baseline numbers and the phone overflow check

**Files:** `scripts/phone-check.mts` (run as `node --import tsx scripts/phone-check.mts`), `package.json` script
`phone:check`, `tests/tools/phone-check.test.ts`, `docs/plans/2026-10-21-lan-access-evidence.md`.

1. On `main`, run `npm run verify` and record in a new evidence log, section `## L0`: the `main` SHA, exit code,
   unit (passed / skipped), contract, api and e2e counts, and the `uc-coverage` line.
2. Build the ratchet tool for G4. `phone:check` starts its own test-mode server
   (`ServerProcess.launch()` from `tests/support/server-process.ts`) and seeds one repo and two loops (one running
   with the mock executor and a finished run, one stopped) through the API. It opens the six screens (list `/`,
   form `/loops/new`, loop detail, execution detail, run detail, repos `/repos`) in Chromium at 390x844 with
   `isMobile` and `hasTouch`. On each screen it measures `document.documentElement.scrollWidth > innerWidth`, plus
   any visible element whose right edge passes the viewport. It prints one line per screen
   (`<screen>: ok` or `<screen>: overflow <px>px (<selector of widest element>)`), then
   `phone overflow: k/6 screens`. `--max k` exits 1 when the count is above `k`.
3. The measuring function (`overflowOf(page)`) is exported and unit-tested on two inline HTML fixtures, one that
   fits and one with a 600px-wide table. The tests run in a plain Chromium page, with no server.
4. Do not add `phone:check` to `verify` yet (L5 does, with `--max 0`).

**Verify**
- **Goal:** G4 needs a measured "before"; every later task needs the L0 counts.
- **Red:** `npx vitest run --project unit tests/tools/phone-check.test.ts` fails with a missing-module error for
  `scripts/phone-check.mts` (write the test first).
- **Green:** (1) the same command passes, with both fixture cases asserted. (2) `npm run phone:check` on `main`
  prints six screen lines and `phone overflow: k/6 screens` with k above 0. Record k and the per-screen lines in
  the evidence log. (3) `npm run verify` exits 0, and the evidence log holds the counts.
- **Stub check:** a checker that always prints `0/6` fails the 600px fixture case. An evidence log without
  counts gives L1 to L6 nothing to compare against.
- **Ratchet:** unit count goes up by the new tests. `phone overflow` k is recorded as the baseline (L5 takes it
  to 0).

## L1 - Command-line flags `--host`, `--port`, `--help`

**Files:** `server/config.ts` (`loadConfig(env, argv)`, `parseArgs`, `USAGE`), `server/config.test.ts`,
`server/main.ts` (passes `process.argv.slice(2)`, prints usage and exits), `tests/api/server-lifecycle.test.ts`
or a new `tests/api/cli.test.ts` (process test), `README.md` (Configuration table: a Flag column).

Implement spec D2 and section 4. `Config` gains `host` (default `127.0.0.1`). The flags table in `USAGE` lists
every flag with its environment variable and default. `--port` reuses `readPort` and its message. `main.ts`
still listens on `127.0.0.1` in this task (L2 switches to `cfg.host`), so behaviour is unchanged.

**Verify**
- **Goal:** G3.
- **Red:** write the tests first. `npx vitest run --project unit server/config.test.ts` fails: `parseArgs` is not
  exported, and `loadConfig({}, ['--host=0.0.0.0']).host` is `undefined`.
- **Green:** (1) the same command passes, with at least these cases: `--host=0.0.0.0`; `--host 0.0.0.0`
  (space form); `npm_config_host` only; `LOOPS_HOST` only; argument beats `npm_config_host`, which beats
  `LOOPS_HOST`; `--port=7170`; `--port=70000` throws the `readPort` message; `--hots=x` throws
  `unknown flag --hots` and the error carries the usage; `--host` without a value throws; `--help` sets
  `help: true`. (2) The process test: `node --import tsx server/main.ts --nope` exits 2 with stderr containing
  `unknown flag --nope` and `Usage:`; `--help` exits 0 with stdout containing `--host` and `--port`. (3)
  `npm run verify` exits 0.
- **Stub check:** a parser that ignores its input fails the precedence and unknown-flag cases. A `main.ts` that
  does not read argv fails the exit-code test.
- **Ratchet:** unit and api counts above L0.

## L2 - Listen on the chosen host; network URLs; UC-33

**Files:** `server/main.ts` (listen on `cfg.host`; startup lines), a pure function `networkUrls(host, port,
interfaces)` in `server/config.ts` with unit tests, `tests/support/server-process.ts` (`launch({ args })` passes
extra arguments to `server/main.ts`; `baseUrl` stays on `127.0.0.1`), `tests/e2e/network.spec.ts`,
`docs/USE-CASES.md` (UC-33 row, 33 use cases), `package.json` (`verify`: `--min 33`), `README.md` (section
"Open from another device": the command, the URLs in the log, the Windows firewall dialog and Private profile,
`New-NetFirewallRule -DisplayName "Castraferrum 7070" -Direction Inbound -Protocol TCP -LocalPort 7070 -Action Allow -Profile Private`
run once from an administrator PowerShell, and the D4 warning), `docs/ARCHITECTURE.md` ("Ports and commands").

Startup log (spec D3, D4): `Castraferrum: http://127.0.0.1:<port>`, then for `0.0.0.0` one
`On your network: http://<ipv4>:<port>` per non-internal IPv4 address, then the warning line when the host is not
a loopback address. The old `Loop Console:` prefix of that line becomes `Castraferrum:`.

**Verify**
- **Goal:** G1, G2 (and the README text for G5).
- **Red:** write the tests first. `npm run build` then
  `npx playwright test --project chromium tests/e2e/network.spec.ts` fails: the `@UC-33` test cannot connect to
  `http://<ipv4>:<port>/` (`net::ERR_CONNECTION_REFUSED`), because the server still binds `127.0.0.1`.
  `npx vitest run --project unit server/config.test.ts` fails on the missing `networkUrls` export.
- **Green:** (1) the unit command passes, with cases for `0.0.0.0` with two fake interfaces (two network URLs),
  a specific address (that URL only), and `127.0.0.1` (no network line, no warning). (2) The e2e command prints
  `2 passed`: the `@UC-33` test opens the list at the IPv4 address in a 390x844 touch context, starts a seeded
  loop, sees the Running state within 2 seconds, and stops it; it also finds the `On your network:` line with that
  address and the warning in the server output. The second test shows `ECONNREFUSED` on the IPv4 address and 200
  on `127.0.0.1` without `--host`. (3) `npm run verify` exits 0, and `uc-coverage` prints
  `UCs with a green e2e: 33/33`.
- **Stub check:** without the listen change the first e2e test cannot connect. Always binding `0.0.0.0` fails the
  second test. A hard-coded URL fails the two-interface unit case. The tests need a machine with at least one
  non-internal IPv4 address; when none exists they fail with a message that says so, never skip silently.
- **Ratchet:** `uc-coverage` 32/32 to 33/33; unit and e2e counts above L1.

## L3 - Phone layout preview

**Files:** `design/preview/states.js`, `design/preview/preview.js`, `design/preview/data.js` (only if a state
needs new sample data), `design/STATES.md` (one row per new state and a D-UI decision row for each choice the
preview makes), `design/components.css` (phone rules in a new block at the end, under a media query below the
phone breakpoint, reading only existing tokens), `design/preview/shots/phone-*.png`, `design/README.md`
(a "Components added after the first set" row).

Draw at least these states with `vp: [390, 844]`, light and dark:

| id | Screen and state |
|---|---|
| `phone-list` | List with every kind of row (as `list-overview`), top bar and stats folded for 390px |
| `phone-list-actions` | The tappable Stop and row menu on a running row (spec D6) |
| `phone-stop-confirm` | Stop confirmation dialog on a phone (`fixed`) |
| `phone-loop-running` | Loop detail with the live log of a running run |
| `phone-run-transcript` | Run detail with the transcript frame |
| `phone-exec` | Execution detail with the session-id list |
| `phone-form-new` | New loop form, schedule builder included |
| `phone-repos` | Repo page with the registration row and Browse |
| `phone-disconnected` | Lost connection banner |
| `vi-phone-list` | `phone-list` in Vietnamese (the longest strings) |

The desktop states must not change. Re-shoot only the new states (`npm run design:shots -- --only <ids>`) and
check that no existing PNG changed (`git status design/preview/shots` lists only new `phone-*` files).

**Verify**
- **Goal:** G4 needs an approved reference before the app changes.
- **Red:** `npm run design:states` prints `states with shots: 92/92` on `main`. After adding the state rows
  and before shooting, it exits 1 and names the missing `phone-*` shots.
- **Green:** (1) `npm run design:states` exits 0 and prints `states with shots: N/N` with N of at least 102.
  (2) `git diff --stat main -- design/preview/shots` lists only added `phone-*` and `vi-phone-*` files (no
  modified PNG). (3) Each new shot is 390px wide (a check in the evidence section:
  `node -e` reading the PNG header width of every `phone-*` file prints `390` for all). (4) `npm run verify`
  exits 0, so the desktop visual tests are untouched. (5) The PR body embeds or links every new light shot and
  lists the D-UI decisions for the owner.
- **Stub check:** states without shots fail `design:states`. Shots at 1440px fail the width check. A CSS change
  that leaks into the desktop layout turns the existing visual tests red.
- **Ratchet:** preview states 92 to at least 102.

## L4 - Owner approval of the phone preview

**Who:** the owner. The issue carries `loop:needs-human`, and a loop never works on it.

The owner opens `design/preview/index.html` (filter or search `phone`), looks at each phone state in light and
dark, and answers on the issue. On approval, the owner, or a session the owner asks, adds a "phone preview" entry
to `design/APPROVED.md` with the owner's words and closes the issue. Requested changes become comments; L3 is
reopened, or a follow-up task is added before L5.

**Verify**
- **Goal:** G4 (the reference is ratified), G6.
- **Red:** not applicable. Approval is a human judgement.
- **Green:** `design/APPROVED.md` on `main` has a phone preview entry quoting the owner, and the owner closed
  this issue.
- **Stub check:** only the owner's own words count. A session must not approve on its own unless the owner
  delegates it in writing on this issue.

## L5 - Phone layout in the app; UC-34

**Files:** `design/components.css` (already holds the approved phone rules from L3; adjust only to match the
shots), `web/` components that need markup for the tappable row actions or a folded top bar,
`tests/visual/phone.visual.ts` (one `snap` per `phone-*` state at the preview viewport), `tests/e2e/phone.spec.ts`,
`docs/USE-CASES.md` (UC-34, 34 use cases), `package.json` (`verify`: `--min 34` and `npm run phone:check -- --max 0`
after the e2e step).

**Verify**
- **Goal:** G4.
- **Red:** write the tests first. `npm run build` then
  `npx playwright test --project visual tests/visual/phone.visual.ts` fails with mismatch ratios above
  `MAX_RATIO` on the phone states. `npx playwright test --project chromium tests/e2e/phone.spec.ts` fails at
  tapping the Stop control on a running row (it does not exist on touch). `npm run phone:check` prints the L0
  baseline k.
- **Green:** (1) `npx playwright test --project visual tests/visual/phone.visual.ts` passes, every region at or
  under `MAX_RATIO`, light and dark. (2) `npx playwright test --project chromium tests/e2e/phone.spec.ts` passes.
  The `@UC-34` test at 390x844 with touch creates a loop through the form, starts it, sees its live log line
  within 1 second, opens the run transcript, stops the loop from the list row, and registers a repo. After each
  step it asserts `scrollWidth <= innerWidth`. (3) `npm run phone:check` prints `phone overflow: 0/6 screens`.
  (4) `npm run verify` exits 0, every desktop visual test stays green, and `uc-coverage` prints
  `UCs with a green e2e: 34/34`.
- **Stub check:** without phone CSS the visual ratios exceed the threshold and `phone:check` stays at k. Without
  the tappable control the e2e cannot stop the loop from the list. A change that breaks the desktop turns the
  existing visual tests red.
- **Ratchet:** `phone overflow` k to 0; `uc-coverage` 33/33 to 34/34; e2e and visual counts above L2.

## L6 - Owner acceptance from a real phone

**Who:** the owner. The issue carries `loop:needs-human`.

The owner pulls `main`, runs `npm run build`, starts the console with `npm start -- --host=0.0.0.0`, follows the
README "Open from another device" section word for word, and opens the printed URL on the phone over the home
Wi-Fi. On the phone: create a loop, start it, watch the live log, open a run transcript, stop it. Then compare
the phone screens with `design/preview/shots/phone-*`.

**Verify**
- **Goal:** G5, G6.
- **Red:** not applicable. Acceptance is a human judgement.
- **Green:** the owner closes this issue with a sign-off comment. Whatever they reject becomes a follow-up issue,
  added as a sub-issue of phase 1; the phase is done when those are closed or waived by the owner.
- **Stub check:** only the owner's own comment counts.
