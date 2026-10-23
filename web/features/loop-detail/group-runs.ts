// Runs grouped by active period (spec 5.3 and D6): the loop page shows the current period with up to 4 runs and "Show N more", then
// the earlier periods as summaries; the All runs page shows each page of runs under the head of its period. A run belongs to the
// period of its `executionId`; a run whose period is not in the loaded executions (the executions list is paged) is grouped under its
// own id, never merged into a neighbour. Pure functions: every number comes from the API.
import type { ExecutionDto, RunDto } from '../../../shared/contracts/loops';

/** How many runs of the current period the loop page shows before "Show N more". */
export const RECENT_RUNS = 4;

const FAILURES: ReadonlySet<RunDto['status']> = new Set(['failed', 'timed_out', 'interrupted']);

/** An active period as a line: `seq` null = a period that is not in the loaded executions. */
export type PeriodSummary = {
  executionId: string;
  seq: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: ExecutionDto['endReason'];
  /** Runs that were not skipped (the period's figure). */
  runs: number;
  /** Failed, timed out or interrupted. */
  failures: number;
};

/** The period the loop page expands: its newest runs (at most `RECENT_RUNS`) and how many of its runs are not shown. */
export type CurrentPeriod = PeriodSummary & { execution: ExecutionDto | null; items: RunDto[]; rest: number };

/** Runs of one period on a page of runs, in the page's order. */
export type PageGroup = { executionId: string; execution: ExecutionDto | null; items: RunDto[] };

function summaryOf(e: ExecutionDto): PeriodSummary {
  return { executionId: e.id, seq: e.seq, startedAt: e.startedAt, endedAt: e.endedAt, endReason: e.endReason, runs: e.stats.runs, failures: e.stats.failed };
}

/** A period known only by its runs: its start is its oldest loaded run. */
function unknownOf(id: string, runs: readonly RunDto[]): PeriodSummary {
  const starts = runs.map((r) => r.startedAt.getTime());
  return {
    executionId: id,
    seq: null,
    startedAt: starts.length ? new Date(Math.min(...starts)) : null,
    endedAt: null,
    endReason: null,
    runs: runs.filter((r) => r.status !== 'skipped').length,
    failures: runs.filter((r) => FAILURES.has(r.status)).length,
  };
}

function byPeriod(runs: readonly RunDto[]): Map<string, RunDto[]> {
  const out = new Map<string, RunDto[]>();
  for (const r of runs) {
    const list = out.get(r.executionId);
    if (list) list.push(r);
    else out.set(r.executionId, [r]);
  }
  return out;
}

const newest = (runs: readonly RunDto[]) => Math.max(...runs.map((r) => r.startedAt.getTime()));

/**
 * `runs`: newest first (as `GET /loops/:id/runs` returns them); `executions`: the loaded periods. The newest period is the current
 * one; every other period, known or not, is a summary, newest first.
 */
export function groupRuns(runs: readonly RunDto[], executions: readonly ExecutionDto[], max = RECENT_RUNS): { current: CurrentPeriod | null; earlier: PeriodSummary[] } {
  const grouped = byPeriod(runs);
  const known = new Set(executions.map((e) => e.id));
  type Entry = { at: number; summary: PeriodSummary; execution: ExecutionDto | null };
  const entries: Entry[] = executions.map((e) => ({ at: e.startedAt.getTime(), summary: summaryOf(e), execution: e }));
  for (const [id, list] of grouped) {
    if (!known.has(id)) entries.push({ at: newest(list), summary: unknownOf(id, list), execution: null });
  }
  entries.sort((a, b) => b.at - a.at);
  const [first, ...others] = entries;
  if (!first) return { current: null, earlier: [] };
  const own = grouped.get(first.summary.executionId) ?? [];
  const items = own.slice(0, max);
  const total = first.execution ? first.execution.stats.runs + first.execution.stats.skipped : own.length;
  return {
    current: { ...first.summary, execution: first.execution, items, rest: Math.max(0, total - items.length) },
    earlier: others.map((x) => x.summary),
  };
}

/** One page of runs (newest first) cut into its periods, in the page's order: the All runs page puts a period head above each. */
export function pageGroups(runs: readonly RunDto[], executions: readonly ExecutionDto[]): PageGroup[] {
  const known = new Map(executions.map((e) => [e.id, e]));
  const out: PageGroup[] = [];
  for (const [id, items] of byPeriod(runs)) out.push({ executionId: id, execution: known.get(id) ?? null, items });
  return out;
}
