// One gate job as a cell of the inset list (preview state `gate-queue`): the pull request and its title, the status as a pill, the step,
// the task and the time. The cell opens the record of the job. A job in `needs_ratification` has the Ratify button at the trailing edge.
import { Link } from 'react-router';
import type { GateJobDto } from '../../../shared/contracts/gate';
import type { GateJobState } from '../../../shared/domain/gate';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button } from '../../ui/kit/Button';
import { Icon } from '../../ui/kit/Icon';
import { Pill, type PillTone } from '../../ui/kit/Pill';
import { fmtStampHm } from '../loop-detail/format';

/** The status word of a job and its tone (the Statuses table of design/ds/SYSTEM.md, "Gate job"). */
export const JOB_PILL: Record<GateJobState, readonly [PillTone, MessageKey]> = {
  queued: ['wait', 'goalLoop.gate.queued'],
  running: ['run', 'goalLoop.gate.running'],
  merged: ['ok', 'goalLoop.gate.merged'],
  failed: ['fail', 'goalLoop.gate.failed'],
  needs_ratification: ['warn', 'goalLoop.gate.needsRatification'],
};

/** The moment the cell shows: when a running job started, when a queued job was queued, when any other job ended. */
export function jobTime(job: GateJobDto): Date {
  if (job.state === 'running') return job.startedAt ?? job.queuedAt;
  if (job.state === 'queued') return job.queuedAt;
  return job.finishedAt ?? job.queuedAt;
}

const data = (text: string) => <span className="data">{text}</span>;

export function JobCell({ job, repoId, tz, now, onRatify, busy }: { job: GateJobDto; repoId: string; tz: string; now: Date; onRatify(id: string): void; busy: boolean }) {
  const t = useT();
  const [tone, key] = JOB_PILL[job.state];
  const title = job.title === null ? t('goalLoop.gate.prShort', { n: job.prNumber }) : t.node('goalLoop.gate.pr', { n: job.prNumber, title: <span data-raw="">{job.title}</span> });
  return (
    <div className="cell" data-testid="gate-job" data-status={job.state} data-job-id={job.id}>
      <Link className="cell-main" to={`/repos/${repoId}/gate/jobs/${job.id}`}>
        <span className="cell-title">{title}</span>
        <span className="cell-row">
          <Pill tone={tone}>{t(key)}</Pill>
          <span className="cell-meta">
            {job.step ? <>{t.node('goalLoop.gate.step', { step: data(job.step) })} · </> : null}
            {t.node('goalLoop.gate.task', { key: data(job.taskKey) })} · {data(fmtStampHm(jobTime(job), tz, now))}
          </span>
        </span>
      </Link>
      {job.state === 'needs_ratification' ? (
        <Button variant="primary" disabled={busy} onClick={() => onRatify(job.id)} data-testid="gate-ratify">
          {t('goalLoop.gate.ratify')}
        </Button>
      ) : (
        <Icon name="chev" className="chev" />
      )}
    </div>
  );
}
