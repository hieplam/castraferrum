// One loop as a cell of the inset list (phone and tablet, below 1024px): name, status and last run, repo, schedule and next run, and
// a round Start or Stop at the trailing edge. The main part opens the loop page.
import { Link } from 'react-router';
import { describeShort } from '../../../shared/domain/schedule';
import { useT } from '../../prefs/prefs';
import { RowCell } from '../../ui/kit/Group';
import { RowAction, StatusPill, useLastRun, type LoopItem } from './row-view';

export function LoopCell({ item, busy, onStart, onStop }: { item: LoopItem; busy: boolean; onStart(): void; onStop(): void }) {
  const t = useT();
  const { loop, row, kind } = item;
  const last = useLastRun(row);
  return (
    <RowCell testId="loop-row" data={{ 'data-loop-id': loop.id, 'data-status': kind }}>
      <Link className="cell-main" to={`/loops/${loop.id}`}>
        <span className="cell-title" data-raw="" data-testid="loop-name">
          {loop.name}
        </span>
        <span className="cell-row">
          <StatusPill kind={kind} />
          <span className={last.className} data-testid="row-last">
            {last.node}
          </span>
        </span>
        <span className="cell-meta">
          <span data-raw="" data-testid="row-repo">
            {row.repoName}
          </span>{' '}
          · {describeShort(row.cron, t.lang)} ·{' '}
          <span data-testid="row-next">{row.next ? t.node('row.next', { t: <span className="data">{row.next}</span> }) : t('row.notScheduled')}</span>
        </span>
      </Link>
      <RowAction kind={kind} round busy={busy} onStart={onStart} onStop={onStop} />
    </RowCell>
  );
}
