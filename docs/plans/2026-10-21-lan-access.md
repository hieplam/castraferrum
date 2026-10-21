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
| L0 | Baseline numbers (the phone overflow check moved to ui-uplift U0) | all (baseline) |
| L1 | Command-line flags `--host`, `--port`, `--help` | G3 |
| L2 | Listen on the chosen host; print the network URLs and the warning; UC-33 | G1, G2, G5 |
| L3 | Superseded by epic #63 (ui-uplift U5 to U9) | - |
| L4 | Superseded by epic #63 (ui-uplift U10) | - |
| L5 | Superseded by epic #63 (ui-uplift U14 to U24, UC-34) | - |
| L6 | Owner acceptance from a real phone | G5, G6 |

---

## L0 - Baseline numbers

**Files:** `docs/plans/2026-10-21-lan-access-evidence.md`.

On `main`, run `npm run verify` and record in a new evidence log, section `## L0`: the `main` SHA, the exit code,
unit (passed / skipped), contract, api and e2e counts, and the `uc-coverage` line. The phone overflow check this task
used to build is built by task U0 of epic #63 (ui-uplift); when `npm run phone:check` exists on `main`, record its
last line too.

**Verify**
- **Goal:** every later task of this phase needs the L0 counts.
- **Red:** not applicable: this task writes no code, it records numbers.
- **Green:** the evidence log on `main` holds the SHA, the exit code 0 of `npm run verify`, the four test counts and
  the `uc-coverage` line, copied from the command output.
- **Stub check:** an evidence log without the counts gives L1 and L2 nothing to compare against.
- **Ratchet:** none moves; the numbers become the baseline.

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

## L3 - Phone layout preview (superseded)

Superseded by epic #63, the UI uplift: the phone layout is drawn mobile-first for every screen in its preview tasks
U5 to U9 (`design/ds/preview/`, `phone-*` states). Closed as not planned.

## L4 - Owner approval of the phone preview (superseded)

Superseded by epic #63, task U10 (owner approval of the new design system and preview). Closed as not planned.

## L5 - Phone layout in the app; UC-34 (superseded)

Superseded by epic #63: the screens are built in U14 to U19, and UC-34 with the phone e2e test and the overflow check
at 0 lands in U24. Closed as not planned.

## L6 - Owner acceptance from a real phone

**Who:** the owner. The issue carries `loop:needs-human`.

The owner pulls `main`, runs `npm run build`, starts the console with `npm start -- --host=0.0.0.0`, follows the
README "Open from another device" section word for word, and opens the printed URL on the phone over the home
Wi-Fi. On the phone: create a loop, start it, watch the live log, open a run transcript, stop it. Then compare
the phone screens with `design/ds/preview/shots/phone-*` (this task also waits for the cut-over of epic #63, U25).

**Verify**
- **Goal:** G5, G6.
- **Red:** not applicable. Acceptance is a human judgement.
- **Green:** the owner closes this issue with a sign-off comment. Whatever they reject becomes a follow-up issue,
  added as a sub-issue of phase 1; the phase is done when those are closed or waived by the owner.
- **Stub check:** only the owner's own comment counts.
