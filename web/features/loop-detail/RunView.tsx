// The run page of the new UI (spec 5.5, `m-run-*`, `/runs/:id`): "Run #N" and its status, when it ran, the loop and active period it
// belongs to; what went wrong (a banner, the hint of a missing repo folder, the reason of a skip); the summary; the facts (started
// by, estimated cost, session with a copy button); "Reopen this session on your computer" with the command (only once the run has
// ended: resuming a session that still works would tangle it, D-UI12); the transcript; the log; the prompt used (the snapshot taken
// when the run started). From 1024px two columns: summary, transcript and log on the left; facts, command and prompt on the right.
// On the phone one column, the copy actions in the navigation bar's `⋯`, and the prompt used behind a cell.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ExecutionDetailDto, LoopDetailDto, RunDto } from '../../../shared/contracts/loops';
import { formatUsd } from '../../../shared/domain/cost';
import { useNow, useSharedServerStatus } from '../../data/connection';
import { useExecution, useRun, useRunLogs } from '../../data/history';
import { useLoop } from '../../data/loops';
import { useTranscript } from '../../data/transcript';
import { fmtDateTime, fmtTime } from '../../prefs/format';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Banner } from '../../ui/kit/Banner';
import { Button, IconButton } from '../../ui/kit/Button';
import { copyText } from '../../ui/kit/copy';
import { Cell, Group } from '../../ui/kit/Group';
import { Icon } from '../../ui/kit/Icon';
import { Cols, useLayout } from '../../ui/kit/Layout';
import { Log } from '../../ui/kit/Log';
import { Menu, Sheet } from '../../ui/kit/Overlay';
import { Pill } from '../../ui/kit/Pill';
import { useToast } from '../../ui/toast';
import { cursorTime, executorSummary, fmtRunDuration, fmtSpan, isRepoMissing, runEndedAt, runSeconds, runTimeoutSec, toLogViewLines, weekdayOf } from './format';
import { errorTitle, PageNotFound, PageSkeleton, PushedPage } from './PushedPage';
import { RUN_PILL } from './RunCell';
import { TranscriptPanel } from './transcript/TranscriptPanel';

const STARTED_BY = { start: 'run.byStart', schedule: 'run.bySchedule', probe: 'run.byProbe' } as const;

export function RunView({ id }: { id: string }) {
  const t = useT();
  const q = useRun(id);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <PageNotFound title={errorTitle(t, q.error, 'error.RUN_NOT_FOUND')} />;
  return <WithParents run={q.data} />;
}

/** A run needs its loop (name, time zone, current prompt, repo) and its active period (the number `active period #k`). */
function WithParents({ run }: { run: RunDto }) {
  const t = useT();
  const loop = useLoop(run.loopId);
  const exec = useExecution(run.executionId);
  if (loop.isPending || exec.isPending) return <PageSkeleton />;
  if (loop.isError) return <PageNotFound title={errorTitle(t, loop.error, 'error.LOOP_NOT_FOUND')} />;
  if (exec.isError) return <PageNotFound title={errorTitle(t, exec.error, 'period.notFound')} />;
  return <RunBody run={run} loop={loop.data} period={exec.data} />;
}

/** The prompt the run started with; a note when the loop's prompt was edited since; the agent it ran with. */
function PromptUsed({ run, loop }: { run: RunDto; loop: LoopDetailDto }) {
  const t = useT();
  const tz = loop.timezone;
  return (
    <>
      {run.promptSnapshot !== loop.prompt ? <p className="note">{t('run.promptEdited', { t: fmtDateTime(loop.updatedAt, tz) })}</p> : null}
      <pre className="code" data-raw="" data-testid="run-prompt">
        {run.promptSnapshot}
      </pre>
      <p className="note" data-testid="run-executor-used">
        {t.node('run.agentUsed', {
          s: (
            <>
              <span data-raw="">{loop.repo.name}</span>
              {` · ${executorSummary(t, run.executorKind, run.executorConfig)}`}
            </>
          ),
        })}
      </p>
    </>
  );
}

