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
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></symbol>
  <symbol id="i-restore" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/></symbol>
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
