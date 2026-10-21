// States of the design preview. Every id has exactly one row in design/STATES.md (scripts/design-states.mjs checks both
// ways) and two images shots/<id>-light.png + shots/<id>-dark.png (npm run design:shots).
// vp = [width, height] of the viewport for the shot (default 1440×900, full page); lang = UI language (default en; the
// vi-* states cover the language toggle); fixed = shoot the viewport only (pages with a fixed overlay — dialogs, toasts:
// a full-page shot would only cover the first 900px with the overlay); tags = filters of the index page (index.html).
window.PV_SCREENS = [
  ['list', 'List', '/'],
  ['form', 'Create / edit', '/loops/new · /loops/:id/edit'],
  ['loop', 'Loop detail', '/loops/:id'],
  ['exec', 'Execution detail', '/executions/:id'],
  ['run', 'Run detail', '/runs/:id'],
  ['repo', 'Repos', '/repos'],
];
window.PV_TAGS = [
  ['repos', 'repos + Claude executor'],
  ['summary', 'run summaries'],
  ['transcript', 'Transcript panel'],
  ['browse', 'folder picker'],
  ['vi', 'Vietnamese UI'],
];
window.PV_STATES = [
  { id: 'list-empty', screen: 'list', title: 'Empty list the first time — large EmptyState + New loop' },
  { id: 'list-loading', screen: 'list', title: 'Loading the list (skeleton)' },
  { id: 'list-load-error', screen: 'list', title: 'The list failed to load + Retry' },
  { id: 'list-overview', screen: 'list', title: 'Normal, no loop selected: every kind of row (run in progress, waiting for next run, latest run failed, stopped by server shutdown, stopped, never started) + short guide', tags: ['repos'] },
  { id: 'list-filter-archived', screen: 'list', title: 'Archived filter' },
  { id: 'list-search-empty', screen: 'list', title: 'Search finds no loop' },
  { id: 'list-row-actions', screen: 'list', title: 'Hover over a running row: Stop + ⋯ menu (Archive is locked while running)' },
  { id: 'list-stop-confirm', screen: 'list', title: 'Stop confirmation while a run is in progress (from the list)', fixed: true },
  { id: 'list-action-error', screen: 'list', title: 'Action refused: LOOP_ALREADY_ACTIVE error toast', fixed: true },
  { id: 'list-disconnected', screen: 'list', title: 'Lost connection to the server: red banner, red server lamp, frozen figures' },
  { id: 'list-reconnected', screen: 'list', title: 'Reconnected: notice banner, data refreshed' },
  { id: 'list-db-down', screen: 'list', title: 'Server up, database not responding: red db lamp' },
  { id: 'list-many', screen: 'list', title: '12 loops, 10 runs in progress at once (UC-16) + a very long name cut off', tags: ['repos'] },
  { id: 'list-narrow', screen: 'list', title: 'Below 1100px: only the list', vp: [960, 900] },

  { id: 'form-new', screen: 'form', title: 'New loop — defaults: no repo chosen, every 30 minutes, Claude opus / medium, empty timeout = no limit', tags: ['repos'] },
  { id: 'form-sched-minutes-uneven', screen: 'form', title: 'Schedule every 7 minutes — warning: uneven gap at the end of the hour' },
  { id: 'form-sched-hours', screen: 'form', title: 'Schedule every N hours, at minute M' },
  { id: 'form-sched-daily', screen: 'form', title: 'Schedule daily at HH:MM' },
  { id: 'form-sched-weekly', screen: 'form', title: 'Schedule on weekdays: Mon, Wed, Fri at 08:30 (UC-02)' },
  { id: 'form-sched-monthly-warn', screen: 'form', title: 'Schedule monthly on day 31 — warning: some months have no such day' },
  { id: 'form-sched-advanced', screen: 'form', title: 'Advanced: a valid cron that matches no built-in kind → opens as Advanced + its description' },
  { id: 'form-sched-advanced-error', screen: 'form', title: 'Advanced: invalid cron → error right away, cannot save' },
  { id: 'form-errors', screen: 'form', title: 'Form with errors after pressing save: error at each field + summary (repo field, optional timeout)', tags: ['repos'] },
  { id: 'form-saving', screen: 'form', title: 'Saving' },
  { id: 'form-edit-running', screen: 'form', title: 'Editing a running loop — applies from the next run (repo field + Claude model / effort)', tags: ['repos'] },
  { id: 'form-conflict', screen: 'form', title: 'Conflict while editing (VERSION_CONFLICT) — Reload / Overwrite', tags: ['repos'] },
  { id: 'form-duplicate', screen: 'form', title: 'Duplicate: the copy “… (copy)” is Stopped, its edit form open' },
  { id: 'form-loading', screen: 'form', title: 'Edit form loading the loop' },

  { id: 'loop-running', screen: 'loop', title: 'Running, with a run in progress + live log (repo in the header and the configuration; the live log shows only console lines)', tags: ['repos'] },
  { id: 'loop-idle', screen: 'loop', title: 'Running, no run in progress (waiting for the next run); latest run log: Start · session / End · $', tags: ['repos'] },
  { id: 'loop-last-failed', screen: 'loop', title: 'Latest run failed — the loop keeps running, with skipped runs (process-level error)', tags: ['repos'] },
  { id: 'loop-stopped', screen: 'loop', title: 'Stopped (the user pressed Stop, the last run was cancelled)' },
  { id: 'loop-server-down', screen: 'loop', title: 'The latest execution ended because the server shut down' },
  { id: 'loop-never-run', screen: 'loop', title: 'Just created, never started (daily recap on the notes repo, no timeout)', tags: ['repos'] },
  { id: 'loop-archived', screen: 'loop', title: 'Archived — Restore, cannot Start' },
  { id: 'loop-stop-confirm', screen: 'loop', title: 'Stop confirmation while a run is in progress', fixed: true },
  { id: 'loop-stopping', screen: 'loop', title: 'Stopping — waiting for the run to cancel (≤ 5 seconds)' },
  { id: 'loop-disconnected', screen: 'loop', title: 'Lost connection while watching the live log' },
  { id: 'loop-loading', screen: 'loop', title: 'Loading the loop detail' },
  { id: 'loop-not-found', screen: 'loop', title: 'Loop not found (LOOP_NOT_FOUND)' },
  { id: 'loop-narrow', screen: 'loop', title: 'Below 1100px: only the main pane + “← List”', vp: [960, 900] },

  { id: 'exec-running', screen: 'exec', title: 'Open execution — list of session ids' },
  { id: 'exec-stopped', screen: 'exec', title: 'Ended because the user pressed Stop — the cancelled run keeps its session id' },
  { id: 'exec-server-down', screen: 'exec', title: 'Ended because the server shut down — Interrupted run' },
  { id: 'exec-copied', screen: 'exec', title: 'Just copied every session id (toast)', fixed: true },
  { id: 'exec-loading', screen: 'exec', title: 'Loading the execution' },
  { id: 'exec-not-found', screen: 'exec', title: 'Execution not found (EXECUTION_NOT_FOUND)' },

  { id: 'run-running', screen: 'run', title: 'Run in progress — live log (only the Start · session line)', tags: ['repos'] },
  { id: 'run-succeeded', screen: 'run', title: 'Succeeded — the prompt used differs from the current prompt (snapshot); cost, summary, copy claude --resume', tags: ['repos'] },
  { id: 'run-failed', screen: 'run', title: 'Failed (the executor reported an error) — process-level error, with session + resume', tags: ['repos'] },
  { id: 'run-timed-out', screen: 'run', title: 'Timed out (over the timeout) — End · Timed out line', tags: ['repos'] },
  { id: 'run-cancelled', screen: 'run', title: 'Cancelled by Stop — still has a session id; End · Cancelled line + resume', tags: ['repos'] },
  { id: 'run-interrupted', screen: 'run', title: 'Interrupted by a server shutdown — only the Start line (the server died mid-run)', tags: ['repos'] },
  { id: 'run-skipped', screen: 'run', title: 'Skipped — no run number, no session, no log' },
  { id: 'run-loading', screen: 'run', title: 'Loading the run' },
  { id: 'run-not-found', screen: 'run', title: 'Run not found (RUN_NOT_FOUND)' },

  // ── repos + the Claude executor ──
  { id: 'list-filter-repo', screen: 'list', title: 'Filtered by repo “acme-api (old)”: only the loops of that repo (UC-25)', tags: ['repos'] },
  { id: 'form-repo-required', screen: 'form', title: 'Pressing Create with no repo chosen → error at the Repo field (UC-21)', tags: ['repos'] },
  { id: 'form-no-repos', screen: 'form', title: 'No repo registered yet → Repo field locked + “Register a repo →” button to the Repo page', tags: ['repos'] },
  { id: 'form-repo-pick', screen: 'form', title: 'Repo field open: name + path, a repo whose folder is gone has a warning, “Manage repos →”', tags: ['repos'] },
  { id: 'form-edit-claude', screen: 'form', title: 'Editing a Claude loop: haiku / low, timeout 600 seconds', tags: ['repos'] },
  { id: 'form-exec-mock', screen: 'form', title: 'Mock executor (kept for tests): Mock fields instead of model / effort', tags: ['repos'] },
  { id: 'loop-repo-missing', screen: 'loop', title: 'Repo folder gone: the latest run failed with “Repo does not exist”, the loop keeps running (UC-23)', tags: ['repos'] },
  { id: 'run-repo-missing', screen: 'run', title: 'Run failed with “Repo does not exist: <path>” — no session, a one-line log (UC-23)', tags: ['repos'] },
  { id: 'run-resume-copied', screen: 'run', title: 'Just copied the claude --resume <id> command (toast)', fixed: true, tags: ['repos'] },

  { id: 'repo-list', screen: 'repo', title: 'Repo page with data: register + repo table (loops using it, folder gone)', tags: ['repos', 'browse'] },
  { id: 'repo-empty', screen: 'repo', title: 'No repo registered yet (first time)', tags: ['repos', 'browse'] },
  { id: 'repo-loading', screen: 'repo', title: 'Loading the repo list', tags: ['repos', 'browse'] },
  { id: 'repo-add-autoname', screen: 'repo', title: 'Typing a path — the name is filled in from the folder name (UC-19)', tags: ['repos', 'browse'] },
  { id: 'repo-err-missing', screen: 'repo', title: 'Registering a folder that does not exist → error at the path field (UC-19)', tags: ['repos', 'browse'] },
  { id: 'repo-err-dup-path', screen: 'repo', title: 'Path already registered → error at the field, naming the existing repo (UC-19)', tags: ['repos', 'browse'] },
  { id: 'repo-err-dup-name', screen: 'repo', title: 'Name taken (the filled-in name clashes with another repo) → error at the Name field (UC-19)', tags: ['repos', 'browse'] },
  { id: 'repo-delete-confirm', screen: 'repo', title: 'Deleting a repo no loop uses — confirmation dialog (UC-20)', fixed: true, tags: ['repos', 'browse'] },
  { id: 'repo-delete-blocked', screen: 'repo', title: 'Deleting a repo that loops still use → refused, naming the loops (archived ones too) (UC-20)', tags: ['repos', 'browse'] },

  // ── run summaries on the run rows: the ↳ sub-row = the first line, cut at 80 characters + "…", the title shows it all ──
  { id: 'loop-runs-summary', screen: 'loop', title: 'Run history with a ↳ summary row under every run: running / failed → “—”; long ones cut with “…”, short, multi-line (first line only), “Skipped this run: …”', tags: ['summary'] },
  { id: 'exec-runs-summary', screen: 'exec', title: 'Run table of an execution with ↳ summary rows: skipped because of overlap / running / failed → “—”, short, long, multi-line summaries', tags: ['summary'] },
  { id: 'vi-loop-runs-summary', screen: 'loop', title: 'Vietnamese UI — run history with ↳ summary rows (summaries are agent text, not translated)', lang: 'vi', tags: ['summary', 'vi'] },

  // ── Transcript panel of the run screen — real-looking transcripts (data.js PV.transcripts), D-UI27…D-UI33 ──
  { id: 'run-transcript-running', screen: 'run', title: 'Run in progress — live Transcript above the Log: sticks to the bottom, thinking open (empty), tool call + JSON input, long result folded, Claude text, cursor', tags: ['transcript'] },
  { id: 'run-transcript-ended', screen: 'run', title: 'Run ended (failed midway) — last page of 50 entries, scrolled to the top: “loading older…”', tags: ['transcript'] },
  { id: 'run-transcript-missing', screen: 'run', title: 'Run ended, the transcript file of the session was not found', tags: ['transcript'] },
  { id: 'run-transcript-waiting', screen: 'run', title: 'Run in progress, Claude has not written the transcript file yet', tags: ['transcript'] },
  { id: 'run-transcript-paused', screen: 'run', title: 'Lost connection while watching the live transcript: the panel dims like the Log, “paused — waiting to reconnect”', tags: ['transcript'] },
  { id: 'run-transcript-no-session', screen: 'run', title: 'Skipped run (overlap) — “The run has no session, so there is no transcript”', tags: ['transcript'] },
  { id: 'vi-run-transcript', screen: 'run', title: 'Vietnamese UI — run ended, a short transcript with the whole file: start-of-transcript edge, folded prompt, long JSON result folded, system line', lang: 'vi', tags: ['transcript', 'vi'] },

  // ── "Browse…" button + folder picker (Repo page) — the folder worlds of data.js PV.folders (a Windows machine + a Mac) ──
  { id: 'repo-browse', screen: 'repo', title: 'Folder picker — Windows: path bar + breadcrumb, Quick access (home folder, Desktop inside OneDrive, drives C: D:, next to your repos), subfolders with git / already registered, hidden folders off; the selected row → “Will choose” (UC-29)', fixed: true, tags: ['browse'] },
  { id: 'repo-browse-notfound', screen: 'repo', title: 'Typing a path that does not exist into the path bar → error right below, the list keeps the old folder, “Will choose” = the open folder (UC-29)', fixed: true, tags: ['browse'] },
  { id: 'repo-browse-mac', screen: 'repo', title: 'Folder picker — Mac: “Macintosh HD” + an external volume, ~/Code; choosing an already registered folder → warning, Choose locked; the path field suggests a macOS path (UC-29)', fixed: true, tags: ['browse'] },
  { id: 'repo-browse-denied', screen: 'repo', title: 'macOS blocks reading ~/Desktop (TCC) → how to grant access + Retry; the folder can still be chosen (UC-29)', fixed: true, tags: ['browse'] },
  { id: 'vi-repo-browse', screen: 'repo', title: 'Vietnamese UI — folder picker on Windows (UC-18, UC-29)', lang: 'vi', fixed: true, tags: ['browse', 'vi'] },

  { id: 'vi-loop-running', screen: 'loop', title: 'Vietnamese UI — loop detail with a run in progress', lang: 'vi', tags: ['vi'] },
  { id: 'vi-form-errors', screen: 'form', title: 'Vietnamese UI — form with errors (repo field, optional timeout)', lang: 'vi', tags: ['repos', 'vi'] },
  { id: 'vi-repo-list', screen: 'repo', title: 'Vietnamese UI — Repo page', lang: 'vi', tags: ['repos', 'browse', 'vi'] },
];
