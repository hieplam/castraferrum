// One run as a cell of the inset list (Recent runs, All runs, an active period; spec 5.3, D27): its number, its status as a pill,
// when it started, how long it took and what it cost, then its whole summary cut at two lines by CSS (nothing needs hovering).
// The active period page adds its session id under it. The cell opens the run page.
import { Link } from 'react-router';
import type { RunDto } from '../../../shared/contracts/loops';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Icon } from '../../ui/kit/Icon';
import { Pill, type PillTone } from '../../ui/kit/Pill';
import { fmtRunDuration, fmtRunStart, runSeconds } from './format';
import { formatUsd } from '../../../shared/domain/cost';

/** A run's status as a pill (spec 4.7). */
export const RUN_PILL: Record<RunDto['status'], readonly [PillTone, MessageKey]> = {
  running: ['run', 'status.running'],
  succeeded: ['ok', 'status.succeeded'],
  failed: ['fail', 'status.failed'],
  timed_out: ['fail', 'status.timedOut'],
  cancelled: ['skip', 'status.cancelled'],
  interrupted: ['int', 'status.interrupted'],
  skipped: ['skip', 'status.skipped'],
};

export function RunCell({ run, tz, now, session }: { run: RunDto; tz: string; now: Date; session?: boolean }) {
  const t = useT();
  const [tone, key] = RUN_PILL[run.status];
  const sec = runSeconds(run, now);
  const meta = [fmtRunStart(t, run.startedAt, tz, now)]
    .concat(sec === null ? [] : [fmtRunDuration(sec)], run.costUsd === null ? [] : [formatUsd(run.costUsd)])
    .join(' · ');
  const sum =
    run.status === 'running' ? (
      t('runs.stillWorking')
    ) : run.status === 'skipped' ? (
      <span data-raw="">{run.skipReason}</span>
    ) : run.summary ? (
      <span data-raw="">{run.summary}</span>
    ) : run.status === 'failed' ? (
      t('runs.noSummaryFailed')
    ) : (
      '-'
    );
  return (
    <Link className="cell" to={`/runs/${run.id}`} data-testid="run-row" data-run-id={run.id} data-status={run.status}>
      <span className="cell-main">
        <span className="run-top">
          <span className="run-id">{run.iteration === null ? '-' : `#${run.iteration}`}</span>
          <Pill tone={tone}>{t(key)}</Pill>
          <span className="run-meta">{meta}</span>
        </span>
        <span className="cell-sum" data-testid="run-sum" data-run-id={run.id}>
          {sum}
        </span>
        {session && run.sessionId ? (
          <span className="cell-meta" data-testid="run-session" data-session-id={run.sessionId}>
            {run.sessionId}
          </span>
        ) : null}
      </span>
      <Icon name="chev" className="chev" />
    </Link>
  );
}
