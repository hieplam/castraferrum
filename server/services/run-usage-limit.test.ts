// RunService at a usage limit (spec 2.5): a `usage_limit` writes `failed` with its message and cost, for every loop. P8 adds `held`.
import { describe, expect, it } from 'vitest';
import { flush, makeKit, until, type Kit } from '../../tests/support/service-kit';

const runOf = (kit: Kit) => [...kit.db.runs.values()][0]!;

describe('RunService: usage_limit', () => {
  it('a cancelled run keeps its stored tokens, and a result with tokens replaces them (decision 28)', async () => {
    const kit = makeKit();
    const loop = await kit.loopService.create(kit.input());
    await kit.loopService.start(loop.id);
    await until(() => kit.scripted.calls.length === 1, 'the run started');
    const run = runOf(kit);
    kit.db.runs.set(run.id, { ...run, tokens: 40 });
    kit.scripted.call(1).succeedWithTokens(70);
    await kit.runService.settled();
    expect(runOf(kit).tokens).toBe(70);

    const kept = makeKit();
    const second = await kept.loopService.create(kept.input());
    await kept.loopService.start(second.id);
    await until(() => kept.scripted.calls.length === 1, 'the run started');
    const held = runOf(kept);
    kept.db.runs.set(held.id, { ...held, tokens: 40 });
    await kept.runService.cancel(held.id, 'cancelled');
    expect(runOf(kept).tokens).toBe(40);
  });

  it('a scripted usage_limit writes failed, error = message, costUsd, and run.finished', async () => {
    const kit = makeKit();
    const loop = await kit.loopService.create(kit.input());
    await kit.loopService.start(loop.id);
    await until(() => kit.scripted.calls.length === 1, 'the run started');
    kit.scripted.call(1).usageLimit("You've hit your limit", 0.25);
    await kit.runService.settled();
    await flush();

    const run = runOf(kit);
    expect(run).toMatchObject({ status: 'failed', error: "You've hit your limit", costUsd: 0.25, summary: null, sessionId: 'scripted-1' });
    expect(kit.eventsOf('run.finished')).toMatchObject([{ runId: run.id, status: 'failed' }]);
  });

  it('the Claude executor with a fake stream: the row keeps the session id, the error line is logged once, and a limit with no cost stores no cost', async () => {
    const kit = makeKit();
    const loop = await kit.loopService.create(kit.input({ prompt: 'Do the work [limit]', executor: { kind: 'claude', config: { model: 'haiku', effort: 'low' } } }));
    await kit.loopService.start(loop.id);
    await kit.runService.settled();

    const done = runOf(kit);
    expect(done).toMatchObject({ status: 'failed', error: "You've hit your limit", costUsd: null });
    expect(done.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    const lines = (await kit.runService.logs(done.id, 0)).map((l) => l.message);
    expect(lines.filter((m) => m === "Error · You've hit your limit")).toHaveLength(1);
  });
});
