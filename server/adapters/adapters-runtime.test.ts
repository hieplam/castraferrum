// Small infrastructure adapters of the server foundation: clock, in-process event bus, active-run registry, executor registry.
import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/domain/events';
import { InMemoryActiveRuns } from './active-runs/in-memory-active-runs';
import { OffsetClock } from './clock/offset-clock';
import { SystemClock } from './clock/system-clock';
import { InProcessEventBus } from './events/in-process-event-bus';
import { MockExecutor } from './executors/mock/mock-executor';
import { StaticExecutorRegistry } from './executors/static-executor-registry';
import { RandomIdGenerator } from './ids/random-id-generator';

const T0 = Date.parse('2026-10-18T01:00:00Z');
const ev = (loopId: string, type: DomainEvent['type'] = 'loop.updated'): DomainEvent =>
  ({ type, at: new Date(T0), loopId }) as DomainEvent;

describe('OffsetClock', () => {
  it('base time + offset: advance moves forward / back, set pins the instant, the base time keeps running', () => {
    let base = T0;
    const c = new OffsetClock(() => base);
    expect(c.now()).toEqual(new Date(T0));
    expect(c.advance(90_000)).toEqual(new Date(T0 + 90_000));
    base += 1000; // real time passes
    expect(c.now()).toEqual(new Date(T0 + 91_000));
    c.set(new Date('2026-10-18T05:00:00Z'));
    base += 500;
    expect(c.now()).toEqual(new Date(Date.parse('2026-10-18T05:00:00Z') + 500));
    expect(c.advance(-500).toISOString()).toBe('2026-10-18T05:00:00.000Z');
    expect(() => c.advance(Number.NaN)).toThrow(RangeError);
    expect(() => c.set(new Date('x'))).toThrow(RangeError);
  });

  it('SystemClock = machine time; RandomIdGenerator yields distinct uuids', () => {
    const before = Date.now();
    const t = new SystemClock().now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    const ids = new RandomIdGenerator();
    expect(ids.newId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids.newId()).not.toBe(ids.newId());
  });
});

describe('InProcessEventBus', () => {
  it('registers right at subscribe (before the first iteration), filters by type / loop, keeps order, abort signal → ends + unregisters', async () => {
    const bus = new InProcessEventBus();
    const ctrl = new AbortController();
    const sub = bus.subscribe({ loopId: 'a', types: ['loop.updated'] }, ctrl.signal);
    expect(bus.listenerCount()).toBe(1);
    bus.publish(ev('a'));
    bus.publish(ev('b'));
    bus.publish(ev('a', 'loop.created'));
    bus.publish(ev('a'));
    const got: DomainEvent[] = [];
    const done = (async () => {
      for await (const e of sub) got.push(e);
    })();
    await new Promise((r) => setImmediate(r));
    expect(got.map((e) => `${e.loopId}:${e.type}`)).toEqual(['a:loop.updated', 'a:loop.updated']);
    ctrl.abort();
    await done;
    expect(bus.listenerCount()).toBe(0);
    bus.publish(ev('a')); // nobody listening → no error
  });

  it('already-aborted signal → empty iterable; leaving the for await loop (break) also unregisters', async () => {
    const bus = new InProcessEventBus();
    const dead = new AbortController();
    dead.abort();
    for await (const _ of bus.subscribe({}, dead.signal)) throw new Error('no event expected');
    const ctrl = new AbortController();
    const sub = bus.subscribe({}, ctrl.signal);
    bus.publish(ev('x'));
    for await (const _ of sub) break;
    expect(bus.listenerCount()).toBe(0);
  });

  it('several listeners: each has its own queue, publish never waits for anyone', async () => {
    const bus = new InProcessEventBus();
    const ctrl = new AbortController();
    const a = bus.subscribe({}, ctrl.signal)[Symbol.asyncIterator]();
    const b = bus.subscribe({ runId: 'r1' }, ctrl.signal)[Symbol.asyncIterator]();
    bus.publish({ type: 'run.started', at: new Date(T0), loopId: 'l', executionId: 'e', runId: 'r1', iteration: 1 });
    bus.publish(ev('l'));
    expect((await a.next()).value).toMatchObject({ type: 'run.started' });
    expect((await a.next()).value).toMatchObject({ type: 'loop.updated' });
    expect((await b.next()).value).toMatchObject({ runId: 'r1' });
    ctrl.abort();
    expect(await b.next()).toEqual({ value: undefined, done: true });
  });
});

describe('InMemoryActiveRuns', () => {
  it('abort aborts the right controller with the reason; unknown run → false; release unregisters', () => {
    const reg = new InMemoryActiveRuns();
    const c = new AbortController();
    reg.register('r1', c);
    expect(reg.size()).toBe(1);
    expect(reg.abort('r1', 'timed_out')).toBe(true);
    expect(c.signal.reason).toBe('timed_out');
    expect(reg.abort('r1', 'cancelled')).toBe(true); // already aborted: the first reason is kept
    expect(c.signal.reason).toBe('timed_out');
    reg.release('r1');
    expect(reg.abort('r1', 'cancelled')).toBe(false);
    expect(reg.size()).toBe(0);
  });
});

describe('StaticExecutorRegistry', () => {
  it('finds by kind, lists descriptors, rejects a duplicate kind', () => {
    const reg = new StaticExecutorRegistry([new MockExecutor()]);
    expect(reg.find('mock')?.kind).toBe('mock');
    expect(reg.find('claude-agent-sdk')).toBeNull();
    expect(reg.list().map((d) => [d.kind, d.label])).toEqual([['mock', 'Mock (simulated)']]);
    expect(() => new StaticExecutorRegistry([new MockExecutor(), new MockExecutor()])).toThrow(/Duplicate/);
  });
});
