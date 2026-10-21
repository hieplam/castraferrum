// Run detail screen `/runs/:id` (UC-07, UC-22, UC-23 · the approved preview `run-*`): status, the timestamps, duration,
// estimated cost (D-UI16), session id + the copy command `claude --resume <id>` once the run has ended (D-UI12), Summary (D-UI17),
// a "Repo does not exist" run + a button that opens the Repo page (D-UI19), error / skip reason, the whole log (running -> follow live;
// finished -> the stream replays everything then `end`), the prompt used (a snapshot from run time - editing the loop later does not change history).
// Transcript (D-UI27): the verbatim JSONL file of the session, above the Log - after Summary (finished) / after the session id (running).
// System text in the DB (skip reason, log) is shown verbatim (spec Q13, D-UI8, D-UI18).
import { useNavigate } from 'react-router';
import type { ExecutionDetailDto, LoopDetailDto, RunDto } from '../../../shared/contracts/loops';
import { isApiError } from '../../api/loops-api';
import { useNow } from '../../data/connection';
import { useExecution, useRun, useRunLogs } from '../../data/history';
import { useLoop } from '../../data/loops';
import { useTranscript } from '../../data/transcript';
import { fmtClock, fmtDateTime } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Button, Note, SectionTitle, StatusTag } from '../../ui/components';
import { KvCell, KvGrid } from '../../ui/KvGrid';
import { LogView } from '../../ui/LogView';
import { useToast } from '../../ui/toast';
import {
  cursorTime,
  executorSummary,
  fmtCost,
  fmtRunDuration,
  fmtStamp,
  fmtTimeout,
  isRepoMissing,
  runEndedAt,
  runSeconds,
  runTimeoutSec,
  toLogViewLines,
} from './format';
import { RepoTag, scheduleText } from './LoopDetailView';
import { DetailCrumbs, DetailNotFound, DetailSkeleton, Raw, RunTag, copyText } from './parts';
import { TranscriptSection } from './transcript/TranscriptSection';

export function RunDetailView({ id }: { id: string }) {
  const q = useRun(id);
  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) return <DetailNotFound code={isApiError(q.error) ? q.error.code : 'NETWORK'} body="notFound.run.body" id={id} />;
  return <WithParents run={q.data} />;
}

/** A run needs its loop (name, schedule, time zone, current prompt, repo) + the execution that holds it (the number `execution #k`). */
function WithParents({ run }: { run: RunDto }) {
  const loop = useLoop(run.loopId);
  const exec = useExecution(run.executionId);
  if (loop.isPending || exec.isPending) return <DetailSkeleton />;
  if (loop.isError) return <DetailNotFound code={isApiError(loop.error) ? loop.error.code : 'NETWORK'} body="notFound.loop.body" id={run.loopId} />;
  if (exec.isError) return <DetailNotFound code={isApiError(exec.error) ? exec.error.code : 'NETWORK'} body="notFound.exec.body" id={run.executionId} />;
  return <RunDetailBody run={run} loop={loop.data} execution={exec.data} />;
}

