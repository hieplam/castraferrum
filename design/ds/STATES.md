# Castraferrum - state list of the new preview

Each table row below is one state of the new preview (`design/ds/preview/`, UI uplift, epic #63). The states are those
of spec section 5 ([docs/specs/2026-10-21-ui-uplift.md](../../docs/specs/2026-10-21-ui-uplift.md)); a phone state is a
separate id `phone-<id>` that draws its base state at 390 by 844. Open a state live at
`preview/app.html?state=<id>&theme=light|dark`, or every state of a screen side by side at
[`preview/index.html`](preview/index.html).

- **Check (no shots yet):** `npm run design:shots -- --design design/ds --dry` draws every state in both themes and
  prints `drawn <k> states x 2 themes, 0 problems`. A problem is a JavaScript error, a missing i18n key, a required test
  id that is missing or has the wrong count, a class that `components.css` does not define, or an inline `style` with a
  colour literal or a `px`, `rem` or `em` length.
- **State list:** `npm run design:states -- --design design/ds --no-shots` checks that this file and
  `preview/states.js` list the same ids. Shots are taken after the owner approves the preview (task U11); from then on
  `npm run design:states -- --design design/ds` also checks them.
- **Add a state:** a row here, an entry in `preview/states.js` (with its `requires`), and a draw function in
  `preview/preview.js`.
- The sample world is the one of the first preview (`preview/data.js` was copied from it): now is Sunday
  2026-10-18 14:00:42; the server crashed on 2026-10-17 at 09:31:05.
- Board: the image of [`design/reference/`](../reference/README.md) that shows the state. A state without a board
  follows spec sections 4 and 4.6; the owner approves it at U10.

## Frame and system (`frame`)

| id | State | Board |
|---|---|---|
| `frame-loading` | First load: skeleton cells on the Loops page, figures `-` | - |
| `phone-frame-loading` | `frame-loading` on the phone | - |
| `frame-disconnected` | Lost connection: red banner with the attempt and the retry time, figures frozen | - |
| `phone-frame-disconnected` | `frame-disconnected` on the phone | - |
| `frame-reconnected` | Info banner: reconnected, data refreshed | - |
| `frame-db-down` | Server up, database not answering: warning banner, the connection shows "Database not answering" | - |
| `not-found` | Unknown URL: empty state with a link to Loops | - |
| `phone-not-found` | `not-found` on the phone | - |

## Loops page (`loops`, route `/`)

| id | State | Board |
|---|---|---|
| `loops-empty` | First launch: "Create your first loop", the three how-it-works steps, New loop | - |
| `phone-loops-empty` | `loops-empty` on the phone | - |
| `loops-error` | The list failed to load, with Retry | - |
| `loops-overview` | The seven sample loops, every kind of row | `d-loops-light` |
| `phone-loops-overview` | `loops-overview` on the phone | `m-loops-light`, `m-loops-dark` |
| `loops-filter-archived` | Archived filter | - |
| `loops-search-empty` | The search finds nothing, with Clear search | - |
| `loops-repo-filter` | The repo filter open (a menu on the desktop) | - |
| `phone-loops-repo-filter` | `loops-repo-filter` on the phone (a sheet) | - |
| `loops-row-menu` | The `⋯` menu of a running row: Open, Edit, Duplicate, Archive locked with "Stop it first" | - |
| `loops-stop-confirm` | Stop confirmation of a running loop (a dialog on the desktop) | - |
| `phone-loops-stop-confirm` | `loops-stop-confirm` on the phone (a sheet) | `m-stop-light`, `m-stop-dark` |
| `loops-action-error` | An action refused (`LOOP_ALREADY_ACTIVE`): error toast | - |
| `loops-many` | 12 loops, 10 runs at once, a long name cut with an ellipsis | - |
| `vi-loops-overview` | `loops-overview` in Vietnamese | - |
| `phone-vi-loops-overview` | `vi-loops-overview` on the phone | - |

## Loop page (`loop`, routes `/loops/:id`, `/loops/:id/runs`, `/loops/:id/settings`)

| id | State | Board |
|---|---|---|
| `loop-running` | A run working, live output | `d-loop-light`, `d-loop-dark` |
| `phone-loop-running` | `loop-running` on the phone | `m-loop-light`, `m-loop-dark` |
| `loop-idle` | Waiting for the next run, the last run's output | - |
| `loop-last-failed` | The last run failed, the loop keeps running; the repo folder is gone: the hint and Open Repos | - |
| `phone-loop-last-failed` | `loop-last-failed` on the phone | - |
| `loop-stopped` | Stopped by the user, the last run cancelled | - |
| `loop-server-down` | Stopped by a server shutdown | - |
| `loop-never-run` | Just created | - |
| `phone-loop-never-run` | `loop-never-run` on the phone | - |
| `loop-archived` | Archived: Restore, no Start | - |
| `loop-stop-confirm` | Stop confirmation from the loop page (a dialog on the desktop) | - |
| `phone-loop-stop-confirm` | `loop-stop-confirm` on the phone (a sheet) | `m-stop-light`, `m-stop-dark` |
| `loop-stopping` | Stopping | - |
| `loop-disconnected` | Connection lost while following the live output | - |
| `loop-not-found` | `LOOP_NOT_FOUND` | - |
| `loop-loading` | Skeleton | - |
| `loop-help` | The `?` of Recent runs open (a popover on the desktop) | `d-loop-dark` |
| `phone-loop-help` | `loop-help` on the phone (a sheet) | `m-help-light`, `m-help-dark` |
| `loop-menu` | The `⋯` of the loop page open: Duplicate, Archive locked while running | - |
| `phone-loop-menu` | `loop-menu` on the phone (a sheet) | - |
| `loop-runs` | All runs: the longest active period, every run grouped by active period, paged (10 per page) | - |
| `phone-loop-runs` | `loop-runs` on the phone | - |
| `loop-settings` | Settings and prompt: repo with path, schedule, agent, runs at the same time, time limit, the full prompt, Edit settings | - |
| `phone-loop-settings` | `loop-settings` on the phone | - |

## Active period page (`period`, route `/executions/:id`)

| id | State | Board |
|---|---|---|
| `period-running` | Still active | - |
| `phone-period-running` | `period-running` on the phone | - |
| `period-stopped` | Ended because the user pressed Stop | - |
| `period-server-down` | Ended because the server shut down, an interrupted run | - |
| `period-copied` | Toast after copying every session id | - |
| `period-not-found` | `EXECUTION_NOT_FOUND` | - |

## Run page (`run`, route `/runs/:id`)

| id | State | Board |
|---|---|---|
| `run-running` | Running, live log | - |
| `phone-run-running` | `run-running` on the phone | - |
| `run-succeeded` | Succeeded: summary, cost, session, resume command; the prompt used differs from the current prompt | - |
| `phone-run-succeeded` | `run-succeeded` on the phone | `m-run-light`, `m-run-dark` |
| `run-failed` | Failed with a process-level error | - |
| `run-timed-out` | Timed out | - |
| `run-cancelled` | Cancelled by Stop | - |
| `run-interrupted` | Interrupted by a server shutdown | - |
| `run-skipped` | Skipped: the reason, no session, no log | - |
| `run-repo-missing` | The repo folder is gone: the hint and Open Repos | - |
| `run-resume-copied` | Toast after Copy command | - |
| `run-not-found` | `RUN_NOT_FOUND` | - |
| `run-loading` | Skeleton | - |
| `run-transcript-running` | The transcript following a live session | - |
| `phone-run-transcript-running` | `run-transcript-running` on the phone | - |
| `run-transcript-waiting` | Waiting for the session file | - |
| `run-transcript-paused` | Connection lost while following | - |
| `run-transcript-missing` | The session file is gone | - |
| `run-transcript-no-session` | A run without a session (no transcript) | - |
| `vi-run-transcript` | The transcript in Vietnamese | - |

## Editor (`form`, routes `/loops/new`, `/loops/:id/edit`)

| id | State | Board |
|---|---|---|
| `form-new` | Defaults: no repo, every 30 minutes, Asia/Ho_Chi_Minh, opus, medium, no time limit | - |
| `phone-form-new` | `form-new` on the phone | - |
| `form-sched-minutes-uneven` | Every 7 minutes: the uneven-gap warning | - |
| `form-sched-hours` | Every 2 hours at minute 05 | - |
| `form-sched-daily` | Every day at 02:30 | - |
| `phone-form-sched-daily` | `form-sched-daily` on the phone | `m-form-light` |
| `form-sched-weekly` | Mon, Wed, Fri at 08:30 | - |
| `phone-form-sched-weekly` | `form-sched-weekly` on the phone | - |
| `form-sched-monthly-warn` | Day 31: the warning | - |
| `form-sched-advanced` | A cron with no built-in kind, with its description | - |
| `form-sched-advanced-error` | An invalid cron: the error, Save locked | - |
| `form-errors` | After Save: an error at each field and a summary | - |
| `phone-form-errors` | `form-errors` on the phone | - |
| `form-saving` | Saving | - |
| `form-edit-running` | Editing a running loop: applies from the next run | - |
| `form-conflict` | `VERSION_CONFLICT`: Reload or Overwrite | - |
| `form-duplicate` | The copy, stopped, its editor open | - |
| `form-loading` | Loading the loop | - |
| `form-repo-required` | No repo chosen | - |
| `form-no-repos` | No repo registered: Register a repo | - |
| `form-repo-pick` | The repo picker open (menu on desktop, sheet on phone), a repo whose folder is gone | - |
| `phone-form-repo-pick` | `form-repo-pick` on the phone | - |
| `form-edit-claude` | Haiku, low, 600 seconds | - |
| `form-exec-mock` | Test mode: the Mock executor | - |
| `vi-form-errors` | `form-errors` in Vietnamese | - |

## Repos page (`repos`, route `/repos`)

| id | State | Board |
|---|---|---|
| `repos-list` | The four sample repos, one whose folder is gone | - |
| `phone-repos-list` | `repos-list` on the phone | `m-repos-light` |
| `repos-empty` | No repo yet | - |
| `repos-loading` | Skeleton | - |
| `repos-add` | The folder picker open (a full-height sheet on the phone, a wide dialog on the desktop), a git folder selected, the name filled in | - |
| `phone-repos-add` | `repos-add` on the phone | `m-folder-light` |
| `repos-add-notfound` | A typed path that does not exist: the error under the path, the list keeps the open folder | - |
| `repos-add-mac` | macOS places (Home, Desktop, Documents, Downloads), a registered folder tagged | - |
| `repos-add-denied` | macOS refuses to read a folder: where to grant access, Retry | - |
| `repos-err-dup-path` | The path is already registered | - |
| `repos-err-dup-name` | The name is taken | - |
| `repos-err-missing` | The folder does not exist | - |
| `repos-delete-confirm` | Delete an unused repo (a dialog on the desktop, a sheet on the phone) | - |
| `phone-repos-delete-confirm` | `repos-delete-confirm` on the phone | - |
| `repos-delete-blocked` | Delete refused: the loops that use it | - |
| `vi-repos-list` | `repos-list` in Vietnamese | - |
| `vi-repos-add` | `repos-add` in Vietnamese | - |

## Settings page (`settings`, route `/settings`)

| id | State | Board |
|---|---|---|
| `settings` | Everything connected | - |
| `phone-settings` | `settings` on the phone | `m-settings-light` |
| `settings-db-down` | The database not answering | - |
| `phone-vi-settings` | Settings in Vietnamese (phone only) | - |