function RunBody({ run: r, loop, period }: { run: RunDto; loop: LoopDetailDto; period: ExecutionDetailDto }) {
  const t = useT();
  const now = useNow(1_000);
  const toast = useToast();
  const phone = useLayout() === 'phone';
  const offline = useSharedServerStatus().server === 'down';
  const [promptOpen, setPromptOpen] = useState(false);
  const tz = loop.timezone;
  const running = r.status === 'running';
  const skipped = r.status === 'skipped';
  const logs = useRunLogs(skipped ? null : r.id);
  const tx = useTranscript(!skipped && (running || r.sessionId) ? r.id : null);
  const k = period.seq;
  const sid = r.sessionId;
  const repoMissing = isRepoMissing(r);

  const [tone, key] = RUN_PILL[r.status];
  const pill = <Pill tone={tone}>{t(key)}</Pill>;
  const title = r.iteration !== null ? t('run.title', { n: r.iteration }) : t('run.skipTitle', { t: fmtTime(r.startedAt, tz).slice(0, 5) });
  const day = `${t(`day.short.${weekdayOf(r.startedAt, tz)}` as MessageKey)} ${fmtDateTime(r.startedAt, tz).slice(0, 5)}`;
  const from = fmtTime(r.startedAt, tz).slice(0, 5);
  const sec = runSeconds(r, now);
  const took = <span data-testid="run-duration">{sec === null ? '-' : fmtRunDuration(sec)}</span>;
  const ended = runEndedAt(r);
  const when: ReactNode = skipped ? (
    `${day} · ${from}`
  ) : running ? (
    <>
      {`${day} · ${t('period.since', { t: from })} · `}
      {took}
    </>
  ) : (
    t.node('run.when', { day, from, to: ended ? fmtTime(ended, tz).slice(0, 5) : '-', d: took })
  );
  const header = (
    <>
      <div className="page-head" data-testid="run-header" data-status={r.status}>
        <h1 className="page-title">
          {title}
          {phone ? null : pill}
        </h1>
      </div>
      {phone ? <div className="page-meta">{pill}</div> : null}
      <div className="page-meta">{when}</div>
      <div className="page-meta" data-testid="run-of">
        {/* one flex item: the meta line's gap would otherwise split the name from the text */}
        <span>{t.node('run.of', { loop: <span data-raw="">{loop.name}</span>, k })}</span>
      </div>
    </>
  );

  // What went wrong: a banner for a run that ended badly, the hint of a missing repo folder, the reason of a skip.
  const timeout = runTimeoutSec(r) ?? loop.timeoutSec;
  const why: Partial<Record<RunDto['status'], () => ReactNode>> = {
    failed: () => t.node('run.banner.failed', { msg: <span data-raw="">{r.error ?? ''}</span> }),
    timed_out: () => t('run.banner.timedOut', { d: timeout === null ? t('dur.unlimited') : fmtSpan(t, timeout) }),
    cancelled: () => t('run.banner.cancelled', { t: ended ? fmtDateTime(ended, tz) : '-', k }),
    interrupted: () => t('run.banner.interrupted', { t: ended ? fmtDateTime(ended, tz) : '-', r: r.finishedAt ? fmtDateTime(r.finishedAt, tz) : '-' }),
  };
  const banner = why[r.status];
  const alert = (
    <>
      {banner ? (
        <Banner tone={r.status === 'cancelled' ? 'warn' : 'err'} testId="run-banner">
          {banner()}
        </Banner>
      ) : null}
      {repoMissing ? (
        <div className="card is-pad" data-testid="run-repo-missing">
          <p className="page-desc">{t('run.repoMissingHint')}</p>
          <Link className="btn" to="/repos" data-testid="open-repos">
            {t('act.openRepos')}
          </Link>
        </div>
      ) : null}
      {skipped ? (
        <p className="page-desc" data-testid="skip-reason">
          {t.node('run.skipNote', { reason: <span data-raw="">{r.skipReason ?? ''}</span> })}
        </p>
      ) : null}
    </>
  );

  const summary =
    running || skipped ? null : (
      <>
        <p className="group-cap">{t('run.summary')}</p>
        <div className="card is-pad" data-testid="run-summary">
          <p className="page-desc" data-raw={r.summary ? '' : undefined}>
            {r.summary ? r.summary : t(r.status === 'failed' ? 'runs.noSummaryFailed' : 'run.noSummary')}
          </p>
        </div>
      </>
    );

  const copySession = (s: string) => void copyText(s).then((ok) => ok && toast.show(t.tn('period.copied', 1)));
  const command = (s: string) => `claude --resume ${s}`;
  const copyCommand = (s: string) => void copyText(command(s)).then((ok) => ok && toast.show(t('run.copiedCommand', { id: s })));
  const facts = (
    <Group testId="run-facts">
      <Cell plain title={t('run.startedBy')} value={t(STARTED_BY[r.trigger])} />
      {skipped ? null : (
        <Cell plain title={t('run.cost')} meta={t('run.costNote')} value={<span data-testid="run-cost">{r.costUsd === null ? '-' : formatUsd(r.costUsd)}</span>} />
      )}
      {sid ? (
        <div className="cell" data-testid="run-session" data-session-id={sid}>
          <span className="cell-main">
            <span className="cell-title is-plain">{t('run.sessionLabel')}</span>
            <span className="cell-meta is-one-line">{sid}</span>
          </span>
          <IconButton icon="copy" bordered label={t('run.copySession')} tooltip={phone ? false : 'above'} onClick={() => copySession(sid)} />
        </div>
      ) : null}
    </Group>
  );
  // Resume only once the run has ended (D-UI12), and only a Claude session.
  const resume =
    sid && !running && r.executorKind === 'claude' ? (
      <>
        <p className="group-cap">{t('run.reopen')}</p>
        <div className="cmd is-wrap" data-testid="run-resume">
          <code data-testid="run-resume-cmd">{command(sid)}</code>
          <Button variant="plain" onClick={() => copyCommand(sid)} data-testid="run-resume-copy">
            {t('run.copyCommand')}
          </Button>
        </div>
      </>
    ) : null;

  const transcript = <TranscriptPanel run={r} tx={tx} tz={tz} now={now} offline={offline} />;
  const paused = running && (logs.mode === 'paused' || offline);
  const log = (
    <>
      <div className="section-head">
        <h2>{t('run.log')}</h2>
      </div>
      {skipped ? (
        <p className="note">{t('log.empty')}</p>
      ) : running ? (
        <Log
          testId="run-log"
          left={t('now.liveOutput')}
          right={t(paused ? 'now.paused' : 'now.following')}
          lines={toLogViewLines(logs.lines, tz, null)}
          live={{ at: cursorTime(now, tz), paused }}
        />
      ) : (
        <Log testId="run-log" left={t.tn('log.saved', logs.lines.length)} right={t(key)} lines={toLogViewLines(logs.lines, tz, r.status)} />
      )}
    </>
  );

  const back = { to: `/loops/${loop.id}`, label: <span data-raw="">{loop.name}</span>, testId: 'back-to-loop' };
  if (phone) {
    const menu = sid ? (
      <Menu
        label={t('act.more')}
        phoneSheet="items"
        items={[
          { id: 'copy-session', label: t('run.copySession'), onSelect: () => copySession(sid) },
          ...(resume ? [{ id: 'copy-command', label: t('run.copyCommand'), onSelect: () => copyCommand(sid) }] : []),
        ]}
        trigger={(p) => <IconButton icon="more" label={t('act.more')} tooltip={false} {...p} />}
      />
    ) : null;
    return (
      <PushedPage back={back} actions={menu} testId="run-page">
        {header}
        {alert}
        {summary}
        {facts}
        {resume}
        {transcript}
        {log}
        {skipped ? null : (
          <div className="group">
            <button type="button" className="cell" data-testid="run-prompt" onClick={() => setPromptOpen(true)}>
              <span className="cell-main">
                <span className="cell-title">{t('run.promptUsed')}</span>
                <span className="cell-meta">{t('run.promptUsedSub')}</span>
              </span>
              <Icon name="chev" className="chev" />
            </button>
          </div>
        )}
        <Sheet open={promptOpen} onClose={() => setPromptOpen(false)} title={t('run.promptUsed')}>
          <PromptUsed run={r} loop={loop} />
        </Sheet>
      </PushedPage>
    );
  }
  return (
    <PushedPage back={back} testId="run-page">
      {header}
      {alert}
      <Cols
        main={
          <>
            {summary}
            {transcript}
            {log}
          </>
        }
        side={
          <>
            {facts}
            {resume}
            {skipped ? null : (
              <>
                <p className="group-cap">{t('run.promptUsed')}</p>
                <PromptUsed run={r} loop={loop} />
              </>
            )}
          </>
        }
      />
    </PushedPage>
  );
}
