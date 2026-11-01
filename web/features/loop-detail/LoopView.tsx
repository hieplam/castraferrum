// The loop page of the new UI (spec 5.3, `d-loop-*`, `m-loop-*`): the name, its status and repo; the now card; the four figures;
// Recent runs grouped by active period; the settings (a side card from 1024px; a cell on the phone, with All runs). The main
// action (Stop loop, Start or Restore) sits in the head from 640px and in the action bar on the phone; Edit and the `⋯` menu
// (Duplicate, Archive) sit in the head, or in the navigation bar on the phone. Data comes from web/data, the actions from the
// hook the Loops page uses (Stop asks first only while a run is working, D29).
import { Link, useNavigate } from 'react-router';
import type { ProbeDto } from '../../../shared/contracts/goal-loop';
import type { LoopDetailDto } from '../../../shared/contracts/loops';
import { PROBE_EVERY_SEC } from '../../../shared/domain/goal-loop';
import { useNow, useSharedServerStatus } from '../../data/connection';
import { useLoop } from '../../data/loops';
import { useHolds, useProbe, useReadNoticesOf } from '../../data/probe';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button, IconButton } from '../../ui/kit/Button';
import { Icon } from '../../ui/kit/Icon';
import { ActionBar, Cols, useLayout } from '../../ui/kit/Layout';
import { Menu } from '../../ui/kit/Overlay';
import { Pill, type PillTone } from '../../ui/kit/Pill';
import { StopSheet } from '../loop-list/StopSheet';
import { useLoopActions, type LoopActions } from '../loop-list/use-loop-actions';
import { Figures } from './Figures';
import { executorSummary, fmtSpan, scheduleSentence } from './format';
import { SettingsCard } from './LoopSettingsView';
import { NowCard, pageKindOf, type PageKind } from './NowCard';
import { HoldBanner, ProbeExtra, probeContext, probeKindOf } from './ProbeNow';
import { errorTitle, PageNotFound, PageSkeleton, PushedPage, useBackToLoops } from './PushedPage';
import { RecentRuns } from './RecentRuns';

/** The pill of the loop's state, and its `data-status` (the loop kinds of spec 7.1: `cancelled` while stopping). */
const PILL: Record<PageKind, readonly [PillTone, MessageKey, string]> = {
  running: ['run', 'status.running', 'running'],
  active: ['wait', 'status.waiting', 'active'],
  stopped: ['stop', 'status.stopped', 'stopped'],
  server_down: ['int', 'status.serverDown', 'server_down'],
  archived: ['stop', 'status.archived', 'archived'],
  stopping: ['run', 'status.stopping', 'cancelled'],
  waiting: ['warn', 'goalLoop.loop.waiting', 'waiting'],
  blocked: ['fail', 'goalLoop.loop.blocked', 'blocked'],
  held: ['int', 'goalLoop.loop.held', 'held'],
  budget_limited: ['warn', 'goalLoop.loop.budgetLimited', 'budget_limited'],
  complete: ['ok', 'goalLoop.loop.complete', 'complete'],
  probe_failed: ['fail', 'goalLoop.loop.probeFailed', 'probe_failed'],
};

export function LoopView({ id }: { id: string }) {
  const t = useT();
  const q = useLoop(id);
  const probe = useProbe(id);
  if (q.isPending || probe.isPending) return <PageSkeleton />;
  if (q.isError) return <PageNotFound title={errorTitle(t, q.error, 'error.LOOP_NOT_FOUND')} />;
  return <LoopBody loop={q.data} probe={probe.data ?? null} />;
}

/** The main action: Stop loop while the loop is active, Start when it is stopped, Restore when it is archived. */
function MainAction({ loop, kind, actions }: { loop: LoopDetailDto; kind: PageKind; actions: LoopActions }) {
  const t = useT();
  const phone = useLayout() === 'phone';
  const size = phone ? { size: 'lg' as const, block: true } : {};
  const busy = actions.isBusy(loop.id);
  if (kind === 'archived') {
    return (
      <Button variant="primary" icon="restore" {...size} disabled={busy} onClick={() => actions.run('restore', loop.id)} data-testid="loop-restore">
        {t('act.restore')}
      </Button>
    );
  }
  if (kind === 'stopped' || kind === 'server_down' || kind === 'complete') {
    return (
      <Button variant="primary" icon="play" {...size} disabled={busy} onClick={() => actions.run('start', loop.id)} data-testid="loop-start">
        {t('act.start')}
      </Button>
    );
  }
  return (
    <Button variant="danger" icon="stop" {...size} disabled={kind === 'stopping' || busy} onClick={() => actions.requestStop(loop)} data-testid="loop-stop">
      {t('act.stopLoop')}
    </Button>
  );
}

/** The `⋯` of the loop page: Duplicate, then Archive (locked while the loop is active) or Restore. */
function LoopMenu({ loop, actions }: { loop: LoopDetailDto; actions: LoopActions }) {
  const t = useT();
  const phone = useLayout() === 'phone';
  const active = loop.status === 'active';
  const items = [
    { id: 'duplicate', label: t('act.duplicate'), testId: 'menu-duplicate', onSelect: () => actions.run('duplicate', loop.id) },
    loop.archivedAt
      ? { id: 'restore', label: t('act.restore'), testId: 'menu-restore', onSelect: () => actions.run('restore', loop.id) }
      : {
          id: 'archive',
          label: t(active ? 'act.archiveLocked' : 'act.archive'),
          testId: 'menu-archive',
          disabled: active,
          onSelect: () => actions.run('archive', loop.id),
        },
  ];
  return (
    <Menu
      label={t('act.more')}
      items={items}
      phoneSheet="items"
      trigger={(p) => <IconButton icon="more" label={t('act.more')} bordered={!phone} tooltip={phone ? false : 'below-end'} data-testid="loop-menu" {...p} />}
    />
  );
}

