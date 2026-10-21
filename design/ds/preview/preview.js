// New preview (UI uplift, epic #63): draws one state from ?state=<id>&theme=light|dark[&lang=en|vi].
// Uses only the classes of design/ds/components.css (which read design/ds/tokens.css), the markup the app will render
// and the test ids of spec 7.1. Every UI text goes through t() or tn(), taken from messages.js (built from
// shared/i18n/en.ts + vi.ts by npm run design:shots). Sample data lives in data.js, the states in states.js; a phone
// state (phone-<id>) draws its base state. Actions are placed with the app's rule: window.innerWidth < 640 is the phone;
// the Loops table is used from 1024px, the inset list below. Problems (missing i18n key, unknown state, a draw error)
// go to window.__PV.problems and a banner at the top; npm run design:shots reports them.
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const STATE_ID = Q.get('state') || 'loops-overview';
  const META = (window.PV_STATES || []).find((s) => s.id === STATE_ID);
  const THEME = Q.get('theme') === 'dark' ? 'dark' : 'light';
  const LANG = (Q.get('lang') || (META && META.lang) || 'en') === 'vi' ? 'vi' : 'en';
  document.documentElement.dataset.theme = THEME;
  document.documentElement.lang = LANG;
  const MSG = ((window.MESSAGES || {})[LANG]) || {};
  const D = window.PV;
  const PHONE = window.innerWidth < 640;
  const WIDE = window.innerWidth >= 1024;
  const problems = [];

  // ── text ────────────────────────────────────────────────────
  function t(key, p) {
    const s = MSG[key];
    if (s == null) { problems.push('missing i18n key: ' + key); return '⟦' + key + '⟧'; }
    return p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m)) : s;
  }
  // Plural-aware text (spec D16): base.zero (when the key exists) / base.one / base.other.
  const tn = (base, n, p) => t(n === 0 && MSG[base + '.zero'] != null ? base + '.zero' : n === 1 ? base + '.one' : base + '.other', Object.assign({ n }, p));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const mmss = (sec) => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
  const SCH = window.PV_SCHED || { desc: {} };
  function schedDesc(cron) {
    const d = SCH.desc[cron];
    if (!d) { problems.push('schedule.js has no sentence for cron: ' + cron); return cron; }
    return d[LANG];
  }
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
  <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></symbol>
  <symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></symbol>
  <symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 5h16l-6 7.5V18l-4 2v-7.5z"/></symbol>
  <symbol id="i-loops" viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/></symbol>
  <symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
  <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></symbol>
  <symbol id="i-theme" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></symbol>