function RunDetailBody({ run: r, loop, execution }: { run: RunDto; loop: LoopDetailDto; execution: ExecutionDetailDto }) {
  const t = useT();
  const now = useNow(1_000);
  const navigate = useNavigate();
  const toast = useToast();
  const tz = loop.timezone;
  const skipped = r.status === 'skipped';
  const live = r.status === 'running';
  const logs = useRunLogs(skipped ? null : r.id);
  // A running run without a session id is still followed: the server reports `missing`, then looks again by itself (SPEC section "Service + API").
  const tx = useTranscript(!skipped && (live || r.sessionId) ? r.id : null);
  const k = execution.seq;
  const execTitle = t('exec.title', { k });
  const title = r.iteration !== null ? t('run.title', { n: r.iteration }) : t('run.skippedTitle', { t: fmtStamp(r.startedAt, tz, now) });
  const endedAt = runEndedAt(r);
  const endTs = endedAt && !live && !skipped ? fmtStamp(endedAt, tz, now) : null;
  const timeout = runTimeoutSec(r);
  const timeoutUsed = fmtTimeout(t, timeout ?? loop.timeoutSec);
  const repoMissing = isRepoMissing(r);
  const claude = r.executorKind === 'claude';
  const banner =
    r.status === 'failed'
      ? (['is-err', `✗ ${t('run.err.failed', { msg: r.error ?? '' })}`] as const)
      : r.status === 'timed_out'
        ? (['is-err', `◷ ${t('run.err.timed_out', { d: timeoutUsed })}`] as const)
        : r.status === 'cancelled'
          ? (['is-warn', `⊘ ${t('run.err.cancelled', { t: endTs ?? '—', k })}`] as const)
          : r.status === 'interrupted'
            ? (['is-err', `↯ ${t('run.err.interrupted', { t: endedAt ? fmtDateTime(endedAt, tz) : '—', r: r.finishedAt ? fmtDateTime(r.finishedAt, tz) : '—' })}`] as const)
            : null;
  const sec = runSeconds(r, now);
  const duration = skipped || sec === null ? t('kv.none') : live ? fmtClock(sec) : fmtRunDuration(sec);
  const done = !live && !skipped;
  const copy = (sid: string) => void copyText(sid).then((ok) => ok && toast.show(t('toast.copied', { n: 1 })));
  // D-UI12: copy exactly the command, WITHOUT `cd` (project owner 19/10/2026) - the sentence under the button says to run it in the repo folder.
  const copyResume = (sid: string) => void copyText(`claude --resume ${sid}`).then((ok) => ok && toast.show(t('toast.copiedResume', { id: sid })));
  const changed = r.promptSnapshot !== loop.prompt;
  return (
    <>
      <DetailCrumbs
        parts={[
          { label: t('crumb.loops'), to: '/' },
          { label: <Raw>{loop.name}</Raw>, to: `/loops/${loop.id}` },
          { label: execTitle, to: `/executions/${execution.id}` },
          { label: r.iteration !== null ? t('run.title', { n: r.iteration }) : t('run.status.skipped') },
        ]}
      />
      <div className="ph" data-testid="run-header" data-status={r.status}>
        <h1>{title}</h1>
        <RunTag status={r.status} />
        <span className="spacer" />
        <Button onClick={() => navigate(`/executions/${execution.id}`)} data-testid="back-to-exec">
          ← {execTitle}
        </Button>
        <Button onClick={() => navigate(`/loops/${loop.id}`)} data-testid="back-to-loop">
          {t('action.backToLoop')}
        </Button>
      </div>
      <div className="ph-sub">
        <Raw>{loop.name}</Raw> ·{' '}
        <span className="mono">
          <RepoTag name={loop.repo.name} />
          {` · ${scheduleText(loop.cron, t.lang)}`}
        </span>
      </div>
      {banner && (
        <div className={`banner inset ${banner[0]}`} role="alert" data-testid="run-banner">
          <span className="txt">{banner[1]}</span>
        </div>
      )}
      {repoMissing && (
        <div className="note" data-testid="run-repo-missing">
          <span className="glyph">▣</span>
          <span className="txt">{t('run.repoMissing.hint')}</span>
          <Button onClick={() => navigate('/repos')} data-testid="open-repos">
            {t('run.repoMissing.open')}
          </Button>
        </div>
      )}
      {skipped && (
        <Note glyph="↷">
          <span data-testid="skip-reason">{t.node('run.skip.reason', { reason: <span data-raw="">{r.skipReason ?? ''}</span> })}</span>
        </Note>
      )}
      <KvGrid cols={6} testId="run-kv">
        <KvCell big={false} label={t('run.trigger')} value={t(`trigger.${r.trigger}`)} />
        <KvCell big={false} label={t('run.scheduledAt')} value={r.scheduledFor && r.trigger !== 'start' ? fmtStamp(r.scheduledFor, tz, now) : t('kv.none')} />
        <KvCell big={false} label={t('run.startedAt')} value={skipped ? t('kv.none') : fmtStamp(r.startedAt, tz, now)} />
        <KvCell
          big={false}
          label={t('run.endedAt')}
          value={skipped ? fmtStamp(r.finishedAt ?? r.startedAt, tz, now) : (endTs ?? t('kv.none'))}
          sub={r.status === 'interrupted' ? t('exec.heartbeat') : ''}
        />
        <KvCell
          testId="run-duration"
          label={t('run.duration')}
          value={duration}
          sub={
            live ? (
              <StatusTag kind="running" pulse>
                {t('run.status.running')}
              </StatusTag>
            ) : (
              ''
            )
          }
        />
        <KvCell testId="run-cost" label={t('run.cost')} value={done ? fmtCost(r.costUsd) : t('kv.none')} sub={done && r.costUsd !== null ? t('run.costSub') : ''} />
      </KvGrid>
      <div className="sid" data-testid="run-session" data-session-id={r.sessionId ?? ''}>
        <span className="label">{t('run.session')}</span>
        {r.sessionId ? (
          <>
            {r.sessionId}
            <span className="copy" role="button" onClick={() => copy(r.sessionId as string)}>
              {t('action.copy')}
            </span>
          </>
        ) : (
          <span className="faint">{repoMissing ? t('run.noSessionFailed') : t('run.noSession')}</span>
        )}
      </div>
      {/* Reopen the session only once the run has ended - resuming in parallel with a running run easily confuses the session (D-UI12) */}
      {claude && r.sessionId && !live && (
        <>
          <div className="cmd" data-testid="run-resume">
            <span className="label">{t('run.resume')}</span>
            <code data-testid="run-resume-cmd">{`claude --resume ${r.sessionId}`}</code>
            <Button onClick={() => copyResume(r.sessionId as string)} data-testid="run-resume-copy">
              {t('run.resume.copy')}
            </Button>
          </div>
          <div className="hint">{t.node('run.resume.hint', { path: <span className="mono" data-raw="">{loop.repo.path}</span> })}</div>
        </>
      )}
      {done && (
        <>
          <SectionTitle title={t('section.summary')} extra={r.summary ? t('run.summary.hint') : undefined} />
          {r.summary ? (
            <div className="code prose" data-raw="" data-testid="run-summary">
              {r.summary}
            </div>
          ) : (
            <Note glyph="—">{t('run.summary.none')}</Note>
          )}
        </>
      )}
      <TranscriptSection run={r} tx={tx} tz={tz} />
      <SectionTitle title={t('section.log')} />
      {skipped ? (
        <Note glyph="↷">{t('log.empty')}</Note>
      ) : (
        <>
          <LogView
            testId="run-log"
            left={live ? `${t('log.live')} · ${r.sessionId ?? '—'}` : t('log.saved', { n: logs.lines.length })}
            right={live ? (logs.mode === 'paused' ? t('log.paused') : t('log.following')) : <RunTag status={r.status} boxed={false} />}
            lines={toLogViewLines(logs.lines, tz, r.status)}
            live={live}
            paused={live && logs.mode === 'paused'}
            cursorAt={live ? cursorTime(now, tz) : undefined}
          />
          {claude && r.sessionId && !live && <div className="hint">{t(tx.entries.length ? 'run.log.consoleOnlyTx' : 'run.log.consoleOnly')}</div>}
          <SectionTitle title={t('section.promptUsed')} />
          {changed && <div className="hint is-warn">{t('run.promptChanged', { t: fmtDateTime(loop.updatedAt, tz) })}</div>}
          <div className="code" data-raw="" data-testid="run-prompt">
            {r.promptSnapshot}
          </div>
          <div className="hint mono" data-testid="run-executor-used">
            {t.node('run.executorUsed', {
              s: (
                <>
                  <RepoTag name={loop.repo.name} /> <span data-raw="">{loop.repo.path}</span>
                  {` · ${executorSummary(t, r.executorKind, r.executorConfig)} · ${t('loop.meta.timeout', { d: timeoutUsed })}`}
                </>
              ),
            })}
          </div>
        </>
      )}
    </>
  );
}
