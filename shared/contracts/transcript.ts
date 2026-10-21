// Transcript of a run (SPEC-phase-2 section "Transcript - Service + API").
//
// `GET /api/runs/:id/transcript?before=` - one `transcriptPageDto` page (oldest first).
// `GET /api/runs/:id/transcript/stream` - SSE: `event: snapshot` (the last page, when not reconnecting) · `entries` (new entries) -
//   both carry `id: <end>` = the byte offset after the last entry, a browser that reconnects sends `Last-Event-ID` itself · `missing` (no /
//   file not found) · `ended` (the run ended, the server closes the stream right after).
import { z } from 'zod';
import { RUN_STATUSES } from '../domain/run';
import { TRANSCRIPT_ENTRY_KINDS } from '../domain/transcript';

export const transcriptEntryDto = z.object({
  /** Byte at the start of the JSONL line; the pair (`offset`, `block`) is the unique key of the entry. */
  offset: z.number().int().min(0),
  block: z.number().int().min(0),
  at: z.string().nullable(),
  kind: z.enum(TRANSCRIPT_ENTRY_KINDS),
  /** Verbatim, not truncated. */
  text: z.string(),
  toolName: z.string().optional(),
  toolUseId: z.string().optional(),
  isError: z.boolean().optional(),
});
export type TranscriptEntryDto = z.output<typeof transcriptEntryDto>;

export const transcriptPageDto = z.object({
  entries: z.array(transcriptEntryDto),
  /** Offset of the earliest line of the page (aligned to a line start) - send it back as `before` to load an older page. */
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  /** There is older content (`start > 0`). */
  hasMore: z.boolean(),
});
export type TranscriptPageDto = z.output<typeof transcriptPageDto>;

/** `?before=` empty = the last page. */
export const transcriptQuery = z.object({ before: z.coerce.number().int().min(0).optional() });

/** `?after=` of the stream (the browser uses `Last-Event-ID`; the header wins when larger). Empty = send `snapshot` first. */
export const transcriptStreamQuery = z.object({ after: z.coerce.number().int().min(0).optional() });

export const transcriptEntriesEventDto = z.object({ entries: z.array(transcriptEntryDto), end: z.number().int().min(0) });
export const transcriptEndedEventDto = z.object({ runId: z.string(), status: z.enum(RUN_STATUSES) });
export type TranscriptEndedEventDto = z.output<typeof transcriptEndedEventDto>;
