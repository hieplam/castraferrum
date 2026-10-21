# Castraferrum - preview state list

Each table row below is one state that has its own design. Every row has two shots,
`preview/shots/<id>-light.png` and `preview/shots/<id>-dark.png`, and can be opened live at
`preview/app.html?state=<id>&theme=light|dark`. The index page is [`preview/index.html`](preview/index.html).

- **Ruler:** `npm run design:states` (`node scripts/design-states.mjs`) prints `states with shots: N/N`. A row with a missing
  light or dark shot, or a preview that cannot draw the id (`preview/states.js` does not know it), is reported and exits 1.
- **Re-shoot:** `npm run design:shots` (all) or `npm run design:shots -- --only loop-running,run-failed`.
- **Add a state:** add a row here, an entry in `preview/states.js` and a draw function in `preview/preview.js`, then shoot it.
- UI text comes from `shared/i18n/vi.ts` and `en.ts`; sample data lives in `preview/data.js`. It is one consistent world:
  now = Sunday 2026-10-18 14:00:42, the server crashed on 2026-10-17 09:31:05. Since the phase 2 preview the sample loops are Claude loops
  with four repos: `Atlas`, `Atlas (old)` (folder moved, so runs fail with "repo does not exist"), `dotfiles` (no loop uses
  it yet) and `notes`.
- Row labels: **(phase 2 new)** and **(phase 2 changed)** mark phase 2 states, **(run summary)** the run summary sub-row, **(transcript new)** the
  Transcript frame, **(folder picker new)** the folder picker. `preview/index.html?only=p2|234|lc28|247` shows one group.
- Source column: *Spec* = the mandatory state list of the spec, `UC-xx` = acceptance column of a use case, `ERROR_CODE` = an API
  error code, *Layout* = the design system layout rules (below 1100px), `D-UIx` = a design decision listed at the end of this file.

## Screen 1 - List (`/`)

| id | State | Source |
|---|---|---|
| `list-empty` | First launch, empty list: compact left pane, large EmptyState in the main pane with "create your first loop" | Spec, layout `/` |
| `list-loading` | Loading: skeleton rows and main pane, top bar stats are `-`, amber light | Spec |
| `list-load-error` | List load error (`GET /api/loops` returns 500) with Retry | Spec |
| `list-overview` | **(phase 2 changed)** Normal, no loop selected: every row kind (running, waiting for next run, last run failed, stopped by server shutdown, stopped, never ran) | Spec |
| `list-filter-archived` | Archived tab filter | UC-03, UC-11 |
| `list-search-empty` | Search finds no loop, with Clear search | UC-03 |
| `list-row-actions` | Hover on a running row: Stop and the ... menu (Open, Edit, Duplicate, Archive locked with "Stop first") | UC-03, UC-10, UC-11, D-UI2 |
| `list-stop-confirm` | Stop confirmation while a run is in progress, opened from the list | Spec, UC-05, D-UI1 |
| `list-action-error` | Action rejected by the server: error toast `LOOP_ALREADY_ACTIVE` | `LOOP_ALREADY_ACTIVE`, D-UI3 |
| `list-disconnected` | Server connection lost: red "retrying" banner, red server light, frozen stats | Spec, UC-17 |
| `list-reconnected` | Reconnected: info banner, data refreshed without F5 | UC-17 |
| `list-db-down` | Server alive but DB not answering (`/api/health` says `db: down`): red db light | Top bar (DB light), D-UI4 |
| `list-many` | **(phase 2 changed)** 12 loops, 10 runs at the same time; very long names cut with "..." | UC-16 |
| `list-narrow` | Below 1100px: `/` shows only the list | Layout |
| `list-filter-repo` | **(phase 2 new)** Filtered by repo "Atlas (old)": the filter box is accent-coloured, only that repo's loops remain, counts follow the filter | UC-25 |

## Screen 2 - Create / edit (`/loops/new`, `/loops/:id/edit`)