</svg>`;

  // ── frame: the top bar (from 640px), the tab bar (below), banners ──
  // conn: 'ok' | 'lost' | 'db'. The nav counts are the loops and the repos of the sample world.
  function topbar(o) {
    const conn = { ok: ['is-ok', 'conn.ok', 'ok', 'ok'], lost: ['is-lost', 'conn.lost', 'down', 'wait'], db: ['is-db-down', 'conn.dbDown', 'ok', 'down'] }[o.conn || 'ok'];
    const link = (k, id, label, count) => `<a class="topbar-link${o.tab === k ? ' is-on' : ''}" href="#" data-testid="${id}"${o.tab === k ? ' aria-current="page"' : ''}>${label}${count}</a>`;
    return `<header class="topbar" data-testid="topbar"><span class="topbar-brand">${t('app.title')}</span>` +
      `<nav class="topbar-nav">${link('loops', 'nav-loops', t('nav.loops'), o.loopCount == null ? '' : ` <span>${o.loopCount}</span>`)}` +
      `${link('repos', 'nav-repos', t('nav.repos'), ` <span data-testid="nav-repos-count">${D.repoOrder.length}</span>`)}${link('settings', 'nav-settings', t('nav.settings'), '')}</nav>` +
      `<div class="topbar-end"><span class="conn ${conn[0]}" data-testid="conn" data-server="${conn[2]}" data-db="${conn[3]}">${t(conn[1])}</span>` +
      `<button class="iconbtn" type="button" data-testid="toggle-theme" aria-label="${t('theme.switch')}">${icon('theme')}</button></div></header>`;
  }
  function tabbar(tab) {
    const item = (k, id, ic, label) => `<a class="tabbar-item${tab === k ? ' is-on' : ''}" href="#" data-testid="${id}"${tab === k ? ' aria-current="page"' : ''}>${icon(ic)}${label}</a>`;
    return `<nav class="tabbar" data-testid="tabbar">${item('loops', 'tab-loops', 'loops', t('nav.loops'))}${item('repos', 'tab-repos', 'folder', t('nav.repos'))}${item('settings', 'tab-settings', 'gear', t('nav.settings'))}</nav>`;
  }
  const BANNERS = {
    lost: () => `<div class="banner is-err" data-testid="banner-disconnected" role="status">${icon('alert')}<span class="banner-text"><b>${t('banner.lost')}</b> ${t('banner.lostRetry', { n: 3, s: 4 })}</span></div>`,
    back: () => `<div class="banner is-info" data-testid="banner-reconnected" role="status">${icon('info')}<span class="banner-text">${t('banner.back')}</span></div>`,
    db: () => `<div class="banner is-warn" data-testid="banner-db-down" role="status">${icon('alert')}<span class="banner-text">${t('banner.db')}</span></div>`,
  };
  // The whole app: frame + one page (+ an overlay drawn over it).
  function app(o) {
    return SPRITE + `<div class="app">${topbar(o)}<main class="page">${o.banner ? BANNERS[o.banner]() : ''}${o.page}</main>${tabbar(o.tab)}</div>${o.overlay || ''}`;
  }

  // ── Loops page ──────────────────────────────────────────────
  // Loop kind (the data-status of spec 7.1) and its pill (spec 4.7).
  function kindOf(l) {
    if (l.archived) return 'archived';
    if (l.run) return 'running';
    if (l.status === 'active') return 'active';
    return l.endReason === 'server_down' ? 'server_down' : 'stopped';
  }
  const PILL = { running: ['s-run', 'status.running'], active: ['s-wait', 'status.waiting'], stopped: ['s-stop', 'status.stopped'], server_down: ['s-int', 'status.serverDown'], archived: ['s-stop', 'status.archived'] };
  const LAST = { failed: 'row.lastFailed', timed_out: 'row.lastTimedOut', succeeded: 'row.lastOk', cancelled: 'row.lastCancelled' };
  function lastText(l) {
    if (l.run) return t('row.runningFor', { n: l.run.n, d: mmss(l.run.elapsed) });
    if (!l.last) return t('row.neverStarted');
    if (!LAST[l.last.st]) { problems.push('no row text for a last run that is ' + l.last.st); return l.last.st; }
    return t(LAST[l.last.st], { t: l.last.at });
  }
  const pill = (kind) => `<span class="pill ${PILL[kind][0]}" data-testid="row-status" data-status="${kind}">${t(PILL[kind][1])}</span>`;
  function rowAction(l, kind) {
    const stop = kind === 'running' || kind === 'active';
    const id = stop ? 'row-stop' : 'row-start', label = t(stop ? 'act.stop' : 'act.start'), ic = stop ? 'stop' : 'play';
    const off = kind === 'archived' ? ' disabled' : '';
    return PHONE || !WIDE
      ? `<button class="act ${stop ? 'stop' : 'start'}" type="button" data-testid="${id}" aria-label="${label}"${off}>${icon(ic)}</button>`
      : `<button class="iconbtn" type="button" data-testid="${id}" aria-label="${label}"${off}>${icon(ic)}</button>`;
  }
  // A loop row: an inset-list cell below 1024px, a row of the Loops table from 1024px. o.menu = its ⋯ menu is open.
  function loopRow(l, o = {}) {
    const kind = kindOf(l), repo = D.repos[l.repo].name;
    const attrs = `data-testid="loop-row" data-loop-id="${l.id}" data-status="${kind}"`;
    if (!WIDE) {
      const next = l.next ? t('row.next', { t: l.next.at }) : t('row.notScheduled');
      return `<div class="cell" ${attrs}><a class="cell-main" href="#"><span class="cell-title" data-testid="loop-name">${esc(l.name)}</span>` +
        `<span class="cell-row">${pill(kind)}<span data-testid="row-last">${lastText(l)}</span></span>` +
        `<span class="cell-meta is-one-line"><span data-testid="row-repo">${esc(repo)}</span> · ${esc(schedDesc(l.cron))} · <span data-testid="row-next">${next}</span></span></a>` +
        `${rowAction(l, kind)}</div>`;
    }
    return `<div class="ltable-row" role="row" ${attrs}><a class="ltable-name" href="#"><b data-testid="loop-name">${esc(l.name)}</b><span data-testid="row-repo">${esc(repo)}</span></a>` +
      `<span class="ltable-cell">${pill(kind)}</span><span class="ltable-cell">${esc(schedDesc(l.cron))}</span>` +
      `<span class="ltable-cell" data-testid="row-last">${lastText(l)}</span><span class="ltable-cell" data-testid="row-next">${l.next ? l.next.at : t('row.notScheduled')}</span>` +
      `<span class="ltable-act">${rowAction(l, kind)}<button class="iconbtn" type="button" data-testid="row-menu" aria-label="${t('act.more')}" aria-haspopup="menu"${o.menu ? ' aria-expanded="true"' : ''}>${icon('more')}</button></span>` +
      `${o.menu ? rowMenu(l) : ''}</div>`;
  }
  // The ⋯ menu of a row (desktop only; the phone cell has no ⋯). Placed under the button, inside the row.
  function rowMenu(l) {
    const busy = l.run || l.status === 'active';
    return `<div class="menu" role="menu" style="position:absolute;top:calc(100% - var(--space-3));right:var(--space-4)">` +
      `<a class="menu-item" href="#" role="menuitem" data-testid="menu-open">${t('act.open')}</a>` +
      `<button class="menu-item" type="button" role="menuitem" data-testid="menu-edit">${t('act.edit')}</button>` +
      `<button class="menu-item" type="button" role="menuitem" data-testid="menu-duplicate">${t('act.duplicate')}</button><hr>` +
      `<button class="menu-item" type="button" role="menuitem" data-testid="menu-archive"${busy ? ' aria-disabled="true"' : ''}>${t(busy ? 'act.archiveLocked' : 'act.archive')}</button></div>`;
  }
  function loopList(list, o = {}) {
    const rows = list.map((l) => loopRow(l, { menu: o.menu === l.id })).join('');
    if (!WIDE) return `<div class="group">${rows}</div>`;
    const head = ['loops.col.loop', 'loops.col.status', 'loops.col.schedule', 'loops.col.last', 'loops.col.next'].map((k) => `<span role="columnheader">${t(k)}</span>`).join('');
    return `<div class="ltable" role="table"><div class="ltable-head" role="row">${head}<span></span></div>${rows}</div>`;
  }
  // The four figures of UC-03 (spec D25). stats null = not loaded yet ("-"); stale = frozen while disconnected.
  function summary(stats, o = {}) {
    const item = (id, key, n, dot, plural = true) => {
      const v = stats ? stats[key] : null;
      const label = plural ? tn(n, v == null ? 2 : v) : t(n);
      const attrs = `${v == null ? '' : ` data-value="${v}"`}${o.stale ? ' data-stale="true"' : ''}${key === 'errors24h' && v > 0 ? ' data-alert="true"' : ''}`;
      return `<div class="summary-item" data-testid="${id}"${attrs}><b>${dot && v > 0 ? `<span class="dot ${dot}"></span>` : ''}${v == null ? '-' : v}</b>${label}</div>`;
    };
    return `<div class="summary" data-testid="summary">${item('stat-active-loops', 'activeLoops', 'summary.running', 'd-run')}` +
      `${item('stat-running-runs', 'runningRuns', 'summary.runs')}${item('stat-runs-today', 'runsToday', 'summary.today')}` +
      `${item('stat-errors-24h', 'errors24h', 'summary.failed', 'd-fail', false)}</div>`;
  }
  // Search, the status segmented control and the repo filter. o.repoOpen = the filter menu (desktop) is open.
  function toolbar(o = {}) {
    const c = o.counts || D.counts, f = o.filter || 'all';
    const seg = ['all', 'active', 'stopped', 'archived'].map((k) => `<button type="button" role="tab" data-testid="tab-${k}" aria-selected="${k === f}"${k === f ? ' class="is-on"' : ''}${o.off ? ' disabled' : ''}>${t('list.filter.' + k)} ${o.off ? '-' : c[k]}</button>`).join('');
    const filterBtn = PHONE
      ? `<button class="iconbtn bordered" type="button" data-testid="repo-filter" data-active="false" aria-label="${t('loops.repoFilter')}" aria-haspopup="dialog"${o.off ? ' disabled' : ''}>${icon('filter')}</button>`
      : `<button class="btn" type="button" data-testid="repo-filter" data-active="false" aria-haspopup="menu"${o.repoOpen ? ' aria-expanded="true"' : ''}${o.off ? ' disabled' : ''}>${t('loops.repoAll')}${icon('down')}</button>`;
    const filter = o.repoOpen && !PHONE ? `<span style="position:relative;display:inline-flex">${filterBtn}${repoMenu()}</span>` : filterBtn;
    return `<div class="toolbar"><label class="search">${icon('search')}<input type="search" data-testid="list-search" placeholder="${t('loops.search')}" aria-label="${t('loops.search')}" value="${esc(o.q || '')}"${o.off ? ' disabled' : ''}></label>` +
      `<div class="seg" role="tablist">${seg}</div>${filter}</div>`;
  }
  const repoItems = (cls) => [['all', t('loops.repoAll')]].concat(D.repoOrder.map((k) => [D.repos[k].id, esc(D.repos[k].name)]))
    .map(([id, name], i) => cls === 'cell'
      ? `<button class="cell${i ? '' : ' is-sel'}" type="button" data-testid="repo-filter-${id}"${i ? '' : ' aria-current="true"'}><span class="cell-title is-plain">${name}</span></button>`
      : `<button class="menu-item${i ? '' : ' is-on'}" type="button" role="menuitemradio" aria-checked="${!i}" data-testid="repo-filter-${id}">${name}</button>`).join('');
  const repoMenu = () => `<div class="menu" role="menu" style="position:absolute;top:calc(100% + var(--space-1));right:0">${repoItems('menu')}</div>`;
  const repoSheet = () => `<div class="scrim"></div><div class="sheet" role="dialog" aria-label="${t('loops.repoFilter')}"><span class="sheet-grab"></span><h2>${t('loops.repoFilter')}</h2><div class="group">${repoItems('cell')}</div></div>`;
  // Page head: the large title of the tab root (phone) or the page title (from 640px) and New loop, rendered once (the
  // empty state carries New loop itself: one primary action per view).
  const head = (action = true) => (!action ? `<div class="page-head"><h1 class="${PHONE ? 'large-title' : 'page-title'}">${t('loops.title')}</h1></div>` : PHONE
    ? `<div class="page-head"><h1 class="large-title">${t('loops.title')}</h1><button class="iconbtn" type="button" data-testid="list-create" aria-label="${t('loops.new')}">${icon('plus')}</button></div>`
    : `<div class="page-head"><h1 class="page-title">${t('loops.title')}</h1><button class="btn primary" type="button" data-testid="list-create">${icon('plus')}${t('loops.new')}</button></div>`);
  const loopsOf = (keys) => keys.map((k) => D.loops[k]);
  // o: stats (null = loading), stale, list = the list block, toolbar options.
  function loopsPage(o = {}) {
    const stats = o.stats === undefined ? D.stats : o.stats;
    return head() + summary(stats, { stale: o.stale }) + toolbar(o.toolbar) + (o.list || loopList(loopsOf(D.order), o));
  }
  const loading = () => `<div class="group" data-testid="list-loading" aria-busy="true">${[0, 1, 2, 3, 4].map(() => '<div class="cell"><div class="cell-main"><span class="skeleton is-line"></span><span class="skeleton is-line"></span></div></div>').join('')}</div>`;
  const howto = () => `<ol class="steps">${[1, 2, 3].map((i) => `<li class="step"><span><b>${t(`howto.${i}.title`)}</b>${t(`howto.${i}.body`)}</span></li>`).join('')}</ol>`;
  // The 12 loops of loops-many (data.js PV.many): 10 with a run working, 2 stopped.
  function manyLoops() {
    const ids = { api: 'api', notes: 'notes', dotfiles: 'dotfiles' };
    return D.many.map(([name, cron, n, el, , , , , lastAt, nextAt, lastSt, , , repo], i) => ({
      id: `many-${i + 1}`, name, cron, repo: ids[repo], status: n != null ? 'active' : 'stopped',
      run: n != null ? { n, elapsed: el } : null, last: { st: lastSt, at: lastAt }, next: nextAt ? { at: nextAt } : null,
    }));
  }
  // The Stop confirmation of a loop with one run working: a dialog from 640px, a sheet below.
  function stopConfirm(key) {
    const l = D.loops[key];
    const title = t('stop.title', { name: esc(l.name) }), body = t('stop.body', { n: l.run.n, d: mmss(l.run.elapsed), k: l.exec.k });
    if (PHONE) {
      return `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" data-testid="stop-dialog"><span class="sheet-grab"></span><h2>${title}</h2><p>${body}</p>` +
        `<button class="btn lg block danger-solid" type="button" data-testid="stop-confirm">${t('stop.confirm')}</button><button class="btn lg block plain" type="button" data-testid="stop-cancel">${t('stop.keep')}</button></div>`;
    }
    return `<div class="scrim"></div><div class="dialog" role="dialog" aria-modal="true" data-testid="stop-dialog"><div class="dialog-head"><h2>${title}</h2></div><div class="dialog-body">${body}</div>` +
      `<div class="dialog-foot"><button class="btn ghost" type="button" data-testid="stop-cancel">${t('stop.keep')}</button><button class="btn danger-solid" type="button" data-testid="stop-confirm">${t('stop.confirm')}</button></div></div>`;
  }
  const toast = (cls, text) => `<div class="toast-stack"><span class="toast ${cls}" role="status">${text}</span></div>`;
  const loops = (o) => app(Object.assign({ tab: 'loops', loopCount: D.counts.all }, o));

  // ── states ──────────────────────────────────────────────────
  const R = {
    'frame-loading': () => loops({ loopCount: null, page: loopsPage({ stats: null, toolbar: { off: true }, list: loading() }) }),
    'frame-disconnected': () => loops({ conn: 'lost', banner: 'lost', page: loopsPage({ stale: true }) }),
    'frame-reconnected': () => loops({ banner: 'back', page: loopsPage() }),
    'frame-db-down': () => loops({ conn: 'db', banner: 'db', page: loopsPage() }),
    'not-found': () => app({ tab: null, loopCount: D.counts.all, page: `<div class="empty"><b>${t('missing.title')}</b><span>${t('missing.body')}</span><a class="btn" href="#">${t('missing.home')}</a></div>` }),
    'loops-empty': () => loops({ loopCount: 0, page: head(false) + `<div class="empty" data-testid="home-empty"><b>${t('howto.title')}</b><button class="btn primary lg" type="button" data-testid="list-create">${icon('plus')}${t('loops.new')}</button></div>` + howto() }),
    'loops-error': () => loops({ loopCount: null, page: loopsPage({ stats: null, toolbar: { off: true }, list: `<div class="empty is-err" data-testid="list-error" role="alert"><b>${t('list.error.title')}</b><button class="btn" type="button">${t('list.error.retry')}</button></div>` }) }),
    'loops-overview': () => loops({ page: loopsPage() }),
    'loops-filter-archived': () => loops({ page: loopsPage({ toolbar: { filter: 'archived' }, list: loopList(loopsOf(['oldsched'])) }) }),
    'loops-search-empty': () => loops({ page: loopsPage({ toolbar: { q: 'nightly' }, list: `<div class="empty" data-testid="list-no-match"><b>${t('list.noMatch.title', { q: 'nightly' })}</b><span>${t('list.noMatch.hint')}</span><button class="btn" type="button">${t('loops.clearSearch')}</button></div>` }) }),
    'loops-repo-filter': () => loops({ page: loopsPage({ toolbar: { repoOpen: true } }), overlay: PHONE ? repoSheet() : '' }),
    'loops-row-menu': () => loops({ page: loopsPage({ menu: D.loops.pilot.id }) }),
    'loops-stop-confirm': () => loops({ page: loopsPage(), overlay: stopConfirm('pilot') }),
    'loops-action-error': () => loops({ page: loopsPage(), overlay: toast('is-err', t('toast.failed', { msg: t('error.LOOP_ALREADY_ACTIVE') })) }),
    'loops-many': () => loops({ loopCount: 12, page: loopsPage({ stats: { activeLoops: 10, runningRuns: 10, runsToday: 214, errors24h: 3 }, toolbar: { counts: { all: 12, active: 10, stopped: 2, archived: 1 } }, list: loopList(manyLoops()) }) }),
  };
  R['vi-loops-overview'] = R['loops-overview'];

  // ── draw ────────────────────────────────────────────────────
  let html = '';
  const drawId = (META && META.base) || STATE_ID;
  if (!META) problems.push('state not in states.js: ' + STATE_ID);
  if (!R[drawId]) problems.push('no draw function for state: ' + drawId);
  else { try { html = R[drawId](); } catch (err) { problems.push('error while drawing: ' + err.message); } }
  document.title = `${STATE_ID} · ${THEME} - Castraferrum new preview`;
  document.body.innerHTML = (problems.length ? `<div class="banner is-err" role="alert"><span class="banner-text">${problems.map(esc).join(' · ')}</span></div>` : '') + html;
  window.__PV = { state: STATE_ID, theme: THEME, lang: LANG, problems };
})();
