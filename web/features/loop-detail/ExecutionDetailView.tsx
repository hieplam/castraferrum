// Execution detail screen `/executions/:id` (UC-08 · the approved preview `exec-*`): start time, stop time, how long it ran, the stop reason,
// iteration count; a table of EVERY run of the execution with the full session id; copy the whole session id list in one click. The list
// is the verbatim `sessionIds` of `GET /api/executions/:id` (= SELECT session_id ... ORDER BY started_at) - never regrouped.
import { useNavigate } from 'react-router';
import type { ExecutionDetailDto, LoopDetailDto } from '../../../shared/contracts/loops';
import { isApiError } from '../../api/loops-api';
import { useNow } from '../../data/connection';
import { useExecution } from '../../data/history';
import { useLoop } from '../../data/loops';
import { fmtDateTime } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Button, SectionTitle, StatusTag } from '../../ui/components';
import { KvCell, KvGrid } from '../../ui/KvGrid';
import { useToast } from '../../ui/toast';
import { fmtUptime, secBetween } from './format';
import { RepoTag, scheduleText } from './LoopDetailView';
import { Counts, DetailCrumbs, DetailNotFound, DetailSkeleton, ExecTag, Raw, RunsTable, copyText } from './parts';

export function ExecutionDetailView({ id }: { id: string }) {
  const q = useExecution(id);
  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) return <DetailNotFound code={isApiError(q.error) ? q.error.code : 'NETWORK'} body="notFound.exec.body" id={id} />;
  return <WithLoop execution={q.data} />;
}

function WithLoop({ execution }: { execution: ExecutionDetailDto }) {
  const loop = useLoop(execution.loopId);
  if (loop.isPending) return <DetailSkeleton />;
  if (loop.isError) return <DetailNotFound code={isApiError(loop.error) ? loop.error.code : 'NETWORK'} body="notFound.loop.body" id={execution.loopId} />;
  return <ExecutionDetailBody execution={execution} loop={loop.data} />;
}

function ExecutionDetailBody({ execution: e, loop }: { execution: ExecutionDetailDto; loop: LoopDetailDto }) {
  const t = useT();
  const now = useNow(1_000);
  const navigate = useNavigate();
  const toast = useToast();
  const tz = loop.timezone;
  const n = e.sessionIds.length;
  const runs = [...e.runs].reverse(); // API: oldest first; table: newest first like the run history
  const copyAll = () => void copyText(e.sessionIds.join('\n')).then((ok) => ok && toast.show(t('toast.copied', { n })));
  const copyOne = (sid: string) => void copyText(sid).then((ok) => ok && toast.show(t('toast.copied', { n: 1 })));
  const title = t('exec.title', { k: e.seq });
  const endSub = !e.endedAt ? t('exec.stillRunning') : e.endReason === 'server_down' ? t('exec.heartbeat') : t('exec.byUser');
  return (
    <>
      <DetailCrumbs parts={[{ label: t('crumb.loops'), to: '/' }, { label: <Raw>{loop.name}</Raw>, to: `/loops/${loop.id}` }, { label: title }]} />
      <div className="ph" data-testid="exec-header" data-ended={e.endReason ?? 'open'}>
        <h1>{title}</h1>
        {e.endedAt ? <ExecTag execution={e} /> : <StatusTag kind="active">{t('loop.status.active')}</StatusTag>}
        <span className="spacer" />
        <Button variant="primary" onClick={copyAll} disabled={n === 0} data-testid="copy-all">
          {t('exec.copyAll', { n })}
        </Button>
        <Button onClick={() => navigate(`/loops/${loop.id}`)} data-testid="back-to-loop">
          {t('action.backToLoop')}
        </Button>
      </div>
      <div className="ph-sub">
        <Raw>{loop.name}</Raw> ·{' '}
        <span className="mono">
          <RepoTag name={loop.repo.name} />
          {` · ${scheduleText(loop.cron, t.lang)} · ${tz}`}
        </span>
      </div>
      {e.endReason === 'server_down' && e.endedAt && (
        <div className="banner inset is-err" role="alert" data-testid="server-down-banner">
          <span className="txt">■ {t('serverDown.banner', { k: e.seq, t: fmtDateTime(e.endedAt, tz) })}</span>
        </div>
      )}
      <KvGrid cols={5} testId="exec-kv">
        <KvCell big={false} label={t('exec.startedAt')} value={fmtDateTime(e.startedAt, tz)} />
        <KvCell big={false} label={t('exec.endedAt')} value={e.endedAt ? fmtDateTime(e.endedAt, tz) : t('kv.none')} sub={endSub} />
        <KvCell label={t('exec.uptime')} value={fmtUptime(t, secBetween(e.startedAt, e.endedAt ?? now))} />
        <KvCell big={false} label={t('exec.endReason')} value={e.endedAt ? <ExecTag execution={e} /> : t('kv.none')} />
        <KvCell label={t('exec.rounds')} value={e.stats.runs} sub={<Counts stats={e.stats} />} />
      </KvGrid>
      <SectionTitle title={t('section.execRuns')} extra={`${t('exec.sessionCount', { n })} · ${t('runs.sumHint')}`} />
      <RunsTable runs={runs} timeZone={tz} now={now} full summaries onCopy={copyOne} testId="exec-runs" />
      <div className="hint mono" data-testid="exec-api">
        {t('exec.api', { id: e.id, n })}
      </div>
    </>
  );
}
