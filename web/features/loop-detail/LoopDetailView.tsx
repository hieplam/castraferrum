// Loop detail screen `/loops/:id` (UC-06, UC-11 · the approved preview `loop-*`): page header (name, status, Start / Stop,
// Edit, ...), figures of the current execution (including the longest execution), the running run + live log, the latest run, the execution
// history, the paginated run history, the configuration. Every figure comes from the API (`useLoop`...); the web only computes "now - start"
// for the second-by-second clock. Live events reload by themselves (web/data/live-sync.ts); the log follows the SSE stream (`useRunLogs`).
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { describe } from '../../../shared/domain/schedule';
import type { LoopDetailDto, RunDto } from '../../../shared/contracts/loops';
import { isApiError } from '../../api/loops-api';
import { useConnection, useNow } from '../../data/connection';
import { useLoopExecutions, useLoopRuns, useRunLogs } from '../../data/history';
import { useLoop } from '../../data/loops';
import { useRepos } from '../../data/repos';
import { fmtClock, fmtDateTime, fmtDurationShort, fmtNumber, fmtRelative } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Button, Note, SectionTitle, StatusTag } from '../../ui/components';
import { DropMenu } from '../../ui/DropMenu';
import { KvCell, KvGrid } from '../../ui/KvGrid';
import { LogView } from '../../ui/LogView';
import { useLoopActions, type LoopActions } from './actions';
import {
  cursorTime,
  executorSummary,
  fmtMmss,
  fmtStamp,
  fmtStampHm,
  fmtTimeout,
  fmtUptime,
  isRepoMissing,
  roundList,
  secBetween,
  toLogViewLines,
} from './format';
import { Counts, DetailCrumbs, DetailNotFound, DetailSkeleton, ExecutionsTable, Raw, RunsTable, RunTag, copyText } from './parts';
import { useToast } from '../../ui/toast';

/** Runs per page of the run history (preview: "1-10 / 69"). */
export const RUNS_PAGE = 10;

export function scheduleText(cron: string, lang: 'vi' | 'en'): string {
  try {
    return describe(cron, lang);
  } catch {
    return cron;
  }
}

export function LoopDetailView({ id }: { id: string }) {
  const q = useLoop(id);
  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) return <DetailNotFound code={isApiError(q.error) ? q.error.code : 'NETWORK'} body="notFound.loop.body" id={id} />;
  return <LoopDetailBody loop={q.data} />;
}

function LoopDetailBody({ loop }: { loop: LoopDetailDto }) {
  const t = useT();
  const now = useNow(1_000);
  const offline = useConnection().status === 'down';
  const actions = useLoopActions(loop, now);
  const exec = loop.currentExecution;
  const run = loop.activeRun;
  const last = loop.lastRun;
  const serverDown = !loop.archivedAt && loop.status === 'stopped' && exec?.endReason === 'server_down';
  return (
    <>
      <LoopHeader loop={loop} now={now} offline={offline} actions={actions} />
      {actions.stopping && run && exec && (
        <div className="banner inset is-warn" role="status" data-testid="stopping-banner">
          <span className="txt">{t('stopping.hint', { n: run.iteration ?? '', k: exec.seq })}</span>
        </div>
      )}
      {loop.archivedAt && <Note glyph="▤">{t('archived.banner')}</Note>}
      {serverDown && exec?.endedAt && (
        <div className="banner inset is-err" role="alert" data-testid="server-down-banner">
          <span className="txt">■ {t('serverDown.banner', { k: exec.seq, t: fmtDateTime(exec.endedAt, loop.timezone) })}</span>
        </div>
      )}
      <LoopKv loop={loop} now={now} />
      {!exec ? (
        <Note glyph="▶">{t('neverRun.body')}</Note>
      ) : run ? (
        <LiveRun loop={loop} run={run} offline={offline} now={now} />
      ) : loop.status === 'active' && loop.nextRunAt ? (
        <>
          <SectionTitle title={t('section.liveRun')} />
          <Note glyph="◷">
            {t('idle.noRun', { at: fmtStampHm(loop.nextRunAt, loop.timezone, now), rel: fmtRelative(t, secBetween(now, loop.nextRunAt)) })}
          </Note>
        </>
      ) : null}
      {last && (!run || last.status === 'failed') && <LastRun loop={loop} run={last} now={now} />}
      {exec && <Histories loop={loop} now={now} />}
      <ConfigBlock loop={loop} />
      {actions.dialog}
    </>
  );
}

