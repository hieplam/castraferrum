// The record of one gate job (goal G6, preview state `gate-failed`): the status, the step that failed with the time and the exit code, the
// output of that step, the eight steps, and Queue again. A page pushed from the gate page: the phone keeps the tab bar under the
// navigation bar and puts the main action in the page (an action bar would cover the tab bar).
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { GateJobDetailDto, GateStepDto } from '../../../shared/contracts/gate';
import { GATE_STEPS, type GateStepName, type GateStepStatus } from '../../../shared/domain/gate';
import { isApiError } from '../../api/loops-api';
import { useGateJob, useQueueGateJob } from '../../data/gate';
import { browserTimeZone } from '../../data/overview';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Banner } from '../../ui/kit/Banner';
import { Button } from '../../ui/kit/Button';
import { Log, type LogLine } from '../../ui/kit/Log';
import { Cols, PageHead, useLayout } from '../../ui/kit/Layout';
import { Pill, type PillTone } from '../../ui/kit/Pill';
import { Group, RowCell } from '../../ui/kit/Group';
import { fmtStampHm } from '../loop-detail/format';
import { errorTitle, PushedPage } from '../loop-detail/PushedPage';
import { JOB_PILL, jobTime } from './JobCell';

const STEP_RESULT: Record<GateStepStatus, readonly [string, MessageKey]> = {
  pass: ['result s-ok', 'goalLoop.step.pass'],
  fail: ['result s-fail', 'goalLoop.step.fail'],
  skip: ['result s-skip', 'goalLoop.step.skip'],
};

const data = (text: string) => <span className="data">{text}</span>;

/** `812 ms`, or `18.7 s` from one second on (the preview's step time). */
const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/** The eight steps in order. A step the job never reached has no row and reads as not run; a step that ran twice shows its last row. */
function stepRows(steps: GateStepDto[]): { name: GateStepName; row: GateStepDto | null }[] {
  return GATE_STEPS.map((name) => ({ name, row: steps.findLast((s) => s.step === name) ?? null }));
}

function StepCell({ name, row }: { name: GateStepName; row: GateStepDto | null }) {
  const t = useT();
  const status: GateStepStatus = row?.status ?? 'skip';
  const [cls, key] = STEP_RESULT[status];
  return (
    <RowCell testId="gate-step" data={{ 'data-status': status }}>
      <span className="cell-main">
        <span className="cell-title is-plain">{data(name)}</span>
        {row && status !== 'skip' ? <span className="cell-meta is-data">{fmtMs(row.ms)}</span> : null}
      </span>
      <span className="cell-value">
        <span className={cls}>{t(key)}</span>
      </span>
    </RowCell>
  );
}

export function GateJobView({ repoId, jobId }: { repoId: string; jobId: string }) {
  const t = useT();
  const job = useGateJob(jobId);
  const back = { to: `/repos/${repoId}/gate`, label: t('goalLoop.gate.title'), testId: 'gate-job-back' };
  if (job.isError) {
    return (
      <PushedPage back={back} backlink={false}>
        <div className="empty is-err" data-testid="gate-job-error" role="alert">
          <b>{errorTitle(t, job.error, 'error.GATE_JOB_NOT_FOUND')}</b>
        </div>
      </PushedPage>
    );
  }
  if (!job.data) {
    return (
      <PushedPage back={back} backlink={false}>
        <span className="skeleton is-block" aria-busy="true" />
      </PushedPage>
    );
  }
  return <Record detail={job.data} back={back} />;
}

function Record({ detail, back }: { detail: GateJobDetailDto; back: { to: string; label: ReactNode; testId: string } }) {
  const t = useT();
  const tz = browserTimeZone();
  const phone = useLayout() === 'phone';
  const navigate = useNavigate();
  const queue = useQueueGateJob(detail.repoId);
  const { job } = detail;
  const [tone, key]: readonly [PillTone, MessageKey] = JOB_PILL[job.state];
  const pill = (
    <Pill tone={tone} testId="gate-job-status" status={job.state}>
      {t(key)}
    </Pill>
  );
  const ended = job.finishedAt ?? jobTime(job);
  const stopped = job.state === 'failed' || job.state === 'needs_ratification' ? stepRows(detail.steps).find((s) => s.name === job.step) : undefined;
  const requeue = (
    <Button variant="primary" size={phone ? 'lg' : undefined} block={phone} disabled={queue.isPending} data-testid="gate-requeue" onClick={() => queue.mutate(job.prNumber, { onSuccess: () => navigate(back.to) })}>
      {t('goalLoop.gate.requeue')}
    </Button>
  );

  const when = data(fmtStampHm(ended, tz, new Date()));
  const banner =
    job.state === 'failed' && job.step ? (
      <Banner tone="err" testId="gate-failed-step">
        {stopped?.row?.exitCode == null
          ? t.node('goalLoop.gate.failedAtNoExit', { step: data(job.step), t: when })
          : t.node('goalLoop.gate.failedAt', { step: data(job.step), t: when, n: stopped.row.exitCode })}
      </Banner>
    ) : null;

  const tail = stopped?.row?.outputTail ?? '';
  const lines: LogLine[] = tail === '' ? [] : tail.split('\n').map((text, i) => ({ seq: i + 1, text }));
  const output =
    stopped?.row && lines.length > 0 ? (
      <>
        <div className="section-head">
          <h2>{t('goalLoop.gate.output', { step: stopped.name })}</h2>
        </div>
        <Log testId="gate-output" left={t('goalLoop.gate.outputTail')} right={stopped.row.exitCode === null ? undefined : t('goalLoop.gate.outputExit', { n: stopped.row.exitCode })} lines={lines} />
      </>
    ) : null;
  const steps = (
    <Group caption={t('goalLoop.gate.steps')} testId="gate-steps">
      {stepRows(detail.steps).map(({ name, row }) => (
        <StepCell key={name} name={name} row={row} />
      ))}
    </Group>
  );

  const failure = queue.error;
  const sha = detail.headSha.slice(0, 7);
  return (
    <PushedPage back={back}>
      <PageHead
        title={
          <>
            {t('goalLoop.gate.prShort', { n: job.prNumber })}
            {phone ? null : pill}
          </>
        }
      >
        {phone || job.state !== 'failed' ? null : requeue}
      </PageHead>
      <div className="page-meta">
        {phone ? pill : null}
        <span>
          {job.title === null ? null : (
            <>
              <span data-raw="">{job.title}</span>{' '}
            </>
          )}
          <span className="keep">
            {job.title === null ? null : '· '}
            {t.node('goalLoop.gate.task', { key: data(job.taskKey) })}
          </span>{' '}
          <span className="keep">· {data(sha)}</span>
        </span>
      </div>
      {banner}
      {failure ? (
        <Banner tone="err" alert testId="gate-error">
          {t(`error.${isApiError(failure) ? failure.code : 'NETWORK'}` as MessageKey)}
        </Banner>
      ) : null}
      {phone ? (
        <>
          {steps}
          {output}
          {job.state === 'failed' ? requeue : null}
        </>
      ) : output ? (
        <Cols main={output} side={steps} />
      ) : (
        steps
      )}
    </PushedPage>
  );
}
