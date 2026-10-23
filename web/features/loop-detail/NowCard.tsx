// The now card of the loop page (spec 5.3): what the loop does now in one sentence, the live output of the run working (or the
// output of the last run), and the link to that run. Its `data-state` is the loop's state on its page, `never` before the first
// Start and `last-failed` while an active loop's last run failed. Every figure comes from the API; the page's clock only counts
// the seconds of the run working.
import { Link } from 'react-router';
import type { LoopDetailDto, RunDto } from '../../../shared/contracts/loops';
import { useRunLogs } from '../../data/history';
import { fmtTime } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Icon } from '../../ui/kit/Icon';
import { useLayout } from '../../ui/kit/Layout';
import { Log } from '../../ui/kit/Log';
import { cursorTime, fmtMmss, fmtRunDuration, fmtStampHm, fmtWaitMinutes, fmtWhen, isRepoMissing, roundList, runEndedAt, secBetween, toLogViewLines } from './format';

/** `14:00`: the hour and minute of an instant in the loop's time zone. */
const hm = (at: Date, tz: string) => fmtTime(at, tz).slice(0, 5);

/** The loop's state on its page: the kinds of the Loops page, plus `stopping` while Stop cancels the run. */
export type PageKind = 'running' | 'active' | 'stopped' | 'server_down' | 'archived' | 'stopping';

export function pageKindOf(loop: LoopDetailDto, stopping: boolean): PageKind {
  if (loop.archivedAt) return 'archived';
  if (loop.activeRun) return stopping ? 'stopping' : 'running';
  if (loop.status === 'active') return 'active';
  return loop.currentExecution?.endReason === 'server_down' ? 'server_down' : 'stopped';
}

function LiveOutput({ run, tz, now, offline }: { run: RunDto; tz: string; now: Date; offline: boolean }) {
  const t = useT();
  const logs = useRunLogs(run.id);
  const paused = offline || logs.mode === 'paused';
  return (
    <Log
      testId="live-log"
      left={t('now.liveOutput')}
      right={t(paused ? 'now.paused' : 'now.following')}
      lines={toLogViewLines(logs.lines, tz, null)}
      live={{ at: cursorTime(now, tz), paused }}
    />
  );
}

function LastOutput({ run, tz }: { run: RunDto; tz: string }) {
  const t = useT();
  const logs = useRunLogs(run.id);
  return <Log testId="last-run-log" left={t('now.lastOutput', { n: run.iteration ?? '' })} lines={toLogViewLines(logs.lines, tz, run.status)} />;
}

export function NowCard({ loop, kind, now, offline }: { loop: LoopDetailDto; kind: PageKind; now: Date; offline: boolean }) {
  const t = useT();
  const phone = useLayout() === 'phone';
  const tz = loop.timezone;
  const exec = loop.currentExecution;
  const run = loop.activeRun;
  const last = loop.lastRun;
  const next = loop.nextRunAt;
  const nextAt = next ? fmtStampHm(next, tz, now) : '-';
  const inT = next ? fmtWaitMinutes(t, secBetween(now, next)) : '';

  let state: string = kind;
  let head: string;
  let sub: string;
  let mark: 'pulse' | 'ok' | 'fail' | null = null;
  let output = null;
  let open: { to: string; label: string } | null = null;
  let repoGone = false;
  if (!exec) {
    state = 'never';
    head = t('now.neverRun');
    sub = t('now.neverRunSub');
  } else if (run) {
    const many = loop.activeRuns.length > 1;
    head =
      kind === 'stopping'
        ? t('now.stopping')
        : many
          ? t('now.workingMany', { c: loop.activeRuns.length, list: roundList(loop.activeRuns) })
          : t('now.working', { n: run.iteration ?? '' });
    sub =
      kind === 'stopping'
        ? t('now.stoppingSub', { n: run.iteration ?? '' })
        : t('now.workingSub', { t: hm(run.startedAt, tz), d: fmtMmss(secBetween(run.startedAt, now)), next: nextAt, in: inT });
    mark = 'pulse';
    output = <LiveOutput run={run} tz={tz} now={now} offline={offline} />;
    open = { to: `/runs/${run.id}`, label: t('now.openRun', { n: run.iteration ?? '' }) };
  } else {
    if (kind === 'active' && last?.status === 'failed') {
      state = 'last-failed';
      head = t('now.lastFailed');
      mark = 'fail';
      repoGone = isRepoMissing(last);
      const ended = runEndedAt(last) ?? last.startedAt;
      sub = t('now.lastFailedSub', {
        n: last.iteration ?? '',
        t: hm(ended, tz),
        d: fmtRunDuration(Math.floor((last.durationMs ?? 0) / 1000)),
        next: nextAt,
      });
    } else if (kind === 'active') {
      head = t('now.waiting');
      sub = t('now.waitingSub', { next: nextAt, in: inT });
      mark = 'ok';
    } else if (kind === 'archived') {
      head = t('now.archived');
      sub = t('now.archivedSub');
    } else if (kind === 'server_down') {
      head = t('now.serverDown');
      sub = t('now.serverDownSub', { k: exec.seq, t: exec.endedAt ? fmtWhen(t, exec.endedAt, tz, now) : '-' });
    } else {
      head = t('now.stopped');
      sub = t('now.stoppedSub', { t: exec.endedAt ? fmtWhen(t, exec.endedAt, tz, now) : '-' });
    }
    if (last) {
      output = <LastOutput run={last} tz={tz} />;
      open = { to: `/runs/${last.id}`, label: kind === 'active' ? t('now.openRun', { n: last.iteration ?? '' }) : t('now.openLastRun') };
    }
  }

  // Open the run, and Open Repos beside it when the repo folder is gone (UC-23).
  const reposLabel = repoGone ? t('act.openRepos') : null;
  const links = !open ? null : phone ? (
    <>
      <Link className="cell is-link" to={open.to}>
        <span className="cell-main">{open.label}</span>
        <Icon name="chev" className="chev" />
      </Link>
      {reposLabel ? (
        <Link className="cell is-link" to="/repos" data-testid="open-repos">
          <span className="cell-main">{reposLabel}</span>
          <Icon name="chev" className="chev" />
        </Link>
      ) : null}
    </>
  ) : (
    <span className="now-actions">
      <Link className="btn" to={open.to}>
        {open.label}
        <Icon name="arrow" />
      </Link>
      {reposLabel ? (
        <Link className="btn" to="/repos" data-testid="open-repos">
          {reposLabel}
        </Link>
      ) : null}
    </span>
  );
  return (
    <div className="card" data-testid="now-card" data-state={state}>
      <div className="now">
        {mark === 'pulse' ? <span className="pulse" /> : mark ? <span className={mark === 'ok' ? 'dot d-ok' : 'dot d-fail'} /> : null}
        <div className="now-text">
          <b>{head}</b>
          {sub}
          {repoGone ? (
            <p className="hint is-err" data-testid="last-run-repo-missing">
              {t.node('now.repoMissing', { path: <span data-raw="">{loop.repo.path}</span> })}
            </p>
          ) : null}
        </div>
        {phone ? null : links}
      </div>
      {output}
      {phone ? links : null}
    </div>
  );
}
