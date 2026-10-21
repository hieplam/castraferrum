// Transcript of a run (SPEC-phase-2 section "Transcript - Web"): watch the SSE stream (`snapshot` = the last page, then
// `entries` append at the bottom), scrolling up calls `loadOlder()` which loads an older page over REST and inserts it on top. No cap on the number of entries (the project owner
// accepts the RAM cost). Each screen opens its own stream - open 2 tabs and both run (D-UI32).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptEntryDto, TranscriptPageDto } from '../../shared/contracts/transcript';
import { useApi, useLive } from './provider';

/**
 * `following` = watching; `paused` = connection lost, waiting to reconnect; `ended` = the run is done, the stream closed; `missing` = not
 * there yet / file not found (for a running run it means "Claude has not written yet"); `noSession` = the run has no session.
 */
export type TranscriptMode = 'following' | 'paused' | 'ended' | 'missing' | 'noSession';

export type TranscriptState = {
  entries: TranscriptEntryDto[];
  /** Offset of the earliest line loaded - the `before` of an older page; null = no page received yet. */
  start: number | null;
  hasMore: boolean;
  /** Received `missing` and no page yet. */
  missing: boolean;
  /** The stream received `ended`. */
  ended: boolean;
  paused: boolean;
  loadingOlder: boolean;
};

export const EMPTY_TRANSCRIPT: TranscriptState = { entries: [], start: null, hasMore: false, missing: false, ended: false, paused: false, loadingOlder: false };

const after = (a: TranscriptEntryDto, b: TranscriptEntryDto) => a.offset > b.offset || (a.offset === b.offset && a.block > b.block);

/** The last page of the stream. If an older page was loaded and `snapshot` arrives again (does not happen - a reconnect skips `snapshot`), replace everything. */
export function onSnapshot(s: TranscriptState, page: TranscriptPageDto): TranscriptState {
  return { ...s, entries: page.entries, start: page.start, hasMore: page.hasMore, missing: false };
}

/** New entries at the bottom; drop entries already present (defensive - a reconnect already has `Last-Event-ID`). */
export function onEntries(s: TranscriptState, entries: readonly TranscriptEntryDto[]): TranscriptState {
  const last = s.entries[s.entries.length - 1];
  const fresh = last ? entries.filter((e) => after(e, last)) : [...entries];
  if (!fresh.length) return s;
  return { ...s, entries: [...s.entries, ...fresh], start: s.start ?? (fresh[0] as TranscriptEntryDto).offset, missing: false };
}

/** An older page (`before` = the old `start`): insert on top, dropping entries that duplicate what is already there. */
export function onOlder(s: TranscriptState, page: TranscriptPageDto): TranscriptState {
  const first = s.entries[0];
  const older = first ? page.entries.filter((e) => after(first, e)) : page.entries;
  return { ...s, entries: [...older, ...s.entries], start: page.start, hasMore: page.hasMore, loadingOlder: false };
}

export function transcriptMode(s: TranscriptState, hasSession: boolean): TranscriptMode {
  if (!hasSession) return 'noSession';
  if (s.missing && !s.entries.length) return 'missing';
  if (s.ended) return 'ended';
  return s.paused ? 'paused' : 'following';
}

export type UseTranscript = TranscriptState & { mode: TranscriptMode; loadOlder: () => void };

/** `runId` null = the run has no session (skipped, "Repo does not exist") -> do not open a stream. */
export function useTranscript(runId: string | null): UseTranscript {
  const api = useApi();
  const live = useLive();
  const [state, setState] = useState<TranscriptState>(EMPTY_TRANSCRIPT);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    setState(EMPTY_TRANSCRIPT);
    if (!runId) return undefined;
    return live.followTranscript(runId, null, {
      onSnapshot: (page) => setState((s) => onSnapshot(s, page)),
      onEntries: (entries) => setState((s) => onEntries(s, entries)),
      onMissing: () => setState((s) => (s.entries.length ? s : { ...s, missing: true })),
      onEnded: () => setState((s) => ({ ...s, ended: true, paused: false })),
      onDisconnect: () => setState((s) => (s.ended ? s : { ...s, paused: true })),
      onReconnect: () => setState((s) => ({ ...s, paused: false })),
    });
  }, [live, runId]);
  const loadOlder = useCallback(() => {
    const s = ref.current;
    if (!runId || !s.hasMore || s.loadingOlder || s.start === null) return;
    const before = s.start;
    ref.current = { ...s, loadingOlder: true }; // scrolling fast fires several events before a redraw: only one call
    setState((x) => ({ ...x, loadingOlder: true }));
    api.getTranscriptPage(runId, before).then(
      (page) => setState((x) => (x.start === before ? onOlder(x, page) : { ...x, loadingOlder: false })),
      () => setState((x) => ({ ...x, loadingOlder: false })),
    );
  }, [api, runId]);
  return { ...state, mode: transcriptMode(state, runId !== null), loadOlder };
}
