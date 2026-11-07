// The words of an active period (spec 5.3, 5.4): its span, how it ended, its runs and failures, and the counts of its runs as
// words. Pure functions over the API's figures and the `t` of the chosen language.
import type { ExecutionDto } from '../../../shared/contracts/loops';
import type { MessageKey } from '../../prefs/messages';
import type { T } from '../../prefs/format';
import { fmtWhen } from './format';

type Plural = (base: 'period.runs' | 'period.failed', n: number) => string;

/** `since Sun 09:47` while open; `Sat 17/10 08:00 to 09:31` once ended. */
export function periodSpanText(t: T, p: { startedAt: Date | null; endedAt: Date | null }, tz: string, now: Date): string {
  if (!p.startedAt) return '-';
  return p.endedAt
    ? t('period.span', { from: fmtWhen(t, p.startedAt, tz, now), to: fmtWhen(t, p.endedAt, tz, now, p.startedAt) })
    : t('period.since', { t: fmtWhen(t, p.startedAt, tz, now) });
}

/** `still active`, `stopped by you` or `ended: server shut down`. */
export function periodEndText(t: T, p: { endedAt: Date | null; endReason: ExecutionDto['endReason'] }): string {
  if (!p.endedAt) return t('period.stillActive');
  if (p.endReason === 'goal_met') return t('goalLoop.period.phrase');
  return t(p.endReason === 'server_down' ? 'period.byServer' : 'period.byYou');
}

/** `4 runs, 1 failed` (the failures only when there are some). */
export function periodCountsText(tn: Plural, runs: number, failures: number): string {
  return tn('period.runs', runs) + (failures ? `, ${tn('period.failed', failures)}` : '');
}

/** `8 succeeded · 1 failed · 1 running`: the counts of a period (an interrupted run is its own word, never failed)'s runs as words, `-` when there is none. */
export function countWords(t: T, s: ExecutionDto['stats']): string {
  const words: [MessageKey, number][] = [
    ['count.succeeded', s.succeeded],
    ['count.failed', s.failed],
    ['count.interrupted', s.interrupted],
    ['count.cancelled', s.cancelled],
    ['count.skipped', s.skipped],
    ['count.running', s.running],
    ['goalLoop.count.held', s.held],
  ];
  const out = words.filter(([, n]) => n > 0).map(([k, n]) => t(k, { n }));
  return out.length ? out.join(' · ') : '-';
}
