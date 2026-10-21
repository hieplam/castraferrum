// SseLiveEvents with a fake EventSource + fake timers: connection state (UC-17), retry 1 -> 2 -> 4 -> 8 seconds, state events
// decoded with the zod codec, the log stream closing itself on `end`.
import { describe, expect, it } from 'vitest';
import type { ConnectionState } from './live-events';
import { SseLiveEvents, type EventSourceLike } from './sse-live-events';

class FakeEs implements EventSourceLike {
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, ((ev: MessageEvent) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, l: (ev: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.(new Event('open'));
  }
  fail() {
    this.onerror?.(new Event('error'));
  }
  emit(type: string, data: unknown) {
    for (const l of this.listeners.get(type) ?? []) l({ data: JSON.stringify(data) } as MessageEvent);
  }
}

function setup() {
  const sources: FakeEs[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let now = new Date('2026-10-18T07:00:42Z');
  const live = new SseLiveEvents({
    createEventSource: (url) => {
      const es = new FakeEs(url);
      sources.push(es);
      return es;
    },
    now: () => now,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
  });
  const states: ConnectionState[] = [];
  live.onConnection((s) => states.push(s));
  const fireTimer = () => {
    const t = timers.shift();
    if (!t) throw new Error('no timer');
    now = new Date(now.getTime() + t.ms);
    t.fn();
    return t.ms;
  };
  return { live, sources, timers, states, fireTimer, last: () => sources[sources.length - 1] as FakeEs };
}

describe('SseLiveEvents - connection to /api/events', () => {
  it('connecting -> open; lost -> down attempt 1 (1 s) -> 2 (2 s) -> 3 (4 s), downSince keeps the first instant; reconnect -> open', () => {
    const s = setup();
    s.live.connect();
    expect(s.live.connection().status).toBe('connecting');
    expect(s.last().url).toBe('/api/events');
    s.last().open();
    expect(s.live.connection().status).toBe('open');

    s.last().fail();
    const down1 = s.live.connection();
    expect(down1).toMatchObject({ status: 'down', attempt: 1 });
    expect(s.last().closed).toBe(true); // do not let EventSource reconnect by itself
    if (down1.status !== 'down') throw new Error();
    expect(down1.retryAt.getTime() - down1.downSince.getTime()).toBe(1_000);

    expect(s.fireTimer()).toBe(1_000);
    expect(s.sources).toHaveLength(2);
    s.last().fail();
    expect(s.live.connection()).toMatchObject({ status: 'down', attempt: 2 });
    expect(s.fireTimer()).toBe(2_000);
    s.last().fail();
    const down3 = s.live.connection();
    expect(down3).toMatchObject({ status: 'down', attempt: 3 });
    if (down3.status !== 'down') throw new Error();
    expect(down3.downSince).toEqual(down1.downSince);
    expect(s.fireTimer()).toBe(4_000);
    s.last().fail();
    expect(s.fireTimer()).toBe(8_000);
    s.last().fail();
    expect(s.fireTimer()).toBe(8_000); // cap of 8 seconds

    s.last().open();
    expect(s.live.connection()).toEqual({ status: 'open', attempt: 0, retryAt: null, downSince: null });
    expect(s.states.map((x) => x.status)).toEqual(['open', 'down', 'down', 'down', 'down', 'down', 'open']);
  });

  it('a state event decodes to a Date; a broken event is skipped; close() means no retry', () => {
    const s = setup();
    const got: unknown[] = [];
    s.live.onEvent((e) => got.push(e));
    s.live.connect();
    s.last().open();
    s.last().emit('run.started', { type: 'run.started', at: '2026-10-18T07:00:00.000Z', loopId: 'l1', executionId: 'e1', runId: 'r1', iteration: 3 });
    s.last().emit('loop.updated', { type: 'loop.updated', at: 'not a time', loopId: 'l1' });
    expect(got).toEqual([{ type: 'run.started', at: new Date('2026-10-18T07:00:00.000Z'), loopId: 'l1', executionId: 'e1', runId: 'r1', iteration: 3 }]);
    s.live.close();
    expect(s.last().closed).toBe(true);
    expect(s.timers).toHaveLength(0);
  });
});

describe('SseLiveEvents - log stream', () => {
  it('pushes line by line, closes itself on `end` (the browser does not reconnect a finished stream), a loss midway reports paused', () => {
    const s = setup();
    const lines: number[] = [];
    const events: string[] = [];
    const off = s.live.followRunLogs('r 1', 0, {
      onLine: (l) => lines.push(l.seq),
      onEnd: (e) => events.push(`end:${e.status}`),
      onDisconnect: () => events.push('down'),
      onReconnect: () => events.push('up'),
    });
    const es = s.last();
    expect(es.url).toBe('/api/runs/r%201/logs/stream?after=0');
    es.open();
    const line = (seq: number) => ({ runId: 'r 1', seq, at: '2026-10-18T07:00:00.000Z', level: 'info', message: `working… (${seq}/3)`, data: null });
    es.emit('log', line(1));
    es.fail();
    es.open();
    es.emit('log', line(2));
    es.emit('end', { runId: 'r 1', status: 'succeeded' });
    expect(lines).toEqual([1, 2]);
    expect(events).toEqual(['down', 'up', 'end:succeeded']);
    expect(es.closed).toBe(true);
    off();
  });

  it('transcript: snapshot / entries / missing decode, ended closes itself; reconnect reports up; after -> ?after=', () => {
    const s = setup();
    const got: string[] = [];
    const entry = (offset: number) => ({ offset, block: 0, at: '2026-10-20T07:00:00.000Z', kind: 'assistant', text: 'xong' });
    s.live.followTranscript('r 1', null, {
      onSnapshot: (p) => got.push(`snap:${p.entries.length}:${p.start}:${p.hasMore}`),
      onEntries: (es, end) => got.push(`entries:${es.map((x) => x.offset).join(',')}:${end}`),
      onMissing: () => got.push('missing'),
      onEnded: (e) => got.push(`ended:${e.status}`),
      onDisconnect: () => got.push('down'),
      onReconnect: () => got.push('up'),
    });
    const es = s.last();
    expect(es.url).toBe('/api/runs/r%201/transcript/stream');
    es.open();
    es.emit('missing', {});
    es.emit('snapshot', { entries: [entry(0)], start: 0, end: 10, hasMore: false });
    es.emit('entries', { entries: [{ ...entry(10), kind: 'unknown' }], end: 20 }); // broken: skipped
    es.fail();
    es.open();
    es.emit('entries', { entries: [entry(20)], end: 30 });
    es.emit('ended', { runId: 'r 1', status: 'succeeded' });
    es.fail(); // after ended: no down
    expect(got).toEqual(['missing', 'snap:1:0:false', 'down', 'up', 'entries:20:30', 'ended:succeeded']);
    expect(es.closed).toBe(true);
    s.live.followTranscript('r2', 42, { onSnapshot() {}, onEntries() {}, onMissing() {}, onEnded() {} });
    expect(s.last().url).toBe('/api/runs/r2/transcript/stream?after=42');
  });
});