function LoopHeader({ loop, now, offline, actions }: { loop: LoopDetailDto; now: Date; offline: boolean; actions: LoopActions }) {
  const t = useT();
  const navigate = useNavigate();
  const run = loop.activeRun;
  const exec = loop.currentExecution;
  const off = offline || undefined;
  const edit = (
    <>
      <Button disabled={off} onClick={() => navigate(`/loops/${loop.id}/edit`)} data-testid="loop-edit">
        {t('action.edit')}
      </Button>
      <LoopMenu loop={loop} actions={actions} disabled={offline} />
    </>
  );
  let status;
  let buttons;
  if (actions.stopping && run) {
    status = <StatusTag kind="cancelled" pulse>{t('loop.stoppingNow', { n: run.iteration ?? '' })}</StatusTag>;
    buttons = (
      <>
        {edit}
        <Button variant="danger" disabled data-testid="loop-stop">
          {t('action.stopping')}
        </Button>
      </>
    );
  } else if (loop.archivedAt) {
    status = <StatusTag kind="archived">{t('loop.status.archived')}</StatusTag>;
    buttons = (
      <>
        <LoopMenu loop={loop} actions={actions} disabled={offline} />
        <Button disabled data-testid="loop-start">
          {t('action.start')}
        </Button>
        <Button variant="primary" disabled={off || actions.busy} onClick={() => actions.run('restore')} data-testid="loop-restore">
          {t('action.restore')}
        </Button>
      </>
    );
  } else if (loop.status === 'active') {
    status = loop.activeRuns.length > 1 ? (
      // several parallel runs -> count + the iterations (newest first)
      <StatusTag kind="running" pulse>
        {t('loop.runningMany', { c: loop.activeRuns.length, list: roundList(loop.activeRuns) })}
      </StatusTag>
    ) : run ? (
      <StatusTag kind="running" pulse>
        {t('loop.runningNow', { n: run.iteration ?? '', t: fmtClock(secBetween(run.startedAt, now)) })}
      </StatusTag>
    ) : (
      <StatusTag kind="active">{t('loop.idleNext', { at: loop.nextRunAt ? fmtStampHm(loop.nextRunAt, loop.timezone, now) : '—' })}</StatusTag>
    );
    buttons = (
      <>
        {edit}
        <Button variant="danger" disabled={off || actions.stopping} onClick={actions.requestStop} data-testid="loop-stop">
          {actions.stopping ? t('action.stopping') : t('action.stop')}
        </Button>
      </>
    );
  } else {
    status =
      exec?.endReason === 'server_down' ? (
        <StatusTag kind="server_down">{t('loop.status.server_down')}</StatusTag>
      ) : (
        <StatusTag kind="stopped">{t('loop.status.stopped')}</StatusTag>
      );
    buttons = (
      <>
        {edit}
        <Button variant="primary" disabled={off || actions.busy} onClick={() => actions.run('start')} data-testid="loop-start">
          {t('action.start')}
        </Button>
      </>
    );
  }
  const meta = [scheduleText(loop.cron, t.lang), loop.timezone, t('loop.meta.timeout', { d: fmtTimeout(t, loop.timeoutSec) }), executorSummary(t, loop.executor.kind, loop.executor.config)];
  if (loop.maxConcurrent > 1) meta.push(t('loop.meta.concurrent', { n: loop.maxConcurrent }));
  return (
    <>
      <DetailCrumbs parts={[{ label: t('crumb.loops'), to: '/' }, { label: <Raw>{loop.name}</Raw> }]} />
      <div className="ph" data-testid="loop-header" data-status={loop.archivedAt ? 'archived' : loop.status}>
        <h1 data-raw="">{loop.name}</h1>
        {status}
        <span className="spacer" />
        {buttons}
      </div>
      <div className="ph-sub">
        {loop.description && (
          <>
            <Raw>{loop.description}</Raw>
            {' · '}
          </>
        )}
        <span className="mono">
          <RepoTag name={loop.repo.name} />
          {` · ${meta.join(' · ')}`}
        </span>
      </div>
    </>
  );
}

