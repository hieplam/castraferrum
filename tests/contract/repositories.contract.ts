// Repository contract tests - ONE suite, run on both memory/ (memory.test.ts) and postgres/ (postgres.test.ts).
// Proves the in-memory fake behaves exactly like Postgres for every operation the services need, so service tests
// can use the fake and still be trustworthy. Add new cases HERE, not in each runner file - both sides must have the same number of cases.
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorCode } from '../../shared/domain/errors';
import type { GateJobState, GateStep } from '../../shared/domain/gate';
import type { ProbeSettings } from '../../shared/domain/goal-loop';
import type { GoalRunRecord } from '../../shared/domain/standing-goal';
import type { NewStandingIssueRecord } from '../../server/ports/goal-repository';
import type { NewLoopRecord } from '../../server/ports/loop-repository';
import type { NewNoticeRecord } from '../../server/ports/notice-repository';
import type { NewRepoRecord } from '../../server/ports/repo-repository';
import type { Repositories } from '../../server/ports/repositories';
import type { RunRecord, StartRunInput } from '../../server/ports/run-repository';

export type ContractEnv = Repositories & {
  /** Wipe all data between cases. */
  reset(): Promise<void>;
  /** Insert a `running` run straight into the runs "table", NOT through the repository (Postgres: raw SQL). */
  rawInsertRunning(row: { id: string; loopId: string; executionId: string; iteration: number }): Promise<void>;
  /** Insert a gate job straight into the gate_jobs "table", NOT through the repository: only the partial unique indexes can block it. */
  rawInsertGateJob(row: { id: string; repoId: string; prNumber: number; headSha: string; state: GateJobState }): Promise<void>;
};

const T0 = new Date('2026-10-18T01:00:00.000Z');
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

async function expectCode(p: Promise<unknown>, code: ErrorCode): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
}

