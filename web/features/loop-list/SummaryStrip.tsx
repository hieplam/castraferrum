// The four figures of the Loops page (UC-03, D25): loops running, runs right now, runs today, runs that failed in 24 hours. The server
// counts them (`GET /api/stats`); this only shows them. `-` while they have not arrived. `stale` = the connection is lost, so the
// figures are frozen (`data-stale`); the failed count carries `data-alert` when it is above 0.
import type { OverviewDto } from '../../../shared/contracts/loops';
import { useT } from '../../prefs/prefs';
import { cx } from '../../ui/kit/cx';

type Key = 'activeLoops' | 'runningRuns' | 'runsToday' | 'errors24h';

export function SummaryStrip({ stats, stale }: { stats: OverviewDto | undefined; stale: boolean }) {
  const t = useT();
  const item = (testId: string, key: Key, label: (n: number) => string, dot?: 'd-run' | 'd-fail') => {
    const v = stats?.[key];
    return (
      <div
        className="summary-item"
        data-testid={testId}
        data-value={v}
        data-stale={stale ? 'true' : undefined}
        data-alert={key === 'errors24h' && v !== undefined && v > 0 ? 'true' : undefined}
      >
        <b>
          {dot && v !== undefined && v > 0 ? <span className={cx('dot', dot)} /> : null}
          {v ?? '-'}
        </b>
        {label(v ?? 2)}
      </div>
    );
  };
  return (
    <div className="summary" data-testid="summary">
      {item('stat-active-loops', 'activeLoops', (n) => t.tn('summary.running', n), 'd-run')}
      {item('stat-running-runs', 'runningRuns', (n) => t.tn('summary.runs', n))}
      {item('stat-runs-today', 'runsToday', (n) => t.tn('summary.today', n))}
      {item('stat-errors-24h', 'errors24h', () => t('summary.failed'), 'd-fail')}
    </div>
  );
}
