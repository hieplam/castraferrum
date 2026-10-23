// The Loops page of the new UI (spec 5.2, `d-loops-light`, `m-loops-*`): the title and New loop, the four figures, the toolbar (search,
// status, repo filter) and the loops as a table (from 1024px) or a list of cells, each with a visible Start or Stop. First launch
// shows "Create your first loop" and the three steps. Data comes from web/data (`GET /api/loops`, `/stats`, `/repos`); the
// actions from use-loop-actions.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { LoopListFilter } from '../../api/loops-api';
import { useSharedServerStatus } from '../../data/connection';
import { useLoops } from '../../data/loops';
import { useOverview } from '../../data/overview';
import { useRepos } from '../../data/repos';
import { useT } from '../../prefs/prefs';
import { Button, IconButton } from '../../ui/kit/Button';
import { Search, Segmented } from '../../ui/kit/Field';
import { Group } from '../../ui/kit/Group';
import { Page, PageHead, useLayout, useWide } from '../../ui/kit/Layout';
import { HowItWorks } from './HowItWorks';
import { LoopCell } from './LoopCell';
import { LoopsTable } from './LoopsTable';
import { RepoFilter } from './RepoFilter';
import { rowModel } from './row-model';
import { kindOf, type LoopItem } from './row-view';
import { StopSheet } from './StopSheet';
import { SummaryStrip } from './SummaryStrip';
import { useLoopActions } from './use-loop-actions';
import { useNow } from './use-now';

type Tab = 'all' | 'active' | 'stopped' | 'archived';
const TABS: readonly Tab[] = ['all', 'active', 'stopped', 'archived'];
const SEARCH_DEBOUNCE_MS = 200;

function filterOf(tab: Tab, q: string, repoId: string | null): LoopListFilter {
  const f: LoopListFilter = tab === 'archived' ? { archived: true } : tab === 'all' ? {} : { status: tab };
  if (q.trim()) f.q = q.trim();
  if (repoId) f.repoId = repoId; // UC-25: filter on the server (GET /api/loops?repoId=)
  return f;
}

/** Five placeholder cells while the list loads. */
function Skeleton() {
  return (
    <div className="group" data-testid="list-loading" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div className="cell" key={i}>
          <div className="cell-main">
            <span className="skeleton is-line" />
            <span className="skeleton is-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoopsView() {
  const t = useT();
  const navigate = useNavigate();
  const layout = useLayout();
  const wide = useWide();
  const status = useSharedServerStatus();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);
  const [repoId, setRepoId] = useState<string | null>(null);
  const repos = useRepos().data;
  const filter = useMemo(() => filterOf(tab, q, repoId), [tab, q, repoId]);
  const list = useLoops(filter);
  const overview = useOverview();
  const tabCounts = useOverview(repoId ?? undefined);
  const now = useNow();
  const actions = useLoopActions();
  const { isStopping } = actions;

  // The repo being filtered was just deleted -> drop the filter.
  useEffect(() => {
    if (repoId && repos && !repos.some((r) => r.id === repoId)) setRepoId(null);
  }, [repoId, repos]);

  const items: LoopItem[] = (list.data ?? []).map((loop) => {
    const row = rowModel(loop, now, list.dataUpdatedAt, isStopping(loop.id));
    return { loop, row, kind: kindOf(row) };
  });

  const total = overview.data?.loops;
  const neverCreated = total !== undefined && total.all + total.archived === 0;
  // Count per tab by the repo filter; with no filter it is the same count as the figures' loops.
  const counts = repoId ? tabCounts.data?.loops : total;
  // The database down (castraferrum#196): a list already loaded stays (like the figures), a failed reload never hides it;
  // with no list yet the error state shows at once, never a skeleton that waits for a database that does not answer.
  const loaded = list.data !== undefined;
  const failed = !loaded && (list.isError || status.db === 'down');
  const off = !loaded || neverCreated;
  const confirmLoop = list.data?.find((l) => l.id === actions.confirmId);
  const pickedRepo = repos?.find((r) => r.id === repoId) ?? null;

  const newLoop = () => navigate('/loops/new');

  if (neverCreated) {
    return (
      <Page testId="loops-page">
        <PageHead title={t('loops.title')} large root />
        <div className="empty" data-testid="home-empty">
          <b>{t('howto.title')}</b>
          <Button variant="primary" size="lg" icon="plus" onClick={newLoop} data-testid="list-create">
            {t('loops.new')}
          </Button>
        </div>
        <HowItWorks />
      </Page>
    );
  }

  let body;
  if (!loaded && !failed) body = <Skeleton />;
  else if (failed) {
    body = (
      <div className="empty is-err" data-testid="list-error" role="alert">
        <b>{t('list.error.title')}</b>
        <Button onClick={() => void list.refetch()}>{t('list.error.retry')}</Button>
      </div>
    );
  } else if (items.length === 0 && q.trim()) {
    body = (
      <div className="empty" data-testid="list-no-match">
        <b>{t('list.noMatch.title', { q: q.trim() })}</b>
        <span>{t('list.noMatch.hint')}</span>
        <Button
          onClick={() => {
            setQuery('');
            setQ('');
          }}
        >
          {t('loops.clearSearch')}
        </Button>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="empty" data-testid="list-empty">
        <span>{t(tab === 'all' ? 'list.empty' : 'list.emptyTab')}</span>
      </div>
    );
  } else if (wide) {
    body = (
      <LoopsTable
        items={items}
        isBusy={actions.isBusy}
        onStart={(item) => actions.run('start', item.loop.id)}
        onStop={(item) => actions.requestStop(item.loop)}
        onAction={(item, action) => actions.run(action, item.loop.id)}
      />
    );
  } else {
    body = (
      <Group>
        {items.map((item) => (
          <LoopCell
            key={item.loop.id}
            item={item}
            busy={actions.isBusy(item.loop.id)}
            onStart={() => actions.run('start', item.loop.id)}
            onStop={() => actions.requestStop(item.loop)}
          />
        ))}
      </Group>
    );
  }

  return (
    <Page testId="loops-page">
      <PageHead title={t('loops.title')} large root>
        {layout === 'phone' ? (
          <IconButton icon="plus" label={t('loops.new')} tooltip={false} onClick={newLoop} data-testid="list-create" />
        ) : (
          <Button variant="primary" icon="plus" onClick={newLoop} data-testid="list-create">
            {t('loops.new')}
          </Button>
        )}
      </PageHead>
      <SummaryStrip stats={overview.data} stale={status.stale} />
      <div className="toolbar">
        <Search label={t('loops.search')} placeholder={t('loops.search')} value={query} onChange={setQuery} testId="list-search" disabled={off} />
        <Segmented
          label={t('loops.title')}
          value={tab}
          disabled={off}
          options={TABS.map((k) => ({ value: k, label: `${t(`list.filter.${k}`)} ${off || !counts ? '-' : counts[k]}`, testId: `tab-${k}` }))}
          onChange={setTab}
        />
        <RepoFilter repos={repos ?? []} value={repoId} onChange={setRepoId} disabled={off} />
      </div>
      {pickedRepo && layout === 'phone' ? (
        <div className="chips">
          <button type="button" className="chip is-on" onClick={() => setRepoId(null)}>
            {t.node('loops.repoChip', { name: <span data-raw="">{pickedRepo.name}</span> })}
          </button>
        </div>
      ) : null}
      {body}
      {actions.confirmId ? <StopSheet loop={confirmLoop} onCancel={actions.cancelStop} onConfirm={actions.confirmStop} /> : null}
    </Page>
  );
}
