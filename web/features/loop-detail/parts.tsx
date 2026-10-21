// Pieces shared by the 3 detail screens (loop · execution · run): status tag, the ✓ ✗ ⊘ ↷ counters, run table, execution
// table, loading skeleton, not found, copy to clipboard. DOM exactly like the approved preview (design/preview/preview.js: runTag,
// counts, runsTable, execTable, detailSkeleton, notFound) so the app screenshot matches the preview screenshot pixel for pixel.
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ExecutionDto, RunDto } from '../../../shared/contracts/loops';
import type { MessageKey } from '../../prefs/messages';
import { fmtClock, fmtDateTime } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Button, EmptyState, Skeleton, StatusTag } from '../../ui/components';
import { fmtCost, fmtRunDuration, fmtStamp, fmtUptime, runSeconds, secBetween, sidShort, summaryLine } from './format';

export function RunTag({ status, boxed = true }: { status: RunDto['status']; boxed?: boolean }) {
  const t = useT();
  return (
    <StatusTag kind={status} boxed={boxed}>
      {t(`run.status.${status}` as MessageKey)}
    </StatusTag>
  );
}

/** Stop reason of an execution (open -> "running"). */
export function ExecTag({ execution }: { execution: ExecutionDto }) {
  const t = useT();
  if (!execution.endedAt) return <StatusTag kind="active">{t('exec.stillRunning')}</StatusTag>;
  if (execution.endReason === 'server_down') return <StatusTag kind="server_down">{t('reason.server_down')}</StatusTag>;
  return <StatusTag kind="stopped">{t('reason.stopped')}</StatusTag>;
}

/** `✓8 ✗1 ⊘0 ↷0` - succeeded / failed (including timed out, interrupted) / cancelled / skipped. */
export function Counts({ stats }: { stats: ExecutionDto['stats'] }) {
  return (
    <span className="counts">
      <span className="c-ok">✓{stats.succeeded}</span> <span className="c-err">✗{stats.failed}</span> ⊘{stats.cancelled} ↷{stats.skipped}
    </span>
  );
}

/** Small path above the title: every part except the last is a link. */
export function DetailCrumbs({ parts }: { parts: readonly { label: ReactNode; to?: string }[] }) {
  return (
    <div className="crumbs">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ' / '}
          {p.to && i < parts.length - 1 ? <Link to={p.to}>{p.label}</Link> : p.label}
        </Fragment>
      ))}
    </div>
  );
}

/** The loop name is user data - not translated (`data-raw`, e2e UC-18 skips it). */
export const Raw = ({ children }: { children: ReactNode }) => <span data-raw="">{children}</span>;

/**
 * The secondary ↳ line right under a run row (D-UI22...D-UI26): the first line of the summary, hover shows it all (`title`); no
 * summary -> a faded `—`. Text the agent wrote itself - not translated (`data-raw`), the status does not change with the content.
 */
function SummaryRow({ run, onClick }: { run: RunDto; onClick(): void }) {
  const line = summaryLine(run.summary);
  return (
    <tr className="sum-row" onClick={onClick} data-testid="run-sum" data-run-id={run.id}>
      <td className="faint">↳</td>
      {line === null ? (
        <td colSpan={6}>
          <span className="faint">—</span>
        </td>
      ) : (
        <td colSpan={6} title={run.summary ?? ''} data-raw="">
          {line}
        </td>
      )}
    </tr>
  );
}

/**
 * Run table: the run history of a loop (shortened session id) or the runs of one execution (full session id + "copy").
 * `summaries` -> each run gets a ↳ summary line (the Latest run table does not - D-UI22). Clicking a row opens the run detail.
 */
