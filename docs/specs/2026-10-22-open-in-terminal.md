# Spec: open a run's Claude session in a terminal

- Date: 2026-10-22
- Status: decisions approved by the owner in conversation (2026-10-22); owner reviews this document after merge
- Epic: #138. Design-system gap: #139
- Plan: [../plans/2026-10-22-open-in-terminal.md](../plans/2026-10-22-open-in-terminal.md)

## 1. Context

The run page shows `claude --resume <id>` with a copy button once a Claude run has ended
(`web/features/loop-detail/RunDetailView.tsx`; the new UI draws the same block, `run-resume`, in
`design/ds/preview/preview.js`). To look inside the session, the owner copies the command, opens a terminal,
changes to the repo folder (Claude Code keeps sessions per project directory) and pastes it. The owner wants this in
one click. They also want to choose the terminal app (PowerShell or Windows Terminal on Windows; Terminal or iTerm2
on macOS) and to change the command, for example to add `--dangerously-skip-permissions`.

A browser cannot open a terminal, so the console server starts one on the machine it runs on. The new UI already
has a Settings tab root (ui-uplift spec 5.8; built in U14, #82). The settings there live in the browser, but the
terminal setting has to live on the server, because the server reads it.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **The server opens the terminal on its own machine, and any device that can use the console may ask it to.** The answer carries the machine's host name, and the success toast names it: "Opened in Windows Terminal on DESKTOP-1". | Owner, 2026-10-22: "any device". Anyone who can use the console can already make a loop run commands on that machine, so this adds no new power. The host name stops a phone user from expecting a window on the phone. |
| D2 | **The default command lives on the server**, in a new key-value table `console_settings (key text primary key, value jsonb not null, updated_at timestamptz not null)` (migration `0004_console_settings.sql`). The terminal setting is the key `terminal`, with value `{ app, command, launcher }`. There is a port `SettingsRepository` with a Postgres adapter and a memory adapter. | The launcher runs on the server. A key-value table holds later console-wide settings without a migration each time. |
| D3 | **The command template.** The default is `claude --resume {sessionId}`. Rules: 1 to 500 characters, one line, contains `{sessionId}` at least once, and contains no other `{word}` placeholder. A shared pure function `resolveResumeCommand(template, sessionId)` in `shared/domain/` checks the template and substitutes. Before substitution the session id must match a UUID, or the function throws. | One function serves the server, the editor's live preview and the tests. A UUID cannot carry shell syntax, so the only free text is what the owner typed. |
| D4 | **Per-loop override.** The Claude executor config (`claudeConfigSchema`) gains `resumeCommand: string \| null` (default `null`, same rules as D3). The command used is the loop's `resumeCommand`, or the default from Settings when it is `null`. The editor shows it as an optional field whose placeholder is the current default. The loop's settings show it only when it is set. | Owner, 2026-10-22: "a default in Settings applies to all loops, and each loop can edit it". The config is `jsonb`, so no migration is needed. |
| D5 | **The terminal apps.** On Windows: Windows Terminal (`wt`), PowerShell 7 (`pwsh`), Windows PowerShell (`powershell`), Command Prompt (`cmd`). On macOS: Terminal (`terminal`), iTerm2 (`iterm`). On Linux: GNOME Terminal (`gnome-terminal`), Konsole (`konsole`), `x-terminal-emulator`. Everywhere: Custom (`custom`). The settings answer lists the apps of the server's platform, with `found` for each. The default app is the first one found, in that order. | Owner, 2026-10-22: the list is approved. |
| D6 | **How each app starts** (the argv is pinned by unit tests; `<cmd>` is the resolved command, `<repo>` the loop's repo path). No shell string is ever built from the repo path. | See below. |
| D7 | **Custom launcher.** The template is split into argv with a quote-aware splitter. Each argument has `{cwd}` and `{command}` substituted. The result is spawned without a shell, with `cwd` set. `{command}` is required. | It covers Ghostty, WezTerm, kitty, Warp and Alacritty without a code path for each. |
| D8 | **Starting and failing.** Every app spawns `detached`, with `stdio: 'ignore'` and `windowsHide: false`, then `unref()`. On Windows a detached child gets its own console window. `osascript` is awaited (at most 10 seconds) so that a denied Automation permission (error `-1743`) or another failure is reported. Any other app counts as started once the `spawn` event fires without an `error` within 2 seconds. | The console must not hold the terminal's lifetime, and a failure has to reach the user. |
| D9 | **When the button works:** only for a run that has ended and has a session id, the same rule as the copy block (D-UI12), and only when the repo directory exists. | Resuming a live session would tangle it. |
| D10 | **The routes.** `GET /api/settings/terminal` returns `{ platform, host, apps: [{ id, label, found }], app, command, launcher, defaults: { app, command } }`. `PUT /api/settings/terminal` takes `{ app, command, launcher }` and answers with the GET shape. `POST /api/runs/:id/terminal` answers 200 `{ app, label, host, command }`. New codes: `RUN_NOT_ENDED` (409), `RUN_HAS_NO_SESSION` (409), `REPO_DIR_MISSING` (409), `TERMINAL_NOT_AVAILABLE` (409, the chosen app is not found), `TERMINAL_FAILED` (502, with `details.reason`: `notFound`, `automationDenied`, `exited`, `timeout`). | One answer gives the UI everything it shows. Each failure gets its own message and fix. |
| D11 | **Test seam.** The environment variable `LOOPS_TERMINAL_LAUNCHER=<path to .mjs>` replaces the spawn. It is accepted only against a database named `*_test`, the same guard as `LOOPS_MOCK_EXECUTOR` in `server/config.ts`. The console then runs `<current node> <path> <json>`, where the JSON is `{ app, argv, cwd }`. The e2e fake `tests/support/fake-terminal.mjs` appends that JSON to the file named by `FAKE_TERMINAL_LOG`, and with `FAKE_TERMINAL_FAIL=<reason>` it exits 1 with that reason. No test ever opens a real window. | The same pattern as the fake executables elsewhere in the suite. A test that opened real terminals would act on the owner's machine (memory: sandbox `claude -p` tests). |
| D12 | **No warning for `--dangerously-skip-permissions`.** | Owner, 2026-10-22. |
| D13 | **Where the UI shows it.** Settings gains a **Terminal** group between Appearance and Connection, on the desktop and the phone, with the *Terminal app* row, the *Command* field with the resolved line for a sample id, and the *Launcher* field when the app is Custom. The run page's resume block gains **Open in terminal** (`.btn.primary`) next to *Copy command* (`.btn.plain`). The editor gains *Resume command*. How these look is decided by the preview and #139, and approved by the owner. | Owner, 2026-10-22: the button sits next to *Copy command* as the main action. |

### D6: launch argv per app

| App | argv (`cwd` = `<repo>` unless stated) |
|---|---|
| `wt` | `wt.exe -w new -d <repo> <pwsh or powershell>.exe -NoExit -Command <cmd with ; escaped as \;>` (`wt` treats a bare `;` as its own separator; the inner shell is PowerShell 7 when found, else Windows PowerShell) |
| `pwsh`, `powershell` | `<exe> -NoExit -Command <cmd>` |
| `cmd` | `cmd.exe /K <cmd>` |
| `terminal` | `osascript -e 'tell application "Terminal"' -e 'activate' -e 'do script "cd <sh-quoted repo> && <cmd>"' -e 'end tell'` (AppleScript string escaping for `\` and `"`) |
| `iterm` | `osascript` with `tell application "iTerm"`, `activate`, `create window with default profile`, `tell current session of current window to write text "cd <sh-quoted repo> && <cmd>"` (`write text` keeps the login shell and the profile) |
| `gnome-terminal` | `gnome-terminal --working-directory=<repo> -- bash -lc '<cmd>; exec bash'` |
| `konsole` | `konsole --workdir <repo> -e bash -lc '<cmd>; exec bash'` |
| `x-terminal-emulator` | `x-terminal-emulator -e bash -lc '<cmd>; exec bash'` |
| `custom` | D7 |

Detection: on Windows, the executables on `PATH` (`wt.exe` is an app execution alias in
`%LOCALAPPDATA%\Microsoft\WindowsApps`, which is on `PATH`), with `cmd` always found. On macOS,
`/System/Applications/Utilities/Terminal.app` (or `/Applications/Utilities/Terminal.app`) and `/Applications/iTerm.app`.
On Linux, `PATH`. Detection takes `platform`, `env` and an `exists(path)` function, so every platform is tested on
any machine.

## 3. Goals

| # | Goal: what the user sees | Oracle |
|---|---|---|
| G1 | On an ended Claude run, **Open in terminal** opens a new window of the chosen terminal on the console's machine. The window starts in the loop's repo folder and runs the loop's command, or the default. | e2e `@UC-37` with the fake launcher (the argv, the cwd and the resolved command recorded). A manual run on Windows (Windows Terminal, PowerShell 7) recorded in the evidence log with screenshots. The owner on macOS (Terminal, iTerm2) at acceptance. |
| G2 | Settings has a **Terminal** group. The app list shows only the apps found on this machine, plus Custom. The command field shows the resolved line as you type. The values survive a server restart. | e2e: save, restart the server, read back. Visual test against the approved preview state. |
| G3 | A loop can override the command in the editor. Leaving it empty uses the default, and the loop's settings show the override. | e2e: a loop with an override opens with its own command, a loop without one opens with the default. |
| G4 | A bad command or launcher is refused with a message under its field. | API tests for each rule of D3 and D7. e2e for one rule. |
| G5 | When the terminal cannot start, a toast names the reason and the fix, and *Copy command* still works. | e2e with `FAKE_TERMINAL_FAIL`; unit tests for the mapping of `osascript` `-1743` and `ENOENT`. |
| G6 | The new parts match the approved preview, on the desktop and the phone, in light and dark. | Visual tests against the approved states; `npm run ratchets` exit 0. |

## 4. Use case added

| UC | Scenario | Expected result |
|---|---|---|
| UC-37 | **Open a run's session in a terminal**: open an ended Claude run, press **Open in terminal** | The chosen terminal opens on the console's machine in the repo folder and runs the loop's resume command (the loop's own, or the default from Settings) with the run's session id. A toast says which app and which machine. A run still running has no button. When the terminal cannot start, a toast names the reason. |

## 5. Out of scope

- Opening a terminal on the device that clicks, when that is not the console's machine (a browser cannot).
- Per-loop terminal *app* (only the command is per loop).
- Resuming a session that is still running.
- The classic UI: the feature is built only in the new UI (the classic UI goes at the ui-uplift cut-over, U25).