| id | State | Source |
|---|---|---|
| `form-new` | **(phase 2 changed)** New loop with defaults: every 30 minutes (D-UI6), `Asia/Ho_Chi_Minh`, no repo chosen, Claude executor `opus` / `medium`, empty timeout = unlimited | UC-01, UC-21 |
| `form-sched-minutes-uneven` | Every N minutes = 7: warning about the uneven gap at the top of the hour; next runs show 14:56 then 15:00 | Friendly schedule |
| `form-sched-hours` | Every N hours at minute M ("Every 2 hours, at minute 05") | Friendly schedule |
| `form-sched-daily` | Daily at HH:MM | Friendly schedule |
| `form-sched-weekly` | Weekly: Mon, Wed, Fri at 08:30 gives `30 8 * * 1,3,5`, a description and the next 5 runs | UC-02 |
| `form-sched-monthly-warn` | Monthly on day 31: warning that some months have no such day | Friendly schedule |
| `form-sched-advanced` | A valid cron that matches no kind opens in Advanced with a generated explanation | Friendly schedule |
| `form-sched-advanced-error` | Invalid cron typed in Advanced: immediate error, no next runs, save locked | UC-02, `INVALID_CRON` |
| `form-errors` | **(phase 2 changed)** Form errors after Save: duplicate name, empty prompt, timeout and failure ratio out of range; error per field plus a summary | Spec, UC-01, `VALIDATION_FAILED`, `LOOP_NAME_TAKEN` |
| `form-saving` | Saving (button locked) | UC-01 |
| `form-edit-running` | **(phase 2 changed)** Editing a running loop: "applies from the next run, the run in progress keeps the old version" | UC-09 |
| `form-conflict` | **(phase 2 changed)** Edit conflict: Reload / Overwrite, never a silent overwrite | Spec, UC-09, `VERSION_CONFLICT` |
| `form-duplicate` | Duplicate: "... (copy)" stopped, edit form open, new row selected on the left | UC-10 |
| `form-loading` | Edit form loading the loop | Spec |
| `form-repo-required` | **(phase 2 new)** Create without a repo: error "Choose a repo" on the Repo field plus summary | UC-21 |
| `form-no-repos` | **(phase 2 new)** No repo registered: Repo field locked, button "Register a repo" leads to the Repo page | UC-21 |
| `form-repo-pick` | **(phase 2 new)** Repo select open: name and path; a repo with a missing folder shows a warning; "Manage repos" | UC-21 |
| `form-edit-claude` | **(phase 2 new)** Editing a Claude loop: `haiku` / `low`, timeout 600 seconds | UC-21 |
| `form-exec-mock` | **(phase 2 new)** Mock executor (kept for tests): a Mock field replaces model / effort, empty timeout. Changed after approval (D-UI14): only visible in test mode, the real console has no Mock | Phase 2 model |

## Screen 3 - Loop detail (`/loops/:id`)

| id | State | Source |
|---|---|---|
| `loop-running` | **(phase 2 changed)** Active with a run in progress and a live log; stats, execution history, run history (paged), config | Spec, UC-06 |
| `loop-idle` | **(phase 2 changed)** Active, no run in progress: waiting for the next run and the last run's log | Spec |
| `loop-last-failed` | **(phase 2 changed)** Last run failed, the loop keeps running, a skipped run in the history | Spec, UC-12, UC-14 |
| `loop-stopped` | Stopped (user pressed Stop, the last run was cancelled) | Spec, UC-05 |
| `loop-server-down` | The last execution ended because the server stopped: no catch-up, press Start | Spec, UC-15 |
| `loop-never-run` | **(phase 2 changed)** Just created, never ran | UC-01 |
| `loop-archived` | Archived: Restore available, Start locked | Spec, UC-11 |
| `loop-stop-confirm` | Stop confirmation while a run is in progress | Spec, UC-05, D-UI1 |
| `loop-stopping` | Stopping: waiting for the run to be cancelled (5 seconds at most) | UC-05, D-UI5 |
| `loop-disconnected` | Connection lost while watching the live log: log paused | UC-17 |
| `loop-loading` | Loop detail loading | Spec |
| `loop-not-found` | Loop not found | `LOOP_NOT_FOUND` |
| `loop-narrow` | Below 1100px: only the main pane and "back to list" | Layout |
| `loop-repo-missing` | **(phase 2 new)** Repo folder missing: last run failed with "repo does not exist", loop still active, waiting for the next run | UC-23 |
| `loop-runs-summary` | **(run summary)** Run history with a **sub-row under each run holding the summary**: running or failed runs show a dim dash, long summaries are cut at 80 characters with "...", multi-line summaries show the first non-empty line | UC-31, D-UI22 to D-UI26 |

## Screen 4 - Execution detail (`/executions/:id`)

| id | State | Source |
|---|---|---|
| `exec-running` | Open execution: run table with full session ids, copy the whole list | UC-08 |
| `exec-stopped` | Ended because the user pressed Stop: the cancelled run still has a session id | UC-08, UC-05 |
| `exec-server-down` | Ended because the server stopped (last heartbeat): run marked Interrupted | Spec, UC-15 |
| `exec-copied` | All session ids just copied (toast) | UC-08 |
| `exec-loading` | Execution loading | Spec |
| `exec-not-found` | Execution not found | `EXECUTION_NOT_FOUND` |
| `exec-runs-summary` | **(run summary)** Run table of an execution with the summary sub-row: skipped runs (overlap), a running run and a failed run show a dim dash, long summaries are cut | UC-31, D-UI22 to D-UI26 |