function LoopMenu({ loop, actions, disabled }: { loop: LoopDetailDto; actions: LoopActions; disabled: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const active = loop.status === 'active';
  return (
    <DropMenu
      label="⋯"
      disabled={disabled}
      testId="loop-menu"
      items={[
        { label: t('menu.edit'), onSelect: () => navigate(`/loops/${loop.id}/edit`), testId: 'menu-edit' },
        { label: t('menu.duplicate'), onSelect: () => actions.run('duplicate'), testId: 'menu-duplicate' },
        { kind: 'separator' },
        loop.archivedAt
          ? { label: t('menu.restore'), onSelect: () => actions.run('restore'), testId: 'menu-restore' }
          : active
            ? { label: t('menu.archiveBlocked'), onSelect: () => undefined, disabled: true, testId: 'menu-archive' }
            : { label: t('menu.archive'), onSelect: () => actions.run('archive'), testId: 'menu-archive' },
      ]}
    />
  );
}

function LoopKv({ loop, now }: { loop: LoopDetailDto; now: Date }) {
  const t = useT();
  const ex = loop.currentExecution;
  if (!ex) {
    const none = t('kv.none');
    return (
      <KvGrid cols={5} testId="loop-kv">
        <KvCell label={t('kv.exec')} value={none} />
        <KvCell label={t('kv.rounds')} value={none} />
        <KvCell label={t('kv.next')} value={none} sub={t('kv.nextNone')} />
        <KvCell label={t('kv.avg')} value={none} />
        <KvCell label={t('kv.longest')} value={none} />
      </KvGrid>
    );
  }
  const running = !ex.endedAt;
  const tz = loop.timezone;
  const longest = loop.longestExecution;
  // The longest execution while open -> a per-second clock like the first box; once closed -> the server's figure.
  const longestSec = longest
    ? longest.executionId === ex.id && running
      ? secBetween(ex.startedAt, now)
      : Math.floor(longest.elapsedMs / 1000)
    : null;
  return (
    <KvGrid cols={5} testId="loop-kv">
      <KvCell
        testId="kv-exec"
        label={t(running ? 'kv.execRunning' : 'kv.execEnded', { k: ex.seq })}
        value={fmtUptime(t, secBetween(ex.startedAt, ex.endedAt ?? now))}
        sub={running ? t('kv.since', { t: fmtStamp(ex.startedAt, tz, now) }) : t('kv.until', { a: fmtDateTime(ex.startedAt, tz), b: fmtDateTime(ex.endedAt as Date, tz) })}
      />
      <KvCell testId="kv-rounds" label={t('kv.rounds')} value={ex.stats.runs} sub={<Counts stats={ex.stats} />} />
      <KvCell
        testId="kv-next"
        label={t('kv.next')}
        value={loop.nextRunAt ? fmtStampHm(loop.nextRunAt, tz, now) : t('kv.none')}
        sub={loop.nextRunAt ? fmtRelative(t, secBetween(now, loop.nextRunAt)) : t('kv.nextNone')}
      />
      <KvCell
        testId="kv-avg"
        label={t('kv.avg')}
        value={ex.stats.avgDurationMs === null ? t('kv.none') : fmtMmss(ex.stats.avgDurationMs / 1000)}
        sub={t('kv.avgSub', { n: ex.stats.runs - ex.stats.running })}
      />
      <KvCell
        testId="kv-longest"
        label={t('kv.longest')}
        value={longestSec === null ? t('kv.none') : fmtDurationShort(t, longestSec)}
        sub={longest ? t('kv.longestSub', { k: longest.seq, e: loop.executionCount, r: loop.iterations }) : ''}
      />
    </KvGrid>
  );
}

function LiveRun({ loop, run, offline, now }: { loop: LoopDetailDto; run: RunDto; offline: boolean; now: Date }) {
  const t = useT();
  const logs = useRunLogs(run.id);
  const paused = offline || logs.mode === 'paused';
  return (
    <>
      <SectionTitle title={t('section.liveRun')} extra={`${t('log.round', { n: run.iteration ?? '' })} · ${run.sessionId ?? '—'}`} />
      <LogView
        testId="live-log"
        left={t('log.live')}
        right={paused ? t('log.paused') : t('log.following')}
        lines={toLogViewLines(logs.lines, loop.timezone, null)}
        live
        paused={paused}
        cursorAt={cursorTime(now, loop.timezone)}
      />
    </>
  );
}

function LastRun({ loop, run, now }: { loop: LoopDetailDto; run: RunDto; now: Date }) {
  const t = useT();
  const repoMissing = isRepoMissing(run);
  const toast = useToast();
  const navigate = useNavigate();
  const failed = run.status === 'failed';
  const logs = useRunLogs(failed ? null : run.id);
  const copy = (sid: string) => void copyText(sid).then((ok) => ok && toast.show(t('toast.copied', { n: 1 })));
  return (
    <>
      <SectionTitle title={t('section.lastRun')} />
      <RunsTable runs={[run]} timeZone={loop.timezone} now={now} full onCopy={copy} testId="last-run" />
      {failed ? (
        <div className="banner inset is-err" role="alert" data-testid="last-run-failed">
          <span className="txt">
            ✗ {t('run.err.failed', { msg: run.error ?? '' })} — {t('lastRun.failedNote')}
          </span>
          <span className="copy" role="link" onClick={() => navigate(`/runs/${run.id}`)}>
            {t('lastRun.open')}
          </span>
        </div>
      ) : null}
      {failed && repoMissing && (
        <div className="hint" data-testid="last-run-repo-missing">
          {t('run.repoMissing.hint')}{' '}
          <span className="copy" role="link" onClick={() => navigate('/repos')} data-testid="open-repos">
            {t('run.repoMissing.open')}
          </span>
        </div>
      )}
      {failed ? null : (
        <LogView
          testId="last-run-log"
          left={`${t('log.round', { n: run.iteration ?? '' })} · ${t('log.saved', { n: logs.lines.length })}`}
          right={<RunTag status={run.status} boxed={false} />}
          lines={toLogViewLines(logs.lines, loop.timezone, run.status).slice(-5)}
        />
      )}
    </>
  );
}

function Histories({ loop, now }: { loop: LoopDetailDto; now: Date }) {
  const t = useT();
  const execs = useLoopExecutions(loop.id);
  const runs = useLoopRuns(loop.id, RUNS_PAGE);
  const [page, setPage] = useState(0);
  const executions = execs.data?.pages.flatMap((p) => p.items) ?? [];
  const pages = runs.data?.pages ?? [];
  const current = Math.min(page, Math.max(0, pages.length - 1));
  const items = pages[current]?.items ?? [];
  const hasNext = current < pages.length - 1 || runs.hasNextPage;
  const next = () => {
    if (current + 1 >= pages.length) void runs.fetchNextPage().then(() => setPage(current + 1));
    else setPage(current + 1);
  };
  const from = current * RUNS_PAGE + 1;
  return (
    <>
      <SectionTitle title={t('section.executions')} />
      <ExecutionsTable executions={executions} timeZone={loop.timezone} now={now} testId="exec-table" />
      {execs.hasNextPage && (
        <div className="pager">
          {t('pager.range', { a: 1, b: executions.length, n: fmtNumber(t.lang, loop.executionCount) })}{' '}
          <Button icon onClick={() => void execs.fetchNextPage()} data-testid="exec-more">
            ›
          </Button>
        </div>
      )}
      <SectionTitle title={t('section.runs')} extra={t('runs.sumHint')} />
      <RunsTable runs={items} timeZone={loop.timezone} now={now} summaries testId="runs-table" />
      <div className="pager" data-testid="runs-pager">
        {t('pager.range', { a: items.length ? from : 0, b: from + items.length - 1, n: fmtNumber(t.lang, loop.runCount) })}{' '}
        <Button icon disabled={current === 0} onClick={() => setPage(current - 1)} data-testid="runs-prev">
          ‹
        </Button>
        <Button icon disabled={!hasNext || runs.isFetchingNextPage} onClick={next} data-testid="runs-next">
          ›
        </Button>
      </div>
    </>
  );
}

/** Repo name (`▣ Atlas`, D-UI15) - user data, not translated. */
export function RepoTag({ name }: { name: string }) {
  return (
    <span className="repo-tag" data-raw="" data-testid="repo-tag">
      {name}
    </span>
  );
}

function ConfigBlock({ loop }: { loop: LoopDetailDto }) {
  const t = useT();
  const tz = loop.timezone;
  // D-UI11: whether the folder still exists - taken from the repo list (`GET /api/repos`), never asking the file system itself.
  const gone = useRepos().data?.find((r) => r.id === loop.repo.id)?.exists === false;
  return (
    <>
      <SectionTitle title={t('section.config')} />
      <KvGrid cols={3} testId="loop-config">
        <KvCell
          big={false}
          testId="config-repo"
          label={t('config.repo')}
          value={<RepoTag name={loop.repo.name} />}
          sub={
            <>
              <span className="mono" data-raw="">
                {loop.repo.path}
              </span>
              {gone && (
                <>
                  {' · '}
                  <span className="hint is-warn" data-testid="config-repo-gone">
                    {t('repo.gone')}
                  </span>
                </>
              )}
            </>
          }
        />
        <KvCell
          big={false}
          label={t('config.executor')}
          value={executorSummary(t, loop.executor.kind, loop.executor.config)}
          sub={loop.maxConcurrent > 1 ? t('loop.meta.concurrent', { n: loop.maxConcurrent }) : undefined}
          testId="config-executor"
        />
        <KvCell
          big={false}
          testId="config-timeout"
          label={t('config.timeout')}
          value={fmtTimeout(t, loop.timeoutSec)}
          sub={loop.timeoutSec === null ? t('config.timeoutNone') : `${fmtNumber(t.lang, loop.timeoutSec)} ${t('form.unit.sec')}`}
        />
        <KvCell
          big={false}
          label={t('config.schedule')}
          value={scheduleText(loop.cron, t.lang)}
          sub={
            <>
              {t('config.cron')} <span className="mono">{loop.cron}</span>
            </>
          }
        />
        <KvCell big={false} label={t('config.tz')} value={tz} />
        <KvCell big={false} label={t('config.created')} value={fmtDateTime(loop.createdAt, tz)} sub={`${t('config.updated')} ${fmtDateTime(loop.updatedAt, tz)}`} />
      </KvGrid>
      <div className="label">{t('config.prompt')}</div>
      <div className="code" data-raw="" data-testid="loop-prompt">
        {loop.prompt}
      </div>
    </>
  );
}
