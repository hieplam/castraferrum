// The active period page of the new UI (spec 5.4, `/executions/:id`; the API keeps the name execution): its number and state, when
// it started and ended, how long it lasted, its runs with their counts as words, "Copy N session ids" (the API's `sessionIds`, in
// run order, also over plain HTTP: D15), and every run of the period with its session id. No developer line names
// the API call.
import type { ExecutionDetailDto, LoopDetailDto } from '../../../shared/contracts/loops';
import { useNow } from '../../data/connection';
import { useExecution } from '../../data/history';
import { useLoop } from '../../data/loops';
import { useT } from '../../prefs/prefs';
import { Button } from '../../ui/kit/Button';
import { copyText } from '../../ui/kit/copy';
import { useLayout } from '../../ui/kit/Layout';
import { Pill } from '../../ui/kit/Pill';
import { useToast } from '../../ui/toast';
import { Stat, Stats } from './Figures';
import { fmtSpan, fmtWhen, secBetween } from './format';
import { countWords, periodSpanText } from './period-text';
import { errorTitle, PageNotFound, PageSkeleton, PushedPage } from './PushedPage';
import { RunCell } from './RunCell';

function PeriodPill({ e }: { e: ExecutionDetailDto }) {
  const t = useT();
  if (!e.endedAt) return <Pill tone="run" testId="period-status">{t('period.pill.active')}</Pill>;
  return e.endReason === 'server_down' ? (
    <Pill tone="int" testId="period-status">
      {t('period.pill.byServer')}
    </Pill>
  ) : (
    <Pill tone="stop" testId="period-status">
      {t('period.pill.byYou')}
    </Pill>
  );
}

function PeriodBody({ e, loop }: { e: ExecutionDetailDto; loop: LoopDetailDto }) {
  const t = useT();
  const now = useNow(1_000);
  const toast = useToast();
  const phone = useLayout() === 'phone';
  const tz = loop.timezone;
  const runs = [...e.runs].reverse(); // the API lists them oldest first; the page newest first, like every list of runs
  const n = e.sessionIds.length;
  const copyAll = () => void copyText(e.sessionIds.join('\n')).then((ok) => ok && toast.show(t.tn('period.copied', n)));
  return (
    <PushedPage back={{ to: `/loops/${loop.id}`, label: <span data-raw="">{loop.name}</span>, testId: 'back-to-loop' }} testId="period-page">
      <div className="page-head" data-testid="exec-header" data-ended={String(e.endedAt !== null)}>
        <h1 className="page-title">
          {t('period.title', { k: e.seq })}
          {phone ? null : <PeriodPill e={e} />}
        </h1>
      </div>
      <div className="page-meta">
        {phone ? <PeriodPill e={e} /> : null}
        {periodSpanText(t, e, tz, now)}
      </div>
      <Stats testId="period-figures">
        <Stat label={t('period.started')} value={fmtWhen(t, e.startedAt, tz, now)} />
        <Stat
          label={t('period.ended')}
          value={e.endedAt ? fmtWhen(t, e.endedAt, tz, now, e.startedAt) : '-'}
          sub={e.endedAt ? undefined : t('period.stillActive')}
        />
        <Stat label={t('period.lasted')} value={fmtSpan(t, secBetween(e.startedAt, e.endedAt ?? now))} />
        <Stat label={t('period.runsLabel')} value={e.stats.runs} sub={countWords(t, e.stats)} />
      </Stats>
      <div className="page-head">
        <Button icon="copy" onClick={copyAll} disabled={n === 0} data-testid="copy-all">
          {t.tn('period.copyIds', n)}
        </Button>
      </div>
      <div className="group" data-testid="exec-runs">
        {runs.map((r) => (
          <RunCell key={r.id} run={r} tz={tz} now={now} session />
        ))}
      </div>
    </PushedPage>
  );
}

function WithLoop({ e }: { e: ExecutionDetailDto }) {
  const t = useT();
  const loop = useLoop(e.loopId);
  if (loop.isPending) return <PageSkeleton />;
  if (loop.isError) return <PageNotFound title={errorTitle(t, loop.error, 'error.LOOP_NOT_FOUND')} />;
  return <PeriodBody e={e} loop={loop.data} />;
}

export function PeriodView({ id }: { id: string }) {
  const t = useT();
  const q = useExecution(id);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <PageNotFound title={errorTitle(t, q.error, 'period.notFound')} />;
  return <WithLoop e={q.data} />;
}