## Screen 5 - Run detail (`/runs/:id`)

| id | State | Source |
|---|---|---|
| `run-running` | **(phase 2 changed)** Run in progress, live log | UC-07, UC-06 |
| `run-succeeded` | **(phase 2 changed)** Succeeded; the prompt used is a snapshot and differs from the loop's current prompt | UC-07, UC-09 |
| `run-failed` | **(phase 2 changed)** Failed (the executor reported an error) | UC-07, UC-14 |
| `run-timed-out` | **(phase 2 changed)** Timed out (timeout exceeded, the executor got a stop signal) | UC-13 |
| `run-cancelled` | **(phase 2 changed)** Cancelled by Stop; the session id is still shown | UC-05, UC-08 |
| `run-interrupted` | **(phase 2 changed)** Interrupted because the server stopped | UC-15 |
| `run-skipped` | Skipped: no round number, no session, no log, reason "round #N still running" | UC-12 |
| `run-loading` | Run loading | Spec |
| `run-not-found` | Run not found | `RUN_NOT_FOUND` |
| `run-repo-missing` | **(phase 2 new)** Run failed with "repo does not exist": no session, no cost, one log line, hint to the Repo page | UC-23 |
| `run-resume-copied` | **(phase 2 new)** The `claude --resume <id>` command just copied (toast) | UC-22 |
| `run-transcript-running` | **(transcript new)** Running run: the **Transcript** section right after the session id and above the Log, a live frame stuck to the bottom with the "following" marker, empty thinking (D-UI28), tool calls, results | UC-26, D-UI27 to D-UI31 |
| `run-transcript-ended` | **(transcript new)** Finished run: Transcript after the Summary with the entry count and a status tag; the frame is scrolled to the top, so a dim "loading older..." line shows | UC-26, UC-27, D-UI31 |
| `run-transcript-missing` | **(transcript new)** Finished run whose session file cannot be found: a note with the session id and the possible reasons; the rest of the screen is normal | UC-28, D-UI33 |
| `run-transcript-waiting` | **(transcript new)** Running run, Claude has not written the file yet: note "Claude has not written the transcript yet" | UC-26, D-UI33 |
| `run-transcript-paused` | **(transcript new)** Connection lost while watching a running run: red banner and red server light, Transcript and Log dimmed, "paused" marker, no cursor | UC-26, UC-17, D-UI31 |
| `run-transcript-no-session` | **(transcript new)** Skipped run (overlap): note "this run has no session, so no transcript" | UC-28, D-UI33 |

## Screen 6 - Repo (`/repos`) - the phase 2 preview

| id | State | Source |
|---|---|---|
| `repo-list` | **(phase 2 new)** With data: registration row and repo table (name, path, loops using it, registered at, Delete); a repo with a missing folder shows a warning | UC-19, UC-20 |
| `repo-empty` | **(phase 2 new)** No repo registered yet | UC-19 |
| `repo-loading` | **(phase 2 new)** Repo list loading | Spec |
| `repo-add-autoname` | **(phase 2 new)** Typing a path: the name is filled from the folder name and can be edited | UC-19 |
| `repo-err-missing` | **(phase 2 new)** Folder does not exist: error on the path field, nothing written to the DB | UC-19 |
| `repo-err-dup-path` | **(phase 2 new)** Duplicate path: error on the field naming the existing repo | UC-19 |
| `repo-err-dup-name` | **(phase 2 new)** Duplicate name (case-insensitive) on the Name field | UC-19 |
| `repo-delete-confirm` | **(phase 2 new)** Delete a repo no loop uses: confirmation dialog (only unregisters, the folder on disk is untouched) | UC-20 |
| `repo-delete-blocked` | **(phase 2 new)** Delete a repo that loops still use: refused, each loop named (archived ones included) | UC-20 |
| `repo-browse` | **(folder picker new)** Folder picker on a Windows machine: typable path bar, up button, breadcrumb, Quick access column (home, Desktop / Documents / Downloads, drives, next to your repos) and the subfolder list | UC-29, D-UI34 to D-UI41 |
| `repo-browse-notfound` | **(folder picker new)** A typed path that does not exist then Enter: error under the path bar, list and breadcrumb keep the old folder | UC-29, D-UI39 |
| `repo-browse-mac` | **(folder picker new)** Folder picker on a Mac (own console: no loop yet, two repos with Mac paths, `/Users/alice/...` placeholder) | UC-29 |
| `repo-browse-denied` | **(folder picker new)** macOS blocks reading `~/Desktop` (TCC): a note explains where to grant access, plus Retry | UC-29, D-UI39 |

