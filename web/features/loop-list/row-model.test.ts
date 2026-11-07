// A list row (UC-03): what the status shows, counts taken verbatim from the API, the clock running between two loads.
import { describe, expect, it } from 'vitest';
import type { ExecutionDto, LoopDto, RunDto } from '../../../shared/contracts/loops';
import { rowModel, shortWhen } from './row-model';
import { FAKE_REPO } from '../../api/fake-loops-api';

const TZ = 'Asia/Ho_Chi_Minh';
const vn = (s: string) => new Date(`${s}+07:00`);
const NOW = vn('2026-10-18T14:00:42');

const exec = (over: Partial<ExecutionDto> = {}): ExecutionDto => ({
  id: 'e1', loopId: 'l1', seq: 3, startedAt: vn('2026-10-18T09:47:15'), endedAt: null, endReason: null,
  stats: { runs: 10, running: 1, succeeded: 8, failed: 1, interrupted: 0, cancelled: 0, skipped: 2, held: 0, sessions: 10, elapsedMs: 15_207_000, avgDurationMs: 93_000 },
  ...over,
});
const run = (over: Partial<RunDto> = {}): RunDto => ({
  id: 'r1', loopId: 'l1', executionId: 'e1', iteration: 69, trigger: 'schedule', status: 'running', skipReason: null,
  scheduledFor: null, startedAt: vn('2026-10-18T14:00:00'), deadlineAt: null, finishedAt: null, durationMs: null,
  promptSnapshot: 'p', executorKind: 'mock', executorConfig: {}, summary: null, error: null, costUsd: null, sessionId: null,
  taskKey: null, slot: null, endResult: null, endPr: null,
  ...over,
});
const loop = (over: Partial<LoopDto> = {}): LoopDto => ({
  id: 'l1', name: 'Game pilot backlog', description: '', prompt: 'p', repo: FAKE_REPO, cron: '*/30 * * * *', timezone: TZ, timeoutSec: 1800, maxConcurrent: 1,
  executor: { kind: 'mock', config: {} }, status: 'active', nextRunAt: vn('2026-10-18T14:30:00'), version: 1,
  createdAt: NOW, updatedAt: NOW, archivedAt: null, iterations: 69, executionCount: 3, currentExecution: exec(),
  activeRun: run(), activeRuns: [run()], lastRun: run({ id: 'r0', iteration: 68, status: 'succeeded', startedAt: vn('2026-10-18T13:30:00') }),
  ...over,
});

describe('rowModel (UC-03)', () => {
  it('three parallel runs: status follows the newest iteration + count 3; the Stop box receives all three iterations', () => {
    const runs = [run({ id: 'r3', iteration: 71 }), run({ id: 'r2', iteration: 70 }), run({ id: 'r1', iteration: 69 })];
    const m = rowModel(loop({ activeRun: runs[0]!, activeRuns: runs }), NOW, NOW.getTime(), false);
    expect(m.status).toMatchObject({ kind: 'running', iteration: 71, count: 3 });
    expect(m.activeRun).toMatchObject({ iteration: 71, count: 3, list: '#71 #70 #69' });
  });

  it('a loop with a running run: #N + clock from the run start, counts VERBATIM from the API stats, latest run -> next', () => {
    const m = rowModel(loop(), NOW, NOW.getTime(), false);
    expect(m.status).toEqual({ kind: 'running', iteration: 69, elapsedSec: 42, count: 1 });
    expect(m.counts).toEqual({ ok: 8, err: 1, cancel: 0, skip: 2 });
    expect(m.execution).toEqual({ seq: 3, elapsedSec: 15_207 });
    expect(m.last).toEqual({ status: 'succeeded', at: '13:30' });
    expect(m.next).toBe('14:30');
  });

  it('an open execution: "running for" = the server elapsedMs + time passed since the load; once closed it stands still', () => {
    const fetched = NOW.getTime() - 5_000;
    expect(rowModel(loop(), NOW, fetched, false).execution?.elapsedSec).toBe(15_212);
    const closed = loop({ status: 'stopped', activeRun: null, nextRunAt: null, currentExecution: exec({ endedAt: NOW, endReason: 'stopped' }) });
    expect(rowModel(closed, NOW, fetched, false).execution?.elapsedSec).toBe(15_207);
  });

  it('status: cancelling / archived / waiting for next run / server off / stopped; counts only while running', () => {
    expect(rowModel(loop(), NOW, 0, true).status).toEqual({ kind: 'stopping', iteration: 69 });
    expect(rowModel(loop({ activeRun: null }), NOW, 0, false).status).toEqual({ kind: 'idle' });
    const down = loop({ status: 'stopped', activeRun: null, nextRunAt: null, currentExecution: exec({ endedAt: NOW, endReason: 'server_down' }) });
    expect(rowModel(down, NOW, 0, false)).toMatchObject({ status: { kind: 'server_down' }, counts: null, next: null });
    expect(rowModel(loop({ status: 'stopped', activeRun: null, archivedAt: NOW }), NOW, 0, false).status).toEqual({ kind: 'archived' });
    expect(rowModel(loop({ status: 'stopped', activeRun: null, currentExecution: null, lastRun: null }), NOW, 0, false)).toMatchObject({
      status: { kind: 'stopped' }, execution: null, counts: null, last: null,
    });
  });

  it('shortWhen: same day (in the loop time zone) -> HH:MM, another day -> dd/mm HH:MM', () => {
    expect(shortWhen(vn('2026-10-18T00:05:00'), NOW, TZ)).toBe('00:05');
    expect(shortWhen(vn('2026-10-16T08:30:00'), NOW, TZ)).toBe('16/10 08:30');
    expect(shortWhen(vn('2026-10-18T00:05:00'), NOW, 'UTC')).toBe('17/10 17:05');
  });
});
