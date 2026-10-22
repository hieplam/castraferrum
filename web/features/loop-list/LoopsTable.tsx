// The Loops table (from 1024px): a header and one row per loop with its status, schedule, last run and next run, a Start or Stop and
// the `⋯` menu. The rows below 1024px are cells (LoopCell).
import { Link } from 'react-router';
import { cx } from '../../ui/kit/cx';
import { describe } from '../../../shared/domain/schedule';
import type { LoopAction } from '../../data/loops';
import { useT } from '../../prefs/prefs';
import { agentText, RowAction, StatusPill, useLastRun, type LoopItem } from './row-view';
import { RowMenu } from './RowMenu';

const COLUMNS = ['loops.col.loop', 'loops.col.status', 'loops.col.schedule', 'loops.col.last', 'loops.col.next'] as const;

function TableRow({ item, busy, onStart, onStop, onAction }: { item: LoopItem; busy: boolean; onStart(): void; onStop(): void; onAction(action: LoopAction): void }) {
  const t = useT();
  const { loop, row, kind } = item;
  const last = useLastRun(row);
  return (
    <div className="ltable-row" role="row" data-testid="loop-row" data-loop-id={loop.id} data-status={kind}>
      <Link className="ltable-name" to={`/loops/${loop.id}`}>
        <b data-raw="" data-testid="loop-name">
          {loop.name}
        </b>
        <span>
          <span data-raw="" data-testid="row-repo">
            {row.repoName}
          </span>{' '}
          · {agentText(t, loop)}
        </span>
      </Link>
      <span className="ltable-cell">
        <StatusPill kind={kind} />
      </span>
      <span className="ltable-cell">{describe(row.cron, t.lang)}</span>
      <span className={cx('ltable-cell', last.className)} data-testid="row-last">
        {last.node}
      </span>
      <span className={cx('ltable-cell', row.next && 'data')} data-testid="row-next">
        {row.next ?? t('row.notScheduled')}
      </span>
      <span className="ltable-act">
        <RowAction kind={kind} round={false} busy={busy} onStart={onStart} onStop={onStop} />
        <RowMenu item={item} onAction={onAction} />
      </span>
    </div>
  );
}

export function LoopsTable({
  items,
  isBusy,
  onStart,
  onStop,
  onAction,
}: {
  items: LoopItem[];
  isBusy(id: string): boolean;
  onStart(item: LoopItem): void;
  onStop(item: LoopItem): void;
  onAction(item: LoopItem, action: LoopAction): void;
}) {
  const t = useT();
  return (
    <div className="ltable" role="table">
      <div className="ltable-head" role="row">
        {COLUMNS.map((key) => (
          <span key={key} role="columnheader">
            {t(key)}
          </span>
        ))}
        <span />
      </div>
      {items.map((item) => (
        <TableRow
          key={item.loop.id}
          item={item}
          busy={isBusy(item.loop.id)}
          onStart={() => onStart(item)}
          onStop={() => onStop(item)}
          onAction={(action) => onAction(item, action)}
        />
      ))}
    </div>
  );
}
