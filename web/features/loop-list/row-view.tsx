// The parts of a loop row that the cell (phone, tablet) and the table row (from 1024px) share: the kind of the row (the
// `data-status` of spec 7.1), its status pill, its "last run" text, and its Start or Stop button.
import type { ReactNode } from 'react';
import type { LoopDto } from '../../../shared/contracts/loops';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { ActionButton, IconButton } from '../../ui/kit/Button';
import { cx } from '../../ui/kit/cx';
import { Pill, type PillTone } from '../../ui/kit/Pill';
import { fmtMmss } from '../loop-detail/format';
import type { RowModel } from './row-model';

/** The classic loop kinds: `cancelled` while Stop is on its way. */
export type RowKind = 'running' | 'active' | 'stopped' | 'archived' | 'server_down' | 'cancelled';

/** A loop of the list: the API's loop, what its row shows, and its kind. */
export type LoopItem = { loop: LoopDto; row: RowModel; kind: RowKind };

export function kindOf(row: RowModel): RowKind {
  const k = row.status.kind;
  return k === 'idle' ? 'active' : k === 'stopping' ? 'cancelled' : k;
}

const PILL: Record<RowKind, readonly [PillTone, MessageKey]> = {
  running: ['run', 'status.running'],
  active: ['wait', 'status.waiting'],
  stopped: ['stop', 'status.stopped'],
  server_down: ['int', 'status.serverDown'],
  archived: ['stop', 'status.archived'],
  cancelled: ['run', 'status.stopping'],
};

export function StatusPill({ kind }: { kind: RowKind }) {
  const t = useT();
  const [tone, key] = PILL[kind];
  return (
    <Pill tone={tone} testId="row-status" status={kind}>
      {t(key)}
    </Pill>
  );
}

/** The text of a finished run's result and the class that colours it. */
const LAST: Record<string, readonly [MessageKey, string]> = {
  failed: ['row.lastFailed', 's-fail'],
  timed_out: ['row.lastTimedOut', 's-fail'],
  succeeded: ['row.lastOk', 's-ok'],
  cancelled: ['row.lastCancelled', 's-skip'],
  interrupted: ['row.lastInterrupted', 's-int'],
  skipped: ['row.lastSkipped', 's-skip'],
};

const data = (v: string | number): ReactNode => <span className="data">{v}</span>;

/** What the "last run" place says: the run working (or how many), the last result coloured by its status, or "never started". */
export function useLastRun(row: RowModel): { className: string; node: ReactNode } {
  const t = useT();
  const run = row.activeRun;
  if (run) {
    return {
      className: 'result',
      // Several runs of one loop working at once (UC-32): the row says how many instead of one run's clock.
      node: run.count > 1 ? t.node('row.runningMany', { c: data(run.count) }) : t.node('row.runningFor', { n: data(run.iteration), d: data(fmtMmss(run.elapsedSec)) }),
    };
  }
  if (!row.last) return { className: 'result', node: t('row.neverStarted') };
  const [key, cls] = LAST[row.last.status] ?? (['row.lastFailed', ''] as const);
  return { className: cx('result', cls), node: t.node(key, { t: data(row.last.at) }) };
}

/**
 * The agent of a loop as a row says it ("Claude opus"; "Claude" when the config names no model, as the preview draws
 * it), or the executor's name when it is not Claude.
 */
export function agentText(t: (key: MessageKey, params?: Record<string, string | number>) => string, loop: LoopDto): string {
  if (loop.executor.kind !== 'claude') return loop.executor.kind;
  const config = loop.executor.config as { model?: unknown } | null;
  return t('row.agent', { model: typeof config?.model === 'string' ? config.model : '' }).trim();
}

/** The loop's Start or Stop, visible at rest (D9): a round button in a cell, an icon button in the table. */
export function RowAction({
  kind,
  round,
  busy,
  onStart,
  onStop,
}: {
  kind: RowKind;
  round: boolean;
  busy: boolean;
  onStart(): void;
  onStop(): void;
}) {
  const t = useT();
  const stop = kind === 'running' || kind === 'active' || kind === 'cancelled';
  const label = t(stop ? 'act.stop' : 'act.start');
  const disabled = busy || kind === 'archived' || kind === 'cancelled';
  const testId = stop ? 'row-stop' : 'row-start';
  const onClick = stop ? onStop : onStart;
  return round ? (
    <ActionButton kind={stop ? 'stop' : 'start'} label={label} disabled={disabled} onClick={onClick} data-testid={testId} />
  ) : (
    <IconButton icon={stop ? 'stop' : 'play'} label={label} disabled={disabled} onClick={onClick} data-testid={testId} />
  );
}