export function repositoryContract(env: () => ContractEnv): void {
  let r: ContractEnv;
  /** Default repo of every loop built with `newLoop` (a loop must have a repo). */
  let repoId: string;
  beforeEach(async () => {
    r = env();
    await r.reset();
    repoId = (await r.repos.insert(newRepo({ name: 'default', path: '/repo/default' }))).id;
  });

  let repoSec = 0;
  const newRepo = (over: Partial<NewRepoRecord> = {}): NewRepoRecord => {
    const id = randomUUID();
    return { id, name: `repo-${id.slice(0, 8)}`, path: `/repo/${id}`, createdAt: at(repoSec++), ...over };
  };

  // ---------------------------------------------------------------- building data
  let createdSec = 0;
  const newLoop = (over: Partial<NewLoopRecord> = {}): NewLoopRecord => ({
    id: randomUUID(),
    name: `loop-${randomUUID().slice(0, 8)}`,
    description: '',
    prompt: 'Do the work #1',
    cron: '*/5 * * * *',
    timezone: 'Asia/Ho_Chi_Minh',
    repoId,
    timeoutSec: 1800,
    executorKind: 'mock',
    executorConfig: { durationSec: 10, failRate: 0 },
    createdAt: at(createdSec++),
    ...over,
  });
  /** An active loop: has an open execution. */
  async function activeLoop(over: Partial<NewLoopRecord> = {}, nextRunAt: Date | null = at(300)) {
    const loop = await r.loops.insert(newLoop(over));
    const opened = await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(0), nextRunAt });
    if (opened.kind !== 'opened') throw new Error('could not open the execution');
    return { loop, execution: opened.execution };
  }
  const startInput = (loopId: string, executionId: string, over: Partial<StartRunInput> = {}): StartRunInput => ({
    id: randomUUID(),
    loopId,
    executionId,
    trigger: 'schedule',
    scheduledFor: at(60),
    startedAt: at(60),
    deadlineAt: at(60 + 1800),
    promptSnapshot: 'Do the work #1',
    executorKind: 'mock',
    executorConfig: { durationSec: 10, failRate: 0 },
    ...over,
  });
  async function started(loopId: string, executionId: string, over: Partial<StartRunInput> = {}): Promise<RunRecord> {
    const res = await r.runs.start(startInput(loopId, executionId, over));
    if (res.kind !== 'started') throw new Error('the run could not start');
    return res.run;
  }
  const skipInput = (loopId: string, executionId: string, sec: number) => ({
    id: randomUUID(),
    loopId,
    executionId,
    scheduledFor: at(sec),
    at: at(sec),
    skipReason: 'round #1 still running',
    promptSnapshot: 'Do the work #1',
    executorKind: 'mock',
    executorConfig: {},
  });

  // ================================================================ RepoRepository
  describe('RepoRepository', () => {
    it('insert -> findById / list (by name, case-insensitive); unknown id -> null', async () => {
      const b = await r.repos.insert(newRepo({ name: 'beta', path: '/x/beta' }));
      const a = await r.repos.insert(newRepo({ name: 'Alpha', path: '/x/alpha' }));
      expect(await r.repos.findById(b.id)).toEqual(b);
      expect(b).toMatchObject({ name: 'beta', path: '/x/beta' });
      expect((await r.repos.list()).map((x) => x.name)).toEqual(['Alpha', 'beta', 'default']);
      expect(a.createdAt).toBeInstanceOf(Date);
      expect(await r.repos.findById(randomUUID())).toBeNull();
    });

    it('duplicate name (case-insensitive) -> REPO_NAME_TAKEN; duplicate path -> REPO_PATH_TAKEN; nothing written', async () => {
      await r.repos.insert(newRepo({ name: 'Atlas', path: '/a' }));
      await expectCode(r.repos.insert(newRepo({ name: 'ATLAS', path: '/b' })), 'REPO_NAME_TAKEN');
      await expect(r.repos.insert(newRepo({ name: 'other', path: '/a' }))).rejects.toMatchObject({ code: 'REPO_PATH_TAKEN', details: { field: 'path', name: 'Atlas' } });
      expect(await r.repos.list()).toHaveLength(2);
    });

    it('loopCounts: loop count per repo, archived loops included; a repo with no loops is absent', async () => {
      const x = await r.repos.insert(newRepo());
      const empty = await r.repos.insert(newRepo());
      await r.loops.insert(newLoop({ name: 'One', repoId: x.id }));
      const two = await r.loops.insert(newLoop({ name: 'Two', repoId: x.id }));
      await r.loops.update(two.id, { archivedAt: at(99), updatedAt: at(99) }, 1);
      await r.loops.insert(newLoop({ name: 'Default' }));
      const counts = await r.repos.loopCounts();
      expect(counts.get(x.id)).toBe(2);
      expect(counts.get(repoId)).toBe(1);
      expect(counts.has(empty.id)).toBe(false);
    });

    it('delete: no loop uses it -> gone; unknown id -> REPO_NOT_FOUND', async () => {
      const x = await r.repos.insert(newRepo());
      await r.repos.delete(x.id);
      expect(await r.repos.findById(x.id)).toBeNull();
      await expectCode(r.repos.delete(x.id), 'REPO_NOT_FOUND');
    });

    it('delete while loops still use it (archived ones included) -> REPO_IN_USE with the loop names, repo left intact', async () => {
      const x = await r.repos.insert(newRepo());
      await r.loops.insert(newLoop({ name: 'Used 1', repoId: x.id }));
      const two = await r.loops.insert(newLoop({ name: 'Used 2', repoId: x.id }));
      await r.loops.update(two.id, { archivedAt: at(99), updatedAt: at(99) }, 1);
      await r.loops.insert(newLoop({ name: 'Other repo' }));
      await expect(r.repos.delete(x.id)).rejects.toMatchObject({ code: 'REPO_IN_USE', details: { loops: ['Used 1', 'Used 2'], archivedLoops: ['Used 2'] } });
      expect(await r.repos.findById(x.id)).not.toBeNull();
    });
  });

  // ================================================================ LoopRepository
  describe('LoopRepository', () => {
    it('loop pointing at a missing repo -> VALIDATION_FAILED on the repoId field (foreign key), nothing written; the repo can be changed', async () => {
      await expect(r.loops.insert(newLoop({ repoId: randomUUID() }))).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { issues: [{ field: 'repoId', code: 'unknownRepo' }] },
      });
      expect(await r.loops.list({})).toHaveLength(0);
      const loop = await r.loops.insert(newLoop());
      expect(loop.repoId).toBe(repoId);
      const other = await r.repos.insert(newRepo());
      expect((await r.loops.update(loop.id, { repoId: other.id, updatedAt: at(5) }, 1)).repoId).toBe(other.id);
      await expectCode(r.loops.update(loop.id, { repoId: randomUUID(), updatedAt: at(6) }, 2), 'VALIDATION_FAILED');
      expect((await r.loops.findById(loop.id))?.repoId).toBe(other.id);
    });

    it('list filters by repoId (UC-25)', async () => {
      const other = await r.repos.insert(newRepo());
      const a = await r.loops.insert(newLoop({ name: 'A' }));
      const b = await r.loops.insert(newLoop({ name: 'B', repoId: other.id }));
      expect((await r.loops.list({ repoId: other.id })).map((l) => l.id)).toEqual([b.id]);
      expect((await r.loops.list({ repoId })).map((l) => l.id)).toEqual([a.id]);
      expect(await r.loops.list({ repoId: randomUUID() })).toEqual([]);
    });

    it('timeoutSec null = unlimited: stored / read back as null; outside 60-86 400 is still rejected', async () => {
      const loop = await r.loops.insert(newLoop({ timeoutSec: null }));
      expect((await r.loops.findById(loop.id))?.timeoutSec).toBeNull();
      const v2 = await r.loops.update(loop.id, { timeoutSec: 600, updatedAt: at(7) }, 1);
      expect(v2.timeoutSec).toBe(600);
      await expect(r.loops.insert(newLoop({ timeoutSec: 30 }))).rejects.toMatchObject({ constraint: 'loops_timeout_range' });
    });

    it('insert: a new loop is always stopped, version 1, counters 0, executor_config keeps its JSON as is', async () => {
      const input = newLoop({ executorConfig: { durationSec: 3, tags: ['a', 'b'], nested: { x: null } } });
      const loop = await r.loops.insert(input);
      expect(loop).toMatchObject({
        id: input.id,
        status: 'stopped',
        nextRunAt: null,
        version: 1,
        runCounter: 0,
        executionCounter: 0,
        overlapPolicy: 'skip',
        archivedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
      expect((await r.loops.findById(input.id))?.executorConfig).toEqual({
        durationSec: 3,
        tags: ['a', 'b'],
        nested: { x: null },
      });
      expect(await r.loops.findById(randomUUID())).toBeNull();
    });

    it('duplicate name (case-insensitive) among unarchived loops -> LOOP_NAME_TAKEN', async () => {
      await r.loops.insert(newLoop({ name: 'Night Round' }));
      await expectCode(r.loops.insert(newLoop({ name: 'night round' })), 'LOOP_NAME_TAKEN');
      await expectCode(r.loops.insert(newLoop({ name: 'NIGHT ROUND' })), 'LOOP_NAME_TAKEN');
      expect(await r.loops.list({})).toHaveLength(1);
    });

    it('an archived loop releases its name; restoring when the name has been taken -> LOOP_NAME_TAKEN', async () => {
      const a = await r.loops.insert(newLoop({ name: 'Report' }));
      const archived = await r.loops.update(a.id, { archivedAt: at(10), updatedAt: at(10) }, 1);
      expect(archived.archivedAt).toEqual(at(10));
      const b = await r.loops.insert(newLoop({ name: 'report' }));
      expect(b.name).toBe('report');
      await expectCode(r.loops.update(a.id, { archivedAt: null, updatedAt: at(20) }, archived.version), 'LOOP_NAME_TAKEN');
      // rename, then it can be restored
      const restored = await r.loops.update(a.id, { name: 'Old report', archivedAt: null, updatedAt: at(30) }, archived.version);
      expect(restored).toMatchObject({ name: 'Old report', archivedAt: null, version: 3 });
    });

    it('update: matching version -> written + version bumps; stale version -> VERSION_CONFLICT; no such loop -> LOOP_NOT_FOUND', async () => {
      const loop = await r.loops.insert(newLoop({ name: 'Edit me' }));
      const v2 = await r.loops.update(loop.id, { prompt: 'new', timeoutSec: 60, updatedAt: at(50) }, 1);
      expect(v2).toMatchObject({ prompt: 'new', timeoutSec: 60, version: 2, updatedAt: at(50), name: 'Edit me' });
      expect(v2.createdAt).toEqual(loop.createdAt);
      // changing the case of its own name is not a name clash
      const v3 = await r.loops.update(loop.id, { name: 'EDIT ME', executorConfig: { durationSec: 1 }, updatedAt: at(60) }, 2);
      expect(v3).toMatchObject({ name: 'EDIT ME', executorConfig: { durationSec: 1 }, version: 3 });

      await expectCode(r.loops.update(loop.id, { prompt: 'old', updatedAt: at(70) }, 2), 'VERSION_CONFLICT');
      expect((await r.loops.findById(loop.id))?.prompt).toBe('new');
      await expectCode(r.loops.update(randomUUID(), { prompt: 'x', updatedAt: at(70) }, 1), 'LOOP_NOT_FOUND');
    });

    it('renaming to another loop name -> LOOP_NAME_TAKEN, nothing written', async () => {
      await r.loops.insert(newLoop({ name: 'One' }));
      const hai = await r.loops.insert(newLoop({ name: 'Two' }));
      await expectCode(r.loops.update(hai.id, { name: 'ONE', updatedAt: at(5) }, 1), 'LOOP_NAME_TAKEN');
      expect(await r.loops.findById(hai.id)).toMatchObject({ name: 'Two', version: 1 });
    });

    it('archiving an active loop -> LOOP_IS_ACTIVE (CHECK archived => stopped)', async () => {
      const { loop } = await activeLoop();
      await expectCode(r.loops.update(loop.id, { archivedAt: at(9), updatedAt: at(9) }, loop.version), 'LOOP_IS_ACTIVE');
      expect((await r.loops.findById(loop.id))?.archivedAt).toBeNull();
    });

    it('list: unarchived by default, filters status / archived / q (a substring, case-insensitive), newest first', async () => {
      const a = await r.loops.insert(newLoop({ name: 'Clean logs 100%' }));
      const { loop: b } = await activeLoop({ name: 'Check PR' });
      const c = await r.loops.insert(newLoop({ name: 'clean wiki' }));
      await r.loops.update(c.id, { archivedAt: at(99), updatedAt: at(99) }, 1);

      expect((await r.loops.list({})).map((l) => l.id)).toEqual([b.id, a.id]);
      expect((await r.loops.list({ archived: true })).map((l) => l.id)).toEqual([c.id]);
      expect((await r.loops.list({ status: 'active' })).map((l) => l.id)).toEqual([b.id]);
      expect((await r.loops.list({ status: 'stopped' })).map((l) => l.id)).toEqual([a.id]);
      expect((await r.loops.list({ q: 'CLEAN' })).map((l) => l.id)).toEqual([a.id]);
      expect((await r.loops.list({ q: 'clean', archived: true })).map((l) => l.id)).toEqual([c.id]);
      expect((await r.loops.list({ q: '0%' })).map((l) => l.id)).toEqual([a.id]);
      expect(await r.loops.list({ q: '_' })).toEqual([]);
    });

    it('counts: loop count per tab - active / stopped count only unarchived loops, archived separately (UC-03)', async () => {
      expect(await r.loops.counts()).toEqual({ active: 0, stopped: 0, archived: 0 });
      await r.loops.insert(newLoop());
      await activeLoop();
      await activeLoop();
      const c = await r.loops.insert(newLoop());
      await r.loops.update(c.id, { archivedAt: at(99), updatedAt: at(99) }, 1);
      expect(await r.loops.counts()).toEqual({ active: 2, stopped: 1, archived: 1 });
    });

    it('counts(repoId): only that repo\'s loops; unknown id -> 0 (UC-25)', async () => {
      const other = await r.repos.insert(newRepo());
      await r.loops.insert(newLoop({ repoId: other.id }));
      const b = await r.loops.insert(newLoop({ repoId: other.id }));
      await r.loops.update(b.id, { archivedAt: at(99), updatedAt: at(99) }, 1);
      await r.loops.insert(newLoop());
      expect(await r.loops.counts(other.id)).toEqual({ active: 0, stopped: 1, archived: 1 });
      expect(await r.loops.counts(repoId)).toEqual({ active: 0, stopped: 1, archived: 0 });
      expect(await r.loops.counts(randomUUID())).toEqual({ active: 0, stopped: 0, archived: 0 });
      expect(await r.loops.counts('not-a-uuid')).toEqual({ active: 0, stopped: 0, archived: 0 });
    });

    it('findDue: only active, unarchived loops with next_run_at <= now; earliest first; limit; includes openExecutionId', async () => {
      const early = await activeLoop({}, at(100));
      const late = await activeLoop({}, at(200));
      await activeLoop({}, at(500)); // not due yet
      await r.loops.insert(newLoop()); // stopped

      const due = await r.loops.findDue(at(300), 50);
      expect(due.map((l) => l.id)).toEqual([early.loop.id, late.loop.id]);
      expect(due[0]).toMatchObject({ nextRunAt: at(100), openExecutionId: early.execution.id, status: 'active' });
      expect((await r.loops.findDue(at(300), 1)).map((l) => l.id)).toEqual([early.loop.id]);
      expect(await r.loops.findDue(at(99), 50)).toEqual([]);
      expect((await r.loops.findDue(at(100), 50)).map((l) => l.id)).toEqual([early.loop.id]); // <= now
    });

    it('advanceNextRun is compare-and-set: matching expected -> true; stale expected / stopped loop -> false', async () => {
      const { loop } = await activeLoop({}, at(100));
      expect(await r.loops.advanceNextRun(loop.id, at(100), at(400))).toBe(true);
      expect((await r.loops.findById(loop.id))?.nextRunAt).toEqual(at(400));
      expect(await r.loops.advanceNextRun(loop.id, at(100), at(700))).toBe(false); // the second tick read the old value
      expect((await r.loops.findById(loop.id))?.nextRunAt).toEqual(at(400));
      // version unchanged (version only covers config edits - UC-09)
      expect((await r.loops.findById(loop.id))?.version).toBe(1);

      expect(await r.loops.advanceNextRun(loop.id, at(400), null)).toBe(true);
      expect((await r.loops.findById(loop.id))?.nextRunAt).toBeNull();

      const stopped = await r.loops.insert(newLoop());
      expect(await r.loops.advanceNextRun(stopped.id, at(100), at(200))).toBe(false);
      expect(await r.loops.advanceNextRun(randomUUID(), at(100), at(200))).toBe(false);
    });

    it('advanceNextRun called concurrently with the same expected -> exactly one wins', async () => {
      const { loop } = await activeLoop({}, at(100));
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => r.loops.advanceNextRun(loop.id, at(100), at(1000 + i))),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('stopAll: every active loop -> stopped, next_run_at null; returns the number of loops changed', async () => {
      const a = await activeLoop();
      const b = await activeLoop();
      const c = await r.loops.insert(newLoop());
      expect(await r.loops.stopAll(at(900))).toBe(2);
      for (const id of [a.loop.id, b.loop.id]) {
        expect(await r.loops.findById(id)).toMatchObject({ status: 'stopped', nextRunAt: null, updatedAt: at(900) });
      }
      expect((await r.loops.findById(c.id))?.updatedAt).toEqual(c.updatedAt);
      expect(await r.loops.stopAll(at(901))).toBe(0);
    });
  });

  // ================================================================ ExecutionRepository
  describe('ExecutionRepository', () => {
    it('open with nextRunAt null: the loop is active with no next run, and findDue skips it', async () => {
      const { loop } = await activeLoop({}, null);
      expect(await r.loops.findById(loop.id)).toMatchObject({ status: 'active', nextRunAt: null });
      expect((await r.loops.findDue(at(999_999), 50)).map((l) => l.id)).not.toContain(loop.id);
    });

    it('open: execution #1, loop -> active + next_run_at; a second open -> already_active, counter does not bump', async () => {
      const loop = await r.loops.insert(newLoop());
      const first = await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(10), nextRunAt: at(60) });
      expect(first.kind).toBe('opened');
      if (first.kind !== 'opened') return;
      expect(first.execution).toMatchObject({ loopId: loop.id, seq: 1, startedAt: at(10), endedAt: null, endReason: null });
      expect(await r.loops.findById(loop.id)).toMatchObject({ status: 'active', nextRunAt: at(60), executionCounter: 1, version: 1 });

      const second = await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(20), nextRunAt: at(999) });
      expect(second).toEqual({ kind: 'already_active' });
      expect(await r.loops.findById(loop.id)).toMatchObject({ executionCounter: 1, nextRunAt: at(60) });
      expect((await r.executions.findOpen(loop.id))?.id).toBe(first.execution.id);
    });

    it('concurrent open (two tabs both press Start) -> exactly one opened, counter = 1', async () => {
      const loop = await r.loops.insert(newLoop());
      const results = await Promise.all(
        [0, 1, 2].map(() => r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(1), nextRunAt: at(60) })),
      );
      expect(results.filter((x) => x.kind === 'opened')).toHaveLength(1);
      expect((await r.loops.findById(loop.id))?.executionCounter).toBe(1);
    });

    it('open an archived loop -> LOOP_ARCHIVED; no such loop -> LOOP_NOT_FOUND', async () => {
      const loop = await r.loops.insert(newLoop());
      await r.loops.update(loop.id, { archivedAt: at(5), updatedAt: at(5) }, 1);
      await expectCode(r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(6), nextRunAt: at(60) }), 'LOOP_ARCHIVED');
      expect((await r.loops.findById(loop.id))?.status).toBe('stopped');
      await expectCode(r.executions.open({ id: randomUUID(), loopId: randomUUID(), now: at(6), nextRunAt: at(60) }), 'LOOP_NOT_FOUND');
    });

    it('close: closes with a reason, loop -> stopped; a second close -> null; Start again -> execution #2', async () => {
      const { loop, execution } = await activeLoop();
      const closed = await r.executions.close(loop.id, 'stopped', at(500));
      expect(closed).toMatchObject({ id: execution.id, endedAt: at(500), endReason: 'stopped' });
      expect(await r.loops.findById(loop.id)).toMatchObject({ status: 'stopped', nextRunAt: null, updatedAt: at(500) });
      expect(await r.executions.findOpen(loop.id)).toBeNull();
      expect(await r.executions.close(loop.id, 'stopped', at(501))).toBeNull();

      const again = await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(600), nextRunAt: at(660) });
      expect(again.kind === 'opened' && again.execution.seq).toBe(2);
      expect(await r.executions.findById(execution.id)).toMatchObject({ endReason: 'stopped' });
      expect(await r.executions.findById(randomUUID())).toBeNull();
    });

    it('listByLoop: newest first, cursor pagination with no duplicates and no gaps', async () => {
      const loop = await r.loops.insert(newLoop());
      for (let k = 1; k <= 5; k++) {
        await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(k * 100), nextRunAt: at(k * 100 + 60) });
        await r.executions.close(loop.id, 'stopped', at(k * 100 + 50));
      }
      const other = await activeLoop();
      const p1 = await r.executions.listByLoop(loop.id, { limit: 2 });
      expect(p1.items.map((e) => e.seq)).toEqual([5, 4]);
      const p2 = await r.executions.listByLoop(loop.id, { limit: 2, cursor: p1.nextCursor });
      expect(p2.items.map((e) => e.seq)).toEqual([3, 2]);
      const p3 = await r.executions.listByLoop(loop.id, { limit: 2, cursor: p2.nextCursor });
      expect(p3).toMatchObject({ nextCursor: null });
      expect(p3.items.map((e) => e.seq)).toEqual([1]);
      expect((await r.executions.listByLoop(loop.id, { limit: 5 })).nextCursor).toBeNull();
      expect((await r.executions.listByLoop(other.loop.id, { limit: 5 })).items).toHaveLength(1);
      await expectCode(r.executions.listByLoop(loop.id, { limit: 2, cursor: 'junk' }), 'VALIDATION_FAILED');
    });

    it('closeAllOpen (recovery): closes every open execution with server_down; returns the number closed', async () => {
      const a = await activeLoop();
      const b = await activeLoop();
      const c = await activeLoop();
      await r.executions.close(c.loop.id, 'stopped', at(100));
      expect(await r.executions.closeAllOpen('server_down', at(200))).toBe(2);
      for (const e of [a.execution, b.execution]) {
        expect(await r.executions.findById(e.id)).toMatchObject({ endedAt: at(200), endReason: 'server_down' });
      }
      expect(await r.executions.findById(c.execution.id)).toMatchObject({ endedAt: at(100), endReason: 'stopped' });
      expect(await r.executions.closeAllOpen('server_down', at(300))).toBe(0);
    });
  });

  // ================================================================ RunRepository
  describe('RunRepository', () => {
    it('latestFinishedAt: no run, or only a running run -> null', async () => {
      const { loop, execution } = await activeLoop();
      expect(await r.runs.latestFinishedAt(loop.id)).toBeNull();
      await r.runs.start(startInput(loop.id, execution.id));
      expect(await r.runs.latestFinishedAt(loop.id)).toBeNull();
    });

    it('latestFinishedAt: the latest finished run of this loop, with no skipped rows', async () => {
      const { loop, execution } = await activeLoop({ maxConcurrent: 2 });
      const other = await activeLoop();
      for (const [loopId, executionId, sec] of [
        [loop.id, execution.id, 100],
        [loop.id, execution.id, 200],
        [other.loop.id, other.execution.id, 900],
      ] as const) {
        const res = await r.runs.start(startInput(loopId, executionId));
        if (res.kind !== 'started') throw new Error('the run did not start');
        await r.runs.finish(res.run.id, { status: 'succeeded', finishedAt: at(sec) });
      }
      await r.runs.recordSkipped({
        id: randomUUID(),
        loopId: loop.id,
        executionId: execution.id,
        scheduledFor: at(500),
        at: at(500),
        skipReason: 'round #1 still running',
        promptSnapshot: 'Do the work #1',
        executorKind: 'mock',
        executorConfig: {},
      });
      expect(await r.runs.latestFinishedAt(loop.id)).toEqual(at(200));
    });

    it('start: round #1 running with a snapshot of prompt + executor; a second start -> busy, round counter does not bump', async () => {
      const { loop, execution } = await activeLoop();
      const res = await r.runs.start(startInput(loop.id, execution.id, { trigger: 'start', scheduledFor: null }));
      expect(res.kind).toBe('started');
      if (res.kind !== 'started') return;
      expect(res.run).toMatchObject({
        loopId: loop.id,
        executionId: execution.id,
        iteration: 1,
        trigger: 'start',
        status: 'running',
        scheduledFor: null,
        startedAt: at(60),
        deadlineAt: at(1860),
        finishedAt: null,
        promptSnapshot: 'Do the work #1',
        executorConfig: { durationSec: 10, failRate: 0 },
        sessionId: null,
        costUsd: null,
      });
      expect((await r.loops.findById(loop.id))?.runCounter).toBe(1);

      const second = await r.runs.start(startInput(loop.id, execution.id, { startedAt: at(120) }));
      expect(second.kind).toBe('busy');
      expect(second.kind === 'busy' && second.active.map((x) => x.id)).toEqual([res.run.id]);
      expect(second.kind === 'busy' && second.limit).toBe(1);
      expect((await r.loops.findById(loop.id))?.runCounter).toBe(1);
      expect(await r.runs.listByExecution(execution.id)).toHaveLength(1);

      await r.runs.finish(res.run.id, { status: 'succeeded', finishedAt: at(70) });
      const third = await r.runs.start(startInput(loop.id, execution.id, { startedAt: at(180) }));
      expect(third.kind === 'started' && third.run.iteration).toBe(2); // #2, not #3
    });

    it('concurrent start (tick + the first run of Start) -> exactly one started, counter = 1', async () => {
      const { loop, execution } = await activeLoop();
      const results = await Promise.all([0, 1, 2, 3].map(() => r.runs.start(startInput(loop.id, execution.id))));
      expect(results.filter((x) => x.kind === 'started')).toHaveLength(1);
      expect(results.filter((x) => x.kind === 'busy')).toHaveLength(3);
      expect((await r.loops.findById(loop.id))?.runCounter).toBe(1);
    });

    it('the runs_max_concurrent_per_loop constraint lives in the "table": inserting a second running run for a loop with N = 1 directly -> rejected', async () => {
      const { loop, execution } = await activeLoop();
      const other = await activeLoop();
      await r.rawInsertRunning({ id: randomUUID(), loopId: loop.id, executionId: execution.id, iteration: 1 });
      await expect(
        r.rawInsertRunning({ id: randomUUID(), loopId: loop.id, executionId: execution.id, iteration: 2 }),
      ).rejects.toThrow();
      // another loop is not blocked
      await r.rawInsertRunning({ id: randomUUID(), loopId: other.loop.id, executionId: other.execution.id, iteration: 1 });
      expect(await r.runs.listByExecution(execution.id)).toHaveLength(1);
    });

    describe('up to N runs in parallel', () => {
      it('a new loop defaults to maxConcurrent = 1; write / read back 3; outside 1-10 -> loops_max_concurrent_range', async () => {
        const loop = await r.loops.insert(newLoop());
        expect(loop.maxConcurrent).toBe(1);
        const three = await r.loops.insert(newLoop({ maxConcurrent: 3 }));
        expect((await r.loops.findById(three.id))?.maxConcurrent).toBe(3);
        expect((await r.loops.update(three.id, { maxConcurrent: 10, updatedAt: at(9) }, 1)).maxConcurrent).toBe(10);
        for (const bad of [0, 11]) {
          await expect(r.loops.insert(newLoop({ maxConcurrent: bad }))).rejects.toMatchObject({ constraint: 'loops_max_concurrent_range' });
        }
        await expect(r.loops.update(three.id, { maxConcurrent: 11, updatedAt: at(10) }, 2)).rejects.toMatchObject({ constraint: 'loops_max_concurrent_range' });
      });

      it('N = 3: three runs running at once (rounds #1-#3); the fourth -> busy with all three (oldest first), counter does not bump', async () => {
        const { loop, execution } = await activeLoop({ maxConcurrent: 3 });
        const runs = [];
        for (const sec of [60, 61, 62]) runs.push(await started(loop.id, execution.id, { startedAt: at(sec) }));
        expect(runs.map((x) => x.iteration)).toEqual([1, 2, 3]);
        const fourth = await r.runs.start(startInput(loop.id, execution.id, { startedAt: at(63) }));
        expect(fourth.kind).toBe('busy');
        expect(fourth.kind === 'busy' && fourth.active.map((x) => x.id)).toEqual(runs.map((x) => x.id));
        expect(fourth.kind === 'busy' && fourth.limit).toBe(3);
        expect((await r.loops.findById(loop.id))?.runCounter).toBe(3);
        expect((await r.runs.listActive(loop.id)).map((x) => x.iteration)).toEqual([1, 2, 3]);
      });

      it('lowering N 3 -> 2 while three runs are running: none is touched; busy until only 1 is left running, only then can a new run open', async () => {
        const { loop, execution } = await activeLoop({ maxConcurrent: 3 });
        const [r1, r2, r3] = [await started(loop.id, execution.id, { startedAt: at(60) }), await started(loop.id, execution.id, { startedAt: at(61) }), await started(loop.id, execution.id, { startedAt: at(62) })];
        await r.loops.update(loop.id, { maxConcurrent: 2, updatedAt: at(63) }, 1);
        expect((await r.runs.listActive(loop.id)).map((x) => x.id)).toEqual([r1!.id, r2!.id, r3!.id]);
        const a = await r.runs.start(startInput(loop.id, execution.id, { startedAt: at(64) }));
        expect(a.kind === 'busy' && a.limit).toBe(2);
        await r.runs.finish(r1!.id, { status: 'succeeded', finishedAt: at(70) });
        expect((await r.runs.start(startInput(loop.id, execution.id, { startedAt: at(71) }))).kind).toBe('busy'); // 2 left = N
        await r.runs.finish(r2!.id, { status: 'succeeded', finishedAt: at(72) });
        const b = await r.runs.start(startInput(loop.id, execution.id, { startedAt: at(73) }));
        expect(b.kind === 'started' && b.run.iteration).toBe(4);
        expect((await r.runs.findById(r3!.id))?.status).toBe('running');
      });

      it('concurrent start on a loop with N = 2 -> exactly two started, counter = 2', async () => {
        const { loop, execution } = await activeLoop({ maxConcurrent: 2 });
        const results = await Promise.all([0, 1, 2, 3, 4].map(() => r.runs.start(startInput(loop.id, execution.id))));
        expect(results.filter((x) => x.kind === 'started')).toHaveLength(2);
        expect(results.filter((x) => x.kind === 'busy')).toHaveLength(3);
        expect((await r.loops.findById(loop.id))?.runCounter).toBe(2);
      });

      it('inserting the (N + 1)th running run directly (not through the repository) -> runs_max_concurrent_per_loop', async () => {
        const { loop, execution } = await activeLoop({ maxConcurrent: 2 });
        await r.rawInsertRunning({ id: randomUUID(), loopId: loop.id, executionId: execution.id, iteration: 1 });
        await r.rawInsertRunning({ id: randomUUID(), loopId: loop.id, executionId: execution.id, iteration: 2 });
        await expect(
          r.rawInsertRunning({ id: randomUUID(), loopId: loop.id, executionId: execution.id, iteration: 3 }),
        ).rejects.toMatchObject({ constraint: 'runs_max_concurrent_per_loop' });
        expect(await r.runs.listByExecution(execution.id)).toHaveLength(2);
      });
    });

    it('runs are independent per loop: a busy loop A does not block loop B', async () => {
      const a = await activeLoop();
      const b = await activeLoop();
      await started(a.loop.id, a.execution.id);
      const rb = await r.runs.start(startInput(b.loop.id, b.execution.id));
      expect(rb.kind === 'started' && rb.run.iteration).toBe(1);
    });

    it('recordSkipped: no round number, ends immediately, does not bump the counter, does not block later runs', async () => {
      const { loop, execution } = await activeLoop();
      const running = await started(loop.id, execution.id);
      const skipped = await r.runs.recordSkipped(skipInput(loop.id, execution.id, 120));
      expect(skipped).toMatchObject({
        iteration: null,
        status: 'skipped',
        trigger: 'schedule',
        skipReason: 'round #1 still running',
        startedAt: at(120),
        finishedAt: at(120),
        durationMs: 0,
        sessionId: null,
      });
      await r.runs.recordSkipped(skipInput(loop.id, execution.id, 180)); // several skipped runs (iteration null) do not clash
      expect((await r.loops.findById(loop.id))?.runCounter).toBe(1);
      expect((await r.runs.listActive(loop.id)).map((x) => x.id)).toEqual([running.id]);
    });

    it('setSession + finish: whoever finishes first wins, duration = finished - started; no such run -> RUN_NOT_FOUND', async () => {
      const { loop, execution } = await activeLoop();
      const run = await started(loop.id, execution.id);
      await r.runs.setSession(run.id, 'mock-abc');
      expect((await r.runs.findById(run.id))?.sessionId).toBe('mock-abc');

      const done = await r.runs.finish(run.id, {
        status: 'cancelled',
        finishedAt: at(65.25),
        summary: 'stopped',
        error: null,
        costUsd: 0.012345,
      });
      expect(done).toMatchObject({ status: 'cancelled', finishedAt: at(65.25), durationMs: 5250, summary: 'stopped', costUsd: 0.012345 });
      const late = await r.runs.finish(run.id, { status: 'succeeded', finishedAt: at(90) });
      expect(late).toMatchObject({ status: 'cancelled', finishedAt: at(65.25), sessionId: 'mock-abc' });
      expect(await r.runs.listActive(loop.id)).toEqual([]);

      await expectCode(r.runs.finish(randomUUID(), { status: 'failed', finishedAt: at(1) }), 'RUN_NOT_FOUND');
      await expectCode(r.runs.setSession(randomUUID(), 'x'), 'RUN_NOT_FOUND');
      expect(await r.runs.findById(randomUUID())).toBeNull();
    });

    it('findOverdue: only running runs with deadline_at <= now, earliest deadline first', async () => {
      const a = await activeLoop();
      const b = await activeLoop();
      const c = await activeLoop();
      const d = await activeLoop();
      const ra = await started(a.loop.id, a.execution.id, { deadlineAt: at(200) });
      const rb = await started(b.loop.id, b.execution.id, { deadlineAt: at(100) });
      await started(c.loop.id, c.execution.id, { deadlineAt: at(900) });
      const rd = await started(d.loop.id, d.execution.id, { deadlineAt: at(50) });
      await r.runs.finish(rd.id, { status: 'succeeded', finishedAt: at(61) });

      expect((await r.runs.findOverdue(at(200))).map((x) => x.id)).toEqual([rb.id, ra.id]);
      expect(await r.runs.findOverdue(at(99))).toEqual([]);
    });

    it('findOverdue: a run with no deadline (unlimited loop - UC-24) never goes overdue', async () => {
      const a = await activeLoop({ timeoutSec: null });
      const run = await started(a.loop.id, a.execution.id, { deadlineAt: null });
      expect((await r.runs.findById(run.id))?.deadlineAt).toBeNull();
      expect(await r.runs.findOverdue(at(60 + 365 * 86_400))).toEqual([]);
    });

    it('markAllRunningInterrupted (recovery): every running run -> interrupted; finished runs stay as they are', async () => {
      const a = await activeLoop();
      const b = await activeLoop();
      const ra = await started(a.loop.id, a.execution.id);
      const rb = await started(b.loop.id, b.execution.id);
      await r.runs.finish(rb.id, { status: 'failed', finishedAt: at(70), error: 'Simulated error' });
      expect(await r.runs.markAllRunningInterrupted(at(100))).toBe(1);
      expect(await r.runs.findById(ra.id)).toMatchObject({ status: 'interrupted', finishedAt: at(100), durationMs: 40_000 });
      expect(await r.runs.findById(rb.id)).toMatchObject({ status: 'failed', error: 'Simulated error', finishedAt: at(70) });
      expect(await r.runs.listActive(a.loop.id)).toEqual([]);
      expect(await r.runs.markAllRunningInterrupted(at(101))).toBe(0);
    });

    it('markAllRunningInterrupted: duration counts up to the last heartbeat (aliveUntil), never negative', async () => {
      const a = await activeLoop();
      const b = await activeLoop();
      const ra = await started(a.loop.id, a.execution.id, { startedAt: at(60) });
      const rb = await started(b.loop.id, b.execution.id, { startedAt: at(95) }); // Start after the last heartbeat
      expect(await r.runs.markAllRunningInterrupted(at(500), at(90))).toBe(2);
      expect(await r.runs.findById(ra.id)).toMatchObject({ status: 'interrupted', finishedAt: at(500), durationMs: 30_000 });
      expect(await r.runs.findById(rb.id)).toMatchObject({ status: 'interrupted', finishedAt: at(500), durationMs: 0 });
    });

    it('listByLoop: newest first, cursor pagination (runs with the same started_at included) with no duplicates and no gaps', async () => {
      const { loop, execution } = await activeLoop();
      const ids: string[] = [];
      for (const sec of [100, 200, 200, 300, 300, 300, 400]) {
        const run = await started(loop.id, execution.id, { startedAt: at(sec) });
        await r.runs.finish(run.id, { status: 'succeeded', finishedAt: at(sec + 1) });
        ids.push(run.id);
      }
      const skipped = await r.runs.recordSkipped(skipInput(loop.id, execution.id, 250));
      const other = await activeLoop();
      await started(other.loop.id, other.execution.id);

      const seen: RunRecord[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await r.runs.listByLoop(loop.id, { limit: 3, cursor });
        seen.push(...page.items);
        cursor = page.nextCursor;
        pages++;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen).toHaveLength(8);
      expect(new Set(seen.map((x) => x.id))).toEqual(new Set([...ids, skipped.id]));
      for (let i = 1; i < seen.length; i++) {
        const prev = seen[i - 1]!;
        const cur = seen[i]!;
        expect(prev.startedAt.getTime() > cur.startedAt.getTime() || (prev.startedAt.getTime() === cur.startedAt.getTime() && prev.id > cur.id)).toBe(true);
      }
      await expectCode(r.runs.listByLoop(loop.id, { limit: 3, cursor: 'not-a-cursor' }), 'VALIDATION_FAILED');
      await expectCode(r.runs.listByLoop(loop.id, { limit: 0 }), 'VALIDATION_FAILED');
    });

    it('listByExecution: only that execution\'s runs, oldest first', async () => {
      const { loop, execution } = await activeLoop();
      const r1 = await started(loop.id, execution.id, { startedAt: at(100) });
      await r.runs.finish(r1.id, { status: 'succeeded', finishedAt: at(110) });
      const s = await r.runs.recordSkipped(skipInput(loop.id, execution.id, 150));
      const r2 = await started(loop.id, execution.id, { startedAt: at(200) });
      await r.executions.close(loop.id, 'stopped', at(300));
      await r.runs.finish(r2.id, { status: 'cancelled', finishedAt: at(300) });
      const next = await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(400), nextRunAt: at(460) });
      if (next.kind !== 'opened') throw new Error('could not reopen');
      await started(loop.id, next.execution.id, { startedAt: at(400) });

      expect((await r.runs.listByExecution(execution.id)).map((x) => x.id)).toEqual([r1.id, s.id, r2.id]);
      expect(await r.runs.listByExecution(next.execution.id)).toHaveLength(1);
    });

    it('listBetween: started_at >= from and < to, every status, ordered by started_at then id', async () => {
      const { loop, execution } = await activeLoop();
      const before = await started(loop.id, execution.id, { startedAt: at(50) });
      await r.runs.finish(before.id, { status: 'succeeded', finishedAt: at(55) });
      const a = await started(loop.id, execution.id, { startedAt: at(100) });
      await r.runs.finish(a.id, { status: 'failed', finishedAt: at(110), error: 'boom' });
      const s = await r.runs.recordSkipped(skipInput(loop.id, execution.id, 150));
      const b = await started(loop.id, execution.id, { startedAt: at(200) });
      await r.runs.finish(b.id, { status: 'cancelled', finishedAt: at(210) });
      const edge = await started(loop.id, execution.id, { startedAt: at(300) });
      await r.runs.finish(edge.id, { status: 'succeeded', finishedAt: at(310) });

      const got = await r.runs.listBetween(at(100), at(300));
      expect(got.map((x) => x.id)).toEqual([a.id, s.id, b.id]);
      expect(got.map((x) => x.status)).toEqual(['failed', 'skipped', 'cancelled']);
    });

    it('listBetween: an empty range, and from = to, give no runs', async () => {
      const { loop, execution } = await activeLoop();
      const a = await started(loop.id, execution.id, { startedAt: at(100) });
      await r.runs.finish(a.id, { status: 'succeeded', finishedAt: at(110) });
      expect(await r.runs.listBetween(at(500), at(900))).toEqual([]);
      expect(await r.runs.listBetween(at(100), at(100))).toEqual([]);
    });

    it('statsByExecution: counts by status (failed = failed + timed_out; interrupted on its own, castraferrum#190), how long it has been running, average duration', async () => {
      const { loop, execution } = await activeLoop(); // opened at at(0)
      const finishAs = async (sec: number, status: 'succeeded' | 'failed' | 'cancelled' | 'timed_out', dur: number) => {
        const run = await started(loop.id, execution.id, { startedAt: at(sec) });
        await r.runs.finish(run.id, { status, finishedAt: at(sec + dur) });
      };
      await finishAs(10, 'succeeded', 2);
      await finishAs(20, 'succeeded', 4);
      await finishAs(30, 'failed', 6);
      await finishAs(40, 'timed_out', 8);
      await finishAs(50, 'cancelled', 10);
      await r.runs.recordSkipped(skipInput(loop.id, execution.id, 55));
      const live = await started(loop.id, execution.id, { startedAt: at(60) }); // running
      await r.runs.setSession(live.id, 'sess-1'); // only runs with a session id count towards `sessions`

      const empty = await activeLoop();
      const closed = await activeLoop();
      const cr = await started(closed.loop.id, closed.execution.id, { startedAt: at(5) });
      await r.runs.markAllRunningInterrupted(at(65)); // the running run of `loop` also becomes interrupted
      await r.executions.close(closed.loop.id, 'stopped', at(90));

      const stats = await r.runs.statsByExecution([execution.id, empty.execution.id, closed.execution.id, randomUUID()], at(120));
      expect(stats.size).toBe(3);
      expect(stats.get(execution.id)).toEqual({
        runs: 6,
        running: 0,
        succeeded: 2,
        failed: 2, // failed + timed_out
        interrupted: 1, // a server shutdown is not a failure of the run
        cancelled: 1,
        skipped: 1,
        sessions: 1,
        elapsedMs: 120_000, // still open: now - started_at
        avgDurationMs: Math.round((2 + 4 + 6 + 8 + 10 + 5) * 1000 / 6),
      });
      expect(stats.get(empty.execution.id)).toEqual({
        runs: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        interrupted: 0,
        cancelled: 0,
        skipped: 0,
        sessions: 0,
        elapsedMs: 120_000,
        avgDurationMs: null,
      });
      expect(stats.get(closed.execution.id)).toMatchObject({ runs: 1, failed: 0, interrupted: 1, elapsedMs: 90_000 }); // closed: ended - started
      expect((await r.runs.findById(cr.id))?.status).toBe('interrupted');
      expect((await r.runs.statsByExecution([], at(1))).size).toBe(0);
    });

    it('countOverview: running runs; runs started (skipped excluded) since the cutoff; failed runs finished since the cutoff (UC-03)', async () => {
      const a = await activeLoop();
      const b = await activeLoop();
      const finishAs = async (sec: number, status: 'succeeded' | 'failed' | 'cancelled' | 'timed_out', end: number) => {
        const run = await started(b.loop.id, b.execution.id, { startedAt: at(sec) });
        await r.runs.finish(run.id, { status, finishedAt: at(end) });
      };
      await finishAs(10, 'failed', 20); // before both cutoffs
      await finishAs(30, 'timed_out', 120); // started before the "today" cutoff, failed after the "24 hours" cutoff
      await finishAs(110, 'succeeded', 130);
      await finishAs(140, 'cancelled', 150); // cancelled is not a failure
      const c = await activeLoop();
      await started(c.loop.id, c.execution.id, { startedAt: at(90) });
      await r.runs.markAllRunningInterrupted(at(160)); // the run started at at(90) -> interrupted, finished at at(160)
      await r.runs.recordSkipped(skipInput(b.loop.id, b.execution.id, 170)); // skipped: not counted
      await started(a.loop.id, a.execution.id, { startedAt: at(200) });
      await finishAs(210, 'failed', 215); // finishes exactly on the failure cutoff -> counted (>=)

      expect(await r.runs.countOverview(at(100), at(100))).toEqual({ running: 1, startedSince: 4, failedSince: 3 });
      expect(await r.runs.countOverview(at(90), at(215))).toEqual({ running: 1, startedSince: 5, failedSince: 1 });
      expect(await r.runs.countOverview(at(1000), at(1000))).toEqual({ running: 1, startedSince: 0, failedSince: 0 });
    });

    it('statsByExecution counts running runs', async () => {
      const { loop, execution } = await activeLoop();
      await started(loop.id, execution.id, { startedAt: at(10) });
      expect((await r.runs.statsByExecution([execution.id], at(30))).get(execution.id)).toMatchObject({
        runs: 1,
        running: 1,
        avgDurationMs: null,
      });
    });
  });

  // ================================================================ RunLogRepository + Heartbeat
  describe('RunLogRepository', () => {
    it('append assigns consecutive increasing seq; list by afterSeq + limit; data keeps its JSON as is', async () => {
      const { loop, execution } = await activeLoop();
      const run = await started(loop.id, execution.id);
      const first = await r.logs.append(run.id, [
        { at: at(61), level: 'info', message: 'Start round #1' },
        { at: at(62), level: 'warn', message: 'working... (1/10)', data: { k: 1, list: [1, 'two'] } },
      ]);
      expect(first.map((l) => l.seq)).toEqual([1, 2]);
      expect(first[1]).toEqual({ runId: run.id, seq: 2, at: at(62), level: 'warn', message: 'working... (1/10)', data: { k: 1, list: [1, 'two'] } });
      expect(first[0]?.data).toBeNull();
      const more = await r.logs.append(run.id, [{ at: at(63), level: 'error', message: 'Simulated error' }]);
      expect(more.map((l) => l.seq)).toEqual([3]);
      expect(await r.logs.append(run.id, [])).toEqual([]);

      expect((await r.logs.list(run.id, 0, 100)).map((l) => l.message)).toEqual(['Start round #1', 'working... (1/10)', 'Simulated error']);
      expect((await r.logs.list(run.id, 1, 1)).map((l) => l.seq)).toEqual([2]);
      expect(await r.logs.list(run.id, 3, 100)).toEqual([]);
      expect(await r.logs.list(randomUUID(), 0, 100)).toEqual([]);
      await expectCode(r.logs.append(randomUUID(), [{ at: at(1), level: 'info', message: 'x' }]), 'RUN_NOT_FOUND');
    });

    it('concurrent append to the same run never hands out a duplicate seq', async () => {
      const { loop, execution } = await activeLoop();
      const run = await started(loop.id, execution.id);
      await Promise.all(
        Array.from({ length: 5 }, (_, i) => r.logs.append(run.id, [{ at: at(70 + i), level: 'info', message: `line ${i}` }])),
      );
      expect((await r.logs.list(run.id, 0, 100)).map((l) => l.seq)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('HeartbeatRepository', () => {
    it('no heartbeat yet -> null; beat overwrites, last returns the latest beat', async () => {
      expect(await r.heartbeat.last()).toBeNull();
      await r.heartbeat.beat(at(10));
      await r.heartbeat.beat(at(20));
      expect(await r.heartbeat.last()).toEqual(at(20));
    });
  });

  describe('loop_probes', () => {
    const settings = (over: Partial<ProbeSettings> = {}): ProbeSettings => ({
      command: ['node', 'probe.mjs'],
      claim: ['node', 'claim.mjs', '{key}'],
      release: ['node', 'release.mjs', '{key}', '{reason}'],
      resources: [{ name: 'docker', check: ['docker', 'info'], everySec: 30 }],
      laneEnv: { PORT: '{port}' },
      laneBasePort: 7200,
      restartPolicy: 'resume',
      ...over,
    });

    it('a loop with no probe -> get null; upsert inserts the row with state active and no last line', async () => {
      const loop = await r.loops.insert(newLoop());
      expect(await r.probes.get(loop.id)).toBeNull();
      const row = await r.probes.upsert(loop.id, settings());
      expect(row).toEqual({ loopId: loop.id, ...settings(), state: 'active', lastLine: null, lastProbeAt: null });
      expect(await r.probes.get(loop.id)).toEqual(row);
    });

    it('upsert on an existing row replaces the settings and keeps the state, the last line and the last probe time', async () => {
      const loop = await r.loops.insert(newLoop());
      await r.probes.upsert(loop.id, settings());
      await r.probes.record(loop.id, { state: 'waiting', lastLine: '{"v":1,"action":"wait"}', at: at(50) });
      const row = await r.probes.upsert(loop.id, settings({ command: ['node', 'other.mjs'], resources: [], laneBasePort: null, restartPolicy: 'stop' }));
      expect(row).toEqual({
        loopId: loop.id,
        ...settings({ command: ['node', 'other.mjs'], resources: [], laneBasePort: null, restartPolicy: 'stop' }),
        state: 'waiting',
        lastLine: '{"v":1,"action":"wait"}',
        lastProbeAt: at(50),
      });
    });

    it('upsert for an unknown loop -> LOOP_NOT_FOUND and no row', async () => {
      const missing = randomUUID();
      await expectCode(r.probes.upsert(missing, settings()), 'LOOP_NOT_FOUND');
      expect(await r.probes.get(missing)).toBeNull();
    });

    it('list returns every probe ordered by loop id', async () => {
      const loops = await Promise.all([r.loops.insert(newLoop()), r.loops.insert(newLoop()), r.loops.insert(newLoop())]);
      expect(await r.probes.list()).toEqual([]);
      for (const l of loops) await r.probes.upsert(l.id, settings({ command: ['probe', l.id] }));
      const rows = await r.probes.list();
      expect(rows.map((x) => x.loopId)).toEqual(loops.map((l) => l.id).sort());
      expect(rows.every((x) => x.command[1] === x.loopId)).toBe(true);
    });

    it('remove deletes the row, leaves other rows, and a loop with no row is not an error', async () => {
      const [a, b] = await Promise.all([r.loops.insert(newLoop()), r.loops.insert(newLoop())]);
      await r.probes.upsert(a.id, settings());
      await r.probes.upsert(b.id, settings());
      await r.probes.remove(a.id);
      await r.probes.remove(a.id);
      expect(await r.probes.get(a.id)).toBeNull();
      expect(await r.probes.get(b.id)).not.toBeNull();
    });

    it('record stores the state, the last line and the time; a loop with no row is not an error', async () => {
      const loop = await r.loops.insert(newLoop());
      await r.probes.record(loop.id, { state: 'blocked', lastLine: 'x', at: at(1) });
      expect(await r.probes.get(loop.id)).toBeNull();
      await r.probes.upsert(loop.id, settings());
      await r.probes.record(loop.id, { state: 'probe_failed', lastLine: null, at: at(60) });
      expect(await r.probes.get(loop.id)).toMatchObject({ state: 'probe_failed', lastLine: null, lastProbeAt: at(60) });
    });
  });

  describe('resource_holds', () => {
    const holdInput = (resource = 'plan-window', sec = 0) => ({ id: randomUUID(), resource, reason: 'a limit', openedAt: at(sec), until: null, openedByRunId: null });
    /** A probe loop with one running run. */
    const runningRun = async (over: Partial<StartRunInput> = {}) => {
      const { loop, execution } = await activeLoop({ maxConcurrent: 3 }, null);
      return { loop, run: await started(loop.id, execution.id, { trigger: 'probe', ...over }) };
    };

    it('open gives opened, and listOpen returns the row with every field', async () => {
      const runId = randomUUID();
      const input = { ...holdInput(), until: at(100), openedByRunId: runId };
      expect(await r.holds.open(input)).toBe('opened');
      expect(await r.holds.listOpen()).toEqual([{ ...input, checkedAt: null, closedAt: null, trialRunId: null }]);
    });

    it('a second open of one resource gives kept and changes nothing, and another resource opens its own row', async () => {
      const first = holdInput();
      await r.holds.open(first);
      expect(await r.holds.open({ ...holdInput(), reason: 'another', until: at(100) })).toBe('kept');
      expect(await r.holds.open(holdInput('docker', 1))).toBe('opened');
      expect((await r.holds.listOpen()).map((h) => [h.id === first.id, h.resource, h.reason, h.until])).toEqual([
        [true, 'plan-window', 'a limit', null],
        [false, 'docker', 'a limit', null],
      ]);
    });

    it('a resource can open again after its hold closes', async () => {
      const first = holdInput();
      await r.holds.open(first);
      await r.holds.close(first.id, at(10));
      expect(await r.holds.open(holdInput('plan-window', 20))).toBe('opened');
      expect((await r.holds.listOpen()).map((h) => h.openedAt)).toEqual([at(20)]);
    });

    it('raiseUntil replaces a null, raises a value, and never lowers it', async () => {
      await r.holds.open(holdInput());
      const until = async () => (await r.holds.listOpen())[0]?.until;
      await r.holds.raiseUntil('plan-window', at(100));
      expect(await until()).toEqual(at(100));
      await r.holds.raiseUntil('plan-window', at(50));
      expect(await until()).toEqual(at(100));
      await r.holds.raiseUntil('plan-window', at(200));
      expect(await until()).toEqual(at(200));
    });

    it('raiseUntil does not touch a closed hold or another resource', async () => {
      const closed = holdInput();
      await r.holds.open(closed);
      await r.holds.close(closed.id, at(1));
      await r.holds.open(holdInput('docker'));
      await r.holds.raiseUntil('plan-window', at(100));
      expect((await r.holds.listOpen()).map((h) => [h.resource, h.until])).toEqual([['docker', null]]);
    });

    it('markChecked writes the time and the trial run, and a null clears the trial', async () => {
      const hold = holdInput();
      const trial = randomUUID();
      await r.holds.open(hold);
      await r.holds.markChecked(hold.id, at(30), trial);
      expect((await r.holds.listOpen())[0]).toMatchObject({ checkedAt: at(30), trialRunId: trial });
      await r.holds.markChecked(hold.id, at(60), null);
      expect((await r.holds.listOpen())[0]).toMatchObject({ checkedAt: at(60), trialRunId: null });
    });

    it('hold: a running run becomes held with its session and no end, a null cost keeps the stored cost, and a value replaces it', async () => {
      const { run } = await runningRun();
      await r.runs.setSession(run.id, 's-1');
      expect(await r.runs.hold(run.id, 0.5)).toMatchObject({ status: 'held', sessionId: 's-1', costUsd: 0.5, finishedAt: null, durationMs: null });
      await r.runs.resume(run.id, null);
      expect(await r.runs.hold(run.id, null)).toMatchObject({ status: 'held', costUsd: 0.5 });
      expect(await r.runs.hold(run.id, 0.75)).toBeNull(); // already held
    });

    it('resume: a held run is running again, with a new deadline and one more resume, and any other run gives null', async () => {
      const { run } = await runningRun({ deadlineAt: at(100) });
      expect(run.resumeCount).toBe(0);
      expect(await r.runs.resume(run.id, at(500))).toBeNull(); // still running
      await r.runs.hold(run.id, null);
      expect(await r.runs.resume(run.id, at(500))).toMatchObject({ status: 'running', deadlineAt: at(500), resumeCount: 1 });
      await r.runs.hold(run.id, null);
      expect(await r.runs.resume(run.id, null)).toMatchObject({ deadlineAt: null, resumeCount: 2 });
    });

    it('finish accepts a held run, and a finished run keeps its first outcome', async () => {
      const { run } = await runningRun();
      await r.runs.hold(run.id, 0.5);
      expect(await r.runs.finish(run.id, { status: 'cancelled', finishedAt: at(90), costUsd: 0.5 })).toMatchObject({ status: 'cancelled', costUsd: 0.5, finishedAt: at(90), durationMs: 30_000 });
      expect(await r.runs.finish(run.id, { status: 'failed', finishedAt: at(95) })).toMatchObject({ status: 'cancelled' });
      expect(await r.runs.hold(run.id, null)).toBeNull();
    });

    it('listHeld and listAllHeld are oldest first, and a held run is neither active nor overdue', async () => {
      const a = await runningRun({ startedAt: at(70), deadlineAt: at(71) });
      const b = await runningRun({ startedAt: at(65) });
      await r.runs.hold(a.run.id, null);
      await r.runs.hold(b.run.id, null);

      expect((await r.runs.listAllHeld()).map((x) => x.id)).toEqual([b.run.id, a.run.id]);
      expect((await r.runs.listHeld(a.loop.id)).map((x) => x.id)).toEqual([a.run.id]);
      expect(await r.runs.listActive(a.loop.id)).toEqual([]);
      expect(await r.runs.findOverdue(at(1000))).toEqual([]);
    });

    it('markHeldInterrupted changes the held runs of other loops, with the duration up to aliveUntil, and leaves running runs', async () => {
      const stops = await runningRun({ startedAt: at(60) });
      const kept = await runningRun({ startedAt: at(60) });
      const live = await runningRun({ startedAt: at(60) });
      await r.runs.hold(stops.run.id, null);
      await r.runs.hold(kept.run.id, null);

      expect(await r.runs.markHeldInterrupted(at(500), at(100), [kept.loop.id])).toBe(1);
      expect(await r.runs.findById(stops.run.id)).toMatchObject({ status: 'interrupted', finishedAt: at(500), durationMs: 40_000 });
      expect(await r.runs.findById(kept.run.id)).toMatchObject({ status: 'held', finishedAt: null });
      expect(await r.runs.findById(live.run.id)).toMatchObject({ status: 'running' });
    });

    it('findOrphaned skips a claim whose run is held, and finds it when the run ends', async () => {
      const { loop, run } = await runningRun();
      await r.claims.open({ id: randomUUID(), loopId: loop.id, taskKey: '141', runId: run.id, at: at(0) });
      await r.runs.hold(run.id, null);
      expect(await r.claims.findOrphaned(10)).toEqual([]);

      await r.runs.finish(run.id, { status: 'cancelled', finishedAt: at(90) });
      expect(await r.claims.findOrphaned(10)).toEqual([expect.objectContaining({ runId: run.id, runStatus: 'cancelled' })]);
    });
  });

  describe('run_claims', () => {
    const openClaim = async (loopId: string, taskKey = '141', sec = 0) => {
      const id = randomUUID();
      const runId = randomUUID();
      return { id, runId, answer: await r.claims.open({ id, loopId, taskKey, runId, at: at(sec) }) };
    };
    /** A loop with a claim whose run is in the table with this status. */
    const claimWithRun = async (status: 'running' | 'succeeded') => {
      const loop = await r.loops.insert(newLoop());
      const exec = await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(0), nextRunAt: null });
      if (exec.kind !== 'opened') throw new Error('no execution');
      const run = randomUUID();
      const started = await r.runs.start({
        id: run,
        loopId: loop.id,
        executionId: exec.execution.id,
        trigger: 'probe',
        taskKey: '141',
        scheduledFor: null,
        startedAt: at(1),
        deadlineAt: null,
        promptSnapshot: 'p',
        executorKind: 'mock',
        executorConfig: {},
      });
      if (started.kind !== 'started') throw new Error('no run');
      expect(started.run).toMatchObject({ trigger: 'probe', taskKey: '141', slot: null, endResult: null, endPr: null });
      if (status === 'succeeded') {
        const done = await r.runs.finish(run, { status: 'succeeded', finishedAt: at(2), endResult: 'PR_OPEN', endPr: 'https://x/pull/7' });
        expect(done).toMatchObject({ endResult: 'PR_OPEN', endPr: 'https://x/pull/7' });
      }
      const id = randomUUID();
      await r.claims.open({ id, loopId: loop.id, taskKey: '141', runId: run, at: at(0) });
      return { id, run };
    };

    it('open gives opened, and a second open of the same loop and key gives taken and no row', async () => {
      const loop = await r.loops.insert(newLoop());
      const first = await openClaim(loop.id);
      expect(first.answer).toBe('opened');
      expect((await openClaim(loop.id)).answer).toBe('taken');
      expect((await r.claims.listOpen(loop.id)).map((c) => c.id)).toEqual([first.id]);
    });

    it('the same key in another loop opens, and another key in one loop opens', async () => {
      const a = await r.loops.insert(newLoop());
      const b = await r.loops.insert(newLoop());
      expect((await openClaim(a.id)).answer).toBe('opened');
      expect((await openClaim(b.id)).answer).toBe('opened');
      expect((await openClaim(a.id, '142')).answer).toBe('opened');
    });

    it('a closed row frees its key', async () => {
      const loop = await r.loops.insert(newLoop());
      const first = await openClaim(loop.id);
      await r.claims.close(first.id, 'run succeeded', at(5));
      expect(await r.claims.listOpen(loop.id)).toEqual([]);
      expect((await openClaim(loop.id)).answer).toBe('opened');
    });

    it('the first close stays', async () => {
      const loop = await r.loops.insert(newLoop());
      const { id } = await openClaim(loop.id);
      await r.claims.close(id, 'run failed', at(5));
      await r.claims.close(id, 'second', at(9));
      await r.claims.close(randomUUID(), 'no such row', at(9));
      const { id: other } = await openClaim(loop.id, '142', 1);
      await r.claims.close(other, 'run failed', at(6));
      expect(await r.claims.findOrphaned(10)).toEqual([]);
      expect(await r.claims.listOpen(loop.id)).toEqual([]);
    });

    it('listOpen gives only the rows of the loop, oldest first, with every field', async () => {
      const loop = await r.loops.insert(newLoop());
      const other = await r.loops.insert(newLoop());
      const late = await openClaim(loop.id, '142', 9);
      const early = await openClaim(loop.id, '141', 1);
      await openClaim(other.id);
      expect(await r.claims.listOpen(loop.id)).toEqual([
        { id: early.id, loopId: loop.id, taskKey: '141', runId: early.runId, openedAt: at(1), closedAt: null, closeReason: null, owner: 'run', gateJobId: null, kind: 'task' },
        { id: late.id, loopId: loop.id, taskKey: '142', runId: late.runId, openedAt: at(9), closedAt: null, closeReason: null, owner: 'run', gateJobId: null, kind: 'task' },
      ]);
    });

    it('findOrphaned skips a running run', async () => {
      await claimWithRun('running');
      expect(await r.claims.findOrphaned(10)).toEqual([]);
    });

    it('findOrphaned gives a finished run with its status and end word, and a row with no run with null', async () => {
      const { id } = await claimWithRun('succeeded');
      const loop = await r.loops.insert(newLoop());
      const lost = await openClaim(loop.id, '200', 7);
      expect((await r.claims.findOrphaned(10)).map((c) => [c.id, c.runStatus, c.endResult, c.endPr])).toEqual([
        [id, 'succeeded', 'PR_OPEN', 'https://x/pull/7'],
        [lost.id, null, null, null],
      ]);
    });

    it('findOrphaned keeps to its limit, oldest first, and a skipped run row keeps its trigger and key', async () => {
      const loop = await r.loops.insert(newLoop());
      const old = await openClaim(loop.id, '141', 1);
      await openClaim(loop.id, '142', 2);
      expect((await r.claims.findOrphaned(1)).map((c) => c.id)).toEqual([old.id]);

      const exec = await r.executions.open({ id: randomUUID(), loopId: loop.id, now: at(0), nextRunAt: null });
      if (exec.kind !== 'opened') throw new Error('no execution');
      const skipped = await r.runs.recordSkipped({
        id: randomUUID(),
        trigger: 'probe',
        taskKey: '141',
        loopId: loop.id,
        executionId: exec.execution.id,
        scheduledFor: null,
        at: at(3),
        skipReason: 'full',
        promptSnapshot: 'p',
        executorKind: 'mock',
        executorConfig: {},
      });
      expect(skipped).toMatchObject({ trigger: 'probe', taskKey: '141', status: 'skipped' });
    });
  });

  describe('goal_met', () => {
    it('close with goal_met stores the reason, stops the loop and frees the next Start', async () => {
      const { loop, execution } = await activeLoop();
      const closed = await r.executions.close(loop.id, 'goal_met', at(50));
      expect(closed).toMatchObject({ id: execution.id, endedAt: at(50), endReason: 'goal_met' });
      expect(await r.executions.findById(execution.id)).toMatchObject({ endReason: 'goal_met' });
      expect(await r.loops.findById(loop.id)).toMatchObject({ status: 'stopped', nextRunAt: null });
      expect(await r.executions.close(loop.id, 'stopped', at(60))).toBeNull(); // the period is closed once
      expect(await r.executions.findOpen(loop.id)).toBeNull();
    });

    it('a plan row keeps its kind, the default kind is task, and a plan key is taken while its row is open', async () => {
      const loop = await r.loops.insert(newLoop());
      const plan = { id: randomUUID(), runId: randomUUID() };
      expect(await r.claims.open({ id: plan.id, loopId: loop.id, taskKey: 'plan-217', runId: plan.runId, at: at(1), kind: 'plan' })).toBe('opened');
      expect(await r.claims.open({ id: randomUUID(), loopId: loop.id, taskKey: 'plan-217', runId: randomUUID(), at: at(2), kind: 'plan' })).toBe('taken');
      expect(await r.claims.open({ id: randomUUID(), loopId: loop.id, taskKey: '141', runId: randomUUID(), at: at(3) })).toBe('opened');
      expect((await r.claims.listOpen(loop.id)).map((c) => [c.taskKey, c.kind])).toEqual([
        ['plan-217', 'plan'],
        ['141', 'task'],
      ]);
      await r.claims.close(plan.id, 'run succeeded', at(9));
      expect(await r.claims.open({ id: randomUUID(), loopId: loop.id, taskKey: 'plan-217', runId: randomUUID(), at: at(10), kind: 'plan' })).toBe('opened');
    });

    it('findOrphaned gives the kind of the row, so the tick can close a plan row with no release', async () => {
      const loop = await r.loops.insert(newLoop());
      const plan = randomUUID();
      const task = randomUUID();
      await r.claims.open({ id: plan, loopId: loop.id, taskKey: 'plan-217', runId: randomUUID(), at: at(1), kind: 'plan' });
      await r.claims.open({ id: task, loopId: loop.id, taskKey: '141', runId: randomUUID(), at: at(2) });
      expect((await r.claims.findOrphaned(10)).map((c) => [c.id, c.kind])).toEqual([
        [plan, 'plan'],
        [task, 'task'],
      ]);
    });
  });

  describe('gate_tables', () => {
    const job = (over: Partial<{ id: string; prNumber: number; headSha: string; taskKey: string; sec: number }> = {}) => {
      const { sec, ...rest } = over;
      return { id: randomUUID(), repoId, prNumber: 7, headSha: 'a'.repeat(40), taskKey: '141', at: at(sec ?? 0), ...rest };
    };
    const enqueue = async (over: Parameters<typeof job>[0] = {}) => {
      const j = job(over);
      return { id: j.id, answer: await r.gate.enqueue(j) };
    };
    const setting = { enabled: true, githubRepo: 'o/r', checkCommand: ['node', 'check.mjs'] };

    it('a repository with no gate row has none', async () => {
      expect(await r.gate.getRepoGate(repoId)).toBeNull();
    });

    it('setRepoGate stores the setting, and the gate stays off when the caller says so', async () => {
      expect(await r.gate.setRepoGate(repoId, { enabled: false, githubRepo: 'o/r', checkCommand: [] }, at(1))).toEqual({
        repoId,
        enabled: false,
        githubRepo: 'o/r',
        checkCommand: [],
        updatedAt: at(1),
      });
      expect(await r.gate.setRepoGate(repoId, setting, at(2))).toMatchObject({ enabled: true, checkCommand: ['node', 'check.mjs'] });
    });

    it('setRepoGate replaces the whole setting', async () => {
      await r.gate.setRepoGate(repoId, setting, at(1));
      await r.gate.setRepoGate(repoId, { enabled: false, githubRepo: 'x/y', checkCommand: [] }, at(2));
      expect(await r.gate.getRepoGate(repoId)).toEqual({ repoId, enabled: false, githubRepo: 'x/y', checkCommand: [], updatedAt: at(2) });
    });

    it('setRepoGate for an unknown repository gives REPO_NOT_FOUND and writes nothing', async () => {
      const unknown = randomUUID();
      await expectCode(r.gate.setRepoGate(unknown, setting, at(1)), 'REPO_NOT_FOUND');
      expect(await r.gate.getRepoGate(unknown)).toBeNull();
    });

    it('enqueue queues a job with its fields', async () => {
      const first = await enqueue();
      expect(first.answer).toBe('queued');
      expect(await r.gate.get(first.id)).toEqual({
        id: first.id,
        repoId,
        prNumber: 7,
        headSha: 'a'.repeat(40),
        taskKey: '141',
        state: 'queued',
        failedStep: null,
        queuedAt: at(0),
        startedAt: null,
        finishedAt: null,
        ratifiedAt: null,
      });
    });

    it('the same repository, PR and head commit is a duplicate, and the index refuses it when the repository is bypassed', async () => {
      expect((await enqueue()).answer).toBe('queued');
      expect((await enqueue({ sec: 1 })).answer).toBe('duplicate');
      expect((await enqueue({ headSha: 'b'.repeat(40) })).answer).toBe('queued');
      expect((await enqueue({ prNumber: 8 })).answer).toBe('queued');
      expect(await r.gate.list(10)).toHaveLength(3);
      await expect(r.rawInsertGateJob({ id: randomUUID(), repoId, prNumber: 7, headSha: 'a'.repeat(40), state: 'queued' })).rejects.toThrow(
        /gate_jobs_one_live_per_head/,
      );
    });

    it('a running job also blocks a duplicate, and enqueue works again after the job finished', async () => {
      const first = await enqueue();
      await r.gate.takeNext(at(1));
      expect((await enqueue({ sec: 2 })).answer).toBe('duplicate');
      await r.gate.finish(first.id, { state: 'failed', failedStep: 'green', at: at(3) });
      expect((await enqueue({ sec: 4 })).answer).toBe('queued');
    });

    it('takeNext takes the oldest queued job and marks it running', async () => {
      const late = await enqueue({ prNumber: 2, sec: 9 });
      const early = await enqueue({ prNumber: 1, sec: 1 });
      const taken = await r.gate.takeNext(at(20));
      expect(taken).toMatchObject({ id: early.id, state: 'running', startedAt: at(20), finishedAt: null });
      expect(await r.gate.get(early.id)).toMatchObject({ state: 'running' });
      expect(await r.gate.get(late.id)).toMatchObject({ state: 'queued', startedAt: null });
    });

    it('takeNext gives null while a job runs, and the index refuses a second running row', async () => {
      await enqueue({ prNumber: 1 });
      await enqueue({ prNumber: 2, sec: 1 });
      expect(await r.gate.takeNext(at(5))).not.toBeNull();
      expect(await r.gate.takeNext(at(6))).toBeNull();
      expect((await r.gate.list(10)).filter((j) => j.state === 'running')).toHaveLength(1);
      await expect(r.rawInsertGateJob({ id: randomUUID(), repoId, prNumber: 99, headSha: 'c'.repeat(40), state: 'running' })).rejects.toThrow(
        /gate_jobs_one_running/,
      );
    });

    it('takeNext gives null when nothing is queued', async () => {
      expect(await r.gate.takeNext(at(1))).toBeNull();
    });

    it('finish moves a running job to its end state, and the first finish stays', async () => {
      const { id } = await enqueue();
      expect(await r.gate.finish(id, { state: 'merged', failedStep: null, at: at(2) })).toBeNull();
      await r.gate.takeNext(at(3));
      expect(await r.gate.finish(id, { state: 'failed', failedStep: 'verify', at: at(4) })).toMatchObject({
        id,
        state: 'failed',
        failedStep: 'verify',
        finishedAt: at(4),
      });
      expect(await r.gate.finish(id, { state: 'merged', failedStep: null, at: at(5) })).toBeNull();
      expect(await r.gate.get(id)).toMatchObject({ state: 'failed', failedStep: 'verify', finishedAt: at(4) });
      expect(await r.gate.finish(randomUUID(), { state: 'failed', failedStep: null, at: at(6) })).toBeNull();
      // The job no longer runs, so the next one can start.
      const next = await enqueue({ prNumber: 8, sec: 7 });
      expect((await r.gate.takeNext(at(8)))?.id).toBe(next.id);
    });

    it('requeueRunning moves each running job to queued and leaves the others', async () => {
      const running = await enqueue({ sec: 1 });
      const queued = await enqueue({ prNumber: 8, sec: 2 });
      await r.gate.takeNext(at(3));
      expect(await r.gate.requeueRunning(at(4))).toBe(1);
      expect(await r.gate.get(running.id)).toMatchObject({ state: 'queued', startedAt: null });
      expect(await r.gate.get(queued.id)).toMatchObject({ state: 'queued' });
      expect(await r.gate.requeueRunning(at(5))).toBe(0);
    });

    it('ratify moves needs_ratification back to queued and keeps its place in the queue', async () => {
      const { id } = await enqueue({ sec: 1 });
      await r.gate.takeNext(at(2));
      await r.gate.finish(id, { state: 'needs_ratification', failedStep: 'scope', at: at(3) });
      const newer = await enqueue({ prNumber: 9, sec: 5 });
      expect(await r.gate.ratify(id, at(6))).toBe('ratified');
      expect(await r.gate.get(id)).toMatchObject({ state: 'queued', ratifiedAt: at(6), startedAt: null, finishedAt: null, failedStep: null });
      expect((await r.gate.takeNext(at(7)))?.id).toBe(id);
      expect((await r.gate.get(newer.id))?.state).toBe('queued');
    });

    it('ratify of a job in any other state, or of an unknown job, gives not_ratifiable and changes nothing', async () => {
      const { id } = await enqueue();
      expect(await r.gate.ratify(id, at(1))).toBe('not_ratifiable');
      await r.gate.takeNext(at(2));
      expect(await r.gate.ratify(id, at(3))).toBe('not_ratifiable');
      await r.gate.finish(id, { state: 'failed', failedStep: 'base', at: at(4) });
      expect(await r.gate.ratify(id, at(5))).toBe('not_ratifiable');
      expect(await r.gate.ratify(randomUUID(), at(5))).toBe('not_ratifiable');
      expect(await r.gate.get(id)).toMatchObject({ state: 'failed', ratifiedAt: null });
    });

    it('listSteps gives the steps of one job by seq, and list gives the newest job first', async () => {
      const a = await enqueue({ prNumber: 1, sec: 1 });
      const b = await enqueue({ prNumber: 2, sec: 2 });
      const step = (jobId: string, seq: number, over: Partial<GateStep> = {}): GateStep => ({
        jobId,
        seq,
        step: 'scope',
        status: 'pass',
        exitCode: 0,
        ms: 12,
        outputTail: 'ok',
        ...over,
      });
      const second = step(a.id, 2, { step: 'base', status: 'skip', exitCode: null, outputTail: 'no base' });
      await r.gate.appendStep(second);
      await r.gate.appendStep(step(a.id, 1));
      await r.gate.appendStep(step(b.id, 1, { step: 'green', status: 'fail', exitCode: 1 }));
      expect(await r.gate.listSteps(a.id)).toEqual([step(a.id, 1), second]);
      expect(await r.gate.listSteps(randomUUID())).toEqual([]);
      expect((await r.gate.list(10)).map((j) => j.id)).toEqual([b.id, a.id]);
      expect((await r.gate.list(1)).map((j) => j.id)).toEqual([b.id]);
    });

    /** Runs a job to its end: enqueue, take (one job runs at a time), finish. */
    const endJob = async (prNumber: number, state: 'merged' | 'failed' | 'needs_ratification', finishSec: number) => {
      const { id } = await enqueue({ prNumber, sec: finishSec - 2 });
      await r.gate.takeNext(at(finishSec - 1));
      await r.gate.finish(id, { state, failedStep: state === 'merged' ? null : 'green', at: at(finishSec) });
      return id;
    };

    it('listRefusedBetween gives only failed and needs_ratification jobs, ordered by finished_at then id', async () => {
      const failed = await endJob(1, 'failed', 20);
      await endJob(2, 'merged', 30);
      const ratify = await endJob(3, 'needs_ratification', 40);
      await enqueue({ prNumber: 4, sec: 41 }); // stays queued
      await enqueue({ prNumber: 5, sec: 42 });
      await r.gate.takeNext(at(43)); // runs
      expect((await r.gate.listRefusedBetween(at(0), at(100))).map((j) => j.id)).toEqual([failed, ratify]);
      expect(await r.gate.listRefusedBetween(at(0), at(100))).toEqual([await r.gate.get(failed), await r.gate.get(ratify)]);
    });

    it('listRefusedBetween includes finished_at = from, excludes finished_at = to, and gives [] for an empty range', async () => {
      const edge = await endJob(1, 'failed', 20);
      const inside = await endJob(2, 'needs_ratification', 30);
      await endJob(3, 'failed', 40);
      expect((await r.gate.listRefusedBetween(at(20), at(40))).map((j) => j.id)).toEqual([edge, inside]);
      expect(await r.gate.listRefusedBetween(at(21), at(30))).toEqual([]);
    });

    it('handOver gives a claim to the gate, and the claim is then not an orphan', async () => {
      const loop = await r.loops.insert(newLoop());
      const claimId = randomUUID();
      // The claim has no run row, so it counts as orphaned until the gate owns it.
      await r.claims.open({ id: claimId, loopId: loop.id, taskKey: '141', runId: randomUUID(), at: at(0) });
      expect((await r.claims.findOrphaned(10)).map((c) => c.id)).toEqual([claimId]);
      const { id: jobId } = await enqueue();
      expect(await r.claims.handOver(claimId, jobId)).toBe(true);
      expect(await r.claims.findOrphaned(10)).toEqual([]);
      expect(await r.claims.listOpen(loop.id)).toMatchObject([{ id: claimId, owner: 'gate', gateJobId: jobId, closedAt: null }]);
      // A closed row cannot be handed over, and an unknown row cannot either.
      await r.claims.close(claimId, 'merged', at(2));
      expect(await r.claims.handOver(claimId, jobId)).toBe(false);
      expect(await r.claims.handOver(randomUUID(), jobId)).toBe(false);
    });
  });

  describe('gate_feed', () => {
    const queued = async (prNumber: number, sec: number) => {
      const id = randomUUID();
      await r.gate.enqueue({ id, repoId, prNumber, headSha: 'b'.repeat(40), taskKey: '141', at: at(sec) });
      return id;
    };

    it('listGateOwned gives the open rows with a gate job, oldest first, and no closed row or row of a run', async () => {
      const loop = await r.loops.insert(newLoop());
      const openRow = async (taskKey: string, sec: number) => {
        const id = randomUUID();
        await r.claims.open({ id, loopId: loop.id, taskKey, runId: randomUUID(), at: at(sec) });
        return id;
      };
      const jobId = await queued(7, 0);
      const late = await openRow('143', 9);
      const early = await openRow('141', 1);
      const closed = await openRow('142', 2);
      await openRow('144', 3);
      for (const id of [late, early, closed]) expect(await r.claims.handOver(id, jobId)).toBe(true);
      await r.claims.close(closed, 'gate: merged', at(10));
      expect((await r.claims.listGateOwned()).map((c) => [c.id, c.owner, c.gateJobId])).toEqual([
        [early, 'gate', jobId],
        [late, 'gate', jobId],
      ]);
    });

    it('ratify with a live job of the same head gives duplicate and changes nothing, and works after that job ends', async () => {
      const waiting = await queued(7, 0);
      await r.gate.takeNext(at(1));
      await r.gate.finish(waiting, { state: 'needs_ratification', failedStep: 'scope', at: at(2) });
      const live = await queued(7, 3);
      expect(await r.gate.ratify(waiting, at(4))).toBe('duplicate');
      expect(await r.gate.get(waiting)).toMatchObject({ state: 'needs_ratification', ratifiedAt: null, failedStep: 'scope' });
      await r.gate.takeNext(at(5));
      expect(await r.gate.ratify(waiting, at(6))).toBe('duplicate');
      await r.gate.finish(live, { state: 'needs_ratification', failedStep: 'scope', at: at(7) });
      expect(await r.gate.ratify(waiting, at(8))).toBe('ratified');
      expect(await r.gate.get(live)).toMatchObject({ state: 'needs_ratification', ratifiedAt: null });
    });
  });

  describe('notices', () => {
    const newNotice = (over: Partial<NewNoticeRecord> = {}): NewNoticeRecord => ({
      id: randomUUID(),
      dedupeKey: `key-${randomUUID().slice(0, 8)}`,
      kind: 'hold',
      loopId: null,
      messageKey: 'notice.hold',
      params: { reason: 'the CI is red' },
      at: at(10),
      ...over,
    });

    it('insertUnread returns the stored unread record; null loopId and params survive the round trip', async () => {
      const n = newNotice({ loopId: null, params: { reason: 'two words' } });
      expect(await r.notices.insertUnread(n)).toEqual({ ...n, readAt: null });
      expect(await r.notices.listUnread(10)).toEqual([{ ...n, readAt: null }]);
    });

    it('a second unread notice with the same dedupeKey is a no-op and returns null', async () => {
      const first = newNotice({ dedupeKey: 'same' });
      await r.notices.insertUnread(first);
      expect(await r.notices.insertUnread(newNotice({ dedupeKey: 'same', params: { reason: 'other' } }))).toBeNull();
      expect(await r.notices.listUnread(10)).toEqual([{ ...first, readAt: null }]);
    });

    it('listUnread is newest first, cuts at the limit, and an equal time is ordered by id descending', async () => {
      const old = newNotice({ at: at(1) });
      const mid = newNotice({ at: at(2) });
      const tieA = newNotice({ at: at(3), id: '00000000-0000-4000-8000-00000000000a' });
      const tieB = newNotice({ at: at(3), id: '00000000-0000-4000-8000-00000000000b' });
      for (const n of [mid, tieA, old, tieB]) await r.notices.insertUnread(n);
      expect((await r.notices.listUnread(10)).map((n) => n.id)).toEqual([tieB.id, tieA.id, mid.id, old.id]);
      expect((await r.notices.listUnread(2)).map((n) => n.id)).toEqual([tieB.id, tieA.id]);
    });

    it('markRead removes the notice from the unread list and frees its key for a new unread notice', async () => {
      const first = newNotice({ dedupeKey: 'again' });
      await r.notices.insertUnread(first);
      await r.notices.markRead(first.id, at(20));
      expect(await r.notices.listUnread(10)).toEqual([]);
      const second = newNotice({ dedupeKey: 'again', at: at(30) });
      expect(await r.notices.insertUnread(second)).toEqual({ ...second, readAt: null });
      expect((await r.notices.listUnread(10)).map((n) => n.id)).toEqual([second.id]);
    });

    it('markRead on an unknown id throws NOTICE_NOT_FOUND, and marking a read notice again does not throw', async () => {
      await expectCode(r.notices.markRead(randomUUID(), at(20)), 'NOTICE_NOT_FOUND');
      const n = newNotice();
      await r.notices.insertUnread(n);
      await r.notices.markRead(n.id, at(20));
      await expect(r.notices.markRead(n.id, at(40))).resolves.toBeUndefined();
      expect(await r.notices.listUnread(10)).toEqual([]);
    });
  });

  describe('standing goals', () => {
    const newIssue = (over: Partial<NewStandingIssueRecord> = {}): NewStandingIssueRecord => ({
      id: randomUUID(),
      repo: 'o/r',
      rowId: 'H1',
      fingerprint: 'cf30542f175d',
      issueNumber: 7,
      openedAt: at(1),
      ...over,
    });

    it('saveGoal stores a goal and replaces it, and getGoal gives null for another row', async () => {
      const goal = { repo: 'o/r', rowId: 'H1', state: 'failing', lastLine: 'FAIL a', lastRunAt: at(1) } as const;
      await r.goals.saveGoal(goal);
      expect(await r.goals.getGoal('o/r', 'H1')).toEqual(goal);
      await r.goals.saveGoal({ ...goal, state: 'passing', lastLine: null, lastRunAt: at(2) });
      expect(await r.goals.getGoal('o/r', 'H1')).toEqual({ ...goal, state: 'passing', lastLine: null, lastRunAt: at(2) });
      expect(await r.goals.getGoal('o/r', 'H2')).toBeNull();
      expect(await r.goals.getGoal('p/r', 'H1')).toBeNull();
    });

    it('open gives one failed pass, a second open issue with a fingerprint is refused, and another repository is free', async () => {
      const first = newIssue();
      expect(await r.goals.open(first)).toEqual({ ...first, lastFailedAt: at(1), failCount: 1, closedAt: null });
      await expect(r.goals.open(newIssue({ issueNumber: 8 }))).rejects.toThrow();
      const other = newIssue({ repo: 'p/r' });
      await r.goals.open(other);
      expect((await r.goals.findOpen('o/r', first.fingerprint))?.id).toBe(first.id);
      expect((await r.goals.findOpen('p/r', first.fingerprint))?.id).toBe(other.id);
      expect(await r.goals.findOpen('o/r', 'aaaaaaaaaaaa')).toBeNull();
      const second = newIssue({ fingerprint: 'bbbbbbbbbbbb', openedAt: at(5) });
      await r.goals.open(second);
      await r.goals.open(newIssue({ rowId: 'H2', fingerprint: 'cccccccccccc' }));
      expect((await r.goals.listOpen('o/r', 'H1')).map((i) => i.id)).toEqual([first.id, second.id]);
    });

    it('touch adds one failed pass, and close frees the fingerprint and keeps its first time', async () => {
      const issue = newIssue();
      await r.goals.open(issue);
      expect(await r.goals.touch(issue.id, at(2))).toMatchObject({ failCount: 2, lastFailedAt: at(2) });
      expect(await r.goals.touch(issue.id, at(3))).toMatchObject({ failCount: 3, lastFailedAt: at(3), openedAt: at(1) });
      await expect(r.goals.touch(randomUUID(), at(4))).rejects.toThrow();

      await r.goals.close(issue.id, at(4));
      await r.goals.close(issue.id, at(5));
      await r.goals.close(randomUUID(), at(5));
      expect(await r.goals.findOpen('o/r', issue.fingerprint)).toBeNull();
      expect(await r.goals.listOpen('o/r', 'H1')).toEqual([]);
      const again = newIssue();
      await r.goals.open(again);
      expect((await r.goals.findOpen('o/r', issue.fingerprint))?.id).toBe(again.id);
    });

    it('saveSchedule stores one row for each repository and replaces it, also with no next time', async () => {
      expect(await r.goals.getSchedule('o/r')).toBeNull();
      await r.goals.saveSchedule({ repo: 'o/r', lastAt: at(1), nextAt: at(2) });
      await r.goals.saveSchedule({ repo: 'p/r', lastAt: at(3), nextAt: at(4) });
      expect(await r.goals.getSchedule('o/r')).toEqual({ repo: 'o/r', lastAt: at(1), nextAt: at(2) });
      await r.goals.saveSchedule({ repo: 'o/r', lastAt: at(5), nextAt: null });
      expect(await r.goals.getSchedule('o/r')).toEqual({ repo: 'o/r', lastAt: at(5), nextAt: null });
      expect((await r.goals.getSchedule('p/r'))?.lastAt).toEqual(at(3));
    });
  });

  describe('goal_runs', () => {
    const row = (over: Partial<GoalRunRecord> = {}): GoalRunRecord => ({
      repo: 'o/r',
      manifest: 'goals/a.json',
      rowId: 'G1',
      pass: true,
      value: 72.5,
      of: 240,
      line: 'G1 72.5/240 screens',
      cadence: 'merge',
      sha: 'abc1234',
      at: at(1),
      ...over,
    });

    it('saveRows replaces the row of the same key, also with no value', async () => {
      await r.goals.saveRows([row()]);
      expect(await r.goals.listRows('o/r', 'goals/a.json')).toEqual([row()]);
      const next = row({ pass: false, value: null, of: null, line: 'G1 FAIL', cadence: 'nightly', sha: 'def5678', at: at(2) });
      await r.goals.saveRows([next]);
      expect(await r.goals.listRows('o/r', 'goals/a.json')).toEqual([next]);
    });

    it('listRows gives the rows of one repository and manifest by row id, and an empty save changes nothing', async () => {
      await r.goals.saveRows([row({ rowId: 'G2' }), row({ rowId: 'G1' }), row({ manifest: 'goals/b.json' }), row({ repo: 'p/r' })]);
      await r.goals.saveRows([]);
      expect((await r.goals.listRows('o/r', 'goals/a.json')).map((x) => x.rowId)).toEqual(['G1', 'G2']);
      expect(await r.goals.listRows('o/r', 'goals/none.json')).toEqual([]);
    });
  });
}
