// The counts of an active period as words (spec 5.3): they name the run states the list shows, so an interrupted run reads
// as interrupted, never as failed (castraferrum#190). The words come from the locale files.
import { describe, expect, it } from 'vitest';
import type { ExecutionDto } from '../../../shared/contracts/loops';
import { translate, type Lang } from '../../prefs/messages';
import { countWords } from './period-text';

const stats = (s: Partial<ExecutionDto['stats']>): ExecutionDto['stats'] => ({
  runs: 0, running: 0, succeeded: 0, failed: 0, interrupted: 0, cancelled: 0, skipped: 0, held: 0, sessions: 0, elapsedMs: 0, avgDurationMs: null, ...s,
});

describe('countWords', () => {
  for (const lang of ['en', 'vi'] as Lang[]) {
    const t: Parameters<typeof countWords>[0] = (key, params) => translate(lang, key, params);

    it(`${lang}: a period the server ended, 3 succeeded and 1 interrupted run, reads "3 succeeded · 1 interrupted"`, () => {
      expect(countWords(t, stats({ runs: 4, succeeded: 3, interrupted: 1 }))).toBe(
        `${t('count.succeeded', { n: 3 })} · ${t('count.interrupted', { n: 1 })}`,
      );
    });

    it(`${lang}: a really failed run still reads as failed`, () => {
      expect(countWords(t, stats({ runs: 4, succeeded: 3, failed: 1 }))).toBe(`${t('count.succeeded', { n: 3 })} · ${t('count.failed', { n: 1 })}`);
    });
  }

  it('no run: a dash', () => {
    expect(countWords((k) => k, stats({}))).toBe('-');
  });
});
