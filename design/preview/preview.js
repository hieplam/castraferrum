// Design preview: draws one state of one screen from ?state=<id>&theme=light|dark[&lang=en|vi].
// Uses only the CSS classes of design/components.css (which read the variables of design/tokens.css); every UI text goes
// through t(), taken from messages.js (built from shared/i18n/en.ts + vi.ts by npm run design:shots). Sample data lives in
// data.js, the list of states in states.js. Problems (missing i18n key, unknown state) -> window.__PV.problems + a red
// banner at the top; the shot script reports them and writes no image.
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const STATE_ID = Q.get('state') || 'list-overview';
  const META = (window.PV_STATES || []).find((s) => s.id === STATE_ID);
  const THEME = Q.get('theme') === 'dark' ? 'dark' : 'light';
  const LANG = (Q.get('lang') || (META && META.lang) || 'en') === 'vi' ? 'vi' : 'en';
  document.documentElement.dataset.theme = THEME;
  document.documentElement.lang = LANG;
  const MSG = ((window.MESSAGES || {})[LANG]) || {};
  const D = window.PV;
  const problems = [];

  // ── text + formatting ───────────────────────────────────────
  function t(key, p) {
    const s = MSG[key];
    if (s == null) { problems.push('missing i18n key: ' + key); return '⟦' + key + '⟧'; }
    return p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m)) : s;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, LANG === 'vi' ? ' ' : ',');
  const nb = (s) => s.replace(/ /g, ' ');
  function dur(sec) { return nb(durRaw(sec)); }
  function durRaw(sec) {
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    if (d) return h ? t('dur.dh', { d, h }) : t('dur.d', { d });
    if (h) return m ? t('dur.hm', { h, m }) : t('dur.h', { h });
    if (m) return t('dur.m', { m });
    return t('dur.s', { s: sec });
  }
  const compact = (sec) => (sec >= 86400 ? t('dur.short.dh', { d: Math.floor(sec / 86400), h: Math.floor((sec % 86400) / 3600) })
    : sec >= 3600 ? t('dur.short.hm', { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60) }) : dur(sec));
  function clock(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  const upFmt = (sec) => (sec >= 86400 ? compact(sec) : clock(sec));
  const mmss = (sec) => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
  const runDur = (sec) => (sec >= 3600 ? clock(sec) : mmss(sec));
  const rel = (sec) => t('rel.in', { d: dur(sec) });
  function addSec(ts, add) { // "dd/mm HH:MM:SS" | "HH:MM:SS" -> the time part only
    const hms = ts.split(' ').pop().split(':').map(Number);
    const tot = hms[0] * 3600 + hms[1] * 60 + (hms[2] || 0) + add;
    return `${pad(Math.floor(tot / 3600) % 24)}:${pad(Math.floor((tot % 3600) / 60))}:${pad(tot % 60)}`;
  }
  const withDate = (ts, hms) => (ts.includes(' ') ? ts.split(' ')[0] + ' ' + hms : hms);
  function hash32(str, seed) {
    let h = 2166136261;
    for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    h ^= Math.imul(seed + 1, 0x9e3779b9); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function uuid(seed) { const x = [0, 1, 2, 3].map((i) => hash32(seed, i * 7919)).join(''); return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`; }
  const sid = (key, n) => uuid(key + '#' + n); // Claude Code session id (a uuid)
  const sidShort = (s) => `${s.slice(0, 8)}…${s.slice(-4)}`;
  const cArr = (c) => [c.ok, c.err, c.cancel, c.skip];
  const counts = (c) => `<span class="counts"><span class="c-ok">✓${c[0]}</span> <span class="c-err">✗${c[1]}</span> ⊘${c[2]} ↷${c[3]}</span>`;
  const runTag = (st, boxed = true) => `<span class="st ${boxed ? 'boxed ' : ''}${st}">${t('run.status.' + st)}</span>`;
  function execTag(st) {
    if (st === 'active') return `<span class="st active">${t('exec.stillRunning')}</span>`;
    if (st === 'server_down') return `<span class="st server_down">${t('reason.server_down')}</span>`;
    return `<span class="st stopped">${t('reason.stopped')}</span>`;
  }
  // Schedule sentences (description, warnings, cron errors, next runs) come from shared/domain/schedule.ts through
  // schedule.js — one source with the real code.
  const SCH = window.PV_SCHED || { desc: {}, warn: {}, error: {}, next: {} };
  function schedDesc(cron) {
    const d = SCH.desc[cron];
    if (!d) { problems.push('schedule.js has no sentence for cron: ' + cron); return cron; }
    return d[LANG];
  }
  const schedWarn = (cron) => ((SCH.warn[cron] || {})[LANG] || []);
  const schedErr = (cron) => ((SCH.error[cron] || {})[LANG] || null);
  const mockSummary = (m) => t('loop.meta.mock', { d: t('dur.s', { s: m.dur }), p: m.fail });
  // Claude executor (model / effort), optional timeout (null = no limit), one repo per loop.
  const execSummary = (l) => (l.claude ? t('loop.meta.claude', { model: l.claude.model, effort: l.claude.effort }) : mockSummary(l.mock));
  const timeoutText = (l) => (l.timeout == null ? t('dur.unlimited') : dur(l.timeout));
  const repoOf = (l) => D.repos[l.repo];
  const repoTag = (name) => `<span class="repo-tag">${esc(name)}</span>`;
  const usd = (c) => (c == null ? '—' : '$' + c.toFixed(2));
  const resumeCmd = (s) => `claude --resume ${s}`;

  // ── log of a Claude run: only the console's own lines — no tool calls ──
  // Log lines are data the server writes (in English, whatever the UI language), not i18n texts: the timeout in them is
  // written with the English duration words.
  const MSG_EN = (window.MESSAGES || {}).en || {};
  function logDur(sec) {
    const f = (key, p) => (MSG_EN[key] || key).replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return nb(d ? (h ? f('dur.dh', { d, h }) : f('dur.d', { d })) : h ? (m ? f('dur.hm', { h, m }) : f('dur.h', { h })) : m ? f('dur.m', { m }) : f('dur.s', { s: sec }));
  }
  const logTimeout = (l) => (l.timeout == null ? MSG_EN['dur.unlimited'] : logDur(l.timeout));
  function claudeLines(r, s, o = {}) {
    if (r.repoGone) return [[addSec(r.start, 0), `<span class="lv-err">Error · Repo does not exist: ${esc(o.path)}</span>`]];
    const L = [[addSec(r.start, 0), `<span class="lv-head">Start round #${r.n} · session ${s}</span>`]];
    const at = addSec(r.start, r.dur);
    if (r.st === 'succeeded') L.push([at, `<span class="lv-ok">End · Succeeded · ${usd(r.cost)}</span>`]);
    if (r.st === 'failed') { L.push([at, `<span class="lv-err">Error · ${esc(r.err)}</span>`]); if (r.cost != null) L.push([at, `End · Error · ${usd(r.cost)}`]); }
    if (r.st === 'timed_out') L.push([at, `<span class="lv-err">End · Timed out (timeout ${o.timeout}) · stop signal sent</span>`]);
    if (r.st === 'cancelled') L.push([at, 'End · Cancelled (Stop) · stop signal sent']);
    return L; // running: only the Start line; interrupted: the server died, no End line
  }
  function logView(lines, o) {
    const bar = `<div class="log-bar"><span>${o.left}</span><span>${o.right}</span></div>`;
    const body = lines.map(([tm, s]) => `<div><span class="t">${tm}</span>${s}</div>`).join('') +
      (o.live ? `<div><span class="t">${o.cursorAt || ''}</span><span class="cursor"></span></div>` : '');
    return `<div class="log${o.paused ? ' is-paused' : ''}">${bar}<div class="log-scroll">${body}</div></div>`;
  }

  // ── app frame ───────────────────────────────────────────────
  function topbar(o = {}) {
    const s = o.stats === undefined ? D.stats : o.stats;
    const v = (k) => `<b>${s ? s[k] : '—'}</b>`;
    const themeT = THEME === 'light' ? `<b>${t('top.theme.light')}</b> / ${t('top.theme.dark')}` : `${t('top.theme.light')} / <b>${t('top.theme.dark')}</b>`;
    const lamp = (st, key) => `<span class="lamp${st === 'down' ? ' is-down' : st === 'wait' ? ' is-wait' : ''}">${t(key)}</span>`;
    const nav = `<nav class="topnav"><a class="${o.nav === 'repos' ? '' : 'is-on'}">${t('nav.loops')}</a><a class="${o.nav === 'repos' ? 'is-on' : ''}">${t('nav.repos')}<span class="n">${o.repoCount == null ? D.repoOrder.length : o.repoCount}</span></a></nav>`;
    return `<header class="topbar"><span class="brand">${t('app.title')}</span>${nav}
      <div class="topstats${o.stale ? ' is-stale' : ''}"><span>${t('top.stats.activeLoops', { n: v('activeLoops') })}</span><span>${t('top.stats.runningRuns', { n: v('runningRuns') })}</span><span>${t('top.stats.runsToday', { n: v('runsToday') })}</span><span class="${s && s.errors24h ? 'is-err' : ''}">${t('top.stats.errors24h', { n: v('errors24h') })}</span></div>
      <span class="spacer"></span>
      <span class="toggle" data-flip="lang">${LANG === 'en' ? `<b>${t('top.lang.en')}</b> / ${t('top.lang.vi')}` : `${t('top.lang.en')} / <b>${t('top.lang.vi')}</b>`}</span><span class="toggle" data-flip="theme">${themeT}</span>
      ${lamp(o.server || 'ok', 'top.lamp.server')}${lamp(o.db || 'ok', 'top.lamp.db')}</header>`;
  }
  function shell(o) {
    return `<div class="app">${topbar(Object.assign({ nav: o.nav, repoCount: o.repoCount }, o.top))}${o.banner || ''}<div class="split${o.root ? ' at-root' : ''}"><aside class="pane-list">${o.list}</aside><main class="pane-main">${o.root ? '' : `<button class="btn ghost back-link">${t('list.back')}</button>`}${o.main}</main></div></div>${o.overlay || ''}`;
  }
  const bannerDisconnected = () => `<div class="banner is-err">${t('banner.disconnected')}<span class="spacer"></span>${t('banner.retry', { n: 3, s: 4 })} · ${t('banner.staleSince', { t: D.now })}</div>`;
  const TOP_DISCONNECTED = { server: 'down', db: 'wait', stale: true };

  // ── list pane ───────────────────────────────────────────────
  function menu(l) {
    const active = l.status === 'active';
    return `<div class="menu is-pop"><div>${t('menu.open')}</div><div class="is-hover">${t('menu.edit')}</div><div>${t('menu.duplicate')}</div><hr><div class="${active ? 'is-disabled' : ''}">${active ? t('menu.archiveBlocked') : l.archived ? t('menu.restore') : t('menu.archive')}</div></div>`;
  }
  function loopRow(l, o = {}) {
    const ex = l.exec;
    let st;
    if (o.stopping) st = `<span class="st cancelled pulse">${t('list.row.stopping', { n: l.run.n })}</span>`;
    else if (l.run) st = `<span class="st running pulse">#${l.run.n} ${clock(l.run.elapsed)}</span>`;
    else if (l.archived) st = `<span class="st archived">${t('list.row.archived')}</span>`;
    else if (l.status === 'active') st = `<span class="st active">${t('list.row.idle')}</span>`;
    else if (l.endReason === 'server_down') st = `<span class="st server_down">${t('list.row.serverDown')}</span>`;
    else st = `<span class="st stopped">${t('list.row.stopped')}</span>`;
    const meta = [esc(schedDesc(l.cron)), ex ? t('list.row.exec', { k: ex.k, d: dur(ex.up) }) : t('list.row.never')];
    if (l.status === 'active' && ex) meta.push(counts(cArr(ex.counts)));
    const right = l.last ? `<span class="st ${l.last.st}">${l.last.at}</span>${l.next ? ' → ' + l.next.at : ''}` : '—';
    const act = l.status === 'active' ? `<button class="btn danger">${t('action.stop')}</button>` : `<button class="btn"${l.archived ? ' disabled' : ''}>${t('action.start')}</button>`;
    const cls = ['row', o.sel && 'is-sel', o.hover && 'is-hover', l.archived && 'is-archived'].filter(Boolean).join(' ');
    return `<div class="${cls}"><span class="row-name has-repo"><span class="nm">${esc(l.name)}</span>${repoTag(repoOf(l).name)}</span>${st}<span class="row-meta">${meta.join(' · ')}</span><span class="row-meta row-right">${right}</span>` +
      `<div class="row-actions">${act}<span class="pop-anchor"><button class="btn icon">⋯</button>${o.menu ? menu(l) : ''}</span></div></div>`;
  }
  const rows = (o = {}) => (o.keys || D.order).map((k) => loopRow(o.loops && o.loops[k] || D.loops[k], { sel: o.sel === k, hover: o.hover === k, menu: o.menu === k, stopping: o.stopping === k })).join('');
  const skRow = (i) => `<div class="row"><span class="sk" style="width:${[62, 48, 70, 55, 40][i % 5]}%"></span><span class="sk" style="width:64px"></span><span class="sk" style="width:${[85, 72, 80, 66, 78][i % 5]}%"></span><span class="sk" style="width:84px"></span></div>`;
  function listPane(o = {}) {
    const c = o.counts || D.counts, f = o.filter || 'all';
    const tabs = ['all', 'active', 'stopped', 'archived'].map((k) => `<span class="tab${k === f ? ' is-on' : ''}">${t('list.filter.' + k)}<span class="n">${o.loading ? '–' : c[k]}</span></span>`).join('');
    let body;
    if (o.loading) body = [0, 1, 2, 3, 4].map(skRow).join('');
    else if (o.error) body = `<div class="empty sm is-err"><div class="glyph">✗</div><h3>${t('list.error.title')}</h3><div class="mono faint">GET /api/loops → HTTP 500</div><button class="btn">${t('list.error.retry')}</button></div>`;
    else if (o.empty) body = `<div class="empty sm"><div class="faint">${t('list.empty')}</div></div>`;
    else if (o.noMatch) body = `<div class="empty sm"><div class="glyph">∅</div><h3>${t('list.noMatch.title', { q: esc(o.q) })}</h3><div>${t('list.noMatch.hint')}</div><button class="btn">${t('list.noMatch.clear')}</button></div>`;
    else body = o.rowsHtml || rows(o);
    // Filter by repo (UC-25): a compact select on the same row as the status tabs; while filtering it takes the accent colour.
    const rf = o.repo ? D.repos[o.repo].name : t('list.filter.repoAll');
    const repoSel = `<span class="select sm is-fake${o.repo ? ' is-set' : ''}${o.loading || o.empty ? ' is-disabled' : ''}"><span class="label">${t('list.filter.repo')}</span>${esc(rf)}<span class="caret">▾</span></span>`;
    return `<div class="toolbar"><input class="input mono" placeholder="${t('list.search')}" value="${esc(o.q || '')}"${o.loading || o.empty ? ' disabled' : ''}><button class="btn primary">${t('list.create')}</button></div>` +
      `<div class="toolbar"><div class="tabs">${tabs}</div><span class="spacer"></span>${repoSel}</div>${body}`;
  }

  // ── main pane at "/" ────────────────────────────────────────
  const guide = () => `<ol class="guide">${[1, 2, 3].map((i) => `<li><b><span class="n">0${i}</span> · ${t(`home.step${i}.title`)}</b>${t(i === 1 ? 'home.step1.bodyRepo' : `home.step${i}.body`)}</li>`).join('')}</ol>`;
  const home = () => `<div class="crumbs">${t('crumb.loops')}</div><div class="ph"><h1>${t('home.title')}</h1></div><div class="ph-sub">${t('home.lead')}</div>${guide()}<div><button class="btn primary lg">${t('list.create')}</button></div>`;
  const emptyFirst = () => `<div class="empty"><div class="glyph">▍_</div><h3>${t('empty.first.title')}</h3><div>${t('empty.first.bodyRepo')}</div><button class="btn primary lg">${t('empty.first.cta')}</button></div>${guide()}`;

  // ── loop detail ─────────────────────────────────────────────
  const section = (title, extra) => `<div class="section-title"><h2>${title}</h2>${extra ? `<span class="crumbs">${extra}</span>` : ''}</div>`;
  const crumbs = (parts) => `<div class="crumbs">${parts.map((p, i) => (i < parts.length - 1 ? `<a href="#">${p}</a>` : p)).join(' / ')}</div>`;
  const kvCell = (label, v, sub, big = true) => `<div><div class="label">${label}</div><div class="v${big ? ' big' : ''}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  // Every Run history / Runs in this execution table has a ↳ sub-row right under each run row = the first non-empty line
  // of runs.summary, cut at SUM_MAX characters (counted in code points, like left() in Postgres); when more lines follow or
  // the line is longer than the limit, "…" is added. Hovering (title) shows the whole text. No summary (running, failed,
  // cancelled, timed out, interrupted, skipped because of overlap) → a dash. The console does not interpret the text —
  // "Skipped this run: …" is written by the agent itself and the run is still Succeeded.
  const SUM_MAX = 80;
  function sumLine(sum) {
    const lines = String(sum || '').split(/\r?\n/);
    const i = lines.findIndex((x) => x.trim());
    if (i < 0) return null;
    const cps = Array.from(lines[i].trim());
    const more = cps.length > SUM_MAX || lines.slice(i + 1).some((x) => x.trim());
    return cps.slice(0, SUM_MAX).join('') + (more ? '…' : '');
  }
  // A sub-row right under the run row (not a column: the run table of the execution screen is already full because of the
  // full session ids — UC-08).
  const sumRow = (r) => {
    const line = sumLine(r.sum);
    const cell = line ? `<td colspan="6" title="${esc(r.sum)}">${esc(line)}</td>` : '<td colspan="6"><span class="faint">—</span></td>';
    return `<tr class="sum-row"><td class="faint">↳</td>${cell}</tr>`;
  };
  function runsTable(key, list, o = {}) {
    const head = `<tr><th>${t('th.round')}</th><th>${t('th.status')}</th><th>${t('th.trigger')}</th><th>${t('th.started')}</th><th>${t('th.duration')}</th><th>${t('th.cost')}</th><th>${t('th.session')}</th></tr>`;
    const tr = o.sum ? '<tr class="has-sum">' : '<tr>';
    const body = list.map((r) => {
      const sub = o.sum ? sumRow(r) : '';
      if (r.st === 'skipped') return `${tr}<td>—</td><td>${runTag('skipped')}</td><td>${t('trigger.' + r.trig)}</td><td>${r.start}</td><td>—</td><td>—</td><td class="faint skip-reason">${t('skip.reason', { n: r.reason })}</td></tr>${sub}`;
      const s = sid(key, r.n);
      const d = r.st === 'running' ? `<span class="st running">${clock(r.dur)}</span>` : runDur(r.dur);
      const sCell = r.repoGone ? `<span class="faint">—</span>` : o.full ? `${s}<span class="copy">${t('action.copy')}</span>` : sidShort(s);
      return `${tr}<td>#${r.n}</td><td>${runTag(r.st)}</td><td>${t('trigger.' + r.trig)}</td><td>${r.start}</td><td>${d}</td><td>${usd(r.cost)}</td><td>${sCell}</td></tr>${sub}`;
    }).join('');
    return `<table class="table">${head}${body}</table>`;
  }
  const pager = (shown, total) => `<div class="pager">${t('pager.range', { a: 1, b: shown, n: num(total) })} <button class="btn icon" disabled>‹</button><button class="btn icon"${shown >= total ? ' disabled' : ''}>›</button></div>`;
  function execTable(list) {
    const head = `<tr><th>${t('th.exec')}</th><th>${t('th.endReason')}</th><th>${t('th.started')}</th><th>${t('th.ended')}</th><th>${t('th.uptime')}</th><th>${t('th.rounds')}</th><th>${t('th.sessions')}</th></tr>`;
    return `<table class="table">${head}${list.map((e) => `<tr><td>#${e.k}</td><td>${execTag(e.st)}</td><td>${e.start}</td><td>${e.end || '—'}</td><td>${upFmt(e.up)}</td><td>${e.rounds} ${counts(e.counts)}</td><td><span class="copy">${t('exec.sessionLink', { n: e.sessions })}</span></td></tr>`).join('')}</table>`;
  }
  function configBlock(l) {
    const rp = repoOf(l);
    const tSub = l.timeout == null ? t('config.timeoutNone') : `${num(l.timeout)} ${t('form.unit.sec')}`;
    return section(t('section.config')) +
      `<div class="kv" style="--kv-cols:3">${kvCell(t('config.repo'), repoTag(rp.name), `<span class="mono">${esc(rp.path)}</span>${rp.gone ? ` · <span class="hint is-warn">${t('repo.gone')}</span>` : ''}`, false)}${kvCell(t('config.executor'), execSummary(l), '', false)}${kvCell(t('config.timeout'), timeoutText(l), tSub, false)}` +
      `${kvCell(t('config.schedule'), esc(schedDesc(l.cron)), `${t('config.cron')} <span class="mono">${l.cron}</span>`, false)}${kvCell(t('config.tz'), l.tz, '', false)}${kvCell(t('config.created'), l.created, `${t('config.updated')} ${l.updated}`, false)}</div>` +
      `<div class="label">${t('config.prompt')}</div><div class="code">${esc(l.prompt)}</div>`;
  }
  function loopHeader(l, o) {
    const edit = `<button class="btn">${t('action.edit')}</button><button class="btn icon">⋯</button>`;
    let st, btns;
    if (o.stopping) { st = `<span class="st cancelled pulse">${t('loop.stoppingNow', { n: l.run.n })}</span>`; btns = edit + `<button class="btn danger" disabled>${t('action.stopping')}</button>`; }
    else if (l.run) { st = `<span class="st running pulse">${t('loop.runningNow', { n: l.run.n, t: clock(l.run.elapsed) })}</span>`; btns = edit + `<button class="btn danger">${t('action.stop')}</button>`; }
    else if (l.archived) { st = `<span class="st archived">${t('loop.status.archived')}</span>`; btns = `<button class="btn icon">⋯</button><button class="btn" disabled>${t('action.start')}</button><button class="btn primary">${t('action.restore')}</button>`; }
    else if (l.status === 'active') { st = `<span class="st active">${t('loop.idleNext', { at: l.next.at })}</span>`; btns = edit + `<button class="btn danger">${t('action.stop')}</button>`; }
    else if (l.endReason === 'server_down') { st = `<span class="st server_down">${t('loop.status.server_down')}</span>`; btns = edit + `<button class="btn primary">${t('action.start')}</button>`; }
    else { st = `<span class="st stopped">${t('loop.status.stopped')}</span>`; btns = edit + `<button class="btn primary">${t('action.start')}</button>`; }
    if (o.paused) btns = btns.replace(/<button class=/g, '<button disabled class=');
    const meta = [l.desc ? esc(l.desc) : '', `<span class="mono">${[repoTag(repoOf(l).name), esc(schedDesc(l.cron)), l.tz, t('loop.meta.timeout', { d: timeoutText(l) }), execSummary(l)].join(' · ')}</span>`].filter(Boolean).join(' · ');
    return crumbs([t('crumb.loops'), esc(l.name)]) + `<div class="ph"><h1>${esc(l.name)}</h1>${st}<span class="spacer"></span>${btns}</div><div class="ph-sub">${meta}</div>`;
  }
  function loopKv(l) {
    const ex = l.exec;
    if (!ex) return `<div class="kv" style="--kv-cols:5">${kvCell(t('kv.exec'), t('kv.none'), '')}${kvCell(t('kv.rounds'), t('kv.none'), '')}${kvCell(t('kv.next'), t('kv.none'), t('kv.nextNone'))}${kvCell(t('kv.avg'), t('kv.none'), '')}${kvCell(t('kv.longest'), t('kv.none'), '')}</div>`;
    const running = !ex.endedAt;
    return `<div class="kv" style="--kv-cols:5">` +
      kvCell(t(running ? 'kv.execRunning' : 'kv.execEnded', { k: ex.k }), upFmt(ex.up), running ? t('kv.since', { t: ex.since }) : t('kv.until', { a: ex.startedAt, b: ex.endedAt })) +
      kvCell(t('kv.rounds'), ex.rounds, counts(cArr(ex.counts))) +
      kvCell(t('kv.next'), l.next ? l.next.at : t('kv.none'), l.next ? rel(l.next.inSec) : t('kv.nextNone')) +
      kvCell(t('kv.avg'), mmss(l.avg), t('kv.avgSub', { n: l.finished })) +
      kvCell(t('kv.longest'), compact(l.longest.sec), t('kv.longestSub', { k: l.longest.k, e: l.execCount, r: l.lifetime })) + '</div>';
  }
  function liveRunBlock(key, l, o = {}) {
    const s = sid(key, l.run.n);
    const lines = claudeLines({ n: l.run.n, st: 'running', start: l.run.started, dur: l.run.elapsed }, s);
    return section(t('section.liveRun'), `${t('log.round', { n: l.run.n })} · ${s}`) +
      logView(lines, { left: t('log.live'), right: o.paused ? t('log.paused') : t('log.following'), live: true, paused: o.paused, cursorAt: addSec(l.run.started, l.run.elapsed) });
  }
  // Resume the session: a command to copy + the folder it runs in (the run screen has a button that copies this command)
  const resumeBlock = (s, rp) => `<div class="cmd"><span class="label">${t('run.resume')}</span><code>${resumeCmd(s)}</code><button class="btn">${t('run.resume.copy')}</button></div>` +
    `<div class="hint">${t('run.resume.hint', { path: `<span class="mono">${esc(rp.path)}</span>` })}</div>`;
  function loopDetail(key, o = {}) {
    const l = D.loops[key];
    let h = loopHeader(l, o);
    if (o.stopping) h += `<div class="banner inset is-warn"><span class="txt">${t('stopping.hint', { n: l.run.n, k: l.exec.k })}</span></div>`;
    if (l.archived) h += `<div class="note"><span class="glyph">▤</span><span class="txt">${t('archived.banner')}</span></div>`;
    if (!l.archived && l.endReason === 'server_down') h += `<div class="banner inset is-err"><span class="txt">■ ${t('serverDown.banner', { k: l.exec.k, t: l.exec.endedAt })}</span></div>`;
    h += loopKv(l);
    if (!l.exec) {
      h += `<div class="note"><span class="glyph">▶</span><span class="txt">${t('neverRun.body')}</span></div>`;
    } else if (l.run) {
      h += liveRunBlock(key, l, o);
    } else if (l.status === 'active') {
      h += section(t('section.liveRun')) + `<div class="note"><span class="glyph">◷</span><span class="txt">${t('idle.noRun', { at: l.next.at, rel: rel(l.next.inSec) })}</span></div>`;
    }
    if (l.last && (!l.run || l.last.st === 'failed')) {
      const r = D.runs[key].find((x) => x.n === l.last.n);
      h += section(t('section.lastRun')) + runsTable(key, [r], { full: true });
      if (r.st === 'failed') {
        h += `<div class="banner inset is-err"><span class="txt">✗ ${t('run.err.failed', { msg: esc(l.last.err) })} — ${t('lastRun.failedNote')}</span><span class="copy">${t('lastRun.open')}</span></div>`;
        if (r.repoGone) h += `<div class="hint">${t('run.repoMissing.hint')} <span class="copy">${t('run.repoMissing.open')}</span></div>`;
      } else {
        const lines = claudeLines(r, sid(key, r.n), { timeout: logTimeout(l) });
        h += logView(lines, { left: `${t('log.round', { n: r.n })} · ${t('log.saved', { n: lines.length })}`, right: runTag(r.st, false) });
      }
    }
    if (l.exec) {
      const ex = D.executions[key];
      h += section(t('section.executions')) + execTable(ex);
      const list = D.runs[key];
      h += section(t('section.runs'), t('runs.sumHint')) + runsTable(key, list, { sum: true }) + pager(list.length, l.runsTotal);
    }
    h += configBlock(l);
    return h;
  }
  function detailSkeleton() {
    return `<div class="crumbs"><span class="sk" style="width:180px"></span></div><div class="ph"><span class="sk lg" style="width:260px"></span><span class="spacer"></span><span class="sk lg" style="width:160px"></span></div><span class="sk" style="width:60%"></span>` +
      `<div class="kv" style="--kv-cols:5">${[0, 1, 2, 3, 4].map(() => `<div><span class="sk" style="width:70%"></span><div class="v big"><span class="sk lg" style="width:80px"></span></div><span class="sk" style="width:50%"></span></div>`).join('')}</div>` +
      `<span class="sk block"></span><div style="border:var(--border-w) solid var(--border)">${[0, 1, 2, 3].map(skRow).join('')}</div>`;
  }
  const notFound = (code, body, id) => crumbs([t('crumb.loops'), '?']) + `<div class="empty is-err"><div class="glyph">∅</div><h3>${t('error.' + code)}</h3><div>${t(body, { id: `<span class="mono">${id}</span>` })}</div><button class="btn">${t('list.back')}</button></div>`;

  // ── execution detail ────────────────────────────────────────
  function execDetail(key, k, o = {}) {
    const l = D.loops[key], e = D.executions[key].find((x) => x.k === k);
    const list = key === 'pilot' && k === 2 ? D.runs.pilotExec2 : D.runs[key];
    const id = e.k === (l.exec && l.exec.k) && l.exec.id ? l.exec.id : uuid(key + 'exec' + k);
    const big = e.st === 'active' ? `<span class="st active">${t('loop.status.active')}</span>` : execTag(e.st);
    let h = crumbs([t('crumb.loops'), esc(l.name), t('exec.title', { k })]) +
      `<div class="ph"><h1>${t('exec.title', { k })}</h1>${big}<span class="spacer"></span><button class="btn primary">${t('exec.copyAll', { n: e.sessions })}</button><button class="btn">${t('action.backToLoop')}</button></div>` +
      `<div class="ph-sub">${esc(l.name)} · <span class="mono">${repoTag(repoOf(l).name)} · ${esc(schedDesc(l.cron))} · ${l.tz}</span></div>`;
    if (e.st === 'server_down') h += `<div class="banner inset is-err"><span class="txt">■ ${t('serverDown.banner', { k, t: e.end })}</span></div>`;
    const endSub = e.st === 'server_down' ? t('exec.heartbeat') : e.st === 'stopped' ? t('exec.byUser') : t('exec.stillRunning');
    h += `<div class="kv" style="--kv-cols:5">${kvCell(t('exec.startedAt'), e.start, '', false)}${kvCell(t('exec.endedAt'), e.end || t('kv.none'), endSub, false)}${kvCell(t('exec.uptime'), upFmt(e.up), '', true)}${kvCell(t('exec.endReason'), e.st === 'active' ? t('kv.none') : execTag(e.st), '', false)}${kvCell(t('exec.rounds'), e.rounds, counts(e.counts), true)}</div>`;
    h += section(t('section.execRuns'), t('exec.sessionCount', { n: e.sessions }) + ' · ' + t('runs.sumHint')) + runsTable(key, list, { full: true, sum: true });
    h += `<div class="hint mono">${t('exec.api', { id, n: e.sessions })}</div>`;
    return h;
  }

  // ── Transcript panel of the run screen — the LogView shell, one row per entry [time | glyph + label | verbatim text].
  // Rules D-UI27…D-UI33 at the end of design/STATES.md. Content = the transcripts of data.js (PV.transcripts), nothing is
  // cut: long tool input / results (more than TX_FOLD_LINES lines or TX_FOLD_CHARS characters) are folded with <details>;
  // the Prompt entry is always folded (it is shown in full under "Prompt used"); thinking is always open. Transcript text
  // is data (not i18n).
  const TX_FOLD_LINES = 30, TX_FOLD_CHARS = 3000;
  const TX_GLYPH = { user: '›', assistant: '●', thinking: '∴', tool_use: '▸', tool_result: '◂', system: '·' };
  const TX_SUBJECT = ['command', 'file_path', 'pattern', 'description', 'url', 'prompt', 'query'];
  function txSize(s) {
    const b = new TextEncoder().encode(s).length;
    return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1).replace('.', LANG === 'vi' ? ',' : '.')} KB`;
  }
  // text = plain text for the fold rule + the summary line; html = how to draw it (empty: the escaped text)
  function txFold(text, always, html) {
    const lines = text.split('\n');
    const body = html == null ? esc(text) : html;
    const fold = always ? lines.length > 1 : lines.length > TX_FOLD_LINES || text.length > TX_FOLD_CHARS;
    if (!fold) return `<div class="tx-pre">${body}</div>`;
    const first = lines.find((x) => x.trim()) || '';
    return `<details class="tx-fold"><summary><span class="tx-first">${esc(first)}</span><span class="tx-meta">${t('tx.fold', { n: num(lines.length), size: txSize(text) })}</span></summary><div class="tx-pre">${body}</div></details>`;
  }
  // D-UI29: the input of a tool call is drawn field by field (top level) — a "field_name:" line, then the value; strings
  // keep their REAL line breaks (no escaped JSON), other values are pretty-printed JSON. The fold rule applies to the whole
  // block once drawn.
  function txInput(json) {
    let o; try { o = JSON.parse(json); } catch { return txFold(json); }
    if (!o || typeof o !== 'object' || Array.isArray(o) || !Object.keys(o).length) return txFold(json);
    const parts = Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v, null, 2)]);
    const text = parts.map(([k, v]) => `${k}:\n${v}`).join('\n');
    const html = parts.map(([k, v]) => `<div class="tx-field"><span class="tx-fk">${esc(k)}:</span>\n${esc(v)}</div>`).join('');
    return txFold(text, false, html);
  }
  function txSubject(json) { // subject line of a tool call: the first string field in priority order, then any string field
    let o; try { o = JSON.parse(json); } catch { return ''; }
    const k = TX_SUBJECT.find((x) => typeof o[x] === 'string');
    const v = k ? o[k] : Object.values(o).find((x) => typeof x === 'string');
    return v ? (v.split('\n').find((x) => x.trim()) || '') : '';
  }
  function txRow(e) {
    let label = t('tx.kind.' + e.kind), cls = '', body;
    if (e.kind === 'user') body = txFold(e.text, true);
    else if (e.kind === 'assistant') { cls = 'is-prose'; body = esc(e.text); }
    else if (e.kind === 'thinking') { cls = 'is-think'; body = e.text.trim() ? esc(e.text) : t('tx.thinking.empty'); }
    else if (e.kind === 'tool_use') { label = t('tx.kind.tool_use', { name: esc(e.tool) }); body = `<span class="tx-subj">${esc(txSubject(e.text))}</span><div class="tx-input">${txInput(e.text)}</div>`; }
    else if (e.kind === 'tool_result') { if (e.err) label = t('tx.kind.tool_error'); body = txFold(e.text); }
    else { cls = 'is-sys'; body = esc(e.text); }
    return `<div class="tx-row k-${e.kind}${e.err ? ' is-err' : ''}"><span class="t">${e.at || '—'}</span><span class="tx-k"><span class="g">${TX_GLYPH[e.kind]}</span>${label}</span><div class="tx-b ${cls}">${body}</div></div>`;
  }
  // tx = { mode: following | paused | ended | waiting | missing | noSession, data: key of PV.transcripts, page: entries
  // loaded (the last page; older entries left → "loading older…" at the top, otherwise "— start of transcript —"),
  // top: the panel is scrolled to the top }
  function transcriptView(r, s, tx) {
    const head = section(t('section.transcript'), tx.mode === 'noSession' ? '' : t('tx.hint'));
    const note = (g, txt) => head + `<div class="note"><span class="glyph">${g}</span><span class="txt">${txt}</span></div>`;
    if (tx.mode === 'noSession') return note('↷', t('tx.noSession'));
    if (tx.mode === 'waiting') return note('◌', t('tx.waiting'));
    if (tx.mode === 'missing') return note('∅', t('tx.missing', { id: `<span class="mono">${s}</span>` }));
    const all = D.transcripts[tx.data];
    const list = tx.page ? all.slice(-tx.page) : all;
    const live = tx.mode === 'following' || tx.mode === 'paused';
    const bar = live ? [t('tx.live', { id: s }), t(tx.mode === 'paused' ? 'log.paused' : 'log.following')] : [t('tx.saved', { n: list.length }), runTag(r.st, false)];
    const edge = `<div class="tx-edge">${list.length < all.length ? t('tx.loadingOlder') : t('tx.start')}</div>`;
    const cur = live ? '<div class="tx-row"><span class="t"></span><span class="tx-k"></span><div class="tx-b"><span class="cursor"></span></div></div>' : '';
    return head + `<div class="log tx${tx.mode === 'paused' ? ' is-paused' : ''}"><div class="log-bar"><span>${bar[0]}</span><span>${bar[1]}</span></div>` +
      `<div class="log-scroll"${tx.top ? ' data-top' : ''}>${edge}${list.map(txRow).join('')}${cur}</div></div>`;
  }

  // ── run detail ──────────────────────────────────────────────
  function runDetail(key, n, o = {}) {
    const l = D.loops[key];
    const pool = key === 'pilot' && n >= 56 && n <= 59 ? D.runs.pilotExec2 : D.runs[key];
    const r = o.skipStart ? pool.find((x) => x.st === 'skipped' && x.start === o.skipStart) : pool.find((x) => x.n === n);
    const k = key === 'pilot' && n >= 56 && n <= 59 ? 2 : l.exec.k;
    const endTs = r.st === 'running' || r.st === 'skipped' ? null : withDate(r.start, addSec(r.start, r.dur));
    const title = r.n ? t('run.title', { n: r.n }) : t('run.skippedTitle', { t: r.start });
    let h = crumbs([t('crumb.loops'), esc(l.name), t('exec.title', { k }), r.n ? t('run.title', { n: r.n }) : t('run.status.skipped')]) +
      `<div class="ph"><h1>${title}</h1>${runTag(r.st)}<span class="spacer"></span><button class="btn">← ${t('exec.title', { k })}</button><button class="btn">${t('action.backToLoop')}</button></div>` +
      `<div class="ph-sub">${esc(l.name)} · <span class="mono">${repoTag(repoOf(l).name)} · ${esc(schedDesc(l.cron))}</span></div>`;
    const rp = repoOf(l);
    const banners = {
      failed: ['is-err', '✗ ' + t('run.err.failed', { msg: esc(r.repoGone ? 'Repo does not exist: ' + rp.path : r.err || '') })],
      timed_out: ['is-err', '◷ ' + t('run.err.timed_out', { d: timeoutText(l) })],
      cancelled: ['is-warn', '⊘ ' + t('run.err.cancelled', { t: endTs, k })],
      interrupted: ['is-err', '↯ ' + t('run.err.interrupted', { t: D.crashAt, r: D.restartedAt })],
    };
    if (banners[r.st]) h += `<div class="banner inset ${banners[r.st][0]}"><span class="txt">${banners[r.st][1]}</span></div>`;
    if (r.repoGone) h += `<div class="note"><span class="glyph">▣</span><span class="txt">${t('run.repoMissing.hint')}</span><button class="btn">${t('run.repoMissing.open')}</button></div>`;
    if (r.st === 'skipped') h += `<div class="note"><span class="glyph">↷</span><span class="txt">${t('run.skip.reason', { reason: t('skip.reason', { n: r.reason }) })}</span></div>`;
    const durV = r.st === 'skipped' ? t('kv.none') : r.st === 'running' ? clock(r.dur) : runDur(r.dur);
    const durSub = r.st === 'running' ? `<span class="st running pulse">${t('run.status.running')}</span>` : '';
    const costV = r.st === 'skipped' || r.st === 'running' ? t('kv.none') : usd(r.cost);
    h += `<div class="kv" style="--kv-cols:6">${kvCell(t('run.trigger'), t('trigger.' + r.trig), '', false)}${kvCell(t('run.scheduledAt'), r.trig === 'start' ? t('kv.none') : r.start, '', false)}` +
      `${kvCell(t('run.startedAt'), r.st === 'skipped' ? t('kv.none') : r.start, '', false)}${kvCell(t('run.endedAt'), r.st === 'skipped' ? r.start : endTs || t('kv.none'), r.st === 'interrupted' ? t('exec.heartbeat') : '', false)}${kvCell(t('run.duration'), durV, durSub, true)}` +
      `${kvCell(t('run.cost'), costV, r.cost != null ? t('run.costSub') : '', true)}</div>`;
    const s = r.n && !r.repoGone ? sid(key, r.n) : null;
    const noSess = r.repoGone ? t('run.noSessionFailed') : t('run.noSession');
    h += `<div class="sid"><span class="label">${t('run.session')}</span>${s ? `${s}<span class="copy">${t('action.copy')}</span>` : `<span class="faint">${noSess}</span>`}</div>`;
    // Resume only once the run has ended (resuming a run in progress in parallel would tangle the session — D-UI12)
    if (s && r.st !== 'running') h += resumeBlock(s, rp);
    if (r.st !== 'running' && r.st !== 'skipped') {
      h += section(t('section.summary'), r.sum ? t('run.summary.hint') : '');
      h += r.sum ? `<div class="code prose">${esc(r.sum)}</div>` : `<div class="note"><span class="glyph">—</span><span class="txt">${t('run.summary.none')}</span></div>`;
    }
    if (o.tx) h += transcriptView(r, s, o.tx); // Transcript above Log, after Summary (run ended) / after the session id (running)
    h += section(t('section.log'));
    if (r.st === 'skipped') { h += `<div class="note"><span class="glyph">↷</span><span class="txt">${t('log.empty')}</span></div>`; return h; }
    const prompt = o.oldPrompt ? l.promptOld : l.prompt;
    const lines = claudeLines(r, s, { path: rp.path, timeout: logTimeout(l) });
    const live = r.st === 'running';
    h += logView(lines, { left: live ? `${t('log.live')} · ${s}` : t('log.saved', { n: lines.length }), right: live ? t(o.paused ? 'log.paused' : 'log.following') : runTag(r.st, false), live, paused: o.paused, cursorAt: live ? addSec(r.start, r.dur) : '' });
    if (s && r.st !== 'running') h += `<div class="hint">${t(o.tx && o.tx.data ? 'run.log.consoleOnlyTx' : 'run.log.consoleOnly')}</div>`;
    h += section(t('section.promptUsed'));
    if (o.oldPrompt) h += `<div class="hint is-warn">${t('run.promptChanged', { t: l.updated })}</div>`;
    h += `<div class="code">${esc(prompt)}</div><div class="hint mono">${t('run.executorUsed', { s: `${repoTag(rp.name)} ${esc(rp.path)} · ${execSummary(l)} · ${t('loop.meta.timeout', { d: timeoutText(l) })}` })}</div>`;
    return h;
  }

  // ── create / edit form ──────────────────────────────────────
  const KINDS = ['minutes', 'hours', 'daily', 'weekly', 'monthly', 'advanced'];
  // Values of the schedule builder fields (UI side); cron + sentence + next runs come from the domain (schedule.js, key = key).
  const SCHED = {
    minutes30: { kind: 'minutes', n: 30, cron: '*/30 * * * *', key: 'minutes30' },
    minutes7: { kind: 'minutes', n: 7, cron: '*/7 * * * *', key: 'minutes7' },
    hours: { kind: 'hours', n: 2, m: 5, cron: '5 */2 * * *', key: 'hours' },
    daily: { kind: 'daily', t: '08:30', cron: '30 8 * * *', key: 'daily' },
    weekly: { kind: 'weekly', days: [1, 3, 5], t: '08:30', cron: '30 8 * * 1,3,5', key: 'weekly' },
    monthly: { kind: 'monthly', d: 31, t: '09:00', cron: '0 9 31 * *', key: 'monthly' },
    advanced: { kind: 'advanced', cron: '0 9-17/2 * * 1-5', key: 'advanced', auto: true },
    advancedErr: { kind: 'advanced', cron: '61 8 * * 1-5', key: 'advancedErr' },
  };
  const field = (label, control, hint, cls = '') => `<div class="field ${cls}"><span class="label">${label}</span>${control}${hint || ''}</div>`;
  const hintE = (s) => `<span class="hint is-error">${s}</span>`;
  const hintN = (s) => `<span class="hint">${s}</span>`;
  const input = (v, o = {}) => `<input class="input${o.mono ? ' mono' : ''}${o.err ? ' is-error' : ''}${o.focus ? ' is-focus' : ''}" value="${esc(v)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.dis ? ' disabled' : ''}>`;
  const affix = (v, unit, o = {}) => `<div class="affix">${input(v, { mono: true, ...o })}<span>${unit}</span></div>`;
  function schedFields(s, errs) {
    const tz = field(t('sched.field.tz'), `<select class="select"><option>Asia/Ho_Chi_Minh (UTC+07:00)</option></select>`);
    let f = '';
    if (s.kind === 'minutes') f = field(t('sched.field.everyMin'), input(String(s.n), { mono: true }));
    if (s.kind === 'hours') f = `<div class="form-grid">${field(t('sched.field.everyHour'), input(String(s.n), { mono: true }))}${field(t('sched.field.atMinute'), input(pad(s.m), { mono: true }))}</div>`;
    if (s.kind === 'daily') f = field(t('sched.field.time'), input(s.t, { mono: true }));
    if (s.kind === 'weekly') f = field(t('sched.field.days'), `<div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="chip-day${s.days.includes(d) ? ' is-on' : ''}">${t('day.short.' + d)}</span>`).join('')}</div>`) + field(t('sched.field.time'), input(s.t, { mono: true }));
    if (s.kind === 'monthly') f = `<div class="form-grid">${field(t('sched.field.dom'), input(String(s.d), { mono: true }))}${field(t('sched.field.time'), input(s.t, { mono: true }))}</div>`;
    if (s.kind === 'advanced') f = field(t('sched.field.cron'), input(s.cron, { mono: true, err: !!schedErr(s.cron) }), schedErr(s.cron) ? hintE(`${t('error.INVALID_CRON')} — ${esc(schedErr(s.cron))}`) : hintN(t('sched.field.cron.hint')) + (s.auto ? hintN('↳ ' + t('sched.autoAdvanced')) : ''));
    return `<div class="form-stack">${f}${tz}</div>`;
  }
  function schedOut(s) {
    if (schedErr(s.cron)) return `<div class="sched-out is-error"><span class="label">${t('sched.out.means')}</span><div class="sched-desc">—</div><span class="hint is-error">${t('error.INVALID_CRON')}</span><span class="label">${t('sched.out.next')}</span><span class="hint">${t('sched.out.none')}</span></div>`;
    const desc = schedDesc(s.cron);
    const next = (SCH.next[s.key] || []).map(([dow, date, hm, sec]) => `<li><span>${t('day.short.' + dow)} ${date} · <b>${hm}</b></span><span class="rel">${rel(sec)}</span></li>`).join('');
    return `<div class="sched-out"><span class="label">${t('sched.out.means')}</span><div class="sched-desc">${esc(desc)}</div>` +
      `<span class="hint">${t('sched.out.cron', { cron: `<span class="mono">${s.cron}</span>` })} · Asia/Ho_Chi_Minh</span>${schedWarn(s.cron).map((w) => `<span class="hint is-warn">${esc(w)}</span>`).join('')}` +
      `<span class="label">${t('sched.out.next')}</span><ol class="next-runs">${next}</ol></div>`;
  }
  // The form samples reuse the "Scan API logs for crashes" loop of data.js (tests/support/form-kit.ts types the same text).
  const SAMPLE_NEW = { name: D.loops.crash.name, desc: D.loops.crash.desc, repo: 'api', prompt: D.loops.crash.prompt,
    exec: 'claude', model: 'sonnet', effort: 'medium', timeout: 1800, mockDur: 10, mockFail: 0 };
  const NEW_DEFAULT = { name: '', desc: '', prompt: '', repo: null, exec: 'claude', model: 'opus', effort: 'medium', timeout: null, mockDur: 10, mockFail: 0 };
  const MODELS = ['opus', 'sonnet', 'haiku'];
  const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
  const segOf = (list, on) => `<div class="seg">${list.map((x) => `<span class="${x === on ? 'is-on' : ''}">${x}</span>`).join('')}</div>`;
  // Repo field (combobox): name + path; open, it lists the registered repos + a way into the Repo page.
  function repoField(v, o, err) {
    const cur = v.repo ? D.repos[v.repo] : null;
    const val = o.noRepos ? `<span class="faint">${t('form.repo.none')}</span>`
      : cur ? `<span><b>${esc(cur.name)}</b> <span class="opt-path">${esc(cur.path)}</span></span>` : `<span class="faint">${t('form.repo.placeholder')}</span>`;
    const pop = o.repoPick ? `<div class="menu is-pop">${D.repoOrder.map((k) => { const r = D.repos[k]; return `<div class="${k === o.repoPick ? 'is-hover' : ''}"><b>${esc(r.name)}</b><span class="opt-path">${esc(r.path)}</span>${r.gone ? `<span class="hint is-warn">${t('form.repo.goneHint')}</span>` : ''}</div>`; }).join('')}<hr><div class="copy">${t('form.repo.manage')}</div></div>` : '';
    const ctl = `<div class="combo"><span class="select is-fake${err ? ' is-error' : ''}${o.repoPick ? ' is-focus' : ''}${o.noRepos ? ' is-disabled' : ''}">${val}<span class="caret">▾</span></span>${pop}</div>`;
    let hint;
    if (o.noRepos) hint = `<div class="field-act"><button class="btn primary">${t('form.repo.goRegister')}</button></div>`;
    else if (err) hint = hintE(err);
    else hint = `<span class="hint">${t('form.repo.hint')} · <span class="copy">${t('form.repo.manage')}</span></span>`;
    return field(t('form.repo'), ctl, hint);
  }
  function form(o) {
    const v = o.v, s = o.s, e = o.errs || {};
    const isEdit = o.mode !== 'new';
    let h = isEdit ? crumbs([t('crumb.loops'), esc(o.title), t('form.crumbEdit')]) : crumbs([t('crumb.loops'), t('form.crumbNew')]);
    h += `<div class="ph"><h1>${isEdit ? t('form.editTitle', { name: esc(o.title) }) : t('form.createTitle')}</h1></div>`;
    if (o.banner) h += o.banner;
    h += section(t('form.section.info')) + `<div class="form-grid">` +
      field(t('form.name'), input(v.name, { err: e.name }), e.name ? hintE(e.name) : hintN(t('form.name.hint'))) +
      repoField(v, o, e.repo) +
      field(t('form.desc'), input(v.desc), hintN(t('form.desc.hint')), 'span-all') +
      `<div class="field span-all"><div class="field-head"><span class="label">${t('form.prompt')}</span><span class="hint mono">${t('form.prompt.count', { n: num(v.prompt.length) })}</span></div>` +
      `<textarea class="textarea mono${e.prompt ? ' is-error' : ''}" placeholder="${t('form.prompt.placeholder')}">${esc(v.prompt)}</textarea>${e.prompt ? hintE(e.prompt) : ''}</div></div>`;
    h += section(t('form.section.schedule')) + `<div class="seg">${KINDS.map((k) => `<span class="${k === s.kind ? 'is-on' : ''}">${t('sched.kind.' + k)}</span>`).join('')}</div>` +
      `<div class="form-grid">${schedFields(s)}${schedOut(s)}</div>`;
    const tVal = v.timeout == null ? '' : String(v.timeout);
    const timeoutF = field(t('form.timeout'), affix(tVal, t('form.unit.sec'), { err: e.timeout, ph: t('form.timeout.placeholder') }), e.timeout ? hintE(e.timeout) : v.timeout == null ? hintN(t('form.timeout.optionalHint')) : hintN(t('form.timeout.hint', { d: dur(v.timeout) })));
    // Max concurrent runs — next to the timeout for both executors (default 1).
    const concF = field(t('form.maxConcurrent'), affix(String(v.maxConc ?? 1), t('form.unit.runs'), { err: e.maxConc }), e.maxConc ? hintE(e.maxConc) : hintN(t('form.maxConcurrent.hint')));
    h += section(t('form.section.exec')) + field(t('form.executor'), `<div class="seg"><span class="${v.exec === 'claude' ? 'is-on' : ''}">${t('form.executor.claude')}</span><span class="${v.exec === 'mock' ? 'is-on' : ''}">${t('form.executor.mock')}</span></div>`);
    if (v.exec === 'claude') {
      h += `<div class="form-grid">${field(t('form.model'), segOf(MODELS, v.model), hintN(t('form.model.hint')))}${field(t('form.effort'), segOf(EFFORTS, v.effort), hintN(t('form.effort.hint')))}${timeoutF}${concF}</div>` +
        `<div class="note"><span class="glyph">◆</span><span class="txt">${t('form.claude.fixed')}</span></div>`;
    } else {
      h += `<div class="form-grid" style="--cols:3">${timeoutF}${concF}` +
        field(t('form.mockDur'), affix(String(v.mockDur), t('form.unit.sec')), hintN(t('form.mockDur.hint'))) +
        field(t('form.mockFail'), affix(String(v.mockFail), t('form.unit.pct'), { err: e.mockFail }), e.mockFail ? hintE(e.mockFail) : hintN(t('form.mockFail.hint'))) + `</div>` +
        `<div class="note"><span class="glyph">◇</span><span class="txt">${t('form.executor.mockHint')}</span></div>`;
    }
    const saveLabel = o.saving ? t('form.saving') : isEdit ? t('form.save') : t('form.create');
    h += `<div class="form-foot"><button class="btn ghost">${t('form.cancel')}</button><button class="btn primary lg"${o.saving || o.noRepos || schedErr(s.cron) ? ' disabled' : ''}>${saveLabel}</button></div>`;
    return h;
  }
  function formSkeleton() {
    const f = (w) => `<div class="field"><span class="sk" style="width:${w}px"></span><span class="sk lg" style="width:100%"></span></div>`;
    return `<div class="crumbs"><span class="sk" style="width:200px"></span></div><div class="ph"><span class="sk lg" style="width:280px"></span></div>` +
      `<div class="form-grid">${f(60)}${f(80)}<div class="span-all"><span class="sk block"></span></div></div><span class="sk lg" style="width:70%"></span><div class="form-grid">${f(90)}<span class="sk block"></span></div>`;
  }
  const pilotV = () => { const l = D.loops.pilot; return { name: l.name, desc: l.desc, prompt: l.prompt, repo: l.repo, exec: 'claude', model: l.claude.model, effort: l.claude.effort, timeout: l.timeout, mockDur: 10, mockFail: 0 }; };

  // ── screens ─────────────────────────────────────────────────
  const listDefault = (o = {}) => listPane(o);
  const withList = (main, o = {}) => shell({ top: o.top, banner: o.banner, list: listPane(o.list || {}), main, root: o.root, overlay: o.overlay, nav: o.nav, repoCount: o.repoCount });
  const stopDialog = (key) => {
    const l = D.loops[key];
    return `<div class="scrim"><div class="dialog"><div class="d-head">${t('dialog.stop.title', { name: esc(l.name) })}</div><div class="d-body">${t('dialog.stop.body', { n: l.run.n, t: clock(l.run.elapsed), k: l.exec.k, reason: `<span class="mono">${t('reason.stopped')}</span>` })}</div><div class="d-foot"><button class="btn ghost">${t('dialog.stop.cancel')}</button><button class="btn danger solid">${t('dialog.stop.confirm')}</button></div></div></div>`;
  };
  const toast = (cls, text) => `<div class="toast-stack"><span class="toast ${cls}">${text}</span></div>`;
  function manyRows() {
    return D.many.map(([name, cron, n, el, ok, err, ca, sk, lastAt, nextAt, lastSt, k, up, repo]) => {
      const running = n != null;
      const l = { name, cron, repo, status: running ? 'active' : 'stopped', exec: { k, up, counts: { ok, err, cancel: ca, skip: sk } },
        run: running ? { n, elapsed: el } : null, last: { st: lastSt, at: lastAt }, next: nextAt ? { at: nextAt } : null };
      return loopRow(l, {});
    }).join('');
  }
  const dupLoops = () => {
    const c = Object.assign({}, D.loops.pilot, { name: t('loop.copySuffix', { name: D.loops.pilot.name }), status: 'stopped', exec: null, run: null, last: null, next: null });
    return Object.assign({}, D.loops, { copy: c });
  };

  const R = {
    'list-empty': () => shell({ repoCount: 0, top: { stats: { activeLoops: 0, runningRuns: 0, runsToday: 0, errors24h: 0 } }, list: listPane({ empty: true, counts: { all: 0, active: 0, stopped: 0, archived: 0 } }), main: emptyFirst(), root: true }),
    'list-loading': () => shell({ top: { stats: null, server: 'wait', db: 'wait' }, list: listPane({ loading: true }), main: home(), root: true }),
    'list-load-error': () => shell({ top: { stats: null, db: 'ok' }, list: listPane({ error: true }), main: home(), root: true }),
    'list-overview': () => withList(home(), { root: true }),
    'list-filter-archived': () => withList(home(), { root: true, list: { filter: 'archived', keys: ['oldsched'] } }),
    'list-search-empty': () => withList(home(), { root: true, list: { q: 'nightly', noMatch: true } }),
    'list-row-actions': () => withList(home(), { root: true, list: { hover: 'debt', menu: 'debt' } }),
    'list-stop-confirm': () => withList(home(), { root: true, list: { hover: 'pilot' }, overlay: stopDialog('pilot') }),
    'list-action-error': () => withList(home(), { root: true, overlay: toast('is-err', t('toast.failed', { msg: t('error.LOOP_ALREADY_ACTIVE') })) }),
    'list-disconnected': () => withList(home(), { root: true, top: TOP_DISCONNECTED, banner: bannerDisconnected() }),
    'list-reconnected': () => withList(home(), { root: true, banner: `<div class="banner is-info">${t('banner.reconnected')}</div>` }),
    'list-db-down': () => withList(home(), { root: true, top: { db: 'down', stale: true }, banner: `<div class="banner is-err">${t('banner.dbDown')}<span class="spacer"></span>${t('banner.dbDownSince', { t: '14:00:31' })}</div>` }),
    'list-many': () => shell({ top: { stats: { activeLoops: 10, runningRuns: 10, runsToday: 214, errors24h: 3 } }, list: listPane({ rowsHtml: manyRows(), counts: { all: 12, active: 10, stopped: 2, archived: 1 } }), main: home(), root: true }),
    'list-narrow': () => withList(home(), { root: true }),

    'form-new': () => withList(form({ mode: 'new', v: NEW_DEFAULT, s: SCHED.minutes30 })),
    'form-sched-minutes-uneven': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.minutes7 })),
    'form-sched-hours': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.hours })),
    'form-sched-daily': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.daily })),
    'form-sched-weekly': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.weekly })),
    'form-sched-monthly-warn': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.monthly })),
    'form-sched-advanced': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.advanced })),
    'form-sched-advanced-error': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.advancedErr })),
    'form-errors': () => withList(form({ mode: 'new', v: Object.assign({}, NEW_DEFAULT, { name: D.loops.wiki.name, desc: 'Also scan the beta channel', timeout: 30 }), s: SCHED.weekly,
      errs: { name: t('error.LOOP_NAME_TAKEN'), repo: t('val.repoRequired'), prompt: t('val.required'), timeout: t('val.timeoutRangeOptional') },
      banner: `<div class="banner inset is-err"><span class="txt">${t('form.errSummary', { n: 4 })}</span></div>` })),
    'form-saving': () => withList(form({ mode: 'new', v: SAMPLE_NEW, s: SCHED.weekly, saving: true })),
    'form-edit-running': () => withList(form({ mode: 'edit', title: D.loops.pilot.name, v: pilotV(), s: SCHED.minutes30,
      banner: `<div class="banner inset is-info"><span class="txt">▶ ${t('form.editRunning', { n: D.loops.pilot.run.n })}</span></div>` }), { list: { sel: 'pilot' } }),
    'form-conflict': () => withList(form({ mode: 'edit', title: D.loops.pilot.name, v: Object.assign(pilotV(), { effort: 'max' }), s: SCHED.minutes30,
      banner: `<div class="banner inset is-warn"><span class="txt">${t('form.conflict', { t: '14:02:10' })}<br>${t('form.conflict.fields', { fields: `${t('form.prompt')}, ${t('form.section.schedule')}` })}</span><button class="btn">${t('form.conflict.reload')}</button><button class="btn danger">${t('form.conflict.overwrite')}</button></div>` }), { list: { sel: 'pilot' } }),
    'form-duplicate': () => {
      const L = dupLoops();
      return withList(form({ mode: 'edit', title: L.copy.name, v: Object.assign(pilotV(), { name: L.copy.name }), s: SCHED.minutes30,
        banner: `<div class="note"><span class="glyph">⧉</span><span class="txt">${t('form.duplicated')}</span></div>` }),
      { list: { loops: L, keys: ['pilot', 'copy', 'crash', 'wiki', 'debt', 'prs', 'evidence', 'recap'], sel: 'copy', counts: { all: 8, active: 4, stopped: 4, archived: 1 } } });
    },
    'form-loading': () => withList(formSkeleton(), { list: { sel: 'pilot' } }),

    'loop-running': () => withList(loopDetail('pilot'), { list: { sel: 'pilot' } }),
    'loop-idle': () => withList(loopDetail('wiki'), { list: { sel: 'wiki' } }),
    'loop-last-failed': () => withList(loopDetail('debt'), { list: { sel: 'debt' } }),
    'loop-stopped': () => withList(loopDetail('evidence'), { list: { sel: 'evidence' } }),
    'loop-server-down': () => withList(loopDetail('prs'), { list: { sel: 'prs' } }),
    'loop-never-run': () => withList(loopDetail('recap'), { list: { sel: 'recap' } }),
    'loop-archived': () => withList(loopDetail('oldsched'), { list: { filter: 'archived', keys: ['oldsched'], sel: 'oldsched' } }),
    'loop-stop-confirm': () => withList(loopDetail('pilot'), { list: { sel: 'pilot' }, overlay: stopDialog('pilot') }),
    'loop-stopping': () => withList(loopDetail('pilot', { stopping: true }), { list: { sel: 'pilot', stopping: 'pilot' } }),
    'loop-disconnected': () => withList(loopDetail('pilot', { paused: true }), { list: { sel: 'pilot' }, top: TOP_DISCONNECTED, banner: bannerDisconnected() }),
    'loop-loading': () => withList(detailSkeleton(), { list: { sel: 'pilot' } }),
    'loop-not-found': () => withList(notFound('LOOP_NOT_FOUND', 'notFound.loop.body', '0e5b7d21-4c9a-4f3e-b812-6a0d9f3c7e45')),
    'loop-narrow': () => withList(loopDetail('pilot'), { list: { sel: 'pilot' } }),

    'exec-running': () => withList(execDetail('pilot', 3), { list: { sel: 'pilot' } }),
    'exec-stopped': () => withList(execDetail('evidence', 1), { list: { sel: 'evidence' } }),
    'exec-server-down': () => withList(execDetail('pilot', 2), { list: { sel: 'pilot' } }),
    'exec-copied': () => withList(execDetail('pilot', 3), { list: { sel: 'pilot' }, overlay: toast('', t('toast.copied', { n: 10 })) }),
    'exec-loading': () => withList(detailSkeleton(), { list: { sel: 'pilot' } }),
    'exec-not-found': () => withList(notFound('EXECUTION_NOT_FOUND', 'notFound.exec.body', '5a1f9e07-c3d2-4b68-9e0a-7f2c4d81b6e3')),

    'run-running': () => withList(runDetail('pilot', 69), { list: { sel: 'pilot' } }),
    'run-succeeded': () => withList(runDetail('pilot', 68, { oldPrompt: true }), { list: { sel: 'pilot' } }),
    'run-failed': () => withList(runDetail('debt', 104), { list: { sel: 'debt' } }),
    'run-timed-out': () => withList(runDetail('oldsched', 4), { list: { filter: 'archived', keys: ['oldsched'], sel: 'oldsched' } }),
    'run-cancelled': () => withList(runDetail('evidence', 4), { list: { sel: 'evidence' } }),
    'run-interrupted': () => withList(runDetail('pilot', 59), { list: { sel: 'pilot' } }),
    'run-skipped': () => withList(runDetail('debt', null, { skipStart: '14:00:00' }), { list: { sel: 'debt' } }),
    'run-loading': () => withList(detailSkeleton(), { list: { sel: 'pilot' } }),
    'run-not-found': () => withList(notFound('RUN_NOT_FOUND', 'notFound.run.body', 'c47e2b90-1d5f-4a83-a6c9-38e0b7f1d254')),
  };
  R['vi-loop-running'] = R['loop-running'];
  R['vi-form-errors'] = R['form-errors'];

  // ── Repo page (/repos) ──────────────────────────────────────
  const loopsOfRepo = (k) => Object.values(D.loops).filter((l) => l.repo === k);
  function repoAddForm(o = {}) {
    const a = o.add || {};
    const pathHint = a.pathErr ? hintE(a.pathErr) : hintN(t('repo.add.path.hint'));
    const nameHint = a.nameErr ? hintE(a.nameErr) : a.auto ? hintN(t('repo.add.name.auto', { folder: esc(a.auto) })) : hintN(t('repo.add.name.hint'));
    // The "Browse…" button sticks to the path field; the placeholder follows the OS of the machine running the console (Mac: a macOS path)
    const pathCtl = `<div class="affix">${input(a.path || '', { mono: true, ph: t(o.posix ? 'repo.add.path.placeholder.posix' : 'repo.add.path.placeholder'), err: !!a.pathErr, focus: a.focus })}` +
      `<button class="btn" title="${t('repo.add.browse.title')}">${t('repo.add.browse')}</button></div>`;
    return section(t('repo.section.add')) + `<div class="form-grid repo-add">` +
      field(t('repo.add.path'), pathCtl, pathHint) +
      field(t('repo.add.name'), input(a.name || '', { err: !!a.nameErr }), nameHint) +
      `<div class="field"><span class="label">&nbsp;</span><button class="btn primary"${a.path ? '' : ' disabled'}>${t('repo.add.submit')}</button></div></div>`;
  }
  function repoTable(set) {
    const repos = set ? set.repos : D.repos, order = set ? set.repoOrder : D.repoOrder;
    const head = `<tr><th>${t('repo.th.name')}</th><th>${t('repo.th.path')}</th><th>${t('repo.th.loops')}</th><th>${t('repo.th.added')}</th><th></th></tr>`;
    const body = order.map((k) => {
      const r = repos[k], n = set ? 0 : loopsOfRepo(k).length;
      return `<tr><td>${repoTag(r.name)}</td><td>${esc(r.path)}${r.gone ? ` <span class="hint is-warn">${t('repo.gone')}</span>` : ''}</td>` +
        `<td>${n ? t('repo.loops.count', { n }) : `<span class="faint">${t('repo.loops.none')}</span>`}</td><td>${r.added}</td><td class="act"><button class="btn ghost">${t('repo.delete')}</button></td></tr>`;
    }).join('');
    return `<table class="table">${head}${body}</table>`;
  }
  function repoPage(o = {}) {
    let h = crumbs([t('crumb.repos')]) + `<div class="ph"><h1>${t('repo.title')}</h1></div><div class="ph-sub">${t('repo.lead')}</div>`;
    if (o.banner) h += o.banner;
    h += repoAddForm(o);
    h += section(t('repo.section.list'), o.empty || o.loading ? '' : String((o.set ? o.set.repoOrder : D.repoOrder).length));
    if (o.empty) h += `<div class="empty"><div class="glyph">▣</div><h3>${t('repo.empty.title')}</h3><div>${t('repo.empty.body')}</div></div>`;
    else if (o.loading) h += `<div style="border:var(--border-w) solid var(--border)">${[0, 1, 2, 3].map(skRow).join('')}</div>`;
    else h += repoTable(o.set);
    return h;
  }

  // ── Folder picker ("Browse…") — drawn from the D.folders world (a Windows machine / a Mac) ──────────────────────
  // The server computes everything (parent folder, breadcrumb, hidden, git, registered repos); the preview applies the same
  // rules to the sample data. The real app (web/features/repos/FolderPicker.tsx) draws this same frame — tests/visual/
  // compares the two images.
  function folderDialog(w, o = {}) {
    const win = w.platform === 'win32', sep = win ? '\\' : '/';
    const fold = (s) => (w.platform === 'linux' ? s : s.toLowerCase());
    const same = (a, b) => fold(a) === fold(b);
    const parentOf = (p) => { const i = p.lastIndexOf(sep); if (i < 0) return null; const up = p.slice(0, i) || '/'; return win && /^[A-Za-z]:$/.test(up) ? up + '\\' : up === p ? null : up; };
    const nameOf = (p) => p.split(sep).filter(Boolean).pop() || p;
    const repoSet = w.repos ? Object.values(w.repos) : D.repoOrder.map((k) => D.repos[k]);
    const at = o.at || w.at;
    // breadcrumb from the root: "C:" / "/"
    const segs = at.split(sep).filter(Boolean);
    const crumbs = win ? segs.map((s, i) => ({ name: s, path: i === 0 ? s + '\\' : segs.slice(0, i + 1).join('\\') }))
      : [{ name: '/', path: '/' }].concat(segs.map((s, i) => ({ name: s, path: '/' + segs.slice(0, i + 1).join('/') })));
    const entries = o.denied ? [] : w.entries.map(([name, flag]) => {
      const path = at + sep + name;
      const repo = repoSet.find((r) => same(r.path, path));
      return { name, path, git: flag === 'git', hidden: flag === 'hidden', repo: repo ? repo.name : null };
    });
    const shown = entries.filter((e) => !e.hidden);
    // Quick access
    const known = w.known || {};
    const places = [['home', w.home, '⌂', nameOf(w.home)], ['desktop', known.desktop || w.home + sep + 'Desktop', '▭', t('folder.place.desktop')],
      ['documents', known.documents || w.home + sep + 'Documents', '≡', t('folder.place.documents')], ['downloads', known.downloads || w.home + sep + 'Downloads', '↓', t('folder.place.downloads')]];
    const roots = win ? w.roots.map((r) => [r, r + '\\']) : w.volumes;
    const near = [];
    for (const r of repoSet) {
      const up = parentOf(r.path);
      if (!up || places.some((p) => same(p[1], up))) continue;
      const g = near.find((n) => same(n.path, up));
      if (g) g.repos.push(r.name); else near.push({ path: up, name: nameOf(up), repos: [r.name] });
    }
    near.sort((a, b) => b.repos.length - a.repos.length || a.path.localeCompare(b.path, 'en', { sensitivity: 'base' }));
    const place = (glyph, label, path, sub) => `<button class="fp-place${same(path, at) ? ' is-on' : ''}" title="${esc(path)}"><span class="g">${glyph}</span><span class="nm">${esc(label)}${sub ? `<span class="sub"> · ${esc(sub)}</span>` : ''}</span></button>`;
    const side = `<span class="label">${t('folder.side.places')}</span>` + places.map((p) => place(p[2], p[3], p[1])).join('') +
      `<span class="label">${t('folder.side.roots')}</span>` + roots.map(([n, p]) => place('◫', n, p)).join('') +
      (near.length ? `<span class="label">${t('folder.side.near')}</span>` + near.map((n) => place('▣', n.name, n.path, n.repos.join(', '))).join('') : '');
    // List
    const sel = entries.find((e) => e.name === o.sel) || null;
    const row = (e) => `<div class="fp-row${e.git ? ' is-git' : ''}${e.hidden ? ' is-hidden' : ''}${sel === e ? ' is-sel' : ''}" title="${esc(e.path)}"><span class="g">${e.git ? '▣' : '▢'}</span><span class="nm">${esc(e.name)}</span>` +
      `<span class="tags">${e.git ? `<span class="tag-git">${t('folder.tag.git')}</span>` : ''}${e.repo ? `<span class="tag-repo">${t('folder.tag.repo', { name: esc(e.repo) })}</span>` : ''}</span><span class="go">›</span></div>`;
    const denied = `<div class="note"><span class="glyph">⊘</span><span class="txt">${t(win ? 'folder.denied' : 'folder.denied.darwin')}</span><button class="btn">${t('folder.retry')}</button></div>`;
    const list = o.denied ? denied : shown.length ? shown.map(row).join('') : `<div class="empty sm"><div>${t('folder.empty')}</div></div>`;
    const hiddenN = entries.length - shown.length;
    const tools = `<div class="fp-tools"><input class="input" placeholder="${t('folder.filter')}">${hiddenN ? `<label class="fp-check"><input type="checkbox">${t('folder.showHidden', { n: hiddenN })}</label>` : ''}</div>`;
    const status = `<div class="fp-status"><span>${t('folder.count', { n: shown.length })}</span><span class="spacer"></span><span>${t('folder.keys')}</span></div>`;
    // Footer: will choose the selected row; with no row selected, the open folder itself
    const target = sel || { path: at, name: crumbs[crumbs.length - 1].name, repo: (repoSet.find((r) => same(r.path, at)) || {}).name || null };
    const head = target.path.endsWith(target.name) ? target.path.slice(0, target.path.length - target.name.length) : '';
    const tail = head ? target.name : target.path;
    const foot = `<div class="fp-target"><span class="label">${t('folder.target')}</span><span class="path"><span class="head">${esc(head)}</span><span class="tail">${esc(tail)}</span></span>` +
      `${target.repo ? `<span class="hint is-warn">${t('folder.target.taken', { name: esc(target.repo) })}</span>` : ''}</div>` +
      `<button class="btn ghost">${t('folder.cancel')}</button><button class="btn primary"${target.repo ? ' disabled' : ''}>${t('folder.choose')}</button>`;
    const crumbHtml = crumbs.map((c, i) => (i === crumbs.length - 1 ? `<span class="is-cur">${esc(c.name)}</span>` : `<button>${esc(c.name)}</button><span>›</span>`)).join('');
    const bar = `<div class="fp-bar"><button class="btn icon" title="${t('folder.up')}">↑</button>${input(o.typed || at, { mono: true, err: !!o.err })}<button class="btn">${t('folder.go')}</button></div>` +
      (o.err ? hintE(o.err) : '');
    return `<div class="scrim"><div class="dialog is-wide fp"><div class="d-head">${t('folder.title')}</div><div class="d-body">${bar}<nav class="fp-crumbs">${crumbHtml}</nav>` +
      `<div class="fp-main"><aside class="fp-side">${side}</aside><div class="fp-pane">${tools}<div class="fp-list">${list}</div>${status}</div></div></div>` +
      `<div class="d-foot">${foot}</div></div></div>`;
  }
  const onRepos = (main, o = {}) => withList(main, Object.assign({ nav: 'repos' }, o));
  const repoDeleteDialog = (k) => {
    const r = D.repos[k];
    return `<div class="scrim"><div class="dialog"><div class="d-head">${t('repo.delete.title', { name: esc(r.name) })}</div><div class="d-body">${t('repo.delete.body', { path: `<span class="mono">${esc(r.path)}</span>` })}</div><div class="d-foot"><button class="btn ghost">${t('repo.delete.cancel')}</button><button class="btn danger solid">${t('repo.delete.confirm')}</button></div></div></div>`;
  };
  const inUseBanner = (k) => {
    const r = D.repos[k], ls = loopsOfRepo(k);
    const names = ls.map((l) => `<b>${esc(l.archived ? t('repo.inUse.archived', { name: l.name }) : l.name)}</b>`).join(', ');
    return `<div class="banner inset is-err"><span class="txt">${t('repo.inUse', { name: esc(r.name), n: ls.length, loops: names })}</span></div>`;
  };
  const API_PATH = D.repos.api.path, API_NAME = D.repos.api.name;
  const WORK = D.folders.win.at;
  Object.assign(R, {
    'repo-list': () => onRepos(repoPage()),
    'repo-empty': () => shell({ nav: 'repos', repoCount: 0, top: { stats: { activeLoops: 0, runningRuns: 0, runsToday: 0, errors24h: 0 } }, list: listPane({ empty: true, counts: { all: 0, active: 0, stopped: 0, archived: 0 } }), main: repoPage({ empty: true }) }),
    'repo-loading': () => onRepos(repoPage({ loading: true })),
    'repo-add-autoname': () => onRepos(repoPage({ add: { path: WORK + '\\acme-tools', name: 'acme-tools', auto: 'acme-tools', focus: true } })),
    'repo-err-missing': () => onRepos(repoPage({ add: { path: D.folders.win.typo, name: 'acme-tool', auto: 'acme-tool', pathErr: t('repo.val.notFound') } })),
    'repo-err-dup-path': () => onRepos(repoPage({ add: { path: API_PATH, name: API_NAME, auto: API_NAME, pathErr: t('repo.val.pathTaken', { name: API_NAME }) } })),
    'repo-err-dup-name': () => onRepos(repoPage({ add: { path: 'D:\\backup\\' + API_NAME, name: API_NAME, auto: API_NAME, nameErr: t('repo.val.nameTaken') } })),
    'repo-delete-confirm': () => onRepos(repoPage(), { overlay: repoDeleteDialog('dotfiles') }),
    'repo-delete-blocked': () => onRepos(repoPage({ banner: inUseBanner('old') })),
    'list-filter-repo': () => withList(home(), { root: true, list: { repo: 'old', keys: ['crash'], counts: { all: 1, active: 1, stopped: 0, archived: 1 } } }),
    'form-repo-required': () => withList(form({ mode: 'new', v: Object.assign({}, SAMPLE_NEW, { repo: null }), s: SCHED.minutes30, errs: { repo: t('val.repoRequired') },
      banner: `<div class="banner inset is-err"><span class="txt">${t('form.errSummary', { n: 1 })}</span></div>` })),
    'form-no-repos': () => shell({ repoCount: 0, top: { stats: { activeLoops: 0, runningRuns: 0, runsToday: 0, errors24h: 0 } }, list: listPane({ empty: true, counts: { all: 0, active: 0, stopped: 0, archived: 0 } }),
      main: form({ mode: 'new', v: NEW_DEFAULT, s: SCHED.minutes30, noRepos: true }) }),
    'form-repo-pick': () => withList(form({ mode: 'new', v: Object.assign({}, SAMPLE_NEW, { repo: null }), s: SCHED.minutes30, repoPick: 'api' })),
    'form-edit-claude': () => {
      const l = D.loops.debt;
      return withList(form({ mode: 'edit', title: l.name, v: { name: l.name, desc: l.desc, prompt: l.prompt, repo: l.repo, exec: 'claude', model: l.claude.model, effort: l.claude.effort, timeout: l.timeout }, s: SCHED.minutes30 }), { list: { sel: 'debt' } });
    },
    'form-exec-mock': () => withList(form({ mode: 'new', v: Object.assign({}, SAMPLE_NEW, { exec: 'mock', timeout: null }), s: SCHED.minutes30 })),
    'loop-repo-missing': () => withList(loopDetail('crash'), { list: { sel: 'crash' } }),
    'run-repo-missing': () => withList(runDetail('crash', 31), { list: { sel: 'crash' } }),
    'run-resume-copied': () => withList(runDetail('pilot', 68, { oldPrompt: true }), { list: { sel: 'pilot' }, overlay: toast('', t('toast.copiedResume', { id: sid('pilot', 68) })) }),
  });
  R['vi-repo-list'] = R['repo-list'];

  // ── "Browse…" button + folder picker ───────────────────────
  const FW = D.folders.win, FM = D.folders.mac;
  const ZERO_TOP = { stats: { activeLoops: 0, runningRuns: 0, runsToday: 0, errors24h: 0 } };
  // The Mac: its own console (its own DB) — no loops yet, 2 repos with Mac paths; the path field suggests a macOS path
  const onMac = (overlay) => shell({ nav: 'repos', repoCount: FM.repoOrder.length, top: ZERO_TOP, list: listPane({ empty: true, counts: { all: 0, active: 0, stopped: 0, archived: 0 } }),
    main: repoPage({ set: FM, posix: true }), overlay });
  Object.assign(R, {
    'repo-browse': () => onRepos(repoPage(), { overlay: folderDialog(FW, { sel: 'acme-tools' }) }),
    'repo-browse-notfound': () => onRepos(repoPage(), { overlay: folderDialog(FW, { typed: FW.typo, err: t('repo.val.notFound') }) }),
    'repo-browse-mac': () => onMac(folderDialog(FM, { sel: FM.repos.api.name })),
    'repo-browse-denied': () => onMac(folderDialog(FM, { at: FM.denied, denied: true })),
  });
  R['vi-repo-browse'] = R['repo-browse'];

  // ── run summaries on the run rows ──
  Object.assign(R, {
    'loop-runs-summary': () => withList(loopDetail('pilot'), { list: { sel: 'pilot' } }),
    'exec-runs-summary': () => withList(execDetail('debt', 5), { list: { sel: 'debt' } }),
  });
  R['vi-loop-runs-summary'] = R['loop-runs-summary'];

  // ── Transcript panel of the run screen ──
  Object.assign(R, {
    'run-transcript-running': () => withList(runDetail('pilot', 69, { tx: { mode: 'following', data: 'pilot69' } }), { list: { sel: 'pilot' } }),
    'run-transcript-ended': () => withList(runDetail('debt', 104, { tx: { mode: 'ended', data: 'debt104', page: 50, top: true } }), { list: { sel: 'debt' } }),
    'run-transcript-missing': () => withList(runDetail('pilot', 68, { oldPrompt: true, tx: { mode: 'missing' } }), { list: { sel: 'pilot' } }),
    'run-transcript-waiting': () => withList(runDetail('pilot', 69, { tx: { mode: 'waiting' } }), { list: { sel: 'pilot' } }),
    'run-transcript-paused': () => withList(runDetail('pilot', 69, { paused: true, tx: { mode: 'paused', data: 'pilot69' } }), { list: { sel: 'pilot' }, top: TOP_DISCONNECTED, banner: bannerDisconnected() }),
    'run-transcript-no-session': () => withList(runDetail('debt', null, { skipStart: '14:00:00', tx: { mode: 'noSession' } }), { list: { sel: 'debt' } }),
    'vi-run-transcript': () => withList(runDetail('pilot', 63, { oldPrompt: true, tx: { mode: 'ended', data: 'pilot63' } }), { list: { sel: 'pilot' } }),
  });

  // ── draw ────────────────────────────────────────────────────
  let html;
  if (!META) problems.push('state not in states.js: ' + STATE_ID);
  if (!R[STATE_ID]) problems.push('no draw function for state: ' + STATE_ID);
  try { html = R[STATE_ID] ? R[STATE_ID]() : ''; } catch (err) { problems.push('error while drawing: ' + err.message); html = ''; }
  document.title = `${STATE_ID} · ${THEME} — Castraferrum preview`;
  document.body.innerHTML = (problems.length ? `<div class="banner is-err">PREVIEW ERROR: ${problems.map(esc).join(' · ')}</div>` : '') + html;
  document.querySelectorAll('.log-scroll').forEach((el) => { el.scrollTop = el.hasAttribute('data-top') ? 0 : el.scrollHeight; });
  // The Transcript panel is tall, with sans + mono text — once the fonts load the height changes, so scroll to the bottom / top again
  if (document.fonts) document.fonts.ready.then(() => document.querySelectorAll('.log.tx .log-scroll').forEach((el) => { el.scrollTop = el.hasAttribute('data-top') ? 0 : el.scrollHeight; }));
  document.querySelectorAll('[data-flip]').forEach((el) => el.addEventListener('click', () => {
    const p = new URLSearchParams(location.search);
    if (el.dataset.flip === 'theme') p.set('theme', THEME === 'dark' ? 'light' : 'dark');
    else p.set('lang', LANG === 'en' ? 'vi' : 'en');
    location.search = p.toString();
  }));
  window.__PV = { state: STATE_ID, theme: THEME, lang: LANG, problems };
})();
