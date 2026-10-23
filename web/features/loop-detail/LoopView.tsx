// The loop page of the new UI (spec 5.3, `d-loop-*`, `m-loop-*`): the name, its status and repo; the now card; the four figures;
// Recent runs grouped by active period; the settings (a side card from 1024px; a cell on the phone, with All runs). The main
// action (Stop loop, Start or Restore) sits in the head from 640px and in the action bar on the phone; Edit and the `⋯` menu
// (Duplicate, Archive) sit in the head, or in the navigation bar on the phone. Data comes from web/data, the actions from the
// hook the Loops page uses (Stop asks first only while a run is working, D29).
import { Link, useNavigate } from 'react-router';
import type { LoopDetailDto } from '../../../shared/contracts/loops';
import { useNow, useSharedServerStatus } from '../../data/connection';
import { useLoop } from '../../data/loops';
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
};

export function LoopView({ id }: { id: string }) {
  const t = useT();
  const q = useLoop(id);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <PageNotFound title={errorTitle(t, q.error, 'error.LOOP_NOT_FOUND')} />;
  return <LoopBody loop={q.data} />;
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
  if (kind === 'stopped' || kind === 'server_down') {
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

function LoopBody({ loop }: { loop: LoopDetailDto }) {
  const t = useT();
  const navigate = useNavigate();
  const phone = useLayout() === 'phone';
  const now = useNow(1_000);
  const offline = useSharedServerStatus().server === 'down';
  const actions = useLoopActions();
  const back = useBackToLoops();
  const kind = pageKindOf(loop, actions.isStopping(loop.id));
  const live = kind === 'running' || kind === 'active' || kind === 'stopping';
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
  const now_ = <NowCard loop={loop} kind={kind} now={now} offline={offline} />;
  const figures = <Figures loop={loop} live={live} now={now} />;
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
            {` ·\u00a0${scheduleSentence(loop.cron, t.lang)}`}
          </span>
        </div>
        {desc}
        {now_}
        {figures}
        {recent}
        <div className="group">
          {loop.runCount ? (
            <Link className="cell" to={`/loops/${loop.id}/runs`} data-testid="all-runs-link">
              <span className="cell-title">{t('runs.all', { n: loop.runCount })}</span>
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
    <PushedPage back={back} testId="loop-page">
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
            {recent}
          </>
        }
        side={
          <>
            {figures}
            <SettingsCard loop={loop} />
          </>
        }
      />
      {stop}
    </PushedPage>
  );
}
