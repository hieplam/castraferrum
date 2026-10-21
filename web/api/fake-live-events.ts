// Fake LiveEvents for tests: the test emits events itself (`emit`), changes the connection state itself (`setConnection`) and pushes
// logs itself (`pushLog`, `endLogs`) - no network, no timers.
import type { LogStreamEndDto, StateEventDto } from '../../shared/contracts/events';
import type { LogLineDto } from '../../shared/contracts/loops';
import { CONNECTING, type ConnectionState, type LiveEvents, type LogStreamHandlers, type TranscriptStreamHandlers } from './live-events';

export class FakeLiveEvents implements LiveEvents {
  readonly #conn = new Set<(s: ConnectionState) => void>();
  readonly #events = new Set<(e: StateEventDto) => void>();
  readonly #logs = new Map<string, Set<LogStreamHandlers>>();
  readonly #transcripts = new Map<string, Set<TranscriptStreamHandlers>>();
  #state: ConnectionState = CONNECTING;
  connected = false;

  connect(): void {
    this.connected = true;
  }
  close(): void {
    this.connected = false;
  }
  connection(): ConnectionState {
    return this.#state;
  }
  onConnection(listener: (s: ConnectionState) => void): () => void {
    this.#conn.add(listener);
    return () => this.#conn.delete(listener);
  }
  onEvent(listener: (e: StateEventDto) => void): () => void {
    this.#events.add(listener);
    return () => this.#events.delete(listener);
  }
  followRunLogs(runId: string, _after: number, handlers: LogStreamHandlers): () => void {
    const set = this.#logs.get(runId) ?? new Set();
    set.add(handlers);
    this.#logs.set(runId, set);
    return () => set.delete(handlers);
  }

  setConnection(state: ConnectionState): void {
    this.#state = state;
    for (const l of this.#conn) l(state);
  }
  emit(event: StateEventDto): void {
    for (const l of this.#events) l(event);
  }
  pushLog(line: LogLineDto): void {
    for (const h of this.#logs.get(line.runId) ?? []) h.onLine(line);
  }
  endLogs(end: LogStreamEndDto): void {
    for (const h of this.#logs.get(end.runId) ?? []) h.onEnd(end);
    this.#logs.delete(end.runId);
  }
  followTranscript(runId: string, _after: number | null, handlers: TranscriptStreamHandlers): () => void {
    const set = this.#transcripts.get(runId) ?? new Set();
    set.add(handlers);
    this.#transcripts.set(runId, set);
    return () => set.delete(handlers);
  }
  /** Everyone watching the transcript of a run (tests call `onSnapshot`, `onEntries`... directly). */
  transcriptFollowers(runId: string): TranscriptStreamHandlers[] {
    return [...(this.#transcripts.get(runId) ?? [])];
  }
  /** Number of watchers of the log of a run (tests assert the watch was cancelled when leaving the screen). */
  logFollowers(runId: string): number {
    return this.#logs.get(runId)?.size ?? 0;
  }
}
