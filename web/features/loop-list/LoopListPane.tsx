// Loop list pane on the left (UC-03, 04, 05), present on EVERY path (the app frame puts it in
// <aside class="pane-list">). Exactly the approved preview `listPane`: search box + Create loop · filter tabs with loop counts · the rows.
// - List: `GET /api/loops` (filter + search on the server); count per tab: `GET /api/stats` - never counted here.
// - Self-updating: live events invalidate both queries (keys under prefix `loops`); the "running for" clock ticks every second.
// - Start / Stop from a row; Stop while a run is running -> confirm box (D-UI1); the server refuses -> red toast (D-UI3).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router';
import type { LoopListFilter } from '../../api/loops-api';
import { isApiError } from '../../api/loops-api';
import { useOwnerLoopId } from '../../data/history';
import { useLoopAction, useLoops, type LoopAction } from '../../data/loops';
import { useOverview } from '../../data/overview';
import { useRepos } from '../../data/repos';
import { FilterSelect } from '../../ui/Combo';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button, cx, EmptyState, Skeleton } from '../../ui/components';
import { useToast } from '../../ui/toast';
import { DUPLICATED_STATE } from '../loop-form/use-duplicate-loop';
import { LoopRow, type RowMenuAction } from './LoopRow';
import { rowModel, type RowModel } from './row-model';
import { StopDialog } from './StopDialog';
import { useNow } from './use-now';

export type ListTab = 'all' | 'active' | 'stopped' | 'archived';
const TABS: readonly ListTab[] = ['all', 'active', 'stopped', 'archived'];
const SEARCH_DEBOUNCE_MS = 200;

function filterOf(tab: ListTab, q: string, repoId: string | null): LoopListFilter {
  const f: LoopListFilter = tab === 'archived' ? { archived: true } : tab === 'all' ? {} : { status: tab };
  if (q.trim()) f.q = q.trim();
  if (repoId) f.repoId = repoId; // UC-25: filter on the server (GET /api/loops?repoId=)
  return f;
}

/** The "All repos" entry of the filter box. */
const ALL_REPOS = '';

const SK_NAME = ['62%', '48%', '70%', '55%', '40%'];
const SK_META = ['85%', '72%', '80%', '66%', '78%'];
function SkeletonRows() {
  return (
    <div data-testid="list-loading">
      {SK_NAME.map((w, i) => (
        <div className="row" key={i}>
          <Skeleton width={w} />
          <Skeleton width={64} />
          <Skeleton width={SK_META[i]} />
          <Skeleton width={84} />
        </div>
      ))}
    </div>
  );
}

