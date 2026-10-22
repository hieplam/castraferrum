// Overview bar in the top bar (UC-03): all four figures come from `GET /api/stats` (the server counts in the DB:
// running loops, running runs, runs today in the browser's time zone, errors in 24 hours). No figures yet (loading / load error)
// -> `—` like preview `list-loading`; stale figures (server / DB lost) -> faded.
import type { ReactNode } from 'react';
import { useOverview } from '../../data/overview';
import { useT } from '../../prefs/prefs';
import { cx } from '../../ui/components';

export function TopStats({ stale }: { stale: boolean }) {
  const t = useT();
  const o = useOverview().data;
  const v = (n: number | undefined): ReactNode => <b>{n ?? '—'}</b>;
  return (
    <div className={cx('topstats', stale && 'is-stale')} data-testid="topstats" data-stale={stale ? 'true' : undefined}>
      <span data-testid="stat-active-loops">{t.node('top.stats.activeLoops', { n: v(o?.activeLoops) })}</span>
      <span data-testid="stat-running-runs">{t.node('top.stats.runningRuns', { n: v(o?.runningRuns) })}</span>
      <span data-testid="stat-runs-today">{t.node('top.stats.runsToday', { n: v(o?.runsToday) })}</span>
      <span className={o?.errors24h ? 'is-err' : ''} data-alert={o?.errors24h ? 'true' : undefined} data-testid="stat-errors-24h">{t.node('top.stats.errors24h', { n: v(o?.errors24h) })}</span>
    </div>
  );
}
