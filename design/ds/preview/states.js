// States of the new preview (UI uplift, epic #63). Every id has exactly one row in design/ds/STATES.md
// (scripts/design-states.mjs checks both ways).
// Fields: id, screen, title; vp = [width, height] (default 1440 by 900); fixed = an overlay is open (shoot the viewport
// only); lang = UI language (default en); base = the state a phone-<id> state draws; requires = the test ids the state
// must show, as 'id' or 'id*count' (only visible elements count). A phone state inherits lang, fixed and requires from
// its base; the frame adds 'topbar' from 640px and, below it, 'tabbar' on the tab roots (pushed pages such as the loop
// page and the active period page show a navigation bar instead).
window.PV_SCREENS = [
  ['frame', 'Frame and system', 'every route', []],
  ['loops', 'Loops page', '/', ['d-loops-light.png', 'm-loops-light.png', 'm-loops-dark.png', 'm-stop-light.png', 'm-stop-dark.png']],
  ['loop', 'Loop page', '/loops/:id, /loops/:id/runs, /loops/:id/settings', ['d-loop-light.png', 'd-loop-dark.png', 'm-loop-light.png', 'm-loop-dark.png', 'm-help-light.png', 'm-help-dark.png', 'm-stop-light.png', 'm-stop-dark.png']],
  ['period', 'Active period page', '/executions/:id', []],
  ['run', 'Run page', '/runs/:id', ['m-run-light.png', 'm-run-dark.png']],
  ['form', 'Editor', '/loops/new, /loops/:id/edit', ['m-form-light.png']],
  ['repos', 'Repos page', '/repos', ['m-repos-light.png', 'm-folder-light.png']],
  ['settings', 'Settings page', '/settings', ['m-settings-light.png']],
];
(function () {
  const PUSHED = ['loop', 'period', 'run', 'form'];
  const LOOP = ['loop-header', 'now-card', 'loop-figures', 'fig-active', 'fig-runs', 'fig-next', 'fig-typical'];
  const RUNNING = LOOP.concat('live-log', 'recent-runs', 'run-row*4', 'runs-help');
  const PERIOD = ['exec-header', 'back-to-loop', 'period-figures', 'copy-all', 'exec-runs', 'period-status'];
  const RUN = ['run-header', 'run-facts', 'run-session', 'run-transcript', 'run-log'];
  const TX = ['run-transcript', 'run-transcript-scroll', 'tx-entry*11'];
  const FORM = ['f-name', 'f-repo', 'f-prompt', 'sched-kind', 'sched-out', 'sched-next', 'f-model', 'f-effort', 'f-timeout', 'form-submit'];
  const ERRORS = FORM.concat('form-errors', 'error-f-name', 'error-f-repo', 'error-f-prompt', 'error-f-timeout');
  const REPOS = ['repo-table', 'repo-row*4', 'repo-gone*1', 'repo-loop-count*4', 'repo-menu*4', 'repo-add'];
  const PICKER = ['folder-picker', 'repo-path', 'folder-list', 'folder-row*7', 'folder-target', 'repo-name', 'repo-submit'];
  const MAC = PICKER.map((x) => (x === 'folder-row*7' ? 'folder-row*5' : x));
  const SETTINGS = ['settings-theme-auto', 'settings-lang-en', 'settings-lang-vi', 'settings-server', 'settings-db', 'settings-address', 'settings-version'];
  const OVERVIEW = ['summary', 'stat-active-loops', 'stat-running-runs', 'stat-runs-today', 'stat-errors-24h', 'loop-row*7', 'list-search'];
  const desktop = [
    { id: 'frame-loading', screen: 'frame', title: 'First load: skeleton cells on the Loops page, figures -', requires: ['list-loading', 'summary'] },
    { id: 'frame-disconnected', screen: 'frame', title: 'Lost connection: red banner with the attempt and the retry time, figures frozen', requires: ['banner-disconnected', 'summary', 'loop-row*7'] },
    { id: 'frame-reconnected', screen: 'frame', title: 'Info banner: reconnected, data refreshed', requires: ['banner-reconnected', 'loop-row*7'] },
    { id: 'frame-db-down', screen: 'frame', title: 'Server up, database not answering: warning banner, the connection shows "Database not answering"', requires: ['banner-db-down', 'conn', 'loop-row*7'] },
    { id: 'not-found', screen: 'frame', title: 'Unknown URL: empty state with a link to Loops' },
    { id: 'loops-empty', screen: 'loops', title: 'First launch: Create your first loop, the three how-it-works steps, New loop', requires: ['home-empty', 'list-create'] },
    { id: 'loops-error', screen: 'loops', title: 'The list failed to load, with Retry', requires: ['list-error'] },
    { id: 'loops-overview', screen: 'loops', title: 'The seven sample loops, every kind of row', requires: OVERVIEW },
    { id: 'loops-filter-archived', screen: 'loops', title: 'Archived filter', requires: ['tab-archived', 'loop-row*1'] },
    { id: 'loops-search-empty', screen: 'loops', title: 'The search finds nothing, with Clear search', requires: ['list-search', 'list-no-match'] },
    { id: 'loops-repo-filter', screen: 'loops', title: 'The repo filter open (a menu on the desktop, a sheet on the phone)', fixed: true, requires: ['repo-filter', 'repo-filter-all', 'loop-row*7'] },
    { id: 'loops-row-menu', screen: 'loops', title: 'The ⋯ menu of a running row: Open, Edit, Duplicate, Archive locked with "Stop it first"', fixed: true, requires: ['row-menu*7', 'menu-open', 'menu-edit', 'menu-duplicate', 'menu-archive'] },
    { id: 'loops-stop-confirm', screen: 'loops', title: 'Stop confirmation of a running loop (a dialog on the desktop, a sheet on the phone)', fixed: true, requires: ['stop-dialog', 'stop-cancel', 'stop-confirm'] },
    { id: 'loops-action-error', screen: 'loops', title: 'An action refused (LOOP_ALREADY_ACTIVE): error toast', fixed: true, requires: ['loop-row*7'] },
    { id: 'loops-many', screen: 'loops', title: '12 loops, 10 runs at once, a long name cut with an ellipsis', requires: ['summary', 'loop-row*12'] },
    { id: 'vi-loops-overview', screen: 'loops', title: 'loops-overview in Vietnamese', lang: 'vi', requires: OVERVIEW },
    { id: 'loop-running', screen: 'loop', title: 'A run working, live output', requires: RUNNING },
    { id: 'loop-idle', screen: 'loop', title: "Waiting for the next run, the last run's output", requires: LOOP.concat('last-run-log', 'recent-runs', 'run-row*4') },
    { id: 'loop-last-failed', screen: 'loop', title: 'The last run failed, the loop keeps running', requires: LOOP.concat('last-run-log', 'last-run-repo-missing', 'open-repos', 'recent-runs', 'run-row*4', 'period-row*1') },
    { id: 'loop-stopped', screen: 'loop', title: 'Stopped by the user, the last run cancelled', requires: LOOP.concat('last-run-log', 'loop-start', 'run-row*4') },
    { id: 'loop-server-down', screen: 'loop', title: 'Stopped by a server shutdown', requires: LOOP.concat('last-run-log', 'loop-start', 'run-row*4', 'period-row*1') },
    { id: 'loop-never-run', screen: 'loop', title: 'Just created', requires: LOOP.concat('loop-start') },
    { id: 'loop-archived', screen: 'loop', title: 'Archived: Restore, no Start', requires: LOOP.concat('loop-restore', 'run-row*2', 'period-row*1') },
    { id: 'loop-stop-confirm', screen: 'loop', title: 'Stop confirmation from the loop page', fixed: true, requires: ['loop-header', 'stop-dialog', 'stop-cancel', 'stop-confirm'] },
    { id: 'loop-stopping', screen: 'loop', title: 'Stopping', requires: LOOP.concat('live-log', 'run-row*4') },
    { id: 'loop-disconnected', screen: 'loop', title: 'Connection lost while following the live output', requires: ['banner-disconnected'].concat(RUNNING) },
    { id: 'loop-not-found', screen: 'loop', title: 'LOOP_NOT_FOUND' },
    { id: 'loop-loading', screen: 'loop', title: 'Skeleton' },
    { id: 'loop-help', screen: 'loop', title: 'The ? of Recent runs open (a popover on the desktop, a sheet on the phone)', fixed: true, requires: ['runs-help', 'help-sheet', 'recent-runs'] },
    { id: 'loop-menu', screen: 'loop', title: 'The ⋯ of the loop page open: Duplicate, Archive locked while running', fixed: true, requires: ['loop-menu', 'menu-duplicate', 'menu-archive'] },
    { id: 'loop-runs', screen: 'loop', title: 'All runs: the longest active period, every run grouped by active period, paged (10 per page)', requires: ['runs-table', 'run-row*10', 'runs-pager', 'period-longest', 'exec-row*1', 'runs-prev', 'runs-next'] },
    { id: 'loop-settings', screen: 'loop', title: 'Settings and prompt: repo with path, schedule, agent, runs at the same time, time limit, the full prompt, Edit settings', requires: ['config-repo', 'config-executor', 'config-timeout', 'loop-prompt', 'loop-edit'] },
    { id: 'period-running', screen: 'period', title: 'Still active', requires: PERIOD.concat('run-row*10') },
    { id: 'period-stopped', screen: 'period', title: 'Ended because the user pressed Stop', requires: PERIOD.concat('run-row*4') },
    { id: 'period-server-down', screen: 'period', title: 'Ended because the server shut down, an interrupted run', requires: PERIOD.concat('run-row*4') },
    { id: 'period-copied', screen: 'period', title: 'Toast after copying every session id', fixed: true, requires: PERIOD.concat('run-row*10') },
    { id: 'period-not-found', screen: 'period', title: 'EXECUTION_NOT_FOUND' },
    { id: 'run-running', screen: 'run', title: 'Running, live log', requires: ['run-header', 'run-facts', 'run-session', 'run-log', 'run-transcript'] },
    { id: 'run-succeeded', screen: 'run', title: 'Succeeded: summary, cost, session, resume command; the prompt used differs from the current prompt', requires: RUN.concat('run-summary', 'run-resume', 'run-resume-copy', 'run-prompt') },
    { id: 'run-failed', screen: 'run', title: 'Failed with a process-level error', requires: RUN.concat('run-banner', 'run-summary', 'run-resume') },
    { id: 'run-timed-out', screen: 'run', title: 'Timed out', requires: RUN.concat('run-banner', 'run-resume') },
    { id: 'run-cancelled', screen: 'run', title: 'Cancelled by Stop', requires: RUN.concat('run-banner', 'run-resume') },
    { id: 'run-interrupted', screen: 'run', title: 'Interrupted by a server shutdown', requires: RUN.concat('run-banner', 'run-resume') },
    { id: 'run-skipped', screen: 'run', title: 'Skipped: the reason, no session, no log', requires: ['run-header', 'skip-reason', 'run-transcript-note'] },
    { id: 'run-repo-missing', screen: 'run', title: 'The repo folder is gone: the hint and Open Repos', requires: ['run-header', 'run-repo-missing', 'open-repos', 'run-log', 'run-transcript-note'] },
    { id: 'run-resume-copied', screen: 'run', title: 'Toast after Copy command', fixed: true, requires: RUN.concat('run-resume') },
    { id: 'run-not-found', screen: 'run', title: 'RUN_NOT_FOUND' },
    { id: 'run-loading', screen: 'run', title: 'Skeleton' },
    { id: 'run-transcript-running', screen: 'run', title: 'The transcript following a live session', requires: TX },
    { id: 'run-transcript-waiting', screen: 'run', title: 'Waiting for the session file', requires: ['run-header', 'run-transcript-note', 'run-log'] },
    { id: 'run-transcript-paused', screen: 'run', title: 'Connection lost while following', requires: ['banner-disconnected'].concat(TX) },
    { id: 'run-transcript-missing', screen: 'run', title: 'The session file is gone', requires: ['run-header', 'run-transcript-note', 'run-log'] },
    { id: 'run-transcript-no-session', screen: 'run', title: 'A run without a session (no transcript)', requires: ['run-header', 'run-transcript-note'] },
    { id: 'vi-run-transcript', screen: 'run', title: 'The transcript in Vietnamese', lang: 'vi', requires: ['run-transcript', 'run-transcript-scroll', 'tx-entry*5'] },
    { id: 'form-new', screen: 'form', title: 'Defaults: no repo, every 30 minutes, Asia/Ho_Chi_Minh, opus, medium, no time limit', requires: FORM.concat('sched-minutes', 'sched-tz', 'f-max-concurrent', 'form-cancel') },
    { id: 'form-sched-minutes-uneven', screen: 'form', title: 'Every 7 minutes: the uneven-gap warning', requires: FORM.concat('sched-minutes', 'sched-warn-unevenMinuteStep') },
    { id: 'form-sched-hours', screen: 'form', title: 'Every 2 hours at minute 05', requires: FORM.concat('sched-hours', 'sched-at-minute') },
    { id: 'form-sched-daily', screen: 'form', title: 'Every day at 02:30', requires: FORM.concat('sched-time', 'sched-desc', 'sched-next-when*5') },
    { id: 'form-sched-weekly', screen: 'form', title: 'Mon, Wed, Fri at 08:30', requires: FORM.concat('sched-days', 'sched-day-1', 'sched-day-3', 'sched-day-5', 'sched-time') },
    { id: 'form-sched-monthly-warn', screen: 'form', title: 'Day 31: the warning', requires: FORM.concat('sched-day', 'sched-time', 'sched-warn-missingMonthDay') },
    { id: 'form-sched-advanced', screen: 'form', title: 'A cron with no built-in kind, with its description', requires: FORM.concat('sched-cron', 'sched-desc') },
    { id: 'form-sched-advanced-error', screen: 'form', title: 'An invalid cron: the error, Save locked', requires: FORM.filter((x) => x !== 'sched-next').concat('sched-cron', 'sched-cron-error') },
    { id: 'form-errors', screen: 'form', title: 'After Save: an error at each field and a summary', requires: ERRORS },
    { id: 'form-saving', screen: 'form', title: 'Saving', requires: FORM },
    { id: 'form-edit-running', screen: 'form', title: 'Editing a running loop: applies from the next run', requires: FORM.concat('form-edit-running') },
    { id: 'form-conflict', screen: 'form', title: 'VERSION_CONFLICT: Reload or Overwrite', requires: FORM.concat('form-conflict', 'conflict-reload', 'conflict-overwrite') },
    { id: 'form-duplicate', screen: 'form', title: 'The copy, stopped, its editor open', requires: FORM },
    { id: 'form-loading', screen: 'form', title: 'Loading the loop', requires: ['form-loading'] },
    { id: 'form-repo-required', screen: 'form', title: 'No repo chosen', requires: FORM.concat('error-f-repo') },
    { id: 'form-no-repos', screen: 'form', title: 'No repo registered: Register a repo', requires: ['f-name', 'f-repo', 'repo-go-register', 'form-submit'] },
    { id: 'form-repo-pick', screen: 'form', title: 'The repo picker open (menu on desktop, sheet on phone), a repo whose folder is gone', fixed: true, requires: ['f-repo', 'repo-opt-name*4', 'repo-manage'] },
    { id: 'form-edit-claude', screen: 'form', title: 'Haiku, low, 600 seconds', requires: FORM.concat('hint-f-timeout') },
    { id: 'form-exec-mock', screen: 'form', title: 'Test mode: the Mock executor', requires: FORM.filter((x) => x !== 'f-model' && x !== 'f-effort').concat('f-executor', 'f-duration', 'f-fail') },
    { id: 'vi-form-errors', screen: 'form', title: 'form-errors in Vietnamese', lang: 'vi', requires: ERRORS },
    { id: 'repos-list', screen: 'repos', title: 'The four sample repos, one whose folder is gone', requires: REPOS },
    { id: 'repos-empty', screen: 'repos', title: 'No repo yet', requires: ['repo-empty', 'repo-add'] },
    { id: 'repos-loading', screen: 'repos', title: 'Skeleton', requires: ['repo-loading'] },
    { id: 'repos-add', screen: 'repos', title: 'The folder picker open (a full-height sheet on the phone, a wide dialog on the desktop), a git folder selected, the name filled in', fixed: true, requires: PICKER },
    { id: 'repos-add-notfound', screen: 'repos', title: 'A typed path that does not exist: the error under the path, the list keeps the open folder', fixed: true, requires: PICKER.concat('error-repo-path') },
    { id: 'repos-add-mac', screen: 'repos', title: 'macOS places (Home, Desktop, Documents, Downloads), a registered folder tagged', fixed: true, requires: MAC },
    { id: 'repos-add-denied', screen: 'repos', title: 'macOS refuses to read a folder: where to grant access, Retry', fixed: true, requires: PICKER.filter((x) => x !== 'folder-row*7').concat('folder-unreadable', 'folder-retry') },
    { id: 'repos-err-dup-path', screen: 'repos', title: 'The path is already registered', fixed: true, requires: PICKER.concat('error-repo-path') },
    { id: 'repos-err-dup-name', screen: 'repos', title: 'The name is taken', fixed: true, requires: PICKER.concat('error-repo-name') },
    { id: 'repos-err-missing', screen: 'repos', title: 'The folder does not exist', fixed: true, requires: PICKER.concat('error-repo-path') },
    { id: 'repos-delete-confirm', screen: 'repos', title: 'Delete an unused repo (a dialog on the desktop, a sheet on the phone)', fixed: true, requires: ['repo-row*4', 'repo-delete-dialog', 'repo-delete-cancel', 'repo-delete-confirm'] },
    { id: 'repos-delete-blocked', screen: 'repos', title: 'Delete refused: the loops that use it', requires: REPOS.concat('repo-in-use') },
    { id: 'vi-repos-list', screen: 'repos', title: 'repos-list in Vietnamese', lang: 'vi', requires: REPOS },
    { id: 'vi-repos-add', screen: 'repos', title: 'repos-add in Vietnamese', lang: 'vi', fixed: true, requires: PICKER },
    { id: 'settings', screen: 'settings', title: 'Everything connected', requires: SETTINGS },
    { id: 'settings-db-down', screen: 'settings', title: 'The database not answering', requires: SETTINGS.concat('banner-db-down') },
  ];
  const PHONE = ['frame-loading', 'frame-disconnected', 'not-found', 'loops-empty', 'loops-overview', 'loops-repo-filter', 'loops-stop-confirm', 'vi-loops-overview',
    'loop-running', 'loop-last-failed', 'loop-never-run', 'loop-stop-confirm', 'loop-help', 'loop-menu', 'loop-runs', 'loop-settings', 'period-running',
    'run-running', 'run-succeeded', 'run-transcript-running', 'form-new', 'form-sched-daily', 'form-sched-weekly', 'form-errors', 'form-repo-pick',
    'repos-list', 'repos-add', 'repos-delete-confirm', 'settings'];
  const byId = Object.fromEntries(desktop.map((s) => [s.id, s]));
  const phone = PHONE.map((id) => {
    const b = byId[id];
    return { id: 'phone-' + id, screen: b.screen, title: b.title + ' (phone)', vp: [390, 844], fixed: b.fixed, lang: b.lang, base: id, requires: b.requires };
  });
  // vi-settings is a phone-only state (spec 5.8): Settings in Vietnamese, drawn by its base settings.
  phone.push({ id: 'phone-vi-settings', screen: 'settings', title: 'Settings in Vietnamese (phone)', vp: [390, 844], lang: 'vi', base: 'settings', requires: SETTINGS });
  window.PV_STATES = desktop.concat(phone).map((s) => {
    const frame = (s.vp ? s.vp[0] : 1440) >= 640 ? ['topbar'] : PUSHED.includes(s.screen) ? [] : ['tabbar'];
    return Object.assign({}, s, { requires: (s.requires || []).concat(frame) });
  });
})();