export function LoopListPane() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const [tab, setTab] = useState<ListTab>('all');
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
  const action = useLoopAction();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  const search = useRef<HTMLInputElement>(null);

  // "/" anywhere (outside an input) -> go to the search box, as the placeholder hints.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || el?.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // `/executions/:id`, `/runs/:id`: the loop that holds it comes from the same query as the detail screen (same key -> no extra call).
  const owner = useOwnerLoopId({ executionId: matchPath('/executions/:id', pathname)?.params.id, runId: matchPath('/runs/:id', pathname)?.params.id });
  const selectedId = (matchPath('/loops/:id/*', pathname) ?? matchPath('/loops/:id', pathname))?.params.id ?? owner;
  const rows: RowModel[] = useMemo(
    () => (list.data ?? []).map((l) => rowModel(l, now, list.dataUpdatedAt, stopping.has(l.id))),
    [list.data, list.dataUpdatedAt, now, stopping],
  );

  const mark = (set: typeof setBusy, id: string, on: boolean) =>
    set((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const run = useCallback(
    (a: LoopAction, id: string, after?: (result: unknown) => void) => {
      mark(setBusy, id, true);
      if (a === 'stop') mark(setStopping, id, true);
      action.mutate(
        { action: a, id },
        {
          onSuccess: (result) => after?.(result),
          onError: (err) => {
            const code = isApiError(err) ? err.code : 'NETWORK';
            toast.show(t('toast.failed', { msg: t(`error.${code}` as MessageKey) }), 'err');
          },
          onSettled: () => {
            mark(setBusy, id, false);
            mark(setStopping, id, false);
          },
        },
      );
    },
    [action, toast, t],
  );

  const onStop = (row: RowModel) => {
    if (row.activeRun) setConfirmFor(row.id); // D-UI1: ask only when a run is running
    else run('stop', row.id);
  };
  const onMenuAction = (row: RowModel, a: RowMenuAction) => {
    if (a === 'open') navigate(`/loops/${row.id}`);
    else if (a === 'edit') navigate(`/loops/${row.id}/edit`);
    // UC-10: open the edit form of the copy right away, with the note "Copy created..." (state of useDuplicateLoop)
    else if (a === 'duplicate') run('duplicate', row.id, (copy) => navigate(`/loops/${(copy as { id: string }).id}/edit`, { state: { [DUPLICATED_STATE]: true } }));
    else run(a, row.id);
  };

  const total = overview.data?.loops;
  const neverCreated = total !== undefined && total.all + total.archived === 0;
  // Count per tab by the repo filter (preview list-filter-repo); with no filter it is the same count as the overview bar.
  const counts = repoId ? tabCounts.data?.loops : total;
  const repoList = repos ?? [];
  const pickedRepo = repoList.find((r) => r.id === repoId) ?? null;
  // The repo being filtered was just deleted -> drop the filter.
  useEffect(() => {
    if (repoId && repos && !repos.some((r) => r.id === repoId)) setRepoId(null);
  }, [repoId, repos]);
  const confirmRow = rows.find((r) => r.id === confirmFor);
  // The run finished while the confirm box was open -> nothing left to cancel, close the box (pressing Stop again stops at once).
  useEffect(() => {
    if (confirmFor && !confirmRow?.activeRun) setConfirmFor(null);
  }, [confirmFor, confirmRow?.activeRun]);

  let body;
  if (list.isPending) body = <SkeletonRows />;
  else if (list.isError) {
    const err = list.error;
    const status = isApiError(err) && err.status ? `HTTP ${err.status}` : t('error.NETWORK');
    body = (
      <EmptyState size="sm" error glyph="✗" title={t('list.error.title')} testId="list-error"
        action={<Button onClick={() => void list.refetch()}>{t('list.error.retry')}</Button>}>
        <span className="mono faint">GET /api/loops → {status}</span>
      </EmptyState>
    );
  } else if (rows.length === 0 && q.trim()) {
    body = (
      <EmptyState size="sm" glyph="∅" title={t('list.noMatch.title', { q: q.trim() })} testId="list-no-match"
        action={<Button onClick={() => { setQuery(''); setQ(''); }}>{t('list.noMatch.clear')}</Button>}>
        {t('list.noMatch.hint')}
      </EmptyState>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState size="sm" testId="list-empty">
        <span className="faint">{t(neverCreated || tab === 'all' ? 'list.empty' : 'list.emptyTab')}</span>
      </EmptyState>
    );
  } else {
    body = rows.map((row) => (
      <LoopRow
        key={row.id}
        row={row}
        selected={row.id === selectedId}
        hover={menuFor === row.id || confirmFor === row.id}
        menuOpen={menuFor === row.id}
        busy={busy.has(row.id)}
        onOpen={() => navigate(`/loops/${row.id}`)}
        onStart={() => run('start', row.id)}
        onStop={() => onStop(row)}
        onMenu={(open) => setMenuFor(open ? row.id : null)}
        onMenuAction={(a) => onMenuAction(row, a)}
      />
    ));
  }

  return (
    <>
      <div className="toolbar">
        <input
          ref={search}
          className="input mono"
          placeholder={t('list.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={list.isPending || neverCreated}
          aria-label={t('list.search')}
          data-testid="list-search"
        />
        <Button variant="primary" onClick={() => navigate('/loops/new')} data-testid="list-create">
          {t('list.create')}
        </Button>
      </div>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {TABS.map((k) => (
            <span
              key={k}
              role="tab"
              tabIndex={0}
              aria-selected={k === tab}
              className={cx('tab', k === tab && 'is-on')}
              onClick={() => setTab(k)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTab(k)}
              data-testid={`tab-${k}`}
            >
              {t(`list.filter.${k}`)}
              <span className="n">{counts ? counts[k] : '–'}</span>
            </span>
          ))}
        </div>
        <span className="spacer" />
        {/* UC-25 (D-UI15): filter by repo in the same row as the status tabs; while filtering the box takes the accent color */}
        <FilterSelect
          label={t('list.filter.repo')}
          display={pickedRepo ? pickedRepo.name : t('list.filter.repoAll')}
          active={pickedRepo !== null}
          disabled={list.isPending || neverCreated}
          current={repoId ?? ALL_REPOS}
          options={[
            { value: ALL_REPOS, content: t('list.filter.repoAll'), testId: 'repo-filter-all' },
            ...repoList.map((r) => ({ value: r.id, content: <span data-raw="">{r.name}</span>, testId: `repo-filter-${r.id}` })),
          ]}
          onSelect={(v) => setRepoId(v === ALL_REPOS ? null : v)}
          testId="repo-filter"
        />
      </div>
      {body}
      {confirmRow?.activeRun && confirmRow.execution && (
        <StopDialog
          name={confirmRow.name}
          iteration={confirmRow.activeRun.iteration}
          elapsedSec={confirmRow.activeRun.elapsedSec}
          count={confirmRow.activeRun.count}
          list={confirmRow.activeRun.list}
          executionSeq={confirmRow.execution.seq}
          onCancel={() => setConfirmFor(null)}
          onConfirm={() => {
            setConfirmFor(null);
            run('stop', confirmRow.id);
          }}
        />
      )}
    </>
  );
}
