// Realtime interface of the web (ARCHITECTURE.md section "Events to the web"): state events of
// `GET /api/events` + the connection state (for the UC-17 disconnect banner, the server light) + the log stream of a run + the transcript stream
// of a run (SPEC-phase-2 section "Transcript" - the transcript work / the transcript screen).
// Real: sse-live-events.ts (EventSource - only web/main.tsx creates it); fake for tests: fake-live-events.ts.
import type { LogStreamEndDto, StateEventDto } from '../../shared/contracts/events';
import type { LogLineDto } from '../../shared/contracts/loops';
import type { TranscriptEndedEventDto, TranscriptEntryDto, TranscriptPageDto } from '../../shared/contracts/transcript';

/**
 * `connecting` = opening for the first time (never connected yet); `open` = connected; `down` = lost, waiting to retry.
 * `attempt` = which retry since the loss (0 when `open`); `retryAt` = when the next retry happens (`down`);
 * `downSince` = when the loss began (the figures on screen are "stopped at" this instant).
 */
export type ConnectionState =
  | { status: 'connecting'; attempt: 0; retryAt: null; downSince: null }
  | { status: 'open'; attempt: 0; retryAt: null; downSince: null }
  | { status: 'down'; attempt: number; retryAt: Date; downSince: Date };

export type LogStreamHandlers = {
  onLine(line: LogLineDto): void;
  /** The run ended (`event: end`) - the stream closed itself, no reconnect. */
  onEnd(end: LogStreamEndDto): void;
  /** Lost the connection midway (the browser reconnects itself, sending `Last-Event-ID` - no duplicate lines). */
  onDisconnect?(): void;
  onReconnect?(): void;
};

/** The stream `/api/runs/:id/transcript/stream` (SPEC-phase-2 section "Service + API"). */
export type TranscriptStreamHandlers = {
  /** The last page when the stream opens (absent on reconnect - the browser sends `Last-Event-ID`). */
  onSnapshot(page: TranscriptPageDto): void;
  /** New entries appended to the file; `end` = the byte offset after the last entry. */
  onEntries(entries: TranscriptEntryDto[], end: number): void;
  /** Not there yet / file not found (running run: the server looks again every 500 ms, and sends `snapshot` once it exists). */
  onMissing(): void;
  /** The run ended - the stream closed itself, no reconnect. */
  onEnded(ended: TranscriptEndedEventDto): void;
  onDisconnect?(): void;
  onReconnect?(): void;
};

export interface LiveEvents {
  /** Open the connection (called once at the composition root / provider). Calling again when already open does nothing. */
  connect(): void;
  /** Close for good, no retry (tests, unmount). */
  close(): void;
  connection(): ConnectionState;
  onConnection(listener: (state: ConnectionState) => void): () => void;
  /** State events - carry only an id + a few fields; after hearing one, reload through `LoopsApi`. */
  onEvent(listener: (event: StateEventDto) => void): () => void;
  /** Watch the log of a run from `after` (replays the stored log, then pushes on). Returns the unwatch function. */
  followRunLogs(runId: string, after: number, handlers: LogStreamHandlers): () => void;
  /** Watch the transcript of a run; `after` null = receive `snapshot` first. Each call is its own stream (D-UI32). Returns the unwatch function. */
  followTranscript(runId: string, after: number | null, handlers: TranscriptStreamHandlers): () => void;
}

export const CONNECTING: ConnectionState = { status: 'connecting', attempt: 0, retryAt: null, downSince: null };
export const OPEN: ConnectionState = { status: 'open', attempt: 0, retryAt: null, downSince: null };

/** Wait before retry number `attempt` (1, 2, 3...): 1 -> 2 -> 4 -> 8 seconds, at most 8 seconds. */
export function retryDelayMs(attempt: number): number {
  return Math.min(8_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}
