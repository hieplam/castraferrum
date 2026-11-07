// Runs grouped by active period (spec 5.3, D6): the current period with up to 4 runs and the count of the rest, earlier periods
// as summaries, runs of a period that is not in the loaded executions grouped under their own id.
import { describe, expect, it } from 'vitest';
import type { ExecutionDto, RunDto } from '../../../shared/contracts/loops';
import { groupRuns, pageGroups } from './group-runs';

const T0 = Date.parse('2026-10-18T02:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000);

function run(executionId: string, iteration: number | null, min: number, status: RunDto['status'] = 'succeeded'): RunDto {
  return {
    id: `${executionId}-run-${iteration ?? `skip${min}`}`,
    loopId: 'loop',
    executionId,
    iteration,
    trigger: 'schedule',
    status,
    skipReason: status === 'skipped' ? 'run #1 still in progress' : null,
    scheduledFor: at(min),
    startedAt: at(min),
    deadlineAt: null,
    finishedAt: status === 'running' ? null : at(min + 1),
    durationMs: status === 'running' || status === 'skipped' ? null : 60_000,
    promptSnapshot: 'p',
    executorKind: 'claude',
    executorConfig: {},
    summary: null,
    error: null,
    costUsd: null,
    sessionId: null,
    taskKey: null,
    slot: null,
    endResult: null,
    endPr: null,
  };
}

function execution(id: string, seq: number, startMin: number, end: { min: number; reason: 'stopped' | 'server_down' } | null, stats: Partial<ExecutionDto['stats']> = {}): ExecutionDto {
  return {
    id,
    loopId: 'loop',
    seq,
    startedAt: at(startMin),
    endedAt: end ? at(end.min) : null,
    endReason: end ? end.reason : null,
    stats: { runs: 0, running: 0, succeeded: 0, failed: 0, interrupted: 0, cancelled: 0, skipped: 0, held: 0, sessions: 0, elapsedMs: 0, avgDurationMs: null, ...stats },
  };
}

/** Newest first, as `GET /loops/:id/runs` returns them. */
const newestFirst = (runs: RunDto[]) => [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

describe('groupRuns', () => {
  it('an open period with 10 runs: the current period shows the 4 newest and counts the 6 others', () => {
    const open = execution('e3', 3, 0, null, { runs: 10, running: 1, succeeded: 8, failed: 1 });
    const runs = newestFirst([...Array.from({ length: 9 }, (_, i) => run('e3', 60 + i, i * 30, i === 4 ? 'failed' : 'succeeded')), run('e3', 69, 270, 'running')]);
    const g = groupRuns(runs, [open]);
    expect(g.current?.executionId).toBe('e3');
    expect(g.current?.seq).toBe(3);
    expect(g.current?.endedAt).toBeNull();
    expect(g.current?.items.map((r) => r.iteration)).toEqual([69, 68, 67, 66]);
    expect(g.current?.rest).toBe(6);
    expect(g.current?.runs).toBe(10);
    expect(g.current?.failures).toBe(1);
    expect(g.earlier).toEqual([]);
  });

  it('a closed server-down period: newest first, the earlier one as a summary with its seq, times, end reason, runs and failures', () => {
    const current = execution('e3', 3, 300, null, { runs: 1, succeeded: 1 });
    const down = execution('e2', 2, 100, { min: 190, reason: 'server_down' }, { runs: 4, succeeded: 3, interrupted: 1 });
    const runs = newestFirst([run('e3', 60, 300), run('e2', 59, 180, 'interrupted'), run('e2', 58, 150), run('e2', 57, 120), run('e2', 56, 100)]);
    const g = groupRuns(runs, [current, down]);
    expect(g.current?.executionId).toBe('e3');
    expect(g.current?.items.map((r) => r.iteration)).toEqual([60]);
    expect(g.current?.rest).toBe(0);
    expect(g.earlier).toEqual([
      { executionId: 'e2', seq: 2, startedAt: at(100), endedAt: at(190), endReason: 'server_down', runs: 4, failures: 0 }, // run 59 was interrupted, not failed (castraferrum#190)
    ]);
  });

  it('runs of a period that is not in the loaded executions are grouped under their own id, never merged into another period', () => {
    const current = execution('e3', 3, 300, null, { runs: 2, succeeded: 2 });
    const runs = newestFirst([run('e3', 61, 330), run('e3', 60, 300), run('gone', 12, 50, 'failed'), run('gone', 11, 20)]);
    const g = groupRuns(runs, [current]);
    expect(g.current?.executionId).toBe('e3');
    expect(g.current?.items.map((r) => r.iteration)).toEqual([61, 60]);
    expect(g.earlier).toEqual([{ executionId: 'gone', seq: null, startedAt: at(20), endedAt: null, endReason: null, runs: 2, failures: 1 }]);
    // The All runs page groups the same way, in the order of the page.
    expect(pageGroups(runs, [current]).map((p) => [p.executionId, p.execution?.seq ?? null, p.items.map((r) => r.iteration)])).toEqual([
      ['e3', 3, [61, 60]],
      ['gone', null, [12, 11]],
    ]);
  });

  it('no runs at all: no current period and nothing earlier', () => {
    expect(groupRuns([], [])).toEqual({ current: null, earlier: [] });
    expect(pageGroups([], [])).toEqual([]);
  });
});