function LoopBody({ loop, probe }: { loop: LoopDetailDto; probe: ProbeDto | null }) {
  const t = useT();
  const navigate = useNavigate();
  const phone = useLayout() === 'phone';
  const now = useNow(1_000);
  const offline = useSharedServerStatus().server === 'down';
  const actions = useLoopActions();
  const back = useBackToLoops();
  const holds = useHolds(probe !== null);
  useReadNoticesOf(loop.id, probe !== null);
  const kind = pageKindOf(loop, actions.isStopping(loop.id), probe);
  const probeKind = probeKindOf(probe);
  const ctx = probe ? probeContext(probe, holds.data) : null;
  // A loop that the goal stopped keeps no live figures; every other state of a probe is live (the loop is active).
  const live = kind === 'running' || kind === 'active' || kind === 'stopping' || (probe !== null && probeKind !== null && kind === probeKind && kind !== 'complete');
  const top = ctx ? <HoldBanner holds={holds.data} tz={loop.timezone} /> : null;
  const [tone, key, status] = PILL[kind];
  const pill = (
    <Pill tone={tone} testId="loop-status" status={status}>
      {t(key)}
    </Pill>
  );
  const name = <span data-raw="">{loop.name}</span>;
  const edit = (
    <Button variant={phone ? 'plain' : 'default'} onClick={() => navigate(`/loops/${loop.id}/edit`)} data-testid="loop-edit">
      {t('act.edit')}
    </Button>
  );
  const menu = <LoopMenu loop={loop} actions={actions} />;
  const desc = loop.description ? (
    <p className="page-desc" data-raw="">
      {loop.description}
    </p>
  ) : null;
  const now_ = <NowCard loop={loop} kind={kind} now={now} offline={offline} probe={ctx} />;
  const extra = ctx ? <ProbeExtra kind={kind === probeKind ? probeKind : null} ctx={ctx} exec={loop.currentExecution} tz={loop.timezone} now={now} /> : null;
  const figures = <Figures loop={loop} live={live} now={now} goals={ctx?.reading.line?.goals ?? null} />;
  const schedule = probe ? t('goalLoop.probe.every', { s: PROBE_EVERY_SEC }) : scheduleSentence(loop.cron, t.lang);
  const recent = <RecentRuns loop={loop} now={now} />;
  const stop = actions.confirmId ? <StopSheet loop={loop} onCancel={actions.cancelStop} onConfirm={actions.confirmStop} /> : null;

  if (phone) {
    const limit = loop.timeoutSec === null ? t('loopSettings.noLimitShort') : t('loopSettings.limitShort', { d: fmtSpan(t, loop.timeoutSec) });
    return (
      <PushedPage
        back={back}
        actions={
          <>
            {edit}
            {menu}
          </>
        }
        testId="loop-page"
        top={top}
      >
        <div className="page-head" data-testid="loop-header" data-status={status}>
          <h1 className="page-title">{name}</h1>
        </div>
        <div className="page-meta">
          {pill}
          {/* The separator belongs to the part after it: a wrap never leaves it at the end of a line. */}
          <span>
            <span data-raw="" data-testid="loop-repo">
              {loop.repo.name}
            </span>
            {` ·\u00a0${schedule}`}
          </span>
        </div>
        {desc}
        {now_}
        {extra}
        {figures}
        {recent}
        <div className="group">
          {loop.runCount ? (
            <Link className="cell" to={`/loops/${loop.id}/runs`} data-testid="all-runs-link">
              <span className="cell-title">{t.tn('runs.all', loop.runCount)}</span>
              <Icon name="chev" className="chev" />
            </Link>
          ) : null}
          <Link className="cell" to={`/loops/${loop.id}/settings`} data-testid="loop-settings-link">
            <span className="cell-main">
              <span className="cell-title">{t('loopSettings.title')}</span>
              <span className="cell-meta">{`${executorSummary(t, loop.executor.kind, loop.executor.config)} · ${limit}`}</span>
            </span>
            <Icon name="chev" className="chev" />
          </Link>
        </div>
        <ActionBar>
          <MainAction loop={loop} kind={kind} actions={actions} />
        </ActionBar>
        {stop}
      </PushedPage>
    );
  }
  return (
    <PushedPage back={back} testId="loop-page" top={top}>
      <div className="page-head" data-testid="loop-header" data-status={status}>
        <h1 className="page-title">
          {name}
          {pill}
        </h1>
        {edit}
        {menu}
        <MainAction loop={loop} kind={kind} actions={actions} />
      </div>
      {desc}
      <Cols
        main={
          <>
            {now_}
            {extra}
            {recent}
          </>
        }
        side={
          <>
            {figures}
            <SettingsCard loop={loop} probe={probe} />
          </>
        }
      />
      {stop}
    </PushedPage>
  );
}
