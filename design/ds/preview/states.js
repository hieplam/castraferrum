// States of the new preview (UI uplift, epic #63). Every id has exactly one row in design/ds/STATES.md
// (scripts/design-states.mjs checks both ways).
// Fields: id, screen, title; vp = [width, height] (default 1440 by 900); fixed = an overlay is open (shoot the viewport
// only); lang = UI language (default en); base = the state a phone-<id> state draws; requires = the test ids the state
// must show, as 'id' or 'id*count' (only visible elements count). A phone state inherits lang, fixed and requires from
// its base; the frame adds 'topbar' from 640px and 'tabbar' below.
window.PV_SCREENS = [
  ['frame', 'Frame and system', 'every route', []],
  ['loops', 'Loops page', '/', ['d-loops-light.png', 'm-loops-light.png', 'm-loops-dark.png', 'm-stop-light.png', 'm-stop-dark.png']],
];
(function () {
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
  ];
  const PHONE = ['frame-loading', 'frame-disconnected', 'not-found', 'loops-empty', 'loops-overview', 'loops-repo-filter', 'loops-stop-confirm', 'vi-loops-overview'];
  const byId = Object.fromEntries(desktop.map((s) => [s.id, s]));
  const phone = PHONE.map((id) => {
    const b = byId[id];
    return { id: 'phone-' + id, screen: b.screen, title: b.title + ' (phone)', vp: [390, 844], fixed: b.fixed, lang: b.lang, base: id, requires: b.requires };
  });
  window.PV_STATES = desktop.concat(phone).map((s) => {
    const frame = (s.vp ? s.vp[0] : 1440) >= 640 ? 'topbar' : 'tabbar';
    return Object.assign({}, s, { requires: (s.requires || []).concat(frame) });
  });
})();