## English UI (UC-18 - longer text, checked for overflow)

The ids keep their historical `vi-` prefix; the shots show the English UI.

| id | State | Source |
|---|---|---|
| `vi-loop-running` | Running loop detail, English UI | UC-18 |
| `vi-form-errors` | **(phase 2 changed)** Form errors, English UI | UC-18 |
| `vi-repo-list` | **(phase 2 new)** Repo page, English UI | UC-18 |
| `vi-repo-browse` | **(folder picker new)** Windows folder picker, English UI (checks the longer text) | UC-18, UC-29 |
| `vi-run-transcript` | **(transcript new)** A finished skipped run in the English UI: a short transcript that fits the whole file, folded prompt, tool call, one-line JSON result folded | UC-18, UC-26 |
| `vi-loop-runs-summary` | **(run summary)** Run history with summary sub-rows, English UI: the hint above the table is translated, the summary text stays as the agent wrote it | UC-18, run summary |

## Decisions (approved by the project owner)

Phase 1 (2026-10-18), D-UI1 to D-UI8: Stop asks only when a run is in progress; row buttons show only on hover; a red
toast in the bottom right when the server rejects an action; DB down shows a red banner and a red db light; stopping locks the
buttons and shows an amber banner; the default schedule is every 30 minutes; timeouts are typed in seconds; sample logs stay in
one language. Schedule sentences come from `shared/domain/schedule.ts` through `preview/schedule.js` (generated by
`npm run design:shots`; `npm run design:states` reports drift), one source with the real code.

Phase 2 (2026-10-19), D-UI9 to D-UI21:

| Id | Decision |
|---|---|
| D-UI9 | The Repo page is its own path `/repos`, reached by the **Loop / Repo** items in the top bar (with a repo count) |
| D-UI10 | Registration is the top row of the Repo page (path, name, button), no dialog; the name is filled from the last folder and can be edited |
| D-UI11 | The repo table has a **Loops using it** column and a "folder is gone" warning (the API returns a folder-exists flag) |
| D-UI12 | **Copy command** `claude --resume <id>` only shows when the run has ended; the copied text has no `cd` |
| D-UI13 | The Repo field sits next to Name in the Info part; model and effort are segmented buttons |
| D-UI14 | Changed after approval: the real console has no Mock executor, it exists only in test mode |
| D-UI15 | The repo name follows the loop name on list rows; the repo filter sits on the status tab row and is accent-coloured while active |
| D-UI16 | A **Cost** column in the run table and an **Estimated cost** cell on the run screen ("reported by the SDK, not money charged"); no totals |
| D-UI17 | The run screen has a **Summary** section (last text of the session, 500 characters at most); runs that did not end normally say "No summary" |
| D-UI18 | Console log lines are fixed English sentences: start, end with result and cost, error |
| D-UI19 | A "repo does not exist" run has no session id, no cost, a hint and an **Open the Repo page** button |
| D-UI20 | Deleting a repo: unused gives a confirmation dialog; in use gives a red banner naming each loop, archived ones marked |
| D-UI21 | A duplicate path reports only the path field, even if the auto-filled name also collides |

Run summary, D-UI22 to D-UI26 (approved by delegation, 2026-10-19): the run tables get a sub-row under each run showing the first
non-empty line of the summary; the cap is 80 characters (code points, matching `left(..., 80)` in Postgres) followed by "...";
the full text is the browser `title`; a run without a summary shows a dim dash; a run where the agent chose to skip is still a
success, told apart only by its text.

the transcript preview, D-UI27 to D-UI33 (approved 2026-10-19): the Transcript section sits above the Log; thinking is always open and
dim (real thinking blocks are empty, only a signature is written); long tool input and results fold into `<details>` (folded,
never cut) and tool input is drawn field by field, not as raw JSON; a `system` entry is one dim line; a running transcript shows
a live bar with a following or paused marker; opening several tabs shows no warning; states without content use the `.note` box.
The sample transcripts are real transcripts of three sessions of the dogfood loop, shifted to the run times of the preview world.

Folder picker, D-UI34 to D-UI41 (2026-10-19): the **Browse...** button is joined to the path field and opens a picker drawn by the console
(a browser hides absolute paths); a 720px dialog with a fixed-height body, a typable path bar, a clickable breadcrumb, a Quick
access column, a filter box and a hidden-folder toggle; one click selects, double click or Enter opens; Quick access holds the
real home, Desktop, Documents, Downloads and drives of the machine; git folders and registered repos are tagged; errors show
under the path bar or as a note with Retry; after choosing, the field and the name are filled and focus moves to Register
without registering; the dialog opens at the path in the field, then the last folder used, then the first folder next to a
registered repo, then home.
