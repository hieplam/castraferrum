// All runs of one loop (spec 5.3 and D26, `/loops/:id/runs`): the longest active period, then the runs, 10 per page, under the
// head of their active period; Previous and Next page through them. Every number comes from the API (`runCount`,
// `longestExecution`, the executions' figures).
import { Fragment, useState } from 'react';
import type { LoopDetailDto } from '../../../shared/contracts/loops';
import { useLoopExecutions, useLoopRuns } from '../../data/history';
import { useNow } from '../../data/connection';
import { useLoop } from '../../data/loops';
import { useT } from '../../prefs/prefs';
import { IconButton } from '../../ui/kit/Button';
import { PageHead } from '../../ui/kit/Layout';
import { fmtSpan } from './format';
import { pageGroups } from './group-runs';
import { periodCountsText, periodEndText, periodSpanText } from './period-text';
import { errorTitle, PageNotFound, PageSkeleton, PushedPage } from './PushedPage';
import { RunCell } from './RunCell';

/** Runs per page (the preview's "1–10 of 69"). */
export const RUNS_PAGE = 10;

function RunsBody({ loop }: { loop: LoopDetailDto }) {
  const t = useT();
  const now = useNow(1_000);
  const tz = loop.timezone;
  const executions = useLoopExecutions(loop.id);
  const runs = useLoopRuns(loop.id, RUNS_PAGE);
  const [page, setPage] = useState(0);
  const pages = runs.data?.pages ?? [];
  const current = Math.min(page, Math.max(0, pages.length - 1));
  const items = pages[current]?.items ?? [];
  const hasNext = current < pages.length - 1 || runs.hasNextPage;
  const next = () => {
    if (current + 1 >= pages.length) void runs.fetchNextPage().then(() => setPage(current + 1));
    else setPage(current + 1);
  };
  const groups = pageGroups(items, executions.data?.pages.flatMap((p) => p.items) ?? []);
  const from = current * RUNS_PAGE + 1;
  const longest = loop.longestExecution;
  return (
    <PushedPage back={{ to: `/loops/${loop.id}`, label: <span data-raw="">{loop.name}</span> }} testId="loop-runs-page">
      <PageHead title={t('runs.allTitle')} />
      {longest ? (
        <p className="page-desc" data-testid="period-longest">
          {t('runs.longest', { k: longest.seq, d: fmtSpan(t, longest.elapsedMs / 1000) })}
        </p>
      ) : null}
      {/* One list of runs for the tests (`runs-table`); each period keeps its own head and group, as the page's own children. */}
      <div data-testid="runs-table" style={{ display: 'contents' }}>
        {groups.map((g) => {
          const e = g.execution;
          return (
            <Fragment key={g.executionId}>
              <p className="group-cap" data-testid="exec-row" data-execution-id={g.executionId}>
                {t('period.title', { k: e?.seq ?? '?' }) +
                  (e ? ` · ${periodSpanText(t, e, tz, now)} · ${periodEndText(t, e)} · ${periodCountsText(t.tn, e.stats.runs, e.stats.failed)}` : '')}
              </p>
              <div className="group">
                {g.items.map((r) => (
                  <RunCell key={r.id} run={r} tz={tz} now={now} />
                ))}
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="pager" data-testid="runs-pager">
        <span>{t('runs.range', { a: items.length ? from : 0, b: from + items.length - 1, n: loop.runCount })}</span>
        <span className="pager-nav">
          <IconButton icon="back" label={t('runs.prev')} bordered disabled={current === 0} onClick={() => setPage(current - 1)} data-testid="runs-prev" />
          <IconButton icon="chev" label={t('runs.next')} bordered disabled={!hasNext || runs.isFetchingNextPage} onClick={next} data-testid="runs-next" />
        </span>
      </div>
    </PushedPage>
  );
}

export function LoopRunsView({ id }: { id: string }) {
  const t = useT();
  const q = useLoop(id);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <PageNotFound title={errorTitle(t, q.error, 'error.LOOP_NOT_FOUND')} />;
  return <RunsBody loop={q.data} />;
}
