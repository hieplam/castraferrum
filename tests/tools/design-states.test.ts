import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PNG as Png } from 'pngjs';
import { checkDrawn, checkStates, compressPng, encodePng, loadDomain, main, messagesJs, readPreviewStates, readStateIds, scheduleJs } from '../../scripts/design-states.mjs';

// The smallest real PNG: the 8-byte signature + padding past the 10 KB threshold.
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(11 * 1024)]);

function fixture(ids: string[], previewIds: string[], shots: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'design-states-'));
  mkdirSync(join(dir, 'preview', 'shots'), { recursive: true });
  writeFileSync(join(dir, 'STATES.md'), ['| id | State |', '|---|---|', ...ids.map((id) => `| \`${id}\` | … |`)].join('\n'));
  writeFileSync(join(dir, 'preview', 'states.js'), `window.PV_STATES = ${JSON.stringify(previewIds.map((id) => ({ id })))};`);
  for (const s of shots) writeFileSync(join(dir, 'preview', 'shots', s), PNG);
  return dir;
}

describe('design-states', () => {
  it('reads ids from the first cell of the STATES.md table, skipping the header row', () => {
    expect(readStateIds('| id | x |\n|---|---|\n| `list-empty` | a |\n| `run-failed` | b |\ntext `not-a-row` |')).toEqual(['list-empty', 'run-failed']);
  });

  it('runs states.js like a browser script', () => {
    expect(readPreviewStates("window.PV_STATES = [{ id: 'a' }, { id: 'b' }];").map((s: { id: string }) => s.id)).toEqual(['a', 'b']);
  });

  it('a light + dark shot for every row → N/N, no errors', () => {
    const dir = fixture(['a', 'b'], ['a', 'b'], ['a-light.png', 'a-dark.png', 'b-light.png', 'b-dark.png']);
    const r = checkStates({ designDir: dir });
    expect([r.ok, r.ids.length, r.missing, r.errors]).toEqual([2, 2, [], []]);
    rmSync(dir, { recursive: true });
  });

  it('missing dark shot, empty shot, state the preview cannot draw → reports the right rows', () => {
    const dir = fixture(['a', 'b', 'c'], ['a', 'b'], ['a-light.png', 'b-light.png', 'b-dark.png', 'c-light.png', 'c-dark.png']);
    writeFileSync(join(dir, 'preview', 'shots', 'b-dark.png'), '');
    const r = checkStates({ designDir: dir });
    expect(r.ok).toBe(0);
    expect(r.missing.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(r.missing[0]?.why).toContain('dark shot missing');
    expect(r.missing[1]?.why).toContain('dark shot not a PNG');
    expect(r.missing[2]?.why).toContain('the preview cannot draw it');
    rmSync(dir, { recursive: true });
  });

  it('a state in the preview that is not in STATES.md → error', () => {
    const dir = fixture(['a'], ['a', 'z'], ['a-light.png', 'a-dark.png']);
    expect(checkStates({ designDir: dir }).errors.join()).toContain('z');
    rmSync(dir, { recursive: true });
  });

  it('build-output files (messages.js, schedule.js) out of date with their sources → error', () => {
    const dir = fixture(['a'], ['a'], ['a-light.png', 'a-dark.png']);
    const msgs = messagesJs({ k: 'text' }, { k: 'vi text' });
    writeFileSync(join(dir, 'preview', 'messages.js'), msgs);
    const sched = 'window.PV_SCHED = {};\n';
    writeFileSync(join(dir, 'preview', 'schedule.js'), sched);
    expect(checkStates({ designDir: dir, generated: { 'messages.js': msgs, 'schedule.js': sched } }).errors).toEqual([]);
    const errs = checkStates({ designDir: dir, generated: { 'messages.js': messagesJs({ k: 'text' }, { k: 'other vi text' }), 'schedule.js': 'other' } }).errors.join();
    expect(errs).toContain('messages.js');
    expect(errs).toContain('schedule.js');
    rmSync(dir, { recursive: true });
  });

  it('missing build-output files only add a note that says to run design:shots', () => {
    const dir = fixture(['a'], ['a'], ['a-light.png', 'a-dark.png']);
    const r = checkStates({ designDir: dir, generated: { 'messages.js': 'x', 'schedule.js': 'y' } });
    expect([r.ok, r.errors]).toEqual([1, []]);
    expect(r.notes.join()).toContain('npm run design:shots');
    rmSync(dir, { recursive: true });
  });

  it('the schedule sentences of schedule.js come from shared/domain (one source with the real code)', async () => {
    const d = await loadDomain();
    const pv = { loops: { a: { cron: '30 8 * * 1,3,5' } }, many: [['x', '*/7 * * * *']],
      schedules: [{ key: 'w', cron: '30 8 * * 1,3,5', tz: 'Asia/Ho_Chi_Minh', from: '2026-10-18T14:00:42+07:00' }, { key: 'bad', cron: '61 8 * * 1-5', tz: 'Asia/Ho_Chi_Minh', from: '2026-10-18T14:00:42+07:00' }] };
    const window: { PV_SCHED?: { desc: Record<string, Record<string, string>>; warn: Record<string, Record<string, string[]>>; error: Record<string, Record<string, string>>; next: Record<string, unknown[][]> } } = {};
    new Function('window', scheduleJs(pv, d))(window);
    const out = window.PV_SCHED!;
    expect(out.desc['30 8 * * 1,3,5']).toEqual({ en: d.describe('30 8 * * 1,3,5', 'en'), vi: d.describe('30 8 * * 1,3,5', 'vi') });
    expect(out.warn['*/7 * * * *']?.en?.[0]).toBe(d.warnings('*/7 * * * *', 'en')[0]?.message);
    expect(out.error['61 8 * * 1-5']?.en).toContain('61');
    expect(out.next['w']?.[0]).toEqual([1, '19/10', '08:30', 66558]); // Mon 19/10 08:30, in 18 h 29 min
    expect(out.next['bad']).toBeUndefined();
  });

  // The new preview (design/ds, UI uplift epic #63) is checked without shots until the owner approves it.
  async function runMain(args: string[]) {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); });
    try { return { code: await main(args), out: lines.join('\n') }; } finally { log.mockRestore(); }
  }
  const withData = (dir: string) => { writeFileSync(join(dir, 'preview', 'data.js'), 'window.PV = { loops: {}, many: [], schedules: [] };'); return dir; };

  it('--design <folder> --no-shots: every id of STATES.md in states.js → "states: N/N (shots not checked)", exit 0', async () => {
    const dir = withData(fixture(['a', 'phone-a'], ['a', 'phone-a'], []));
    const r = await runMain(['--design', dir, '--no-shots']);
    expect(r.out).toContain('states: 2/2 (shots not checked)');
    expect(r.code).toBe(0);
    rmSync(dir, { recursive: true });
  });

  it('--design <folder> --no-shots: a row the preview cannot draw is still missing, exit 1', async () => {
    const dir = withData(fixture(['a', 'b'], ['a'], []));
    const r = await runMain(['--design', dir, '--no-shots']);
    expect(r.out).toContain('missing: b');
    expect(r.out).toContain('states: 1/2 (shots not checked)');
    expect(r.code).toBe(1);
    rmSync(dir, { recursive: true });
  });

  it('--design <folder> without --no-shots still needs the shots', async () => {
    const dir = withData(fixture(['a'], ['a'], []));
    const r = await runMain(['--design', dir]);
    expect(r.out).toContain('states with shots: 0/1');
    expect(r.code).toBe(1);
    rmSync(dir, { recursive: true });
  });

  describe('checkDrawn (the dry run of design:shots)', () => {
    const known = new Set(['page', 'cell', 'pill', 's-run']);
    it('a page that shows every required id with its count, known classes and no literal style → no problem', () => {
      const snap = { ids: { summary: 1, 'loop-row': 7, topbar: 1 }, classes: ['page', 'cell', 'pill', 's-run'], styles: ['position:absolute;top:calc(100% + var(--space-1))'] };
      expect(checkDrawn(snap, { requires: ['summary', 'loop-row*7', 'topbar'], known })).toEqual([]);
    });
    it('a draw function that returns nothing misses every required id', () => {
      expect(checkDrawn({ ids: {}, classes: [], styles: [] }, { requires: ['summary', 'loop-row*7'], known }))
        .toEqual(['requires summary, shows 0', 'requires loop-row*7, shows 0']);
    });
    it('a wrong count, an id shown twice, an invented class and an inline colour or length are problems', () => {
      const snap = { ids: { 'loop-row': 6, summary: 2 }, classes: ['page', 'my-row'], styles: ['color:#fff', 'margin:4px', 'width:1.5rem'] };
      expect(checkDrawn(snap, { requires: ['loop-row*7', 'summary'], known })).toEqual([
        'requires loop-row*7, shows 6', 'requires summary, shows 2', 'unknown class .my-row',
        'inline style with a literal: "color:#fff"', 'inline style with a literal: "margin:4px"', 'inline style with a literal: "width:1.5rem"',
      ]);
    });
  });

  it('compressPng: a lossless re-encode keeps the pixels; a lossy one fails and keeps the original', () => {
    const img = new Png({ width: 40, height: 30 });
    for (let i = 0; i < img.data.length; i += 4) img.data.set([i % 251, (i * 7) % 253, 90, 255], i);
    const plain = Png.sync.write(img, { deflateLevel: 0 });
    const good = compressPng(plain);
    expect(good.identical).toBe(true);
    expect(good.after).toBeLessThan(good.before);
    expect(Png.sync.read(good.buf).data.equals(Png.sync.read(plain).data)).toBe(true);
    const lossy = compressPng(plain, (x) => { const d = Buffer.from(x.data); d.writeUInt8(d.readUInt8(0) ^ 1, 0); return encodePng({ ...x, data: d }); });
    expect([lossy.identical, lossy.buf]).toEqual([false, plain]);
  });
});
