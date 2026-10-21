// Loop service tests: the real service + memory repository + OffsetClock, no HTTP / real DB.
// Test names carry the spec UC codes (SPEC-phase-1.md § Use cases).
import { beforeEach, describe, expect, it } from 'vitest';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';
import type { ValidationIssue } from './contracts';

const at = (ms: number) => new Date(T0.getTime() + ms);

async function expectCode(p: Promise<unknown>, code: string, details?: unknown): Promise<void> {
  await expect(p).rejects.toMatchObject(details === undefined ? { code } : { code, details });
}

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

describe('LoopService', () => {
  describe('UC-01 create loop', () => {
    it('UC-01 a new loop is Stopped, defaults filled in (time zone, empty timeout = unlimited, Mock config), cron normalised', async () => {
      const v = await k.loopService.create({ name: '  Game pilot  ', prompt: 'Run the backlog', repoId: k.repo.id, cron: '  */15   * * * * ', executor: { kind: 'mock' } });
      expect(v).toMatchObject({
        repo: { id: k.repo.id, name: k.repo.name, path: k.repo.path },
        name: 'Game pilot',
        description: '',
        cron: '*/15 * * * *',
        timezone: 'Asia/Ho_Chi_Minh',
        timeoutSec: null,
        executor: { kind: 'mock', config: { durationSec: 10, failRate: 0 } },
        status: 'stopped',
        nextRunAt: null,
        version: 1,
        iterations: 0,
        executionCount: 0,
        currentExecution: null,
        activeRun: null,
        lastRun: null,
      });
      expect(k.db.loops.get(v.id)?.status).toBe('stopped');
      expect(k.eventsOf('loop.created')).toEqual([{ type: 'loop.created', at: T0, loopId: v.id }]);
    });

    it('UC-01 bad data → VALIDATION_FAILED pointing at exactly each field, nothing created', async () => {
      const bad = k.loopService.create({
        name: ' ',
        description: 'x'.repeat(501),
        prompt: '',
        cron: '61 * * * *',
        timezone: 'Mars/Olympus',
        timeoutSec: 59,
        executor: { kind: 'mock', config: { durationSec: 0, failRate: 101 } },
      });
      await expect(bad).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      const err = (await bad.then(
        () => null,
        (e: unknown) => e,
      )) as { details: { issues: ValidationIssue[] } };
      expect(err.details.issues.map((i) => `${i.field}:${i.code}`)).toEqual([
        'name:required',
        'description:tooLong',
        'prompt:required',
        'repoId:required',
        'cron:invalid',
        'timezone:invalid',
        'timeoutSec:outOfRange',
        'executor.config.durationSec:invalid',
        'executor.config.failRate:invalid',
      ]);
      expect(k.db.loops.size).toBe(0);
      expect(k.events).toEqual([]);
    });

    it('UC-01 name over 80 characters, prompt over 20 000 characters, empty cron, unknown executor → error on the field', async () => {
      await expectCode(
        k.loopService.create({ name: 'a'.repeat(81), prompt: 'p'.repeat(20_001), cron: '', executor: { kind: 'no-such-executor' } }),
        'VALIDATION_FAILED',
        {
          issues: [
            expect.objectContaining({ field: 'name', code: 'tooLong' }),
            expect.objectContaining({ field: 'prompt', code: 'tooLong' }),
            expect.objectContaining({ field: 'repoId', code: 'required' }),
            expect.objectContaining({ field: 'cron', code: 'required' }),
            expect.objectContaining({ field: 'executor.kind', code: 'unknownExecutor' }),
          ],
        },
      );
      // 80 non-ASCII characters (counted as characters, not bytes) are accepted
      await expect(k.loopService.create(k.input({ name: 'ж'.repeat(80) }))).resolves.toMatchObject({ name: 'ж'.repeat(80) });
    });

    it('UC-01 duplicate name (case-insensitive) → LOOP_NAME_TAKEN; a name equal to an archived loop is fine', async () => {
      const a = await k.loopService.create(k.input({ name: 'Clean logs' }));
      await expectCode(k.loopService.create(k.input({ name: 'CLEAN LOGS' })), 'LOOP_NAME_TAKEN');
      await k.loopService.archive(a.id);
      await expect(k.loopService.create(k.input({ name: 'clean logs' }))).resolves.toMatchObject({ status: 'stopped' });
    });
  });

  describe('UC-03 list', () => {
    it('UC-03 every loop carries the current execution stats: how long it has run, rounds split into succeeded / failed / cancelled / skipped, the running run, the latest run, the next run', async () => {
      const a = await k.loopService.create(k.input({ name: 'A' }));
      k.clock.advance(1); // list order follows creation time — do not let two loops share a timestamp (the random uuid would decide)
      const b = await k.loopService.create(k.input({ name: 'B' }));
      k.clock.set(T0);
      await k.loopService.start(a.id); // round #1 (start)
      await flush();
      k.clock.advance(MIN);
      k.scripted.call(1).succeed();
      await flush();
      await k.tickAt(at(5 * MIN)); // round #2 (schedule)
      k.clock.advance(30_000);
      k.scripted.call(2).fail('broken');
      await flush();
      await k.tickAt(at(10 * MIN)); // round #3 running
      await k.tickAt(at(15 * MIN)); // skipped
      k.clock.set(at(16 * MIN));

      const [vb, va] = await k.loopService.list({});
      expect(vb?.id).toBe(b.id); // created first
      expect(vb).toMatchObject({ status: 'stopped', currentExecution: null, activeRun: null, lastRun: null });
      expect(va).toMatchObject({
        status: 'active',
        nextRunAt: at(20 * MIN),
        iterations: 3,
        executionCount: 1,
        currentExecution: {
          seq: 1,
          endedAt: null,
          stats: { runs: 3, running: 1, succeeded: 1, failed: 1, cancelled: 0, skipped: 1, elapsedMs: 16 * MIN, avgDurationMs: 45_000 },
        },
        activeRun: { iteration: 3, status: 'running' },
        lastRun: { iteration: 2, status: 'failed', error: 'broken' },
      });

      expect((await k.loopService.list({ status: 'active' })).map((l) => l.name)).toEqual(['A']);
      expect((await k.loopService.list({ q: 'b' })).map((l) => l.name)).toEqual(['B']);
      expect(await k.loopService.list({ archived: true })).toEqual([]);
    });

    it('UC-03 overview bar: running loops / runs, runs today by time zone, errors in 24 hours, loops per tab', async () => {
      // T0 = 08:00 Vietnam time (01:00 UTC) on 18 Oct.
      const a = await k.loopService.create(k.input({ name: 'A' }));
      const b = await k.loopService.create(k.input({ name: 'B' }));
      const c = await k.loopService.create(k.input({ name: 'C' }));
      await k.loopService.archive(c.id);
      await k.loopService.start(a.id); // round #1 runs at 08:00
      await flush();
      k.clock.advance(MIN);
      k.scripted.call(1).fail('broken'); // error at 08:01
      await flush();
      await k.tickAt(at(5 * MIN)); // round #2 running
      await k.loopService.start(b.id);
      await k.loopService.stop(b.id); // round #1 of B → cancelled (not an error)
      await flush();

      const vn = await k.loopService.overview('Asia/Ho_Chi_Minh');
      expect(vn).toMatchObject({
        activeLoops: 1,
        runningRuns: 1,
        runsToday: 3,
        errors24h: 1,
        loops: { all: 2, active: 1, stopped: 1, archived: 1 },
        todayFrom: new Date('2026-10-17T17:00:00.000Z'), // 00:00 on 18 Oct Vietnam time
      });
      // In New York it is 21:00 on 17 Oct — every run still belongs to New York's "today".
      expect((await k.loopService.overview('America/New_York')).todayFrom).toEqual(new Date('2026-10-17T04:00:00.000Z'));
      // One day later: no run of "today" is left, the error is older than 24 hours.
      k.clock.set(at(24 * 60 * MIN + 2 * MIN));
      expect(await k.loopService.overview('Asia/Ho_Chi_Minh')).toMatchObject({ runsToday: 0, errors24h: 0, runningRuns: 1 });
      await expectCode(k.loopService.overview('Mars/Venus'), 'VALIDATION_FAILED', {
        issues: [{ field: 'tz', code: 'invalid', message: 'Invalid time zone "Mars/Venus"' }],
      });
    });
  });

  describe('UC-04 Start', () => {
    it('UC-04 opens execution #1, the first run (trigger start) runs at once, the next run = the first cron mark after Start', async () => {
      const loop = await k.loopService.create(k.input({ cron: '*/5 * * * *' }));
      k.clock.set(at(2 * MIN + 10_000)); // 08:02:10
      const v = await k.loopService.start(loop.id);
      expect(v).toMatchObject({
        status: 'active',
        nextRunAt: at(5 * MIN),
        version: 1, // Start is not a config edit — an open form is not reported as a conflict
        executionCount: 1,
        currentExecution: { seq: 1, startedAt: at(2 * MIN + 10_000), endedAt: null, endReason: null },
        activeRun: { iteration: 1, trigger: 'start', status: 'running', scheduledFor: null, startedAt: at(2 * MIN + 10_000) },
      });
      expect(v.activeRun?.deadlineAt).toEqual(at(2 * MIN + 10_000 + 1800_000));
      await flush();
      expect(k.scripted.calls).toHaveLength(1);
      expect(k.scripted.call(1).input).toMatchObject({ loopId: loop.id, iteration: 1, prompt: k.input().prompt });
      expect(k.events.map((e) => e.type)).toEqual(['loop.created', 'execution.started', 'loop.updated', 'run.started']);
    });

    it('UC-04 a running loop → LOOP_ALREADY_ACTIVE, no second execution opened, no extra run', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id);
      await expectCode(k.loopService.start(loop.id), 'LOOP_ALREADY_ACTIVE');
      expect(k.db.executions.size).toBe(1);
      expect(k.db.runs.size).toBe(1);
      expect(k.db.loops.get(loop.id)?.executionCounter).toBe(1);
    });

    it('UC-04 Start again after Stop → execution #2, the round number #N continues over the loop lifetime', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id);
      await k.loopService.stop(loop.id);
      k.clock.advance(MIN);
      const v = await k.loopService.start(loop.id);
      expect(v).toMatchObject({ executionCount: 2, currentExecution: { seq: 2 }, activeRun: { iteration: 2, trigger: 'start' } });
    });

    it('UC-04 archived loop → LOOP_ARCHIVED; missing loop → LOOP_NOT_FOUND', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.archive(loop.id);
      await expectCode(k.loopService.start(loop.id), 'LOOP_ARCHIVED');
      await expectCode(k.loopService.start('00000000-0000-4000-8000-000000000000'), 'LOOP_NOT_FOUND');
      expect(k.db.executions.size).toBe(0);
    });
  });

  describe('UC-05 Stop', () => {
    it('UC-05 cancels the running run (cancelled at once, the executor receives the signal), closes the execution as stopped at click time, loop Stopped, no scheduled runs left', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id);
      await flush();
      k.clock.set(at(3 * MIN));
      const v = await k.loopService.stop(loop.id);
      expect(v).toMatchObject({
        status: 'stopped',
        nextRunAt: null,
        version: 1,
        activeRun: null,
        currentExecution: { seq: 1, endedAt: at(3 * MIN), endReason: 'stopped', stats: { runs: 1, cancelled: 1, elapsedMs: 3 * MIN } },
        lastRun: { iteration: 1, status: 'cancelled', finishedAt: at(3 * MIN), sessionId: 'scripted-1' },
      });
      const exec = k.scripted.call(1);
      expect(exec.signal.aborted).toBe(true);
      expect(exec.signal.reason).toBe('cancelled');
      await flush();
      expect(exec.ended).toBe(true);
      expect(k.active.size()).toBe(0);

      await k.tickAt(at(5 * MIN));
      await k.tickAt(at(10 * MIN));
      expect(k.db.runs.size).toBe(1);
      expect(k.eventsOf('execution.ended')).toMatchObject([{ reason: 'stopped' }]);
      expect(k.eventsOf('run.finished')).toMatchObject([{ status: 'cancelled' }]);
    });

    it('UC-05 an executor that ignores the signal → the DB is still cancelled at once; a late result does not overwrite it', async () => {
      k.scripted.ignoreSignal = true;
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id);
      await flush();
      await k.loopService.stop(loop.id);
      const runId = [...k.db.runs.keys()][0]!;
      expect(k.db.runs.get(runId)?.status).toBe('cancelled');
      k.scripted.call(1).log('still running').succeed();
      await flush();
      expect(k.db.runs.get(runId)).toMatchObject({ status: 'cancelled', summary: null });
      expect(k.eventsOf('run.finished')).toHaveLength(1);
    });

    it('UC-05 stopped loop → LOOP_NOT_ACTIVE', async () => {
      const loop = await k.loopService.create(k.input());
      await expectCode(k.loopService.stop(loop.id), 'LOOP_NOT_ACTIVE');
    });

    it('UC-05 Stop when the run is already done (no running run) → only closes the execution', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id);
      await flush();
      k.scripted.call(1).succeed();
      await flush();
      const v = await k.loopService.stop(loop.id);
      expect(v).toMatchObject({ status: 'stopped', currentExecution: { endReason: 'stopped', stats: { succeeded: 1, cancelled: 0 } } });
    });
  });

  describe('UC-06 loop detail', () => {
    it('UC-06 execution count, longest execution, total rounds over the loop lifetime', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id); // execution #1: 08:00 → 08:30
      k.clock.set(at(30 * MIN));
      await k.loopService.stop(loop.id);
      k.clock.set(at(40 * MIN));
      await k.loopService.start(loop.id); // execution #2: 08:40 → 08:50
      k.clock.set(at(50 * MIN));
      await k.loopService.stop(loop.id);
      k.clock.set(at(60 * MIN));
      await k.loopService.start(loop.id); // execution #3: 09:00 → running
      k.clock.set(at(65 * MIN));

      const d = await k.loopService.get(loop.id);
      const first = [...k.db.executions.values()].find((e) => e.seq === 1)!;
      expect(d).toMatchObject({
        executionCount: 3,
        iterations: 3,
        currentExecution: { seq: 3, stats: { elapsedMs: 5 * MIN } },
        longestExecution: { executionId: first.id, seq: 1, elapsedMs: 30 * MIN },
        runCount: 3, // phase 1: denominator for paging the run history (skipped runs included)
      });
      await expectCode(k.loopService.get('00000000-0000-4000-8000-000000000000'), 'LOOP_NOT_FOUND');
    });

    it('UC-06 execution history: newest first, paged, with stats', async () => {
      const loop = await k.loopService.create(k.input());
      for (let i = 0; i < 3; i++) {
        await k.loopService.start(loop.id);
        k.clock.advance(MIN);
        await k.loopService.stop(loop.id);
      }
      const p1 = await k.loopService.listExecutions(loop.id, { limit: 2 });
      expect(p1.items.map((e) => e.seq)).toEqual([3, 2]);
      expect(p1.items[0]?.stats).toMatchObject({ runs: 1, cancelled: 1, elapsedMs: MIN });
      const p2 = await k.loopService.listExecutions(loop.id, { limit: 2, cursor: p1.nextCursor });
      expect(p2).toMatchObject({ items: [{ seq: 1 }], nextCursor: null });
    });
  });

  describe('UC-08 execution detail', () => {
    it('UC-08 all runs + the session id list in run order; a cancelled run still has a session id, a skipped run does not', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id);
      await flush();
      k.scripted.call(1).succeed();
      await flush();
      await k.tickAt(at(5 * MIN)); // round #2 runs
      await k.tickAt(at(10 * MIN)); // skipped
      k.clock.set(at(11 * MIN));
      const stopped = await k.loopService.stop(loop.id); // cancels round #2

      const d = await k.loopService.getExecution(stopped.currentExecution!.id);
      expect(d.runs.map((r) => [r.iteration, r.status, r.sessionId])).toEqual([
        [1, 'succeeded', 'scripted-1'],
        [2, 'cancelled', 'scripted-2'],
        [null, 'skipped', null],
      ]);
      expect(d.sessionIds).toEqual(['scripted-1', 'scripted-2']);
      // = SELECT session_id FROM runs WHERE execution_id = … AND session_id IS NOT NULL ORDER BY started_at
      const fromDb = [...k.db.runs.values()]
        .filter((r) => r.executionId === d.id && r.sessionId !== null)
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
        .map((r) => r.sessionId);
      expect(d.sessionIds).toEqual(fromDb);
      expect(d).toMatchObject({ seq: 1, endReason: 'stopped', stats: { runs: 2, succeeded: 1, cancelled: 1, skipped: 1 } });
      // phase 1: the loop's total run count (denominator for paging the run history) includes skipped runs; the round count does not
      expect(await k.loopService.get(loop.id)).toMatchObject({ runCount: 3, iterations: 2 });
      await expectCode(k.loopService.getExecution('00000000-0000-4000-8000-000000000000'), 'EXECUTION_NOT_FOUND');
    });
  });

  describe('UC-09 edit loop', () => {
    it('UC-09 editing with a stale version (second tab) → VERSION_CONFLICT, no silent overwrite; each edit bumps version + 1', async () => {
      const loop = await k.loopService.create(k.input({ name: 'Original' }));
      const tab1 = await k.loopService.update(loop.id, k.input({ name: 'Tab 1' }), loop.version);
      expect(tab1).toMatchObject({ name: 'Tab 1', version: 2 });
      await expectCode(k.loopService.update(loop.id, k.input({ name: 'Tab 2' }), loop.version), 'VERSION_CONFLICT', {
        currentVersion: 2,
      });
      expect(k.db.loops.get(loop.id)).toMatchObject({ name: 'Tab 1', version: 2 });
    });

    it('UC-09 Start / Stop / scheduler ticks do not change the version — a form opened before Start can still be saved', async () => {
      const loop = await k.loopService.create(k.input());
      await k.loopService.start(loop.id);
      await k.tickAt(at(5 * MIN));
      await k.loopService.stop(loop.id);
      await expect(k.loopService.update(loop.id, k.input({ name: 'new' }), loop.version)).resolves.toMatchObject({ version: 2 });
    });

    it('UC-09 changing the schedule while running → the next run is recomputed; changing the prompt → the running run keeps the old snapshot, later runs use the new prompt', async () => {
      const loop = await k.loopService.create(k.input({ prompt: 'Old', cron: '*/5 * * * *' }));
      await k.loopService.start(loop.id);
      await flush();
      k.clock.set(at(MIN));
      const v = await k.loopService.update(loop.id, k.input({ name: loop.name, prompt: 'New', cron: '0 * * * *' }), 1);
      expect(v.nextRunAt).toEqual(at(60 * MIN)); // 09:00
      expect(v.activeRun?.promptSnapshot).toBe('Old');
      k.scripted.call(1).succeed();
      await flush();
      await k.tickAt(at(5 * MIN));
      expect(k.db.runs.size).toBe(1); // 08:05 is no longer a mark
      await k.tickAt(at(60 * MIN));
      expect(k.scripted.call(2).input.prompt).toBe('New');
      const runs = [...k.db.runs.values()].map((r) => [r.iteration, r.promptSnapshot]);
      expect(runs).toEqual([
        [1, 'Old'],
        [2, 'New'],
      ]);
    });

    it('UC-09 bad data on edit → VALIDATION_FAILED, nothing written', async () => {
      const loop = await k.loopService.create(k.input());
      await expectCode(k.loopService.update(loop.id, k.input({ cron: 'every 5 minutes' }), 1), 'VALIDATION_FAILED');
      expect(k.db.loops.get(loop.id)?.version).toBe(1);
    });
  });

  describe('UC-10 duplicate', () => {
    it('UC-10 the copy "… (copy)" is Stopped, same config, carrying no executions / runs', async () => {
      const loop = await k.loopService.create(k.input({ name: 'Pilot', description: 'a description', timeoutSec: 600 }));
      await k.loopService.start(loop.id);
      const copy = await k.loopService.duplicate(loop.id);
      expect(copy).toMatchObject({
        name: 'Pilot (copy)',
        description: 'a description',
        timeoutSec: 600,
        cron: loop.cron,
        status: 'stopped',
        version: 1,
        iterations: 0,
        executionCount: 0,
        currentExecution: null,
      });
      expect([...k.db.runs.values()].filter((r) => r.loopId === copy.id)).toEqual([]);
      expect((await k.loopService.duplicate(loop.id)).name).toBe('Pilot (copy 2)');
    });

    it('UC-10 an 80-character name → truncated to fit the suffix, still ≤ 80', async () => {
      const loop = await k.loopService.create(k.input({ name: 'x'.repeat(80) }));
      const copy = await k.loopService.duplicate(loop.id);
      expect([...copy.name].length).toBe(80);
      expect(copy.name.endsWith(' (copy)')).toBe(true);
    });
  });

  describe('UC-11 archive / restore', () => {
    it('UC-11 a running loop cannot be archived; archive → hidden from the default list, the Archived filter shows it again; restore → back to Stopped', async () => {
      const loop = await k.loopService.create(k.input({ name: 'Old' }));
      await k.loopService.start(loop.id);
      await expectCode(k.loopService.archive(loop.id), 'LOOP_IS_ACTIVE');
      await k.loopService.stop(loop.id);
      await k.loopService.archive(loop.id);
      expect(await k.loopService.list({})).toEqual([]);
      expect((await k.loopService.list({ archived: true })).map((l) => l.name)).toEqual(['Old']);
      const restored = await k.loopService.restore(loop.id);
      expect(restored).toMatchObject({ status: 'stopped', archivedAt: null, executionCount: 1 });
      expect((await k.loopService.list({})).map((l) => l.name)).toEqual(['Old']);
    });

    it('UC-11 restore when a live loop with the same name exists → LOOP_NAME_TAKEN', async () => {
      const a = await k.loopService.create(k.input({ name: 'Dup' }));
      await k.loopService.archive(a.id);
      await k.loopService.create(k.input({ name: 'dup' }));
      await expectCode(k.loopService.restore(a.id), 'LOOP_NAME_TAKEN');
    });
  });

  it('executors() lists the executors + their config schema', () => {
    expect(k.loopService.executors().map((e) => e.kind)).toEqual(['mock', 'scripted', 'claude']);
  });
});
