import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDuration, fmtNumber, fmtTime } from './format';
import { format, formatParts, tn, translate } from './messages';
import { en } from '../../shared/i18n/en';
import { vi } from '../../shared/i18n/vi';

/** What `translate` must produce for a key: the template of vi.ts with `{x}` replaced by the parameter. */
const fill = (template: string, p: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));

describe('t() - UI texts', () => {
  it('fills parameters and keeps {x} when one is missing', () => {
    expect(format('{n} loops running', { n: 3 })).toBe('3 loops running');
    expect(format('attempt {n} - in {s} s', { n: 2 })).toBe('attempt 2 - in {s} s');
    expect(translate('en', 'banner.retry', { n: 3, s: 4 })).toBe(fill(en['banner.retry'], { n: 3, s: 4 }));
    expect(translate('en', 'banner.retry', { n: 3, s: 4 })).toBe('attempt 3 · retry in 4 s');
  });

  it('reads the Vietnamese texts from vi.ts', () => {
    const p = { n: 3, s: 4 };
    expect(translate('vi', 'banner.retry', p)).toBe(fill(vi['banner.retry'], p));
    expect(translate('vi', 'banner.retry', p)).not.toBe(translate('en', 'banner.retry', p));
  });

  it('formatParts: a parameter that is an element keeps its position', () => {
    const node = { el: 'b' };
    expect(formatParts('{n} loops running', { n: node })).toEqual([node, ' loops running']);
    expect(formatParts('a {x} b {y}', { x: 1, y: node })).toEqual(['a ', '1', ' b ', node]);
  });
});

describe('formatting', () => {
  const t = (key: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate('en', key, p);
  const tv = (key: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate('vi', key, p);
  it('duration, clock, number, time', () => {
    expect(fmtDuration(t, 4 * 3600 + 12 * 60)).toBe(fill(en['dur.hm'], { h: 4, m: 12 }).replace(/ /g, ' '));
    expect(fmtDuration(tv, 2 * 86400 + 3 * 3600)).toBe(fill(vi['dur.dh'], { d: 2, h: 3 }).replace(/ /g, ' '));
    expect(fmtClock(42)).toBe('00:42');
    expect(fmtClock(3909)).toBe('1:05:09');
    expect(fmtNumber('vi', 1234567)).toBe('1 234 567');
    expect(fmtNumber('en', 1234567)).toBe('1,234,567');
    expect(fmtTime(new Date('2026-10-18T07:00:42Z'), 'Asia/Ho_Chi_Minh')).toBe('14:00:42');
  });
});

describe('tn() - plural texts (spec D16)', () => {
  it('English: zero uses the .zero text when the key has one, otherwise .other; one and two', () => {
    expect(tn('en', 'period.runs', 0)).toBe('0 runs');
    expect(tn('en', 'period.runs', 1)).toBe('1 run');
    expect(tn('en', 'period.runs', 2)).toBe('2 runs');
    expect(tn('en', 'repos.loops', 0)).toBe('No loops');
    expect(tn('en', 'repos.loops', 1)).toBe('1 loop');
    expect(tn('en', 'repos.loops', 2)).toBe('2 loops');
  });

  it('Vietnamese: the same three cases, read from vi.ts', () => {
    expect(tn('vi', 'period.runs', 0)).toBe(fill(vi['period.runs.other'], { n: 0 }));
    expect(tn('vi', 'period.runs', 1)).toBe(vi['period.runs.one']);
    expect(tn('vi', 'period.runs', 2)).toBe(fill(vi['period.runs.other'], { n: 2 }));
    expect(tn('vi', 'repos.loops', 0)).toBe(vi['repos.loops.zero']);
    expect(tn('vi', 'repos.loops', 1)).toBe(vi['repos.loops.one']);
    expect(tn('vi', 'repos.loops', 2)).toBe(fill(vi['repos.loops.other'], { n: 2 }));
  });

  it('fills {n} and the extra parameters', () => {
    expect(tn('en', 'runs.showMore', 3)).toBe('Show 3 more runs from this period');
    expect(tn('en', 'runs.showMore', 1)).toBe('Show 1 more run from this period');
  });
});
