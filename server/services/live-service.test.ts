// Live-event tests: the real service + the real in-process bus.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent, LogLine } from './contracts';
import { flush, makeKit, type Kit } from '../../tests/support/service-kit';

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

/** Collects the items of an iterable in the background until it ends. */
function collect<T>(it: AsyncIterable<T>) {
  const items: T[] = [];
  let done = false;
  const finished = (async () => {
    for await (const x of it) items.push(x);
    done = true;
  })();
  return { items, finished, isDone: () => done };
}

describe('LiveService', () => {
  it('UC-06 live log: replays the stored log after afterSeq, then pushes new lines as soon as the executor prints them, no duplicates; run done → ends', async () => {
    const loop = await k.loopService.create(k.input());
    const run = (await k.loopService.start(loop.id)).activeRun!;
    await flush();
    const exec = k.scripted.call(1);
    exec.log('a').log('b').log('c');
    await flush();

    const ctrl = new AbortController();
    const s = collect(k.live.runLogs(run.id, 1, ctrl.signal));
    await flush();
    expect(s.items.map((l: LogLine) => l.message)).toEqual(['b', 'c']);
    exec.log('d');
    await flush();
    expect(s.items.map((l) => l.message)).toEqual(['b', 'c', 'd']);
    exec.succeed();
    await s.finished;
    expect(s.items.map((l) => l.seq)).toEqual([2, 3, 4]);
    expect(k.bus.listenerCount()).toBe(0);
  });

  it('UC-07 finished run → replays the whole log in order, then ends', async () => {
    const loop = await k.loopService.create(k.input());
    const run = (await k.loopService.start(loop.id)).activeRun!;
    await flush();
    k.scripted.call(1).log('x').log('y').fail('z');
    await flush();
    const s = collect(k.live.runLogs(run.id, 0, new AbortController().signal));
    await s.finished;
    expect(s.items.map((l) => `${l.seq}:${l.message}`)).toEqual(['1:x', '2:y']);
    await expect(collect(k.live.runLogs('00000000-0000-4000-8000-000000000000', 0, new AbortController().signal)).finished).rejects.toMatchObject({
      code: 'RUN_NOT_FOUND',
    });
  });

  it('runLogs: signal aborted (the browser closes SSE) → ends, unsubscribes', async () => {
    const loop = await k.loopService.create(k.input());
    const run = (await k.loopService.start(loop.id)).activeRun!;
    const ctrl = new AbortController();
    const s = collect(k.live.runLogs(run.id, 0, ctrl.signal));
    await flush();
    expect(k.bus.listenerCount()).toBe(1);
    ctrl.abort();
    await s.finished;
    expect(k.bus.listenerCount()).toBe(0);
  });

  it('UC-03 events(): state events (no run.log), filtered by loop', async () => {
    const a = await k.loopService.create(k.input());
    const b = await k.loopService.create(k.input());
    const ctrl = new AbortController();
    const all = collect(k.live.events({}, ctrl.signal));
    const onlyA = collect(k.live.events({ loopId: a.id }, ctrl.signal));
    await k.loopService.start(a.id);
    await k.loopService.start(b.id);
    await flush();
    k.scripted.call(1).log('does not reach /api/events').succeed();
    await flush();
    ctrl.abort();
    await Promise.all([all.finished, onlyA.finished]);
    const types = (xs: DomainEvent[]) => xs.map((e) => e.type);
    expect(types(all.items)).not.toContain('run.log');
    expect(types(onlyA.items)).toEqual(['execution.started', 'loop.updated', 'run.started', 'run.finished']);
    expect(all.items.filter((e) => e.loopId === b.id).map((e) => e.type)).toEqual(['execution.started', 'loop.updated', 'run.started']);
  });
});