export function RunsTable({ runs, timeZone, now, full, summaries, onCopy, testId }: {
  runs: readonly RunDto[];
  timeZone: string;
  now: Date;
  full?: boolean;
  summaries?: boolean;
  onCopy?(sessionId: string): void;
  testId?: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <table className="table" data-testid={testId}>
      <tbody>
        <tr>
          <th>{t('th.round')}</th>
          <th>{t('th.status')}</th>
          <th>{t('th.trigger')}</th>
          <th>{t('th.started')}</th>
          <th>{t('th.duration')}</th>
          <th>{t('th.cost')}</th>
          <th>{t('th.session')}</th>
        </tr>
        {runs.map((r) => {
          const open = () => navigate(`/runs/${r.id}`);
          const trigger = t(`trigger.${r.trigger}`);
          const start = fmtStamp(r.startedAt, timeZone, now);
          const cls = summaries ? 'has-sum' : undefined;
          const sum = summaries ? <SummaryRow run={r} onClick={open} /> : null;
          if (r.status === 'skipped') {
            return (
              <Fragment key={r.id}>
                <tr className={cls} onClick={open} data-testid="run-row" data-run-id={r.id} data-status={r.status}>
                  <td>—</td>
                  <td>
                    <RunTag status="skipped" />
                  </td>
                  <td>{trigger}</td>
                  <td>{start}</td>
                  <td>—</td>
                  <td>—</td>
                  <td className="faint skip-reason" data-raw="">
                    {r.skipReason ?? ''}
                  </td>
                </tr>
                {sum}
              </Fragment>
            );
          }
          const sec = runSeconds(r, now);
          const dur = sec === null ? '—' : r.status === 'running' ? <StatusTag kind="running">{fmtClock(sec)}</StatusTag> : fmtRunDuration(sec);
          return (
            <Fragment key={r.id}>
              <tr className={cls} onClick={open} data-testid="run-row" data-run-id={r.id} data-status={r.status}>
                <td>#{r.iteration}</td>
                <td>
                  <RunTag status={r.status} />
                </td>
                <td>{trigger}</td>
                <td>{start}</td>
                <td>{dur}</td>
                <td data-testid="run-cost">{fmtCost(r.costUsd)}</td>
                <td data-testid="run-session" data-session-id={r.sessionId ?? ''}>
                  {r.sessionId === null ? (
                    <span className="faint">—</span>
                  ) : full ? (
                    <>
                      {r.sessionId}
                      <span
                        className="copy"
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopy?.(r.sessionId as string);
                        }}
                      >
                        {t('action.copy')}
                      </span>
                    </>
                  ) : (
                    sidShort(r.sessionId)
                  )}
                </td>
              </tr>
              {sum}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** The execution history table of a loop. Clicking a row opens the execution detail. */
export function ExecutionsTable({ executions, timeZone, now, testId }: { executions: readonly ExecutionDto[]; timeZone: string; now: Date; testId?: string }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <table className="table" data-testid={testId}>
      <tbody>
        <tr>
          <th>{t('th.exec')}</th>
          <th>{t('th.endReason')}</th>
          <th>{t('th.started')}</th>
          <th>{t('th.ended')}</th>
          <th>{t('th.uptime')}</th>
          <th>{t('th.rounds')}</th>
          <th>{t('th.sessions')}</th>
        </tr>
        {executions.map((e) => (
          <tr key={e.id} onClick={() => navigate(`/executions/${e.id}`)} data-testid="exec-row" data-execution-id={e.id}>
            <td>#{e.seq}</td>
            <td>
              <ExecTag execution={e} />
            </td>
            <td>{fmtDateTime(e.startedAt, timeZone)}</td>
            <td>{e.endedAt ? fmtDateTime(e.endedAt, timeZone) : '—'}</td>
            <td>{fmtUptime(t, secBetween(e.startedAt, e.endedAt ?? now))}</td>
            <td>
              {e.stats.runs} <Counts stats={e.stats} />
            </td>
            <td>
              <span className="copy">{t('exec.sessionLink', { n: e.stats.sessions })}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SK_A = [62, 48, 70, 55, 40];
const SK_B = [85, 72, 80, 66, 78];
function SkRow({ i }: { i: number }) {
  return (
    <div className="row">
      <Skeleton width={`${SK_A[i % 5]}%`} />
      <Skeleton width={64} />
      <Skeleton width={`${SK_B[i % 5]}%`} />
      <Skeleton width={84} />
    </div>
  );
}

/** Loading a detail screen (preview `loop-loading` / `exec-loading` / `run-loading`). */
export function DetailSkeleton() {
  return (
    <>
      <div className="crumbs" data-testid="detail-loading">
        <Skeleton width={180} />
      </div>
      <div className="ph">
        <Skeleton width={260} size="lg" />
        <span className="spacer" />
        <Skeleton width={160} size="lg" />
      </div>
      <Skeleton width="60%" />
      <div className="kv" style={{ '--kv-cols': 5 } as CSSProperties}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            <Skeleton width="70%" />
            <div className="v big">
              <Skeleton width={80} size="lg" />
            </div>
            <Skeleton width="50%" />
          </div>
        ))}
      </div>
      <Skeleton size="block" />
      <div style={{ border: 'var(--border-w) solid var(--border)' }}>
        {[0, 1, 2, 3].map((i) => (
          <SkRow key={i} i={i} />
        ))}
      </div>
    </>
  );
}

/** Loop / execution / run not found (or another load error - the sentence follows `code`). */
export function DetailNotFound({ code, body, id }: { code: string; body: MessageKey; id: string }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <DetailCrumbs parts={[{ label: t('crumb.loops'), to: '/' }, { label: '?' }]} />
      <EmptyState
        glyph="∅"
        title={t(`error.${code}` as MessageKey)}
        error
        testId="detail-not-found"
        action={<Button onClick={() => navigate('/')}>{t('list.back')}</Button>}
      >
        {t.node(body, { id: <span className="mono">{id}</span> })}
      </EmptyState>
    </>
  );
}

/** Copy text to the clipboard (new API; if the browser blocks it, the old way). Returns `true` when copied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
