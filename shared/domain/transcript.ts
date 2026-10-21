// Transcript of a Claude turn (SPEC-phase-2, Transcript): conversation entries read from the JSONL file Claude Code writes itself.
// The console only reads and shows them verbatim - no copy is stored, no text is cut.

export const TRANSCRIPT_ENTRY_KINDS = ['user', 'assistant', 'thinking', 'tool_use', 'tool_result', 'system'] as const;
export type TranscriptEntryKind = (typeof TRANSCRIPT_ENTRY_KINDS)[number];

/**
 * One conversation entry. One JSONL line can yield several entries (one per block of `message.content`), so the unique key
 * is the pair (`offset`, `block`).
 */
export type TranscriptEntry = {
  /** Byte offset of the start of the JSONL line - pagination cursor and SSE `id`. */
  offset: number;
  /** Index of the block within the line (0 when the line has a single entry). */
  block: number;
  /** ISO `timestamp` of the line; null when the line has none. */
  at: string | null;
  kind: TranscriptEntryKind;
  /** Verbatim, not cut. `tool_use` = pretty-printed input (JSON, 2-space indent). */
  text: string;
  toolName?: string;
  toolUseId?: string;
  isError?: boolean;
};

/** One transcript page: older `entries` first; `start` is aligned to a line start; `hasMore` = older content remains (`start > 0`). */
export type TranscriptPage = {
  entries: TranscriptEntry[];
  start: number;
  end: number;
  hasMore: boolean;
};

/** Default page (SPEC, Transcript, D28): at least 50 entries or 4 MB read, whichever comes first. */
export const DEFAULT_TRANSCRIPT_PAGE = { minEntries: 50, maxBytes: 4 * 1024 * 1024 } as const;
