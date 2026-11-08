// The four figures of the loop page (spec 5.3, D25): how long the current active period has run (or how long the last one
// lasted), its runs with their counts as words, the next run, and the typical run (the average of the period's finished runs,
// `avgDurationMs`). Two by two in the side column and on the phone. Every number comes from the API; the page's clock only
// counts the seconds of an open period.
import type { ReactNode } from 'react';
import type { LoopDetailDto } from '../../../shared/contracts/loops';
import { useT } from '../../prefs/prefs';
import { fmtRunDuration, fmtSpan, fmtStampHm, fmtWaitMinutes, fmtWhen, secBetween } from './format';
import { countWords } from './period-text';

/** One figure: its label, its value (the data font) and a line under it. */
export function Stat({ testId, label, value, sub }: { testId?: string; label: string; value: string | number; sub?: ReactNode }) {
  return (
    <div className="stat" data-testid={testId}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

/** A row of figures (`.stats`): four in a row, two by two in a side column and on the phone. */
export function Stats({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div className="stats" data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * `goals` = the goals of the last probe line (`null` = the line has none, and the figure is hidden). A loop with a probe has no
 * next run, so the figure of the goals takes the place of the next run.
 */
export function Figures({ loop, live, now, goals = null }: { loop: LoopDetailDto; live: boolean; now: Date; goals?: { passed: number; total: number } | null }) {
  const t = useT();
  const e = loop.currentExecution;
  const tz = loop.timezone;
  if (!e) {
    const never = t('stat.neverStarted');
    return (
      <Stats testId="loop-figures">
        <Stat testId="fig-active" label={t('stat.activeFor')} value="-" sub={never} />
        <Stat testId="fig-runs" label={t('stat.runsSinceStart')} value="-" sub={never} />
        {goals ? (
          <Stat testId="fig-goals" label={t('goalLoop.goals.figure')} value={`${goals.passed}/${goals.total}`} sub={t('goalLoop.goals.figureSub')} />
        ) : (
          <Stat testId="fig-next" label={t('stat.nextRun')} value="-" sub={never} />
        )}
        <Stat testId="fig-typical" label={t('stat.typical')} value="-" sub={never} />
      </Stats>
    );
  }
  const up = fmtSpan(t, secBetween(e.startedAt, e.endedAt ?? now));
  const next = live && loop.nextRunAt ? loop.nextRunAt : null;
  const finished = e.stats.runs - e.stats.running - e.stats.held;
  return (
    <Stats testId="loop-figures">
      {live ? (
        <Stat testId="fig-active" label={t('stat.activeFor')} value={up} sub={t('stat.since', { t: fmtWhen(t, e.startedAt, tz, now) })} />
      ) : (
        <Stat
          testId="fig-active"
          label={t('stat.lastPeriod')}
          value={up}
          sub={t('stat.span', { from: fmtWhen(t, e.startedAt, tz, now), to: e.endedAt ? fmtWhen(t, e.endedAt, tz, now, e.startedAt) : '-' })}
        />
      )}
      <Stat testId="fig-runs" label={t(live ? 'stat.runsSinceStart' : 'stat.runsInIt')} value={e.stats.runs} sub={countWords(t, e.stats)} />
      {goals ? (
        <Stat testId="fig-goals" label={t('goalLoop.goals.figure')} value={`${goals.passed}/${goals.total}`} sub={t('goalLoop.goals.figureSub')} />
      ) : next ? (
        <Stat testId="fig-next" label={t('stat.nextRun')} value={fmtStampHm(next, tz, now)} sub={t('stat.in', { d: fmtWaitMinutes(t, secBetween(now, next)) })} />
      ) : (
        <Stat testId="fig-next" label={t('stat.nextRun')} value="-" sub={live ? undefined : t('stat.stoppedNote')} />
      )}
      <Stat
        testId="fig-typical"
        label={t('stat.typical')}
        value={e.stats.avgDurationMs === null ? '-' : fmtRunDuration(e.stats.avgDurationMs / 1000)}
        sub={e.stats.avgDurationMs === null ? t('stat.none') : t('stat.average', { n: finished })}
      />
    </Stats>
  );
}
