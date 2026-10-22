# Plan: open a run's Claude session in a terminal

- Date: 2026-10-22
- Epic: [castraferrum#138](https://github.com/hieplam/castraferrum/issues/138). Design-system gap: [castraferrum#139](https://github.com/hieplam/castraferrum/issues/139)
- Spec: [../specs/2026-10-22-open-in-terminal.md](../specs/2026-10-22-open-in-terminal.md) (decisions D1 to D13,
  goals G1 to G6, UC-37)
- Evidence log: `docs/plans/2026-10-22-open-in-terminal-evidence.md`. OT0 creates it. Every task appends a section
  headed `## OT<k>` with its Red and Green output and its before and after numbers (commands and literal output only).

## How to read this plan

- **This file wins** over the copy of a section in a task issue.
- **One task, one pull request.** The pull request carries the code, the tests and the task's evidence section. Its
  body contains `Closes #<task issue>` and a `## Verify` section with Red, Green and Stub check and their results.
  Every pull request that touches `web/` or `design/` names the design-system components it used (`CLAUDE.md`).
- **Order:** one task at a time, in the order below. The UI tasks also wait for the ui-uplift task that builds the
  page they extend: OT5 for U14 (#82), OT6 for U16 (#84) and U18 (#86), OT7 for U17 (#85).
- **Verify blocks are the contract.** Write the tests first, run Red and keep its literal output. A task is done only
  when every Green command has been run and its output matches. "The suite is green" alone never counts.
- **Never decrease** (against the numbers OT0 records): unit, contract, api and e2e test counts, preview states and
  `uc-coverage`. `npm run verify` exits 0 at the end of every task.
- **No real terminal in tests.** Tests and e2e use `LOOPS_TERMINAL_LAUNCHER` with `tests/support/fake-terminal.mjs`
  (spec D11), or an injected `spawn`. A test that would open a real window, or run the real `claude`, is a bug.
  Manual checks on a real terminal happen only in OT8 and OT9.
- **The running console is off limits.** Never stop, restart or kill the process on `127.0.0.1:7070`. Tests start
  their own servers (`tests/support/server-process.ts`).

## Task overview

| Task | What | Goals |
|---|---|---|
| OT0 | Baseline numbers | all (baseline) |
| OT1 | Server: the settings store, the terminal settings routes, the per-loop `resumeCommand` | G2, G3, G4 (server) |
| OT2 | Server: detection, the launcher, `POST /runs/:id/terminal`, the fake launcher | G1, G5 (server) |
| OT3 | Design system and preview: the Terminal group, the editor field, the run page action, the toasts (castraferrum#139) | G6 (drawn) |
| OT4 | **Owner approval of the preview** (`loop:needs-human`) | G6 |
| OT5 | UI: the Terminal group on Settings | G2, G4, G6 |
| OT6 | UI: *Resume command* in the editor and in the loop's settings | G3, G6 |
| OT7 | UI: **Open in terminal** on the run page; UC-37 | G1, G5, G6 |
| OT8 | Docs and the manual Windows check | G1 |
| OT9 | **Owner acceptance** (`loop:needs-human`) | all |

---

## OT0 - Baseline numbers

**Files:** `docs/plans/2026-10-22-open-in-terminal-evidence.md`.

On `main`, run `npm run verify` and record in a new evidence log, section `## OT0`:

- the `main` SHA and the exit code;
- the unit (passed / skipped), contract, api and e2e counts;
- the `uc-coverage` line;
- the preview state count from `npm run design:states -- --design design/ds`.

**Verify**
- **Goal:** every later task compares its numbers with OT0.
- **Red:** not applicable: this task writes no code, it records numbers.
- **Green:** the evidence log on `main` holds the SHA, exit code 0, the four test counts, the `uc-coverage` line and
  the state count, each copied from command output.
- **Stub check:** a log without the counts gives OT1 nothing to compare against.
- **Ratchet:** none moves; the numbers become the baseline.

## OT1 - Server: settings store, terminal settings routes, per-loop `resumeCommand`

**Files:**
- `shared/domain/resume-command.ts`: `DEFAULT_RESUME_COMMAND`, `checkResumeCommand(template)` (returns an error
  code or `null`), `resolveResumeCommand(template, sessionId)` (spec D3), and `splitLauncher(template)` (spec D7,
  quote-aware). With `shared/domain/resume-command.test.ts`.
- `shared/domain/terminal-apps.ts`: the app ids, labels and platform order of spec D5.
- `shared/contracts/settings.ts`: the zod schemas of the GET and PUT bodies (spec D10).
- `server/ports/settings-repository.ts`; `server/adapters/postgres/pg-settings-repository.ts`;
  `server/adapters/memory/memory-settings-repository.ts` (exported from `memory/index.ts`); the table in
  `server/adapters/postgres/schema.ts`; migration `0004_console_settings.sql` with `npm run db:generate`.
- `server/services/settings-service.ts` and its test: reads and writes the `terminal` key. When nothing is stored
  it falls back to the defaults (the first found app; `DEFAULT_RESUME_COMMAND`; `launcher` empty). In this task the
  detection is a constructor argument returning a fixed list; OT2 replaces it with the real one.
- `server/http/settings-routes.ts`, registered in `server/http/app.ts` and wired in `server/compose.ts`.
- `server/adapters/executors/claude/claude-agent-executor.ts`: `claudeConfigSchema` gains
  `resumeCommand: z.string().nullable().default(null)`, refined with `checkResumeCommand`.
- `tests/api/settings-api.test.ts`; `docs/API.md` (two rows).

**Verify**
- **Goal:** G2, G3 and G4 on the server: the setting is stored, survives a restart and refuses bad values; a loop
  stores its own command.
- **Red:** write the tests first. `npx vitest run --project unit shared/domain/resume-command.test.ts` fails because
  the module does not exist. `npx vitest run --project api tests/api/settings-api.test.ts` fails with 404 on
  `GET /api/settings/terminal`.
- **Green:**
  - (1) The unit command passes, with at least these cases:
    - the default resolves with a UUID;
    - `{sessionId}` twice is replaced twice;
    - a template without `{sessionId}` gives `missingSessionId`;
    - a template with a line break gives `multiLine`;
    - `{repo}` gives `unknownPlaceholder`;
    - 501 characters gives `tooLong`;
    - a non-UUID session id throws;
    - `splitLauncher('ghostty -e "{command}" --cwd={cwd}')` gives three arguments;
    - a launcher without `{command}` gives `missingCommand`.
  - (2) The api command passes:
    - GET on an empty store answers the defaults;
    - PUT then GET returns the saved values;
    - the values survive a restart of the composed server on the same database;
    - PUT with each bad value of (1) answers 400 `VALIDATION_FAILED` with the field and the code;
    - PUT of an app the platform does not list answers 400;
    - `PUT /api/loops/:id` with `executor: claude` and `resumeCommand: "claude --resume"` answers 400, and with
      `"claude --resume {sessionId} --verbose"` it answers 200 and stores it.
  - (3) `tests/api/api-surface.test.ts` passes with the two new rows.
  - (4) `npm run verify` exits 0.
- **Stub check:** routes that echo the body pass neither the restart case nor the validation cases. A resolver that
  returns the template unchanged fails the substitution case.
- **Ratchet:** unit and api counts above OT0.

## OT2 - Server: detection, launcher, `POST /runs/:id/terminal`, fake launcher

**Files:**
- `server/ports/terminal-launcher.ts`: `detect(): Promise<TerminalApp[]>` and
  `open({ app, cwd, command, launcher }): Promise<void>`. `open` throws `TerminalError` with a reason (spec D10).
- `server/adapters/terminal/detect.ts`: `detectApps({ platform, env, exists })` (spec D6, Detection).
- `server/adapters/terminal/argv.ts`: `launchArgv(app, { cwd, command, launcher, innerShell })`, which returns
  `{ file, args, cwd, waitForExit }` for every app of spec D6, plus the AppleScript and POSIX quoting helpers.
- `server/adapters/terminal/spawn-launcher.ts`: spawns per spec D8 through an injected `spawn`. It maps `ENOENT` to
  `notFound`, `osascript` stderr with `-1743` to `automationDenied`, another non-zero exit to `exited`, and more than
  10 seconds to `timeout`.
- `server/adapters/terminal/hook-launcher.ts`: used when `LOOPS_TERMINAL_LAUNCHER` is set (spec D11). The guard goes
  in `server/config.ts` next to the `LOOPS_MOCK_EXECUTOR` guard, with a case in `server/config.test.ts`.
- Unit tests for the four modules (`*.test.ts` next to each). The argv tests use inline snapshots, one per app, with
  a repo path holding a space and a `'`, and a command holding `;` and `"`.
- `server/services/terminal-service.ts` and its test: loads the run, its loop and repo; checks spec D9; picks the
  command (`loop.executorConfig.resumeCommand ?? settings.command`); resolves it; calls `open`; answers
  `{ app, label, host: os.hostname(), command }`.
- `server/http/terminal-routes.ts` (`POST /api/runs/:id/terminal`); the five new codes in `server/http/errors.ts`
  and `shared/domain/errors.ts`.
- `tests/support/fake-terminal.mjs`; `tests/api/terminal-api.test.ts`; `docs/API.md` (one row).

**Verify**
- **Goal:** G1 and G5 on the server: the right program starts with the right arguments in the repo folder, and each
  failure has its code.
- **Red:** write the tests first. `npx vitest run --project unit server/adapters/terminal` fails because the modules
  do not exist. `npx vitest run --project api tests/api/terminal-api.test.ts` fails with 404 on
  `POST /api/runs/<id>/terminal`.
- **Green:**
  - (1) The unit command passes:
    - detection finds `wt`, `pwsh` and `cmd` on a faked Windows `PATH`, `terminal` and `iterm` on faked macOS paths,
      and `konsole` on a faked Linux `PATH`;
    - one argv snapshot per app; `wt` escapes `;` as `\;`; `terminal` and `iterm` escape `"` and `\` in the
      AppleScript string and single-quote the repo path;
    - the custom launcher substitutes `{cwd}` and `{command}`;
    - the spawn launcher maps `ENOENT`, `-1743`, exit 1 and a hang (fake clock) to their reasons.
  - (2) The api command passes, on a server started with `LOOPS_TERMINAL_LAUNCHER=tests/support/fake-terminal.mjs`:
    - an ended run with a session answers 200 and the fake log holds `{ app, argv, cwd }`, with `cwd` = the repo
      path and the argv containing `claude --resume <the run's session id>`;
    - a loop whose `resumeCommand` is `claude --resume {sessionId} --verbose` shows `--verbose` in the argv;
    - a running run answers 409 `RUN_NOT_ENDED`;
    - a run without a session answers 409 `RUN_HAS_NO_SESSION`;
    - a deleted repo folder answers 409 `REPO_DIR_MISSING`;
    - an app that is not found answers 409 `TERMINAL_NOT_AVAILABLE`;
    - `FAKE_TERMINAL_FAIL=automationDenied` answers 502 `TERMINAL_FAILED` with that reason;
    - an unknown run answers 404 `RUN_NOT_FOUND`.
  - (3) `LOOPS_TERMINAL_LAUNCHER` against a database not named `*_test` throws at config load (config test).
  - (4) `npm run verify` exits 0.
- **Stub check:** a launcher that does nothing leaves the fake log empty and fails the first api case. A service
  that ignores the loop's command fails the `--verbose` case. Hard-coded argv fails the quoting snapshots.
- **Ratchet:** unit and api counts above OT1.

## OT3 - Design system and preview (castraferrum#139)

**Files:** `design/ds/preview/preview.js`, `design/ds/preview/data.js`, `design/ds/STATES.md`,
`design/ds/SYSTEM.md`, `design/ds/index.html`, `design/ds/components.css` (only if castraferrum#139 needs a new rule),
`shared/i18n/en.ts` and `shared/i18n/vi.ts` (the new keys), `docs/specs/2026-10-21-ui-uplift.md` Appendix B (the
new texts).

Draw, from existing components first (`.group`, `.cell`, `.fcell.is-row`, `.select`, `.field`, `.input.is-data`,
`.hint`, `.cmd`, `.btn.primary`, `.btn.plain`, `.toast`), the parts that castraferrum#139 lists:

- the Settings **Terminal** group between Appearance and Connection;
- the editor's *Resume command* field (empty, with the default as placeholder);
- the loop settings row when an override is set;
- the run page resume block with **Open in terminal** and *Copy command*;
- the success toast naming the app and the host, and the failure toast for each reason.

A part the system lacks is added to `components.css` and `SYSTEM.md` and drawn on `design/ds/index.html`, never
inline. New states, desktop and phone, light and dark:

- `settings-terminal`, `settings-terminal-custom`, `settings-terminal-err`;
- `editor-resume-command`, `loop-settings-resume-command`;
- `run-open-terminal`, `run-open-terminal-opened`, `run-open-terminal-failed`;
- `phone-settings-terminal`, `phone-run-open-terminal`.

The Windows sample world lists Windows Terminal, PowerShell 7, Windows PowerShell and Command Prompt, plus Custom.

**Verify**
- **Goal:** G6 drawn: the owner can judge every new part in the preview before any UI is built.
- **Red:** with the 10 rows added to `design/ds/STATES.md`, `npm run design:states -- --design design/ds` exits 1
  naming the 10 missing states.
- **Green:**
  - (1) `npm run design:shots -- --design design/ds --dry` prints `0 problems`, with the drawn count up by 10 from OT0.
  - (2) `npm run design:states -- --design design/ds` exits 0, with the count up by 10.
  - (3) `npm run ratchets -- --base main` exits 0: no raw value and no class outside the system.
  - (4) The i18n test passes; `vi.ts` holds every new key.
  - (5) Screenshots of `settings-terminal` and `run-open-terminal` (light and dark) are in the PR body.
  - (6) `npm run verify` exits 0.
- **Stub check:** a state row with nothing drawn fails (1). A part drawn with an inline style or an invented class
  fails (3).
- **Ratchet:** preview states up by 10 from OT0.

## OT4 - Owner approval of the preview

**Who:** the owner. The issue carries `loop:needs-human`.

The owner pulls `main`, runs `npm ci` and `npm run design:shots -- --design design/ds --dry`, and opens
`design/ds/preview/index.html` (the 10 new states, desktop and phone, light and dark) and `design/ds/index.html`.
On approval an entry "open in terminal" goes into `design/APPROVED.md`, quoting the owner in English, and castraferrum#139 is
closed. Requested changes reopen OT3.

**Verify**
- **Goal:** G6.
- **Red:** not applicable. Approval is a human judgement.
- **Green:** the entry in `design/APPROVED.md` on `main`, and the owner closes this issue.
- **Stub check:** only the owner's own words count.

## OT5 - UI: the Terminal group on Settings

**Waits for:** OT4 and U14 (#82).

**Files:** `web/features/settings/TerminalGroup.tsx` (used by `SettingsView.tsx`), `web/api/` (the client calls and
the fake API), `tests/visual/ds/frame.visual.ts` (or the file U14 put the settings states in), and
`tests/e2e/terminal.spec.ts` (new).

The group reads `GET /api/settings/terminal` and saves with `PUT`. The command preview uses `resolveResumeCommand`
with a sample id, and field errors come from `checkResumeCommand` as the user types and from the 400 answer on save.

**Verify**
- **Goal:** G2, G4, G6.
- **Red:** write the tests first. After `npm run build`, `npx playwright test tests/e2e/terminal.spec.ts -g settings`
  fails: `settings-terminal-app` is not found.
- **Green:**
  - (1) The e2e passes:
    - choose PowerShell 7 and type `claude --resume {sessionId} --verbose`; the preview line shows the sample id;
    - save, restart the server, reload: both values are back;
    - remove `{sessionId}`: the field shows the error and Save does nothing.
  - (2) The visual test of `settings-terminal`, `settings-terminal-custom`, `settings-terminal-err` and
    `phone-settings-terminal` passes against the approved shots.
  - (3) `npm run verify` exits 0.
- **Stub check:** a group that does not call the API fails the restart case. A group drawn differently from the
  approved state fails (2).
- **Ratchet:** e2e count and visual states above OT2.

## OT6 - UI: *Resume command* in the editor and the loop's settings

**Waits for:** OT5, U16 (#84) and U18 (#86).

**Files:** the editor built by U18 (the Claude section), `LoopSettingsView.tsx` and the side card from U16,
`tests/e2e/terminal.spec.ts`, and the editor and loop settings visual tests.

**Verify**
- **Goal:** G3, G6.
- **Red:** write the tests first. After `npm run build`, `npx playwright test tests/e2e/terminal.spec.ts -g editor`
  fails: `loop-resume-command` is not found.
- **Green:**
  - (1) The e2e passes:
    - the field is empty with the default as placeholder;
    - type `claude --resume {sessionId} --verbose` and save; the loop's settings show it;
    - clear it and save; the row is gone and `GET /api/loops/:id` has `resumeCommand: null`;
    - a value without `{sessionId}` shows the error.
  - (2) The visual tests of `editor-resume-command` and `loop-settings-resume-command` pass.
  - (3) `npm run verify` exits 0.
- **Stub check:** a field that is not sent in the PUT body fails the reload case.
- **Ratchet:** e2e count above OT5.

## OT7 - UI: **Open in terminal** on the run page; UC-37

**Waits for:** OT6 and U17 (#85).

**Files:** `web/features/loop-detail/RunView.tsx` (the resume block), `web/api/`, `tests/e2e/terminal.spec.ts`
(`@UC-37`), `tests/visual/ds/run.visual.ts`, `docs/USE-CASES.md` (UC-37 row), `package.json` (`uc-coverage --min`
plus one from its value on `main`).

**Verify**
- **Goal:** G1, G5, G6.
- **Red:** write the tests first. After `npm run build`, `npx playwright test tests/e2e/terminal.spec.ts -g UC-37`
  fails: `run-open-terminal` is not found.
- **Green:**
  - (1) The `@UC-37` e2e passes on a server with the fake launcher. The case runs at desktop width and at 390x844:
    - on an ended run, press **Open in terminal**;
    - the fake log holds the run's session id, the loop's command and `cwd` = the repo path;
    - the toast names the app and `os.hostname()`;
    - a running run shows no button;
    - with `FAKE_TERMINAL_FAIL=notFound` the failure toast shows, and *Copy command* still copies.
  - (2) The visual tests of `run-open-terminal`, `run-open-terminal-opened`, `run-open-terminal-failed` and
    `phone-run-open-terminal` pass.
  - (3) `npm run verify` exits 0, and `uc-coverage` reports one more UC than on `main`, UC-37 included.
- **Stub check:** a button that only shows a toast leaves the fake log empty. A button shown on a running run fails
  the running case.
- **Ratchet:** `uc-coverage` up by one; e2e count above OT6.

## OT8 - Docs and the manual Windows check

**Files:** `docs/ARCHITECTURE.md` (the `TerminalLauncher` port and the settings store), `README.md` (a short
"Open a session in a terminal" section: Settings › Terminal, the per-loop override, and the macOS Automation
prompt), the evidence log.

On this Windows machine, a session started by the owner (not a loop run) builds `main` and starts a second console on
a free port against the main database, read-only use. It opens one ended run with each of Windows Terminal,
PowerShell 7 and Command Prompt, then stops that second console. It never touches the console on 7070.

**Verify**
- **Goal:** G1 on a real Windows terminal.
- **Red:** not applicable: documentation and a manual check.
- **Green:** the evidence log `## OT8` holds three screenshots, each a terminal window in the repo folder showing the
  resumed session, plus the API answer of each click. The README section exists. `npm run verify` exits 0.
- **Stub check:** a screenshot without the resumed conversation does not count.
- **Ratchet:** none moves.

## OT9 - Owner acceptance

**Who:** the owner. The issue carries `loop:needs-human`.

On their own machine (Windows, and macOS with Terminal and iTerm2 if they have one), from the desktop and from the
phone: set the default in Settings, override it on one loop, and open sessions from both loops. Compare the screens
with the approved preview states.

**Verify**
- **Goal:** all.
- **Red:** not applicable. Acceptance is a human judgement.
- **Green:** the owner closes this issue with a sign-off comment. What they reject becomes a follow-up sub-issue of
  castraferrum#138.
- **Stub check:** only the owner's own comment counts.
