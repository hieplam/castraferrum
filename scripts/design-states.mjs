// npm run design:states — checks that the design preview has every state, each with a light and a dark shot.
// N = number of table rows of design/STATES.md (first cell shaped `id`). A row passes when:
//   - the id is in design/preview/states.js (the preview page can draw it), and
//   - design/preview/shots/<id>-light.png + <id>-dark.png exist and are real PNGs (≥ 10 KB).
// Also checked both ways: an id in states.js that is not in STATES.md → error. Two files are build output of
// `npm run design:shots` (git-ignored) and must match their sources byte for byte when present:
// design/preview/messages.js ← shared/i18n/en.ts + vi.ts (UI texts) and design/preview/schedule.js ←
// shared/domain/schedule.ts (schedule descriptions, warnings, cron errors, next runs — one source with the real code, the
// preview never writes schedule sentences). When one is missing, a note says to run `npm run design:shots`.
// Prints "states with shots: k/N" + what is missing; anything missing → exit 1.
// Options: --design <folder> (default design/), --i18n <folder> (default shared/i18n/).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_DESIGN = join(ROOT, 'design');
export const DEFAULT_I18N = join(ROOT, 'shared', 'i18n');
export const THEMES = ['light', 'dark'];
export const GENERATED = ['messages.js', 'schedule.js'];
const MIN_PNG_BYTES = 10 * 1024;
const PNG_SIG = '89504e470d0a1a0a';

/** State ids = first cell of every table row of STATES.md shaped `| \`list-empty\` | …`. */
export function readStateIds(md) {
  return [...md.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]);
}

/** Runs states.js (a browser script that sets window.PV_STATES) in a fake window and returns the state list. */
export function readPreviewStates(statesJs) {
  const window = {};
  new Function('window', statesJs)(window);
  return window.PV_STATES ?? [];
}

/** Content of design/preview/messages.js, built from the i18n key sets (en = default + vi). */
export function messagesJs(en, vi) {
  return '// GENERATED from shared/i18n/en.ts + vi.ts by `npm run design:shots` — do not edit.\n' +
    `window.MESSAGES = ${JSON.stringify({ en, vi }, null, 2)};\n`;
}

/** shared/domain/schedule.ts through tsx (the file uses TS syntax that Node cannot strip on its own). */
export async function loadDomain() {
  const { tsImport } = await import('tsx/esm/api');
  return tsImport(pathToFileURL(join(ROOT, 'shared', 'domain', 'schedule.ts')).href, import.meta.url);
}

/** Runs data.js (a browser script that sets window.PV) in a fake window. */
export function readPreviewData(dataJs) {
  const window = {};
  new Function('window', dataJs)(window);
  return window.PV;
}

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function wallClock(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((x) => [x.type, x.value]));
  return { dow: DOW[p.weekday], dm: `${p.day}/${p.month}`, dmy: `${p.day}/${p.month}/${p.year}`, hm: `${p.hour}:${p.minute}` };
}

/**
 * Content of design/preview/schedule.js: every schedule sentence the preview needs, produced by
 * shared/domain/schedule.ts — description, warnings, cron error (en + vi) for every cron of data.js, and the next 5 runs
 * of every schedule of the form (pv.schedules).
 */
export function scheduleJs(pv, d) {
  const crons = new Set([...Object.values(pv.loops).map((l) => l.cron), ...pv.many.map((m) => m[1]), ...pv.schedules.map((x) => x.cron)]);
  const out = { desc: {}, warn: {}, error: {}, next: {} };
  for (const cron of [...crons].sort()) {
    const ok = d.validate(cron).ok;
    const by = (fn) => ({ en: fn('en'), vi: fn('vi') });
    if (ok) {
      out.desc[cron] = by((l) => d.describe(cron, l));
      out.warn[cron] = by((l) => d.warnings(cron, l).map((w) => w.message));
    } else out.error[cron] = by((l) => d.validate(cron, l).error.message);
  }
  for (const s of pv.schedules) {
    if (!d.validate(s.cron).ok) continue;
    const from = new Date(s.from);
    const runs = d.nextRuns(s.cron, s.tz, from, 5);
    const far = runs.at(-1) - from > 60 * 86400e3;
    out.next[s.key] = runs.map((r) => { const w = wallClock(r, s.tz); return [w.dow, far ? w.dmy : w.dm, w.hm, Math.round((r - from) / 1000)]; });
  }
  return '// GENERATED from shared/domain/schedule.ts (+ the crons of data.js) by `npm run design:shots` — do not edit.\n' +
    `window.PV_SCHED = ${JSON.stringify(out, null, 2)};\n`;
}

