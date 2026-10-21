// LiveEvents over real SSE (EventSource) - only web/main.tsx creates it.
//
// `/api/events`: does NOT let EventSource reconnect itself (it does not know which attempt this is, so it cannot count down for the UC-17 banner).
// Error -> close -> `down` -> retry after 1 -> 2 -> 4 -> 8 seconds. When it reconnects -> `open`; the listener (web/data) reloads everything
// because the server does not replay missed events (ARCHITECTURE.md section "Events to the web").
//
// `/api/runs/:id/logs/stream`: lets EventSource reconnect itself - the browser sends `Last-Event-ID` (= the last seq) so no
// line repeats; on `event: end` it closes itself, otherwise the browser would reconnect a finished stream (the server foundation handover).
// `/api/runs/:id/transcript/stream`: the same way - `id:` is the byte offset, on `event: ended` it closes itself.
import { z } from 'zod';
import { logStreamEndDto, stateEventDto } from '../../shared/contracts/events';
import { logLineDto } from '../../shared/contracts/loops';
import { transcriptEndedEventDto, transcriptEntriesEventDto, transcriptPageDto } from '../../shared/contracts/transcript';
import {
  CONNECTING,
  OPEN,
  retryDelayMs,
  type ConnectionState,
  type LiveEvents,
  type LogStreamHandlers,
  type TranscriptStreamHandlers,
} from './live-events';

/** The part of EventSource this layer uses (tests pass a fake). */
export type EventSourceLike = {
  readonly readyState: number;
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  close(): void;
};
export type EventSourceFactory = (url: string) => EventSourceLike;

const STATE_EVENT_TYPES = stateEventDto.options.map((o) => o.shape.type.value);

export type SseLiveEventsOptions = {
  base?: string;
  createEventSource?: EventSourceFactory;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class SseLiveEvents implements LiveEvents {
  readonly #base: string;
  readonly #create: EventSourceFactory;
  readonly #now: () => Date;
  readonly #setTimer: (fn: () => void, ms: number) => unknown;
  readonly #clearTimer: (handle: unknown) => void;
  readonly #connListeners = new Set<(s: ConnectionState) => void>();
  readonly #eventListeners = new Set<(e: z.output<typeof stateEventDto>) => void>();
  #state: ConnectionState = CONNECTING;
  #es: EventSourceLike | null = null;
  #retry: unknown = null;
  #closed = false;

  constructor(opts: SseLiveEventsOptions = {}) {
    this.#base = opts.base ?? '/api';
    this.#create = opts.createEventSource ?? ((url) => new EventSource(url) as EventSourceLike);
    this.#now = opts.now ?? (() => new Date());
    this.#setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.#clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  connect(): void {
    if (this.#es || this.#retry !== null) return;
    this.#closed = false;
    this.#open();
  }

  close(): void {
    this.#closed = true;
    if (this.#retry !== null) this.#clearTimer(this.#retry);
    this.#retry = null;
    this.#es?.close();
    this.#es = null;
  }

  connection(): ConnectionState {
    return this.#state;
  }

  onConnection(listener: (s: ConnectionState) => void): () => void {
    this.#connListeners.add(listener);
    return () => this.#connListeners.delete(listener);
  }

  onEvent(listener: (e: z.output<typeof stateEventDto>) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  followRunLogs(runId: string, after: number, h: LogStreamHandlers): () => void {
    const es = this.#create(`${this.#base}/runs/${encodeURIComponent(runId)}/logs/stream?after=${after}`);
    let ended = false;
    let wasDown = false;
    es.addEventListener('log', (ev) => {
      const line = decodeJson(logLineDto, ev.data);
      if (line) h.onLine(line);
    });
    es.addEventListener('end', (ev) => {
      ended = true;
      es.close(); // do not let the browser reconnect a finished stream
      const end = decodeJson(logStreamEndDto, ev.data);
      if (end) h.onEnd(end);
    });
    es.onopen = () => {
      if (wasDown) h.onReconnect?.();
      wasDown = false;
    };
    es.onerror = () => {
      if (ended) return;
      wasDown = true;
      h.onDisconnect?.();
    };
    return () => es.close();
  }

  // Like the log stream: let EventSource reconnect itself (`id:` = byte offset -> `Last-Event-ID`, the server skips `snapshot`, no repeated entries);
  // on `ended` it closes itself.
  followTranscript(runId: string, after: number | null, h: TranscriptStreamHandlers): () => void {
    const es = this.#create(`${this.#base}/runs/${encodeURIComponent(runId)}/transcript/stream${after === null ? '' : `?after=${after}`}`);
    let ended = false;
    let wasDown = false;
    es.addEventListener('snapshot', (ev) => {
      const page = decodeJson(transcriptPageDto, ev.data);
      if (page) h.onSnapshot(page);
    });
    es.addEventListener('entries', (ev) => {
      const batch = decodeJson(transcriptEntriesEventDto, ev.data);
      if (batch) h.onEntries(batch.entries, batch.end);
    });
    es.addEventListener('missing', () => h.onMissing());
    es.addEventListener('ended', (ev) => {
      ended = true;
      es.close();
      const end = decodeJson(transcriptEndedEventDto, ev.data);
      if (end) h.onEnded(end);
    });
    es.onopen = () => {
      if (wasDown) h.onReconnect?.();
      wasDown = false;
    };
    es.onerror = () => {
      if (ended) return;
      wasDown = true;
      h.onDisconnect?.();
    };
    return () => es.close();
  }

  #open(): void {
    const es = this.#create(`${this.#base}/events`);
    this.#es = es;
    es.onopen = () => {
      if (this.#es !== es) return;
      this.#set(OPEN);
    };
    es.onerror = () => {
      if (this.#es !== es) return;
      es.close();
      this.#es = null;
      if (this.#closed) return;
      this.#scheduleRetry();
    };
    for (const type of STATE_EVENT_TYPES) {
      es.addEventListener(type, (ev) => {
        if (this.#es !== es) return;
        const event = decodeJson(stateEventDto, ev.data);
        if (event) for (const l of this.#eventListeners) l(event);
      });
    }
  }

  #scheduleRetry(): void {
    const prev = this.#state;
    const now = this.#now();
    const attempt = prev.status === 'down' ? prev.attempt + 1 : 1;
    const delay = retryDelayMs(attempt);
    this.#set({ status: 'down', attempt, retryAt: new Date(now.getTime() + delay), downSince: prev.status === 'down' ? prev.downSince : now });
    this.#retry = this.#setTimer(() => {
      this.#retry = null;
      if (!this.#closed) this.#open();
    }, delay);
  }

  #set(state: ConnectionState): void {
    this.#state = state;
    for (const l of this.#connListeners) l(state);
  }
}

function decodeJson<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> | null {
  try {
    return z.decode(schema, JSON.parse(String(raw)) as z.input<S>);
  } catch {
    return null; // odd / broken event: skipped, it must not break the stream
  }
}
