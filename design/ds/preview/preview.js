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
  <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></symbol>
  <symbol id="i-up" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></symbol>
  <symbol id="i-restore" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/></symbol>
</svg>`;

  // ── frame: the top bar (from 640px), the tab bar (below), banners ──
  // conn: 'ok' | 'lost' | 'db'. The nav counts are the loops and the repos of the sample world (o.repoCount for another
  // world).
  function topbar(o) {
    const conn = { ok: ['is-ok', 'conn.ok', 'ok', 'ok'], lost: ['is-lost', 'conn.lost', 'down', 'wait'], db: ['is-db-down', 'conn.dbDown', 'ok', 'down'] }[o.conn || 'ok'];
    const link = (k, id, label, count) => `<a class="topbar-link${o.tab === k ? ' is-on' : ''}" href="#" data-testid="${id}"${o.tab === k ? ' aria-current="page"' : ''}>${label}${count}</a>`;
    return `<header class="topbar" data-testid="topbar"><span class="topbar-brand">${t('app.title')}</span>` +
      `<nav class="topbar-nav">${link('loops', 'nav-loops', t('nav.loops'), o.loopCount == null ? '' : ` <span>${o.loopCount}</span>`)}` +
      `${link('repos', 'nav-repos', t('nav.repos'), ` <span data-testid="nav-repos-count">${o.repoCount == null ? D.repoOrder.length : o.repoCount}</span>`)}${link('settings', 'nav-settings', t('nav.settings'), '')}</nav>` +
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
  // The whole app: frame + one page (+ an overlay drawn over it). o.navbar = a pushed page: its navigation bar on the
  // phone and no tab bar; o.narrow = the narrow page width.
  function app(o) {
    const bottom = o.navbar === undefined ? tabbar(o.tab) : '';
    return SPRITE + `<div class="app">${topbar(o)}${PHONE && o.navbar ? o.navbar : ''}<main class="page${o.narrow ? ' is-narrow' : ''}">${o.banner ? BANNERS[o.banner]() : ''}${o.page}</main>${bottom}</div>${o.overlay || ''}`;
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

  // ── Loop page, All runs, loop settings, active period ───────
  // Times of the sample world are 'dd/mm hh:mm:ss', or 'hh:mm:ss' for today (18/10/2026, a Sunday).
  const TODAY = D.today.slice(0, 5);
  const split = (ts) => (ts.includes(' ') ? ts.split(' ') : [TODAY, ts]);
  const hm = (ts) => split(ts)[1].slice(0, 5);
  const dow = (date) => { const [d, m] = date.split('/').map(Number); return new Date(Number(D.today.slice(6)), m - 1, d).getDay(); };
  // 'Sun 09:47' today, 'Sat 17/10 08:00' another day; the time alone when the day is the same as sameAs.
  function when(ts, sameAs) {
    const [date, time] = split(ts);
    if (sameAs && split(sameAs)[0] === date) return time.slice(0, 5);
    return `${t('day.short.' + dow(date))}${date === TODAY ? '' : ' ' + date} ${time.slice(0, 5)}`;
  }
  const stamp = (ts) => (split(ts)[0] === TODAY ? hm(ts) : when(ts));
  function dur(sec) {
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return d ? t('dur.short.dh', { d, h }) : h ? t('dur.short.hm', { h, m }) : m ? t('dur.m', { m }) : t('dur.s', { s: sec });
  }
  const clock = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}` : mmss(sec));
  const usd = (c) => '$' + c.toFixed(2);
  function addSec(ts, sec) {
    const [h, m, s] = split(ts)[1].split(':').map(Number), x = h * 3600 + m * 60 + s + sec;
    return `${pad(Math.floor(x / 3600) % 24)}:${pad(Math.floor((x % 3600) / 60))}:${pad(x % 60)}`;
  }
  // Ids as the seeded world makes them (the classic preview's hash): session ids, period ids, run ids.
  function hash32(str, seed) {
    let h = 2166136261;
    for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    h ^= Math.imul(seed + 1, 0x9e3779b9); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function uuid(seed) { const x = [0, 1, 2, 3].map((i) => hash32(seed, i * 7919)).join(''); return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`; }
  const sid = (key, n) => uuid(key + '#' + n);
  const execId = (key, k) => { const e = D.loops[key].exec; return e && e.k === k ? e.id : uuid(key + 'exec' + k); };
  const runId = (key, r) => uuid(key + (r.n == null ? 'skip' + r.start : 'run' + r.n));
  const chev = `<svg class="icon chev" aria-hidden="true"><use href="#i-chev"/></svg>`;

  // The console's own log lines of a run. The server writes them in English: they are data, not UI text.
  function serverDur(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : m ? `${m} min` : `${sec} s`;
  }
  function serverLines(key, r) {
    const l = D.loops[key];
    if (r.repoGone) return [[addSec(r.start, 0), 'log-err', `Error · Repo does not exist: ${D.repos[l.repo].path}`]];
    const L = [[addSec(r.start, 0), 'log-head', `Start round #${r.n} · session ${sid(key, r.n)}`]];
    const at = addSec(r.start, r.dur);
    if (r.st === 'succeeded') L.push([at, 'log-ok', `End · Succeeded · ${usd(r.cost)}`]);
    if (r.st === 'failed') { L.push([at, 'log-err', `Error · ${r.err}`]); if (r.cost != null) L.push([at, '', `End · Error · ${usd(r.cost)}`]); }
    if (r.st === 'timed_out') L.push([at, 'log-err', `End · Timed out (timeout ${l.timeout == null ? 'no limit' : serverDur(l.timeout)}) · stop signal sent`]);
    if (r.st === 'cancelled') L.push([at, '', 'End · Cancelled (Stop) · stop signal sent']);
    return L; // running: only the Start line; interrupted: the server died, no End line
  }
  // o.live = the live output (a cursor at now, data-paused); o.left and o.right = the bar.
  function logBlock(id, lines, o) {
    const body = lines.map(([at, cls, s], i) => `<span class="log-line" data-seq="${i + 1}"><span class="log-time">${at}</span>${cls ? `<span class="${cls}">${esc(s)}</span>` : esc(s)}</span>`).join('') +
      (o.live ? `<span class="log-line"><span class="log-time">${D.now}</span><span class="cursor"></span></span>` : '');
    return `<div class="log" data-testid="${id}"${o.live ? ` data-paused="${!!o.paused}"` : ''}><div class="log-bar"><span>${o.left}</span><span>${o.right || ''}</span></div><div class="log-scroll">${body}</div></div>`;
  }

  // The loop's state on its page: the kinds of the Loops page, plus 'stopping' (data-status cancelled, spec 7.1).
  const LOOP_PILL = Object.assign({ stopping: ['s-run', 'status.stopping'] }, PILL);
  const pageKind = (l, o) => (o.stopping ? 'stopping' : kindOf(l));
  const RUN_PILL = {
    running: ['s-run', 'status.running'], succeeded: ['s-ok', 'status.succeeded'], failed: ['s-fail', 'status.failed'],
    timed_out: ['s-fail', 'status.timedOut'], cancelled: ['s-skip', 'status.cancelled'], interrupted: ['s-int', 'status.interrupted'],
    skipped: ['s-skip', 'status.skipped'],
  };
  // The counts of an active period as words (spec 5.3): [succeeded, failed, cancelled, skipped] + the runs working.
  function countWords(c, running) {
    const n = Array.isArray(c) ? c : [c.ok, c.err, c.cancel, c.skip];
    const words = [['count.succeeded', n[0]], ['count.failed', n[1]], ['count.cancelled', n[2]], ['count.skipped', n[3]], ['count.running', running]]
      .filter(([, v]) => v > 0).map(([k, v]) => t(k, { n: v }));
    return words.length ? words.join(' · ') : '-';
  }
  const periodSpan = (e) => (e.end ? t('period.span', { from: when(e.start), to: when(e.end, e.start) }) : t('period.since', { t: when(e.start) }));
  const periodEnd = (e) => t(e.st === 'active' ? 'period.stillActive' : e.st === 'server_down' ? 'period.byServer' : 'period.byYou');
  const periodCounts = (e) => tn('period.runs', e.rounds) + (e.counts[1] ? ', ' + tn('period.failed', e.counts[1]) : '');
  const periodRuns = (key, e) => (key === 'pilot' && e.k === 2 ? D.runs.pilotExec2 : D.runs[key].slice(0, e.rounds));

  // A run cell (Recent runs, All runs, an active period): number, pill, start · duration · cost, the summary on two
  // lines (spec D27); o.session = its session id under it (the active period page).
  function runCell(key, r, o = {}) {
    const p = RUN_PILL[r.st], rid = runId(key, r);
    const meta = [stamp(r.start)].concat(r.dur != null ? clock(r.dur) : [], r.cost != null ? usd(r.cost) : []).join(' · ');
    const sum = r.st === 'running' ? t('runs.stillWorking') : r.st === 'skipped' ? t('skip.reason', { n: r.reason }) : r.sum ? esc(r.sum) : '-';
    return `<a class="cell" href="#" data-testid="run-row" data-run-id="${rid}" data-status="${r.st}"><span class="cell-main">` +
      `<span class="run-top"><span class="run-id">${r.n == null ? '-' : '#' + r.n}</span><span class="pill ${p[0]}">${t(p[1])}</span><span class="run-meta">${meta}</span></span>` +
      `<span class="cell-sum" data-testid="run-sum" data-run-id="${rid}">${sum}</span>${o.session && r.n != null ? `<span class="cell-meta">${sid(key, r.n)}</span>` : ''}</span>${chev}</a>`;
  }
  const periodCell = (key, e) => `<a class="cell" href="#" data-testid="period-row" data-execution-id="${execId(key, e.k)}"><span class="cell-main">` +
    `<span class="cell-title">${t('period.title', { k: e.k })}</span><span class="cell-meta">${periodSpan(e)} · ${periodEnd(e)} · ${periodCounts(e)}</span></span>${chev}</a>`;

  // The now card of spec 5.3: what the loop does now, the live or the last output, the link to that run.
  function nowCard(key, o = {}) {
    const l = D.loops[key], kind = pageKind(l, o), rs = D.runs[key];
    const inT = l.next ? t('dur.m', { m: Math.floor(l.next.inSec / 60) }) : '';
    let state = kind, head, sub, mark = '', log = '', open = '';
    if (!l.exec) {
      state = 'never'; head = t('now.neverRun'); sub = t('now.neverRunSub');
    } else if (l.run) {
      head = t(kind === 'stopping' ? 'now.stopping' : 'now.working', { n: l.run.n });
      sub = kind === 'stopping' ? t('now.stoppingSub', { n: l.run.n }) : t('now.workingSub', { t: l.run.started.slice(0, 5), d: mmss(l.run.elapsed), next: l.next.at, in: inT });
      mark = '<span class="pulse"></span>';
      log = logBlock('live-log', serverLines(key, rs.find((r) => r.n === l.run.n)), { live: true, paused: o.paused, left: t('now.liveOutput'), right: t(o.paused ? 'now.paused' : 'now.following') });
      open = t('now.openRun', { n: l.run.n });
    } else {
      const last = rs.find((r) => r.n === l.last.n);
      if (kind === 'active' && last.st === 'failed') {
        state = 'last-failed'; head = t('now.lastFailed'); mark = '<span class="dot d-fail"></span>';
        sub = t('now.lastFailedSub', { n: last.n, t: addSec(last.start, last.dur).slice(0, 5), d: clock(last.dur), next: l.next.at });
      } else if (kind === 'active') {
        head = t('now.waiting'); sub = t('now.waitingSub', { next: l.next.at, in: inT }); mark = '<span class="dot d-ok"></span>';
      } else if (kind === 'archived') {
        head = t('now.archived'); sub = t('now.archivedSub');
      } else if (kind === 'server_down') {
        head = t('now.serverDown'); sub = t('now.serverDownSub', { k: l.exec.k, t: when(l.exec.endedAt) });
      } else {
        head = t('now.stopped'); sub = t('now.stoppedSub', { t: when(l.exec.endedAt) });
      }
      log = logBlock('last-run-log', serverLines(key, last), { left: t('now.lastOutput', { n: last.n }) });
      open = kind === 'active' ? t('now.openRun', { n: last.n }) : t('now.openLastRun');
    }
    const link = !open ? '' : PHONE ? `<a class="cell is-link" href="#"><span class="cell-main">${open}</span>${chev}</a>` : `<a class="btn" href="#">${open}${icon('arrow')}</a>`;
    return `<div class="card" data-testid="now-card" data-state="${state}"><div class="now">${mark}<span class="now-text"><b>${head}</b> ${sub}</span>${PHONE ? '' : link}</div>${log}${PHONE ? link : ''}</div>`;
  }

  // The four figures of the loop (spec 5.3), two by two.
  function figures(key) {
    const l = D.loops[key], e = l.exec, kind = kindOf(l);
    const stat = (id, label, value, sub) => `<div class="stat" data-testid="${id}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
    let html;
    if (!e) {
      const n = t('stat.neverStarted');
      html = stat('fig-active', t('stat.activeFor'), '-', n) + stat('fig-runs', t('stat.runsSinceStart'), '-', n) + stat('fig-next', t('stat.nextRun'), '-', n) + stat('fig-typical', t('stat.typical'), '-', n);
    } else {
      const live = kind === 'running' || kind === 'active';
      html = (live
        ? stat('fig-active', t('stat.activeFor'), dur(e.up), t('stat.since', { t: when(e.startedAt) }))
        : stat('fig-active', t('stat.lastPeriod'), dur(e.up), t('stat.span', { from: when(e.startedAt), to: when(e.endedAt, e.startedAt) }))) +
        stat('fig-runs', t(live ? 'stat.runsSinceStart' : 'stat.runsInIt'), e.rounds, countWords(e.counts, l.run ? 1 : 0)) +
        (live
          ? stat('fig-next', t('stat.nextRun'), l.next.at, t('stat.in', { d: t('dur.m', { m: Math.floor(l.next.inSec / 60) }) }))
          : stat('fig-next', t('stat.nextRun'), '-', t('stat.stoppedNote'))) +
        stat('fig-typical', t('stat.typical'), l.avg == null ? '-' : clock(l.avg), l.avg == null ? t('stat.none') : t('stat.average', { n: l.finished }));
    }
    return `<div class="stats" data-testid="loop-figures">${html}</div>`;
  }

  // The ? of Recent runs (spec D10): a popover from 640px, a sheet below.
  const helpDefs = () => ['loop', 'run', 'period', 'session'].map((k) => `<div class="def"><b>${t('help.' + k)}</b><span>${t('help.' + k + 'Body')}</span></div>`).join('');
  const helpPopover = () => `<div class="popover" role="dialog" data-testid="help-sheet" aria-label="${t('help.title')}" style="position:absolute;top:calc(100% + var(--space-2));left:0"><b>${t('help.title')}</b>${helpDefs()}</div>`;
  const helpSheet = () => `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" data-testid="help-sheet"><span class="sheet-grab"></span><h2>${t('help.title')}</h2>${helpDefs()}<button class="btn lg block" type="button">${t('help.close')}</button></div>`;

  // Recent runs: the current (or latest) active period expanded with up to 4 runs, then "Show N more", then the earlier
  // periods as cells. o.help = the ? is open.
  function recentRuns(key, o = {}) {
    const l = D.loops[key], ex = D.executions[key];
    if (!ex.length) return '';
    const cur = ex[0], shown = periodRuns(key, cur).slice(0, 4), more = cur.rounds - shown.length;
    const help = `<button class="help" type="button" data-testid="runs-help" aria-label="${t('runs.help')}" aria-haspopup="dialog"${o.help ? ' aria-expanded="true"' : ''}>${icon('help')}</button>`;
    const all = PHONE ? '' : `<a class="link" href="#" data-testid="all-runs-link">${t('runs.all', { n: l.runsTotal })}${icon('arrow')}</a>`;
    const earlier = ex.slice(1);
    return `<div class="section-head"><h2>${t('runs.title')}</h2>${o.help && !PHONE ? `<span style="position:relative;display:inline-flex">${help}${helpPopover()}</span>` : help}${all}</div>` +
      `<p class="group-cap" data-execution-id="${execId(key, cur.k)}">${t('period.title', { k: cur.k })} · ${periodSpan(cur)} · ${periodEnd(cur)} · ${tn('period.runs', cur.rounds)}</p>` +
      `<div class="group" data-testid="recent-runs">${shown.map((r) => runCell(key, r)).join('')}${more > 0 ? `<button class="cell is-link" type="button">${tn('runs.showMore', more)}</button>` : ''}</div>` +
      (earlier.length ? `<p class="group-cap">${t('runs.earlier')}</p><div class="group">${earlier.map((e) => periodCell(key, e)).join('')}</div>` : '');
  }

  // The loop's settings (spec 5.3, Settings and prompt): definitions in the side card from 1024px (a card holds no list),
  // inset-list cells on the settings page, one cell on the phone's loop page.
  function settings(key, card) {
    const l = D.loops[key], repo = D.repos[l.repo];
    const rows = [['config-repo', 'loopSettings.repo', esc(repo.name), repo.path], ['', 'loopSettings.schedule', esc(schedDesc(l.cron)), l.tz],
      ['config-executor', 'loopSettings.agent', t('loop.meta.claude', l.claude)], ['', 'loopSettings.parallel', t('loopSettings.atMost', { n: 1 })],
      ['config-timeout', 'loopSettings.limit', l.timeout == null ? t('loopSettings.noLimit') : dur(l.timeout)]];
    const tid = (id) => (id ? ` data-testid="${id}"` : '');
    const list = card
      ? rows.map(([id, k, v, m]) => `<div class="def"${tid(id)}><b>${t(k)}</b><span>${v}</span>${m ? `<span>${esc(m)}</span>` : ''}</div>`).join('')
      : `<div class="group">${rows.map(([id, k, v, m]) => `<div class="cell"${tid(id)}><span class="cell-main"><span class="cell-title is-plain">${t(k)}</span>${m ? `<span class="cell-meta">${esc(m)}</span>` : ''}</span><span class="cell-value">${v}</span></div>`).join('')}</div>`;
    return list + `<p class="group-cap">${t('loopSettings.prompt')}</p><pre class="code" data-testid="loop-prompt">${esc(l.prompt)}</pre>`;
  }
  const settingsCard = (key) => `<div class="card is-pad"><div class="section-head"><h2>${t('loopSettings.title')}</h2></div>${settings(key, true)}<button class="btn block" type="button">${t('loopSettings.edit')}</button></div>`;

  // The main action of the loop page: Stop loop, Start or Restore (in the action bar on the phone, in the head from 640px).
  function mainAction(l, kind) {
    const size = PHONE ? ' lg block' : '';
    if (kind === 'archived') return `<button class="btn primary${size}" type="button" data-testid="loop-restore">${icon('restore')}${t('act.restore')}</button>`;
    if (kind === 'stopped' || kind === 'server_down') return `<button class="btn primary${size}" type="button" data-testid="loop-start">${icon('play')}${t('act.start')}</button>`;
    return `<button class="btn danger${size}" type="button" data-testid="loop-stop"${kind === 'stopping' ? ' disabled' : ''}>${icon('stop')}${t('act.stopLoop')}</button>`;
  }
  // The ⋯ of the loop page: a menu under the button from 640px, a sheet on the phone.
  function loopMenu(l) {
    const busy = l.run || l.status === 'active';
    const items = `<button class="menu-item" type="button" role="menuitem" data-testid="menu-duplicate">${t('act.duplicate')}</button>` +
      `<button class="menu-item" type="button" role="menuitem" data-testid="menu-archive"${busy ? ' aria-disabled="true"' : ''}>${t(busy ? 'act.archiveLocked' : 'act.archive')}</button>`;
    return PHONE
      ? `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${t('act.more')}"><span class="sheet-grab"></span>${items}</div>`
      : `<div class="menu" role="menu" style="position:absolute;top:calc(100% + var(--space-1));right:0">${items}</div>`;
  }
  const backlink = (label, id) => `<a class="backlink" href="#"${id ? ` data-testid="${id}"` : ''}>${icon('back')}${esc(label)}</a>`;
  const navbar = (label, id, actions = '') => `<nav class="navbar"><a class="navbar-back" href="#"${id ? ` data-testid="${id}"` : ''}>${icon('back')}${esc(label)}</a><span class="navbar-title"></span><div class="navbar-actions">${actions}</div></nav>`;

  // The loop page. o: stopping, paused (the live output while disconnected), help, menu, overlay, conn, banner.
  function loopApp(key, o = {}) {
    const l = D.loops[key], kind = pageKind(l, o), repo = D.repos[l.repo];
    const pill = `<span class="pill ${LOOP_PILL[kind][0]}" data-testid="loop-status" data-status="${kind === 'stopping' ? 'cancelled' : kind}">${t(LOOP_PILL[kind][1])}</span>`;
    const menuBtn = `<button class="iconbtn${PHONE ? '' : ' bordered'}" type="button" data-testid="loop-menu" aria-label="${t('act.more')}" aria-haspopup="menu"${o.menu ? ' aria-expanded="true"' : ''}>${icon('more')}</button>`;
    const edit = `<button class="btn${PHONE ? ' plain' : ''}" type="button" data-testid="loop-edit">${t('act.edit')}</button>`;
    const status = kind === 'stopping' ? 'cancelled' : kind;
    const desc = l.desc ? `<p class="page-desc">${esc(l.desc)}</p>` : '';
    let page;
    if (PHONE) {
      const links = `<div class="group">${l.runsTotal ? `<a class="cell" href="#" data-testid="all-runs-link"><span class="cell-title">${t('runs.all', { n: l.runsTotal })}</span>${chev}</a>` : ''}` +
        `<a class="cell" href="#" data-testid="loop-settings-link"><span class="cell-main"><span class="cell-title">${t('loopSettings.title')}</span><span class="cell-meta">${t('loop.meta.claude', l.claude)}</span></span>${chev}</a></div>`;
      page = `<div class="page-head" data-testid="loop-header" data-status="${status}"><h1 class="page-title">${esc(l.name)}</h1></div>` +
        `<div class="page-meta">${pill}<span data-testid="loop-repo">${esc(repo.name)}</span> · <span>${esc(schedDesc(l.cron))}</span></div>${desc}` +
        nowCard(key, o) + figures(key) + recentRuns(key, o) + links + `<div class="actionbar">${mainAction(l, kind)}</div>`;
    } else {
      const menu = o.menu ? `<span style="position:relative;display:inline-flex">${menuBtn}${loopMenu(l)}</span>` : menuBtn;
      page = backlink(t('nav.loops')) +
        `<div class="page-head" data-testid="loop-header" data-status="${status}"><h1 class="page-title">${esc(l.name)}${pill}</h1>${edit}${menu}${mainAction(l, kind)}</div>${desc}` +
        `<div class="cols"><div class="cols-main">${nowCard(key, o)}${recentRuns(key, o)}</div><div class="cols-side">${figures(key)}${settingsCard(key)}</div></div>`;
    }
    return app({ tab: 'loops', loopCount: D.counts.all, conn: o.conn, banner: o.banner, navbar: navbar(t('nav.loops'), '', edit + menuBtn), page, overlay: o.overlay });
  }
  // All runs (spec 5.3 and D26): the longest active period, then the runs of page 1 grouped by active period.
  function runsApp(key) {
    const l = D.loops[key], cur = D.executions[key][0], rows = periodRuns(key, cur).slice(0, 10);
    const page = (PHONE ? '' : backlink(l.name)) +
      `<div class="page-head"><h1 class="page-title">${t('runs.allTitle')}</h1></div>` +
      `<p class="page-desc" data-testid="period-longest">${t('runs.longest', { k: l.longest.k, d: dur(l.longest.sec) })}</p>` +
      `<p class="group-cap" data-testid="exec-row" data-execution-id="${execId(key, cur.k)}">${t('period.title', { k: cur.k })} · ${periodSpan(cur)} · ${periodEnd(cur)} · ${periodCounts(cur)}</p>` +
      `<div class="group" data-testid="runs-table">${rows.map((r) => runCell(key, r)).join('')}</div>` +
      `<div class="page-meta" data-testid="runs-pager"><span>${t('runs.range', { a: 1, b: rows.length, n: l.runsTotal })}</span>` +
      `<button class="iconbtn bordered" type="button" data-testid="runs-prev" aria-label="${t('runs.prev')}" disabled>${icon('back')}</button>` +
      `<button class="iconbtn bordered" type="button" data-testid="runs-next" aria-label="${t('runs.next')}">${icon('chev')}</button></div>`;
    return app({ tab: 'loops', loopCount: D.counts.all, navbar: navbar(l.name, ''), page });
  }
  // Settings and prompt of one loop (narrow page); Edit settings is the main action.
  function settingsApp(key) {
    const l = D.loops[key];
    const edit = `<button class="btn primary${PHONE ? ' lg block' : ''}" type="button" data-testid="loop-edit">${t('loopSettings.edit')}</button>`;
    const page = (PHONE ? '' : backlink(l.name)) +
      `<div class="page-head"><h1 class="page-title">${t('loopSettings.title')}</h1>${PHONE ? '' : edit}</div>` + settings(key) +
      (PHONE ? `<div class="actionbar">${edit}</div>` : '');
    return app({ tab: 'loops', loopCount: D.counts.all, narrow: true, navbar: navbar(l.name, ''), page });
  }
  // The active period page (spec 5.4).
  function periodApp(key, k, o = {}) {
    const l = D.loops[key], e = D.executions[key].find((x) => x.k === k), id = execId(key, k);
    const stat = (label, value, sub) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
    const running = e.st === 'active' && l.run ? 1 : 0;
    const page = (PHONE ? '' : backlink(l.name, 'back-to-loop')) +
      `<div class="page-head" data-testid="exec-header" data-ended="${!!e.end}"><h1 class="page-title">${t('period.title', { k })}</h1></div>` +
      `<div class="page-meta">${periodSpan(e)} · ${periodEnd(e)}</div>` +
      `<div class="stats" data-testid="period-figures">${stat(t('period.started'), when(e.start))}${stat(t('period.ended'), e.end ? when(e.end, e.start) : '-', e.end ? '' : t('period.stillActive'))}` +
      `${stat(t('period.lasted'), dur(e.up))}${stat(t('period.runsLabel'), e.rounds, countWords(e.counts, running))}</div>` +
      `<div class="page-head"><button class="btn" type="button" data-testid="copy-all">${icon('copy')}${tn('period.copyIds', e.sessions)}</button></div>` +
      `<div class="group" data-testid="exec-runs">${periodRuns(key, e).map((r) => runCell(key, r, { session: true })).join('')}</div>` +
      `<p class="note" data-testid="exec-api">${t('exec.api', { id, n: e.sessions })}</p>`;
    return app({ tab: 'loops', loopCount: D.counts.all, navbar: navbar(l.name, 'back-to-loop'), page, overlay: o.overlay });
  }
  const notFoundApp = (title) => app({ tab: 'loops', loopCount: D.counts.all, navbar: navbar(t('nav.loops'), ''),
    page: `<div class="empty is-err" role="alert"><b>${title}</b><span>${t('missing.body')}</span><a class="btn" href="#">${t('missing.home')}</a></div>` });
  const loadingApp = () => app({ tab: 'loops', loopCount: D.counts.all, navbar: navbar(t('nav.loops'), ''),
    page: `<div class="cols" aria-busy="true"><div class="cols-main"><span class="skeleton is-line"></span><span class="skeleton is-block"></span><span class="skeleton is-block"></span></div>` +
      `<div class="cols-side"><span class="skeleton is-block"></span><span class="skeleton is-block"></span></div></div>` });

  // ── Run page and transcript ─────────────────────────────────
  // The run of a state: runs 56 to 59 of "Issue backlog worker" belong to its active period #2; skip = the start of a
  // skipped run (it has no number).
  function runOf(key, n, skip) {
    const pool = key === 'pilot' && n != null && n <= 59 ? D.runs.pilotExec2 : D.runs[key];
    const r = skip ? pool.find((x) => x.st === 'skipped' && x.start === skip) : pool.find((x) => x.n === n);
    return { r, k: pool === D.runs.pilotExec2 ? 2 : D.loops[key].exec.k };
  }
  const day = (ts) => { const date = split(ts)[0]; return `${t('day.short.' + dow(date))} ${date}`; };
  // A tool call's subject: the first string field in this order, then any string field (the classic rule, D-UI29).
  const TX_SUBJECT = ['command', 'file_path', 'pattern', 'description', 'url', 'prompt', 'query'];
  function txFields(json) {
    try { const o = JSON.parse(json); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (err) { return null; }
  }
  const firstLine = (s) => s.split('\n').find((x) => x.trim()) || '';
  const fold = (label) => `<button class="tx-fold" type="button" aria-expanded="false">${icon('chev')}${label}</button>`;
  const TX_KIND = { user: ['', 'tx.prompt'], thinking: ['k-think', 'tx.thinking'], assistant: ['k-assistant', 'tx.assistant'], tool_use: ['k-tool', 'tx.tool'], tool_result: ['', 'tx.result'], system: ['', 'tx.kind.system'] };
  // One entry per block (spec 5.5): the time and the kind, then the body; long blocks are folded. The prompt is always
  // folded (it is shown in full under Prompt used); a tool call shows its subject and folds the rest of its input; a
  // result longer than two lines shows its first line.
  function txEntry(e) {
    const [cls, key] = TX_KIND[e.kind] || TX_KIND.system;
    let body;
    if (e.kind === 'user') body = fold(`${esc(firstLine(e.text))} · ${tn('tx.lines', e.text.split('\n').length)}`);
    else if (e.kind === 'thinking') body = `<div class="tx-body is-think">${e.text.trim() ? esc(e.text) : t('tx.thinking.empty')}</div>`;
    else if (e.kind === 'tool_use') {
      const o = txFields(e.text) || {};
      const sk = TX_SUBJECT.find((x) => typeof o[x] === 'string') || Object.keys(o).find((x) => typeof o[x] === 'string');
      const rest = Object.keys(o).filter((x) => x !== sk && x !== 'description');
      const n = Object.entries(o).map(([k, v]) => `${k}:\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`).join('\n').split('\n').length;
      body = `<div class="tx-body is-code">${esc(sk ? firstLine(o[sk]) : e.text)}</div>${rest.length ? fold(t('tx.input', { n })) : ''}`;
    } else if (e.kind === 'tool_result') {
      const lines = e.text.split('\n');
      body = `<div class="tx-body is-code">${esc(lines.length > 2 ? lines[0] : e.text)}</div>${lines.length > 2 ? fold(tn('tx.more', lines.length - 1)) : ''}`;
    } else body = `<div class="tx-body">${esc(e.text)}</div>`;
    const p = e.kind === 'tool_use' ? { name: esc(e.tool) } : undefined;
    return `<div class="tx-entry${cls ? ' ' + cls : ''}${e.err ? ' is-err' : ''}" data-testid="tx-entry" data-kind="${e.kind}" data-at="${e.at}">` +
      `<div class="tx-head"><span>${e.at}</span><span class="tx-kind">${t(key, p)}</span></div>${body}</div>`;
  }
  // tx = { mode: following | paused | ended | waiting | missing | noSession, data: key of PV.transcripts, page: the last
  // page loaded (older entries left: "loading older…" at the top) }.
  function transcript(r, s, tx) {
    const help = `<button class="help" type="button" aria-label="${t('tx.help')}" aria-haspopup="dialog">${icon('help')}</button>`;
    const head = `<div class="section-head"><h2 data-testid="run-transcript-title">${t('run.transcript')}</h2>${help}</div>`;
    const note = { noSession: () => t('tx.noSession'), waiting: () => t('tx.waiting'), missing: () => t('tx.missing', { id: s }) }[tx.mode];
    if (note) return head + `<p class="note" data-testid="run-transcript-note" data-mode="${tx.mode}">${esc(note())}</p>`;
    const all = D.transcripts[tx.data], list = tx.page ? all.slice(-tx.page) : all;
    const live = tx.mode === 'following' || tx.mode === 'paused';
    const right = live ? t(tx.mode === 'paused' ? 'now.paused' : 'now.following') : t('tx.ended');
    const top = list.length < all.length ? `<div class="tx-end" data-testid="run-transcript-edge">${t('tx.loadingOlder')}</div>` : '';
    const end = live
      ? `<div class="tx-entry" data-cursor="live"><div class="tx-head"><span>${D.now}</span></div><div class="tx-body"><span class="cursor"></span></div></div>`
      : `<div class="tx-end" data-testid="run-transcript-edge">${t('tx.end', { t: addSec(r.start, r.dur) })}</div>`;
    return head + `<div class="tx" data-testid="run-transcript" data-paused="${tx.mode === 'paused'}"><div class="tx-bar"><span>${tn('tx.entries', all.length)}</span><span>${right}</span></div>` +
      `<div data-testid="run-transcript-scroll">${top}${list.map(txEntry).join('')}${end}</div></div>`;
  }

  // The run page (spec 5.5). Phone: one column in the board's order. From 1024px two columns: summary, transcript and log
  // on the left; facts, session, resume command and prompt used on the right. o: skip, tx, paused, conn, banner, overlay.
  function runApp(key, n, o = {}) {
    const l = D.loops[key], repo = D.repos[l.repo], { r, k } = runOf(key, n, o.skip);
    const running = r.st === 'running', skipped = r.st === 'skipped';
    const s = r.n != null && !r.repoGone ? sid(key, r.n) : null;
    const pill = `<span class="pill ${RUN_PILL[r.st][0]}">${t(RUN_PILL[r.st][1])}</span>`;
    const title = r.n != null ? t('run.title', { n: r.n }) : t('run.skippedTitle', { t: hm(r.start) });
    const took = `<span data-testid="run-duration">${r.dur != null ? clock(r.dur) : '-'}</span>`;
    const end = addSec(r.start, r.dur || 0);
    const whenLine = skipped ? `${day(r.start)} · ${hm(r.start)}`
      : running ? `${day(r.start)} · ${t('period.since', { t: hm(r.start) })} · ${took}`
        : t('run.when', { day: day(r.start), from: hm(r.start), to: end.slice(0, 5), d: took });
    const header = `<div class="page-head" data-testid="run-header" data-status="${r.st}"><h1 class="page-title">${title}${PHONE ? '' : pill}</h1></div>` +
      (PHONE ? `<div class="page-meta">${pill}</div>` : '') + `<div class="page-meta">${whenLine}</div>` +
      `<div class="page-meta" data-testid="run-of">${t('run.of', { loop: esc(l.name), k })}</div>`;
    // What went wrong: a banner for a run that ended badly, the hint of a missing repo, the reason of a skipped run.
    const why = {
      failed: () => t('run.err.failed', { msg: esc(r.repoGone ? 'Repo does not exist: ' + repo.path : r.err) }),
      timed_out: () => t('run.err.timed_out', { d: dur(l.timeout) }),
      cancelled: () => t('run.err.cancelled', { t: `${split(r.start)[0]} ${end}`, k }),
      interrupted: () => t('run.err.interrupted', { t: D.crashAt, r: D.restartedAt }),
    }[r.st];
    let alert = why ? `<div class="banner ${r.st === 'cancelled' ? 'is-warn' : 'is-err'}" data-testid="run-banner" role="status">${icon('alert')}<span class="banner-text">${why()}</span></div>` : '';
    if (r.repoGone) alert += `<div class="card is-pad" data-testid="run-repo-missing"><p class="page-desc">${t('run.repoMissing.hint')}</p><a class="btn" href="#" data-testid="open-repos">${t('run.repoMissing.open')}</a></div>`;
    if (skipped) alert += `<p class="page-desc" data-testid="skip-reason">${t('run.skip.reason', { reason: t('skip.reason', { n: r.reason }) })}</p>`;
    const summary = running || skipped ? '' : `<p class="group-cap">${t('run.summary')}</p>` +
      `<div class="card is-pad" data-testid="run-summary"><p class="page-desc">${r.sum ? esc(r.sum) : t('run.summary.none')}</p></div>`;
    const fact = (label, value, meta, id) => `<div class="cell"${id ? ` data-testid="${id}"` : ''}><span class="cell-main"><span class="cell-title is-plain">${label}</span>` +
      `${meta ? `<span class="cell-meta">${meta}</span>` : ''}</span><span class="cell-value">${value}</span></div>`;
    const facts = `<div class="group" data-testid="run-facts">${fact(t('run.startedBy'), t(r.trig === 'start' ? 'run.byStart' : 'run.bySchedule'))}` +
      (skipped ? '' : fact(t('run.cost'), `<span data-testid="run-cost">${r.cost != null ? usd(r.cost) : '-'}</span>`, t('run.costNote'))) +
      (s ? `<div class="cell" data-testid="run-session" data-session-id="${s}"><span class="cell-main"><span class="cell-title is-plain">${t('run.sessionLabel')}</span>` +
        `<span class="cell-meta is-one-line">${s}</span></span><button class="iconbtn bordered" type="button" aria-label="${t('run.copySession')}">${icon('copy')}</button></div>` : '') + '</div>';
    // Resume only once the run has ended: resuming a session that is still working would tangle it (D-UI12).
    const resume = s && !running ? `<p class="group-cap">${t('run.reopen')}</p><div class="cmd" data-testid="run-resume"><code data-testid="run-resume-cmd">claude --resume ${s}</code>` +
      `<button class="btn plain" type="button" data-testid="run-resume-copy">${t('run.copyCommand')}</button></div>` : '';
    const tx = transcript(r, s, o.tx || (s ? { mode: running ? 'following' : 'ended', data: key + r.n } : { mode: 'noSession' }));
    const lines = skipped ? [] : serverLines(key, r);
    const log = `<div class="section-head"><h2>${t('run.log')}</h2></div>` + (skipped ? `<p class="note">${t('log.empty')}</p>`
      : logBlock('run-log', lines, running ? { live: true, paused: o.paused, left: t('now.liveOutput'), right: t(o.paused ? 'now.paused' : 'now.following') }
        : { left: t('log.saved', { n: lines.length }), right: t(RUN_PILL[r.st][1]) }));
    // Runs of "Issue backlog worker" up to #68 started before its prompt was edited (18/10 13:41:07).
    const old = key === 'pilot' && r.n != null && r.n <= 68;
    const prompt = skipped ? '' : PHONE
      ? `<div class="group"><a class="cell" href="#" data-testid="run-prompt"><span class="cell-main"><span class="cell-title">${t('run.promptUsed')}</span><span class="cell-meta">${t('run.promptUsedSub')}</span></span>${chev}</a></div>`
      : `<p class="group-cap">${t('run.promptUsed')}</p>${old ? `<p class="note">${t('run.promptChanged', { t: l.updated })}</p>` : ''}` +
        `<pre class="code" data-testid="run-prompt">${esc(old ? l.promptOld : l.prompt)}</pre>` +
        `<p class="note" data-testid="run-executor-used">${t('run.executorUsed', { s: `${esc(repo.name)} · ${t('loop.meta.claude', l.claude)}` })}</p>`;
    const page = PHONE
      ? header + alert + summary + facts + resume + tx + log + prompt
      : backlink(l.name, 'back-to-loop') + header + alert +
        `<div class="cols"><div class="cols-main">${summary}${tx}${log}</div><div class="cols-side">${facts}${resume}${prompt}</div></div>`;
    const more = `<button class="iconbtn" type="button" aria-label="${t('act.more')}" aria-haspopup="menu">${icon('more')}</button>`;
    return app({ tab: 'loops', loopCount: D.counts.all, conn: o.conn, banner: o.banner, navbar: navbar(l.name, 'back-to-loop', more), page, overlay: o.overlay });
  }

  // ── Editor ──────────────────────────────────────────────────
  // The schedule builder's values (UI side); the cron's sentence, warnings, error and next runs come from the domain
  // (schedule.js, by cron and by key). warn = the code of the warning the domain gives (its test id).
  const KINDS = ['minutes', 'hours', 'daily', 'weekly', 'monthly', 'advanced'];
  const SCHED = {
    minutes30: { kind: 'minutes', n: 30, cron: '*/30 * * * *', key: 'minutes30' },
    minutes7: { kind: 'minutes', n: 7, cron: '*/7 * * * *', key: 'minutes7', warn: 'unevenMinuteStep' },
    hours: { kind: 'hours', n: 2, m: 5, cron: '5 */2 * * *', key: 'hours' },
    daily: { kind: 'daily', t: '02:30', cron: '30 2 * * *', key: 'daily0230' },
    weekly: { kind: 'weekly', days: [1, 3, 5], t: '08:30', cron: '30 8 * * 1,3,5', key: 'weekly' },
    monthly: { kind: 'monthly', d: 31, t: '09:00', cron: '0 9 31 * *', key: 'monthly', warn: 'missingMonthDay' },
    advanced: { kind: 'advanced', cron: '0 9-17/2 * * 1-5', key: 'advanced' },
    advancedErr: { kind: 'advanced', cron: '61 8 * * 1-5', key: 'advancedErr' },
  };
  const MODELS = ['haiku', 'sonnet', 'opus'];
  const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
  const TZ = 'Asia/Ho_Chi_Minh';
  const PROMPT_MAX = 20000;
  const num = (n) => n.toLocaleString(LANG === 'vi' ? 'vi-VN' : 'en-US');
  // A duration in words (next runs, the time limit): '12 h 29 min', '1 d 12 h'.
  function durLong(sec) {
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    if (d) return h ? t('dur.dh', { d, h }) : t('dur.d', { d });
    if (h) return m ? t('dur.hm', { h, m }) : t('dur.h', { h });
    return m ? t('dur.m', { m }) : t('dur.s', { s: sec });
  }
  // The values of a new loop: the board's sample, or the defaults of form-new.
  const sampleNew = () => ({ name: D.formSample.name, desc: '', repo: D.formSample.repo, prompt: D.formSample.prompt, exec: 'claude', model: 'opus', effort: 'medium', parallel: 1, timeout: null });
  const emptyNew = () => ({ name: '', desc: '', repo: null, prompt: '', exec: 'claude', model: 'opus', effort: 'medium', parallel: 1, timeout: null });
  const valuesOf = (key, o) => { const l = D.loops[key]; return Object.assign({ name: l.name, desc: l.desc, repo: l.repo, prompt: l.prompt, exec: 'claude', model: l.claude.model, effort: l.claude.effort, parallel: 1, timeout: l.timeout }, o); };

  // A form control with its label and hints: a row of a group (.fcell) on every width, the label above the control.
  // o.hints = [[class, text, test id]]; o.err = the error under the control (error-<id>); o.count = the count of the prompt.
  const hintsOf = (o) => (o.err ? [['is-err', o.err, 'error-' + o.id]] : o.hints || []).map(([cls, s, tid]) => `<p class="hint${cls ? ' ' + cls : ''}"${tid ? ` data-testid="${tid}"` : ''}>${s}</p>`).join('');
  function fld(id, label, control, o = {}) {
    const count = o.count ? `<span class="count">${o.count}</span>` : '';
    return `<div class="fcell"><label class="label" for="${id}">${label}</label>${control}${count}${hintsOf(Object.assign({ id }, o))}</div>`;
  }
  // A pick row (.fcell.is-row): the label at the start, the value and a chevron at the end; a hint wraps under it.
  const rowFld = (id, label, control, o = {}) => `<div class="fcell is-row"><label class="label" for="${id}">${label}</label>${control}${chev}${hintsOf(Object.assign({ id }, o))}</div>`;
  // o.time = a 24-hour HH:MM text field (the browser's time field shows 12 hours in an English browser).
  const input = (id, value, o = {}) => `<input class="input${o.err ? ' is-err' : ''}" id="${id}" data-testid="${id}" type="${o.time ? 'text' : o.type || 'text'}" value="${esc(value)}"` +
    `${o.time ? ' inputmode="numeric" maxlength="5" autocomplete="off" pattern="([01][0-9]|2[0-3]):[0-5][0-9]"' : ''}` +
    `${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.err ? ' aria-invalid="true"' : ''}${o.label ? ` aria-label="${esc(o.label)}"` : ''}${o.off ? ' disabled' : ''}>`;
  // The stepper: Fewer, the value as a number field, More.
  const stepper = (id, value, label) => `<div class="stepper"><button type="button" aria-label="${t('editor.fewer')}"${value <= 1 ? ' disabled' : ''}>-</button>` +
    `<input id="${id}" data-testid="${id}" type="number" value="${esc(value)}" aria-label="${esc(label)}"><button type="button" aria-label="${t('editor.more')}">+</button></div>`;
  // A row with a stepper: a cell of the group.
  const stepRow = (id, label, meta, value) => `<div class="cell"><span class="cell-main"><span class="cell-title is-plain">${label}</span>${meta ? `<span class="cell-meta">${meta}</span>` : ''}</span>${stepper(id, value, label)}</div>`;
  const seg = (id, label, list, on, word = (x) => x) => `<div class="seg" role="radiogroup" aria-label="${label}" data-testid="${id}" data-value="${on}">` +
    list.map((x) => `<button type="button" role="radio" aria-checked="${x === on}" data-testid="${id}-${x}"${x === on ? ' class="is-on"' : ''}>${word(x)}</button>`).join('') + '</div>';
  const segFld = (id, label, list, on, word) => `<div class="fcell"><span class="label">${label}</span>${seg(id, label, list, on, word)}</div>`;
  // Effort has five values: the segmented control from 640px, a row whose value opens the list (a sheet) on the phone.
  const effortFld = (on) => (PHONE
    ? `<div class="fcell is-row"><span class="label" id="l-f-effort">${t('editor.effort')}</span><button class="select" type="button" id="f-effort" data-testid="f-effort" data-value="${on}" aria-haspopup="dialog" aria-labelledby="l-f-effort f-effort">${on}</button>${chev}</div>`
    : segFld('f-effort', t('editor.effort'), EFFORTS, on));
  // A section: its caption (phone) or title (from 640px) and a group of rows.
  const section = (title, rows, note = '') => (PHONE ? `<p class="group-cap">${title}</p>` : `<div class="section-head"><h2>${title}</h2></div>`) + `<div class="group">${rows}</div>${note}`;

  // The repo: a cell that opens a sheet on the phone, a select-like button (a combobox) that opens a menu from 640px.
  function repoRow(v, o) {
    const r = v.repo ? D.repos[v.repo] : null;
    const value = o.noRepos ? t('editor.repoNone') : r ? esc(r.name) : t('editor.repoPlaceholder');
    const err = o.errs && o.errs.repo;
    const errHint = err ? `<p class="hint is-err" data-testid="error-f-repo">${err}</p>` : '';
    if (PHONE) {
      return `<button class="cell" type="button" data-testid="f-repo" aria-haspopup="dialog"${o.noRepos ? ' disabled' : ''}><span class="cell-main"><span class="cell-title is-plain">${t('editor.repo')}</span>` +
        `${errHint}</span><span class="cell-value">${value}</span>${chev}</button>`;
    }
    const btn = `<button class="select${err ? ' is-err' : ''}" type="button" id="f-repo" data-testid="f-repo" aria-haspopup="menu"${o.repoPick ? ' aria-expanded="true"' : ''}${err ? ' aria-invalid="true"' : ''}${o.noRepos ? ' disabled' : ''}>${value}</button>`;
    return `<div class="fcell"><label class="label" for="f-repo">${t('editor.repo')}</label><div class="combo">${btn}${o.repoPick ? repoMenu2() : ''}</div>${errHint}</div>`;
  }
  const repoOpt = (k, cls) => {
    const r = D.repos[k], gone = r.gone ? `<span class="hint is-warn">${t('editor.repoGone')}</span>` : '';
    return cls === 'cell'
      ? `<button class="cell${k === 'api' ? ' is-sel' : ''}" type="button" data-testid="repo-opt-${r.id}"${k === 'api' ? ' aria-current="true"' : ''}><span class="cell-main"><span class="cell-title is-plain" data-testid="repo-opt-name">${esc(r.name)}</span><span class="cell-meta">${esc(r.path)}</span>${gone}</span></button>`
      : `<button class="menu-item${k === 'api' ? ' is-on' : ''}" type="button" role="menuitemradio" aria-checked="${k === 'api'}" data-testid="repo-opt-${r.id}"><span class="cell-main"><span class="cell-title is-plain" data-testid="repo-opt-name">${esc(r.name)}</span><span class="cell-meta">${esc(r.path)}</span>${gone}</span></button>`;
  };
  const repoMenu2 = () => `<div class="menu" role="menu">${D.repoOrder.map((k) => repoOpt(k)).join('')}<hr>` +
    `<a class="menu-item" href="#" data-testid="repo-manage">${t('editor.repoManage')}</a></div>`;
  const repoSheet2 = () => `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${t('editor.repo')}"><span class="sheet-grab"></span><h2>${t('editor.repo')}</h2>` +
    `<div class="group">${D.repoOrder.map((k) => repoOpt(k, 'cell')).join('')}</div><a class="btn lg block plain" href="#" data-testid="repo-manage">${t('editor.repoManage')}</a></div>`;

  // The fields of the chosen kind, then the time zone.
  function schedFields(s) {
    const time = () => rowFld('sched-time', t('editor.at'), input('sched-time', s.t, { time: true }));
    let f = '';
    if (s.kind === 'minutes') f = stepRow('sched-minutes', t('editor.every'), t('editor.minutes'), s.n);
    if (s.kind === 'hours') f = stepRow('sched-hours', t('editor.every'), t('editor.hours'), s.n) + rowFld('sched-at-minute', t('editor.atMinute'), input('sched-at-minute', s.m, { type: 'number' }));
    if (s.kind === 'daily') f = time();
    if (s.kind === 'weekly') {
      const chips = [1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip${s.days.includes(d) ? ' is-on' : ''}" type="button" role="checkbox" aria-checked="${s.days.includes(d)}" data-testid="sched-day-${d}">${t('day.short.' + d)}</button>`).join('');
      f = `<div class="fcell"><span class="label">${t('editor.on')}</span><div class="chips" role="group" aria-label="${t('editor.on')}" data-testid="sched-days">${chips}</div></div>` + time();
    }
    if (s.kind === 'monthly') f = rowFld('sched-day', t('editor.dayOfMonth'), input('sched-day', s.d, { type: 'number' })) + time();
    if (s.kind === 'advanced') {
      const e = SCH.error[s.cron];
      f = fld('sched-cron', t('editor.cron'), input('sched-cron', s.cron, { err: !!e }),
        e ? { hints: [['is-err', `${t('error.INVALID_CRON')}: ${esc(e[LANG])}`, 'sched-cron-error']] } : { hints: [['', t('editor.cronHint')]] });
    }
    const kind = `<select class="select" id="sched-kind" data-testid="sched-kind">${KINDS.map((k) => `<option value="${k}"${k === s.kind ? ' selected' : ''}>${t('editor.kind.' + k)}</option>`).join('')}</select>`;
    const tz = `<select class="select" id="sched-tz" data-testid="sched-tz"><option>${TZ}</option></select>`;
    return rowFld('sched-kind', t('editor.repeat'), kind) + f + rowFld('sched-tz', t('editor.timeZone'), tz);
  }
  // The description card: the sentence, the stored cron, the warnings and the next 5 runs (or the error).
  function schedOut(s) {
    if (SCH.error[s.cron]) {
      return `<div class="card is-pad" data-testid="sched-out" data-state="error"><p class="sched-desc">-</p><p class="hint is-err">${t('error.INVALID_CRON')}</p><p class="hint">${t('sched.out.none')}</p></div>`;
    }
    const warns = ((SCH.warn[s.cron] || {})[LANG] || []).map((w) => `<p class="hint is-warn" data-testid="sched-warn-${s.warn}">${esc(w)}</p>`).join('');
    const next = (SCH.next[s.key] || []).map(([d, date, at, sec]) => `<li><span>${t('day.short.' + d)} ${date} · ${at}</span><span data-testid="sched-next-when">${t('rel.in', { d: durLong(sec) })}</span></li>`).join('');
    return `<div class="card is-pad" data-testid="sched-out" data-state="ok"><p class="sched-desc" data-testid="sched-desc">${esc(schedDesc(s.cron))}</p>` +
      `<p class="note">${t('editor.stored', { cron: s.cron, tz: TZ })}</p>${warns}<ol class="next-runs" data-testid="sched-next" aria-label="${t('editor.nextRuns')}">${next}</ol></div>`;
  }

  // The editor (spec 5.6). o: mode new | edit, key (the loop edited), v (values), s (schedule), errs, banner, saving,
  // noRepos, repoPick, mock (test mode: the executor choice and the Mock fields).
  function formApp(o) {
    const v = o.v, s = o.s, e = o.errs || {}, edit = o.mode === 'edit';
    const title = edit ? t('editor.edit', { name: esc(v.name) }) : t('editor.new');
    const r = v.repo ? D.repos[v.repo] : null;
    const details = section(t('editor.details'),
      fld('f-name', t('editor.name'), input('f-name', v.name, { err: !!e.name }), { err: e.name }) + repoRow(v, o) +
      fld('f-description', t('editor.description'), input('f-description', v.desc, { ph: t('editor.descriptionHint') })),
      r ? `<p class="group-note">${t('editor.repoNote', { path: esc(r.path) })}</p>` : o.noRepos ? `<a class="btn" href="#" data-testid="repo-go-register">${t('editor.repoRegister')}</a>` : '');
    const prompt = section(t('editor.prompt'), fld('f-prompt', t('editor.promptLabel'),
      `<textarea class="textarea${e.prompt ? ' is-err' : ''}" id="f-prompt" data-testid="f-prompt"${e.prompt ? ' aria-invalid="true"' : ''}>${esc(v.prompt)}</textarea>`,
      { err: e.prompt, count: t('editor.count', { n: num(v.prompt.length), max: num(PROMPT_MAX) }) }));
    const schedule = section(t('editor.schedule'), schedFields(s)) + schedOut(s);
    const limitHints = [['', t('editor.limitHint')]].concat(v.timeout != null && !e.timeout ? [['', durLong(v.timeout), 'hint-f-timeout']] : []);
    const limit = rowFld('f-timeout', t('editor.limit'), input('f-timeout', v.timeout == null ? '' : v.timeout, { type: 'number', ph: t('editor.noLimit'), err: !!e.timeout }), { err: e.timeout, hints: limitHints });
    const parallel = stepRow('f-max-concurrent', t('editor.parallel'), t('editor.atMost'), v.parallel);
    const agent = section(t('editor.agent'), o.mock
      ? segFld('f-executor', t('form.executor'), ['claude', 'mock'], 'mock', (x) => t('form.executor.' + x)) + parallel + limit +
        rowFld('f-duration', t('editor.mockDur'), input('f-duration', 10, { type: 'number' }), { hints: [['', t('editor.mockDurHint')]] }) +
        rowFld('f-fail', t('editor.mockFail'), input('f-fail', 0, { type: 'number' }), { hints: [['', t('editor.mockFailHint')]] })
      : segFld('f-model', t('editor.model'), MODELS, v.model) + effortFld(v.effort) + parallel + limit,
    o.mock ? `<p class="note">${t('editor.mockHint')}</p>` : '');
    const locked = o.saving || o.noRepos || !!SCH.error[s.cron];
    const label = o.saving ? t('form.saving') : t(edit ? 'editor.save' : 'editor.create');
    const submit = `<button class="btn primary${PHONE ? ' lg block' : ''}" type="submit" form="loop-form" data-testid="form-submit"${locked ? ' disabled' : ''}>${label}</button>`;
    const back = edit ? D.loops[o.key].name : t('nav.loops');
    // The phone's navigation bar holds the heading (Cancel at the start, the title centred); from 640px the page does.
    const page = (PHONE ? '' : backlink(back) + `<div class="page-head"><h1 class="page-title">${title}</h1></div>`) + (o.banner || '') +
      `<form id="loop-form" data-testid="loop-form" style="display:contents">${details}${prompt}${schedule}${agent}</form>` +
      (PHONE ? `<div class="actionbar">${submit}</div>` : `<div class="form-foot"><button class="btn ghost" type="button" data-testid="form-cancel">${t('editor.cancel')}</button>${submit}</div>`);
    const bar = `<nav class="navbar"><a class="navbar-back" href="#" data-testid="form-cancel">${t('editor.cancel')}</a><h1 class="navbar-title">${title}</h1><div class="navbar-actions"></div></nav>`;
    return app({ tab: 'loops', loopCount: D.counts.all, narrow: true, navbar: bar, page, overlay: o.repoPick && PHONE ? repoSheet2() : '' });
  }
  const formBanner = {
    errors: (n) => `<div class="banner is-err" data-testid="form-errors" role="alert">${icon('alert')}<span class="banner-text">${tn('editor.errSummary', n)}</span></div>`,
    running: () => `<div class="banner is-info" data-testid="form-edit-running" role="status">${icon('info')}<span class="banner-text">${t('editor.editRunning', { n: D.loops.pilot.run.n })}</span></div>`,
    conflict: () => `<div class="banner is-warn" data-testid="form-conflict" role="alert">${icon('alert')}<span class="banner-text">${t('editor.conflict', { t: '14:02:10' })} ` +
      `${t('editor.conflictFields', { fields: `${t('editor.prompt')}, ${t('editor.schedule')}` })}</span><button class="btn sm" type="button" data-testid="conflict-reload">${t('form.conflict.reload')}</button>` +
      `<button class="btn sm danger" type="button" data-testid="conflict-overwrite">${t('form.conflict.overwrite')}</button></div>`,
    duplicated: () => `<p class="note">${t('editor.duplicated')}</p>`,
  };
  const formErrors = () => formApp({ mode: 'new', v: Object.assign(emptyNew(), { name: D.loops.wiki.name, desc: 'Also scan the beta channel', timeout: 30 }), s: SCHED.weekly,
    errs: { name: t('error.LOOP_NAME_TAKEN'), repo: t('val.repoRequired'), prompt: t('val.required'), timeout: t('val.timeoutRangeOptional') }, banner: formBanner.errors(4) });
  const formLoading = () => app({ tab: 'loops', loopCount: D.counts.all, narrow: true, navbar: navbar(t('nav.loops'), ''),
    page: `<div class="page-head"><span class="skeleton is-line"></span></div><div class="group" data-testid="form-loading" aria-busy="true">` +
      [0, 1, 2, 3].map(() => '<div class="cell"><div class="cell-main"><span class="skeleton is-line"></span><span class="skeleton is-line"></span></div></div>').join('') + '</div><span class="skeleton is-block"></span>' });

  // ── Repos page, folder picker, settings ─────────────────────
  // A world of repos: the main one (the Windows machine of data.js) or the Mac's own console (its repos, no loops).
  const WIN = { repos: D.repos, order: D.repoOrder, loops: true }, MAC = { repos: D.folders.mac.repos, order: D.folders.mac.repoOrder, loops: false };
  const loopsOfRepo = (k) => Object.values(D.loops).filter((l) => l.repo === k);
  const reposHead = () => (PHONE
    ? `<div class="page-head"><h1 class="large-title">${t('repos.title')}</h1><button class="iconbtn" type="button" data-testid="repo-add" aria-label="${t('repos.add')}">${icon('plus')}</button></div>`
    : `<div class="page-head"><h1 class="page-title">${t('repos.title')}</h1><button class="btn primary" type="button" data-testid="repo-add">${icon('plus')}${t('repos.add')}</button></div>`);
  // A repo: name, path, "Folder is gone", the loop count and its ⋯ (Delete).
  function repoCell(set, k) {
    const r = set.repos[k], n = set.loops ? loopsOfRepo(k).length : 0;
    const gone = r.gone ? `<span class="cell-row"><span class="pill s-warn" data-testid="repo-gone">${t('status.folderGone')}</span></span>` : '';
    return `<div class="cell" data-testid="repo-row" data-repo-id="${r.id}" data-exists="${!r.gone}"><span class="cell-main"><span class="cell-title" data-testid="repo-row-name">${esc(r.name)}</span>` +
      `<span class="cell-meta is-one-line">${esc(r.path)}</span>${gone}</span><span class="cell-value" data-testid="repo-loop-count" data-n="${n}">${tn('repos.loops', n)}</span>` +
      `<button class="iconbtn" type="button" data-testid="repo-menu" aria-label="${t('act.more')}" aria-haspopup="menu">${icon('more')}</button></div>`;
  }
  // o: set (the world), loading, empty, banner.
  function reposPage(o = {}) {
    const set = o.set || WIN;
    const list = o.loading
      ? `<div class="group" data-testid="repo-loading" aria-busy="true">${[0, 1, 2, 3].map(() => '<div class="cell"><div class="cell-main"><span class="skeleton is-line"></span><span class="skeleton is-line"></span></div></div>').join('')}</div>`
      : o.empty ? `<div class="empty" data-testid="repo-empty"><b>${t('repo.empty.title')}</b></div>`
        : `<div class="group" data-testid="repo-table">${set.order.map((k) => repoCell(set, k)).join('')}</div>`;
    return reposHead() + `<p class="page-desc">${t('repos.note')}</p>` + (o.banner || '') + list;
  }
  const reposApp = (o = {}) => app({ tab: 'repos', loopCount: o.set === MAC ? 0 : D.counts.all, repoCount: (o.set || WIN).order.length, narrow: true, page: reposPage(o), overlay: o.overlay });

  // The folder picker (spec 5.7), drawn from a world of data.js PV.folders: the path field (also the registration path),
  // quick access, the breadcrumb, the filter, the show-hidden switch, the folder list, the target line, the name and Add
  // repo. A full-height sheet on the phone, a wide dialog from 640px. o: sel (the selected folder), at (the open folder),
  // typed (the path field), target ({ path, name } instead of the selection), name, pathErr, navErr (the path error
  // comes from opening a typed path, so Add keeps the open folder), nameErr, denied.
  function picker(w, o = {}) {
    const win = w.platform === 'win32', sep = win ? '\\' : '/';
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const nameOf = (p) => p.split(sep).filter(Boolean).pop() || p;
    const parentOf = (p) => { const i = p.lastIndexOf(sep); return i <= 0 ? null : p.slice(0, i); };
    const repoSet = w.repos ? Object.values(w.repos) : D.repoOrder.map((k) => D.repos[k]);
    const at = o.at || w.at;
    const segs = at.split(sep).filter(Boolean);
    const crumbs = (win ? segs : ['/'].concat(segs)).map((s, i, a) => (i === a.length - 1 ? `<b data-testid="folder-crumb">${esc(s)}</b>` : `<span data-testid="folder-crumb">${esc(s)}</span><span>›</span>`)).join('');
    const entries = o.denied ? [] : w.entries.map(([name, flag]) => {
      const path = at + sep + name, repo = repoSet.find((r) => same(r.path, path));
      return { name, path, git: flag === 'git', hidden: flag === 'hidden', repo: !!repo };
    });
    const shown = entries.filter((e) => !e.hidden);
    // Quick access: the four places, the drives or volumes, then the folders that hold registered repos.
    const known = w.known || {};
    const places = [[t('folder.place.home'), w.home], [t('folder.place.desktop'), known.desktop || w.home + sep + 'Desktop'],
      [t('folder.place.documents'), known.documents || w.home + sep + 'Documents'], [t('folder.place.downloads'), known.downloads || w.home + sep + 'Downloads']]
      .concat(win ? w.roots.map((r) => [r, r + '\\']) : w.volumes);
    for (const r of repoSet) {
      const up = parentOf(r.path);
      if (up && !places.some((p) => same(p[1], up))) places.push([esc(nameOf(up)), up]);
    }
    const placeChips = `<div class="picker-places" role="group" aria-label="${t('picker.quick')}">${places.map(([label, path]) => `<button class="chip${same(path, at) ? ' is-on' : ''}" type="button" data-testid="folder-place"${same(path, at) ? ' aria-current="true"' : ''}>${label}</button>`).join('')}</div>`;
    const sel = entries.find((e) => e.name === o.sel) || null;
    const tags = (e) => (e.git || e.repo ? `<span class="cell-row">${e.git ? `<span class="tag git">${t('picker.tagGit')}</span>` : ''}${e.repo ? `<span class="tag repo">${t('picker.tagRepo')}</span>` : ''}</span>` : '');
    const row = (e) => `<div class="cell${sel === e ? ' is-sel' : ''}" role="option" aria-selected="${sel === e}" data-testid="folder-row">${icon('folder')}` +
      `<span class="cell-main"><span class="cell-title is-plain">${esc(e.name)}</span>${tags(e)}</span>` +
      `<button class="iconbtn" type="button" data-testid="folder-open" aria-label="${t('picker.open', { name: esc(e.name) })}">${chev}</button></div>`;
    const list = o.denied
      ? `<div class="picker-list" data-testid="folder-list"><div class="banner is-warn" data-testid="folder-unreadable" role="alert">${icon('alert')}<span class="banner-text">${t('folder.denied.darwin')}</span>` +
        `<button class="btn sm" type="button" data-testid="folder-retry">${t('folder.retry')}</button></div></div>`
      : `<div class="picker-list group" role="listbox" data-testid="folder-list" aria-label="${esc(at)}">${shown.map(row).join('')}</div>`;
    const hidden = entries.length - shown.length;
    const filter = `<label class="search">${icon('search')}<input type="search" data-testid="folder-filter" placeholder="${t('picker.filter')}" aria-label="${t('picker.filter')}"></label>` +
      (hidden ? `<button class="chip" type="button" role="switch" aria-checked="false" data-testid="folder-show-hidden">${t('picker.showHidden')}</button>` : '');
    const pathErr = o.pathErr ? `<p class="hint is-err" data-testid="error-repo-path">${o.pathErr}</p>` : '';
    const path = `<div class="field" style="flex:1"><input class="input${o.pathErr ? ' is-err' : ''}" id="repo-path" data-testid="repo-path" data-platform="${w.platform}" type="text" value="${esc(o.typed || at)}" aria-label="${t('picker.path')}"${o.pathErr ? ' aria-invalid="true"' : ''}>${pathErr}</div>`;
    const bar = `<div class="picker-bar">${path}<button class="iconbtn bordered" type="button" data-testid="folder-up" aria-label="${t('picker.up')}">${icon('up')}</button>` +
      `<button class="btn" type="button" data-testid="folder-go">${t('picker.go')}</button></div>`;
    // The target: the selected folder, or the open folder when nothing is selected.
    const target = o.target || (sel ? { path: sel.path, name: sel.name } : { path: at, name: nameOf(at) });
    const name = o.name || target.name;
    const taken = (!!o.pathErr && !o.navErr) || !!o.nameErr;
    const targetLine = `<div class="picker-target" data-testid="folder-target">${icon('folder')}<span>${t('picker.target', { path: `<b>${esc(target.path)}</b>`, name: `<b>${esc(name)}</b>` })}</span></div>`;
    const nameErr = o.nameErr ? `<p class="hint is-err" data-testid="error-repo-name">${o.nameErr}</p>` : '';
    const nameField = `<div class="field"><label class="label" for="repo-name">${t('picker.name')}</label><input class="input${o.nameErr ? ' is-err' : ''}" id="repo-name" data-testid="repo-name" type="text" value="${esc(name)}"${o.nameErr ? ' aria-invalid="true"' : ''}>${nameErr}</div>`;
    const status = `<p class="picker-status">${t(PHONE ? 'picker.hintTouch' : 'picker.hintPointer')}</p>`;
    const submit = (cls) => `<button class="btn primary${cls}" type="button" data-testid="repo-submit"${taken ? ' disabled' : ''}>${t('picker.add')}</button>`;
    const crumbNav = `<nav class="crumbs" data-testid="folder-crumbs" aria-label="${t('picker.path')}">${crumbs}</nav>`;
    if (PHONE) {
      return `<div class="scrim"></div><div class="fullsheet" role="dialog" aria-modal="true" aria-label="${t('repos.add')}" data-testid="folder-picker">` +
        `<nav class="navbar"><button class="navbar-back" type="button" data-testid="folder-cancel">${t('folder.cancel')}</button><span class="navbar-title">${t('repos.add')}</span><div class="navbar-actions"></div></nav>` +
        `<div class="picker">${bar}${placeChips}${crumbNav}<div class="picker-bar">${filter}</div>${list}${status}${targetLine}${nameField}${submit(' lg block')}</div></div>`;
    }
    return `<div class="scrim"></div><div class="dialog is-wide" role="dialog" aria-modal="true" data-testid="folder-picker"><div class="dialog-head"><h2>${t('repos.add')}</h2></div>` +
      `<div class="dialog-body"><div class="picker">${bar}<div class="picker-bar">${crumbNav.replace('class="crumbs"', 'class="crumbs" style="flex:1"')}${filter}</div>${placeChips}${list}${status}${targetLine}</div>${nameField}</div>` +
      `<div class="dialog-foot"><button class="btn ghost" type="button" data-testid="folder-cancel">${t('folder.cancel')}</button>${submit('')}</div></div>`;
  }
  // Delete a repo no loop uses: a dialog from 640px, a sheet below.
  function repoDelete(k) {
    const r = D.repos[k], title = t('repos.deleteTitle', { name: esc(r.name) }), body = t('repos.deleteBody');
    if (PHONE) {
      return `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" data-testid="repo-delete-dialog"><span class="sheet-grab"></span><h2>${title}</h2><p>${body}</p>` +
        `<button class="btn lg block danger-solid" type="button" data-testid="repo-delete-confirm">${t('repo.delete.confirm')}</button><button class="btn lg block plain" type="button" data-testid="repo-delete-cancel">${t('repo.delete.cancel')}</button></div>`;
    }
    return `<div class="scrim"></div><div class="dialog" role="dialog" aria-modal="true" data-testid="repo-delete-dialog"><div class="dialog-head"><h2>${title}</h2></div><div class="dialog-body">${body}</div>` +
      `<div class="dialog-foot"><button class="btn ghost" type="button" data-testid="repo-delete-cancel">${t('repo.delete.cancel')}</button><button class="btn danger-solid" type="button" data-testid="repo-delete-confirm">${t('repo.delete.confirm')}</button></div></div>`;
  }
  // Delete refused (REPO_IN_USE): the loops that use the repo, archived ones marked.
  function repoInUse(k) {
    const list = loopsOfRepo(k).map((l) => `<b>${esc(l.archived ? t('repo.inUse.archived', { name: l.name }) : l.name)}</b>`).join(', ');
    return `<div class="banner is-err" data-testid="repo-in-use" role="alert">${icon('alert')}<span class="banner-text">${t('repos.deleteBlocked', { list })}</span></div>`;
  }
  const FW = D.folders.win, FM = D.folders.mac;

  // Settings (spec 5.8): Appearance, Connection, This device (phone only), About. Each language option reads its own
  // name from its own locale file, marked with its lang and data-raw.
  function selfName(l) {
    const s = ((window.MESSAGES || {})[l] || {})['settings.lang.self'];
    if (s == null) problems.push('missing i18n key: settings.lang.self (' + l + ')');
    return `<span lang="${l}" data-raw="">${esc(s || '')}</span>`;
  }
  function settingsPage(o = {}) {
    const fcell = (label, control) => `<div class="fcell"><span class="label">${label}</span>${control}</div>`;
    const value = (id, label, dot, text) => `<div class="cell" data-testid="${id}"><span class="cell-main"><span class="cell-title is-plain">${label}</span></span><span class="cell-value"><span class="dot ${dot}"></span>${text}</span></div>`;
    const group = (cap, rows) => `<p class="group-cap">${cap}</p><div class="group">${rows}</div>`;
    const appearance = fcell(t('settings.theme'), seg('settings-theme', t('settings.theme'), ['auto', 'light', 'dark'], 'auto', (x) => t('settings.theme.' + x))) +
      fcell(t('settings.language'), seg('settings-lang', t('settings.language'), ['en', 'vi'], LANG, selfName));
    const connection = value('settings-server', t('settings.server'), 'd-ok', t('settings.connected')) +
      (o.dbDown ? value('settings-db', t('settings.database'), 'd-fail', t('settings.notAnswering')) : value('settings-db', t('settings.database'), 'd-ok', t('settings.answering'))) +
      `<div class="cell" data-testid="settings-address"><span class="cell-main"><span class="cell-title is-plain">${t('settings.address')}</span><span class="cell-meta">${esc(D.console.address)}</span></span></div>`;
    const device = `<div class="cell"><span class="cell-main"><span class="cell-title is-plain">${t('settings.homeScreen')}</span><span class="cell-meta">${t('settings.homeScreenHow')}</span></span></div>`;
    const about = `<div class="cell" data-testid="settings-version"><span class="cell-main"><span class="cell-title is-plain">${t('settings.version')}</span></span><span class="cell-value">${esc(D.console.version)}</span></div>`;
    return `<div class="page-head"><h1 class="${PHONE ? 'large-title' : 'page-title'}">${t('settings.title')}</h1></div>` +
      group(t('settings.appearance'), appearance) + group(t('settings.connection'), connection) + (PHONE ? group(t('settings.device'), device) : '') + group(t('settings.about'), about);
  }
  const settingsTabApp = (o = {}) => app({ tab: 'settings', loopCount: D.counts.all, narrow: true, conn: o.dbDown ? 'db' : 'ok', banner: o.dbDown ? 'db' : '', page: settingsPage(o) });

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
    'loop-running': () => loopApp('pilot'),
    'loop-idle': () => loopApp('wiki'),
    'loop-last-failed': () => loopApp('crash'),
    'loop-stopped': () => loopApp('evidence'),
    'loop-server-down': () => loopApp('prs'),
    'loop-never-run': () => loopApp('recap'),
    'loop-archived': () => loopApp('oldsched'),
    'loop-stop-confirm': () => loopApp('pilot', { overlay: stopConfirm('pilot') }),
    'loop-stopping': () => loopApp('pilot', { stopping: true }),
    'loop-disconnected': () => loopApp('pilot', { paused: true, conn: 'lost', banner: 'lost' }),
    'loop-not-found': () => notFoundApp(t('error.LOOP_NOT_FOUND')),
    'loop-loading': () => loadingApp(),
    'loop-help': () => loopApp('pilot', { help: true, overlay: PHONE ? helpSheet() : '' }),
    'loop-menu': () => loopApp('pilot', { menu: true, overlay: PHONE ? loopMenu(D.loops.pilot) : '' }),
    'loop-runs': () => runsApp('pilot'),
    'loop-settings': () => settingsApp('pilot'),
    'period-running': () => periodApp('pilot', 3),
    'period-stopped': () => periodApp('evidence', 1),
    'period-server-down': () => periodApp('pilot', 2),
    'period-copied': () => periodApp('pilot', 3, { overlay: toast('', tn('period.copied', 10)) }),
    'period-not-found': () => notFoundApp(t('period.notFound')),
    'run-running': () => runApp('pilot', 69),
    'run-succeeded': () => runApp('pilot', 68),
    'run-failed': () => runApp('debt', 104, { tx: { mode: 'ended', data: 'debt104', page: 50 } }),
    'run-timed-out': () => runApp('oldsched', 4),
    'run-cancelled': () => runApp('evidence', 4),
    'run-interrupted': () => runApp('pilot', 59),
    'run-skipped': () => runApp('debt', null, { skip: '14:00:00' }),
    'run-repo-missing': () => runApp('crash', 31),
    'run-resume-copied': () => runApp('pilot', 68, { overlay: toast('', t('toast.copiedResume', { id: sid('pilot', 68) })) }),
    'run-not-found': () => notFoundApp(t('error.RUN_NOT_FOUND')),
    'run-loading': () => loadingApp(),
    'run-transcript-running': () => runApp('pilot', 69),
    'run-transcript-waiting': () => runApp('pilot', 69, { tx: { mode: 'waiting' } }),
    'run-transcript-paused': () => runApp('pilot', 69, { paused: true, conn: 'lost', banner: 'lost', tx: { mode: 'paused', data: 'pilot69' } }),
    'run-transcript-missing': () => runApp('pilot', 68, { tx: { mode: 'missing' } }),
    'run-transcript-no-session': () => runApp('debt', null, { skip: '14:00:00' }),
    'vi-run-transcript': () => runApp('pilot', 63),
    'form-new': () => formApp({ mode: 'new', v: emptyNew(), s: SCHED.minutes30 }),
    'form-sched-minutes-uneven': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.minutes7 }),
    'form-sched-hours': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.hours }),
    'form-sched-daily': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.daily }),
    'form-sched-weekly': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.weekly }),
    'form-sched-monthly-warn': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.monthly }),
    'form-sched-advanced': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.advanced }),
    'form-sched-advanced-error': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.advancedErr }),
    'form-errors': () => formErrors(),
    'form-saving': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.weekly, saving: true }),
    'form-edit-running': () => formApp({ mode: 'edit', key: 'pilot', v: valuesOf('pilot'), s: SCHED.minutes30, banner: formBanner.running() }),
    'form-conflict': () => formApp({ mode: 'edit', key: 'pilot', v: valuesOf('pilot', { effort: 'max' }), s: SCHED.minutes30, banner: formBanner.conflict() }),
    'form-duplicate': () => formApp({ mode: 'edit', key: 'pilot', v: valuesOf('pilot', { name: D.loops.pilot.name + ' (copy)' }), s: SCHED.minutes30, banner: formBanner.duplicated() }),
    'form-loading': () => formLoading(),
    'form-repo-required': () => formApp({ mode: 'new', v: Object.assign(sampleNew(), { repo: null }), s: SCHED.daily, errs: { repo: t('val.repoRequired') }, banner: formBanner.errors(1) }),
    'form-no-repos': () => formApp({ mode: 'new', v: emptyNew(), s: SCHED.minutes30, noRepos: true }),
    'form-repo-pick': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.daily, repoPick: true }),
    'form-edit-claude': () => formApp({ mode: 'edit', key: 'wiki', v: valuesOf('wiki', { model: 'haiku', effort: 'low', timeout: 600 }), s: SCHED.hours }),
    'form-exec-mock': () => formApp({ mode: 'new', v: sampleNew(), s: SCHED.daily, mock: true }),
    'repos-list': () => reposApp(),
    'repos-empty': () => reposApp({ empty: true, set: { repos: {}, order: [], loops: false } }),
    'repos-loading': () => reposApp({ loading: true }),
    'repos-add': () => reposApp({ overlay: picker(FW, { sel: 'acme-tools' }) }),
    'repos-add-notfound': () => reposApp({ overlay: picker(FW, { typed: FW.typo, pathErr: t('repo.val.notFound'), navErr: true }) }),
    'repos-add-mac': () => reposApp({ set: MAC, overlay: picker(FM, { sel: 'dotfiles' }) }),
    'repos-add-denied': () => reposApp({ set: MAC, overlay: picker(FM, { at: FM.denied, denied: true }) }),
    'repos-err-dup-path': () => reposApp({ overlay: picker(FW, { sel: 'acme-api', typed: D.repos.api.path, pathErr: t('repo.val.pathTaken', { name: esc(D.repos.api.name) }) }) }),
    'repos-err-dup-name': () => reposApp({ overlay: picker(FW, { sel: 'acme-api-hotfix', name: D.repos.api.name, nameErr: t('repo.val.nameTaken') }) }),
    'repos-err-missing': () => reposApp({ overlay: picker(FW, { typed: FW.typo, target: { path: FW.typo, name: 'acme-tool' }, pathErr: t('repo.val.notFound') }) }),
    'repos-delete-confirm': () => reposApp({ overlay: repoDelete('dotfiles') }),
    'repos-delete-blocked': () => reposApp({ banner: repoInUse('old') }),
    'settings': () => settingsTabApp(),
    'settings-db-down': () => settingsTabApp({ dbDown: true }),
  };
  R['vi-repos-list'] = R['repos-list'];
  R['vi-repos-add'] = R['repos-add'];
  R['vi-form-errors'] = R['form-errors'];
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