export async function loadMessages(i18nDir = DEFAULT_I18N) {
  const { en } = await import(pathToFileURL(join(i18nDir, 'en.ts')).href);
  const { vi } = await import(pathToFileURL(join(i18nDir, 'vi.ts')).href);
  return { en, vi };
}

/** Both build-output files of the preview, from their sources: { 'messages.js': …, 'schedule.js': … }. */
export async function generatedFiles({ designDir = DEFAULT_DESIGN, i18nDir = DEFAULT_I18N } = {}) {
  const { en, vi } = await loadMessages(i18nDir);
  const pv = readPreviewData(readFileSync(join(designDir, 'preview', 'data.js'), 'utf8'));
  return { 'messages.js': messagesJs(en, vi), 'schedule.js': scheduleJs(pv, await loadDomain()) };
}

function shotOk(file) {
  if (!existsSync(file)) return 'missing';
  const size = statSync(file).size;
  if (readFileSync(file).subarray(0, 8).toString('hex') !== PNG_SIG) return 'not a PNG';
  if (size < MIN_PNG_BYTES) return `too small (${size} bytes)`;
  return null;
}

/**
 * Checks the whole set; returns { ids, ok, missing: [{id, why}], errors: [string], notes: [string] }.
 * generated = { 'messages.js': expected content, 'schedule.js': … } — a build-output file that is present must match
 * byte for byte; a missing one only adds a note.
 * @param {{ designDir?: string, generated?: Record<string, string> }} [opts]
 */
export function checkStates({ designDir = DEFAULT_DESIGN, generated = {} } = {}) {
  const errors = [];
  const notes = [];
  const md = readFileSync(join(designDir, 'STATES.md'), 'utf8');
  const ids = readStateIds(md);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) errors.push(`STATES.md has duplicate ids: ${[...new Set(dup)].join(', ')}`);
  if (!ids.length) errors.push('STATES.md has no state rows');
  const statesFile = join(designDir, 'preview', 'states.js');
  const preview = existsSync(statesFile) ? readPreviewStates(readFileSync(statesFile, 'utf8')).map((s) => s.id) : [];
  const extra = preview.filter((id) => !ids.includes(id));
  if (extra.length) errors.push(`states.js has states that are not in STATES.md: ${extra.join(', ')}`);
  for (const [name, want] of Object.entries(generated)) {
    const file = join(designDir, 'preview', name);
    const source = name === 'schedule.js' ? 'shared/domain/schedule.ts' : 'shared/i18n';
    if (!existsSync(file)) notes.push(`design/preview/${name} is missing (build output of ${source}) — run npm run design:shots`);
    else if (readFileSync(file, 'utf8') !== want) errors.push(`design/preview/${name} is out of date with ${source} — run npm run design:shots`);
  }
  const missing = [];
  let ok = 0;
  for (const id of new Set(ids)) {
    const why = [];
    if (!preview.includes(id)) why.push('the preview cannot draw it (not in states.js)');
    for (const th of THEMES) {
      const bad = shotOk(join(designDir, 'preview', 'shots', `${id}-${th}.png`));
      if (bad) why.push(`${th} shot ${bad}`);
    }
    if (why.length) missing.push({ id, why: why.join('; ') });
    else ok++;
  }
  return { ids: [...new Set(ids)], ok, missing, errors, notes };
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { design: { type: 'string' }, i18n: { type: 'string' } } });
  const designDir = values.design ?? DEFAULT_DESIGN;
  const generated = await generatedFiles({ designDir, i18nDir: values.i18n ?? DEFAULT_I18N });
  const r = checkStates({ designDir, generated });
  for (const m of r.missing) console.log(`  missing: ${m.id} — ${m.why}`);
  for (const e of r.errors) console.log(`  error: ${e}`);
  for (const n of r.notes) console.log(`  note: ${n}`);
  console.log(`states with shots: ${r.ok}/${r.ids.length}`);
  return r.missing.length || r.errors.length || !r.ids.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main();
}
