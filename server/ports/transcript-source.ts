// Reads Claude Code transcripts already written to disk. The service does not touch node:fs (layer rule) and does not know the
// JSONL format — only the adapter `server/adapters/transcripts/claude-jsonl/` does.

import type { TranscriptEntry, TranscriptPage } from '../../shared/domain/transcript';

/** A pointer to a session's transcript file; the service only holds it and hands it back to the adapter. */
export type TranscriptRef = { readonly sessionId: string; readonly path: string };

export type TranscriptPageOptions = { minEntries: number; maxBytes: number };

export interface TranscriptSource {
  /** Finds the file by session id in every project folder of every root. Malformed id / not found → null; once found it is remembered in RAM. */
  locate(sessionId: string): Promise<TranscriptRef | null>;
  /**
   * Reads BACKWARD from `before` (null = end of file) until `minEntries` entries are collected or `maxBytes` is used up; never reads the whole file.
   * File gone → an empty page `{ entries: [], start: 0, end: 0, hasMore: false }`.
   */
  readBack(ref: TranscriptRef, before: number | null, opts: TranscriptPageOptions): Promise<TranscriptPage>;
  /**
   * Reads FORWARD once from `from` (start of a line) to the current end of file: every complete line → an entry; `end` = just after the last
   * complete line (no new line → `end = from`). The service uses it for the final sweep when a run ends and to rejoin the stream of
   * a finished run. File gone → `{ entries: [], end: from }`.
   */
  readForward(ref: TranscriptRef, from: number): Promise<{ entries: TranscriptEntry[]; end: number }>;
  /**
   * Reads FORWARD once from `from` (start of a line) to the current end of file: every complete line → an entry; `end` = just after the last complete
   * line (no new line → `end = from`). The service uses it for the final sweep when a run ends and to rejoin the stream of a
   * finished run. File gone → `{ entries: [], end: from }`.
   */
  readForward(ref: TranscriptRef, from: number): Promise<{ entries: TranscriptEntry[]; end: number }>;
  /**
   * Follows the growing file from `from` (start of a line): each time a new complete line yields entries → one batch `{ entries, end }`
   * (`end` = just after the last complete line read). Ends when `signal` aborts or the file disappears.
   */
  follow(ref: TranscriptRef, from: number, signal: AbortSignal): AsyncIterable<{ entries: TranscriptEntry[]; end: number }>;
}
