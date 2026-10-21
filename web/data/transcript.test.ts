// Rules for merging pages / new entries of a transcript: snapshot = the last page, entries append at the bottom without repeats, older pages are inserted
// on top without repeats, the display mode (missing / noSession / ended / paused).
import { describe, expect, it } from 'vitest';
import type { TranscriptEntryDto } from '../../shared/contracts/transcript';
import { EMPTY_TRANSCRIPT, onEntries, onOlder, onSnapshot, transcriptMode } from './transcript';

const e = (offset: number, block = 0): TranscriptEntryDto => ({ offset, block, at: null, kind: 'assistant', text: `${offset}:${block}` });
const keys = (s: { entries: TranscriptEntryDto[] }) => s.entries.map((x) => `${x.offset}:${x.block}`);

describe('transcript state', () => {
  it('snapshot then entries: append at the bottom, drop entries already present (same offset, different block is still a new entry)', () => {
    let s = onSnapshot(EMPTY_TRANSCRIPT, { entries: [e(100), e(200, 0), e(200, 1)], start: 100, end: 300, hasMore: true });
    s = onEntries(s, [e(200, 1), e(200, 2), e(300)]);
    expect(keys(s)).toEqual(['100:0', '200:0', '200:1', '200:2', '300:0']);
    expect(s.start).toBe(100);
    expect(onEntries(s, [e(300)])).toBe(s);
  });

  it('an older page is inserted on top, updates start + hasMore, drops the overlap', () => {
    let s = onSnapshot(EMPTY_TRANSCRIPT, { entries: [e(100), e(200)], start: 100, end: 300, hasMore: true });
    s = onOlder({ ...s, loadingOlder: true }, { entries: [e(0), e(50), e(100)], start: 0, end: 100, hasMore: false });
    expect(keys(s)).toEqual(['0:0', '50:0', '100:0', '200:0']);
    expect(s).toMatchObject({ start: 0, hasMore: false, loadingOlder: false });
  });

  it('mode: no session -> noSession; missing when there are no entries; ended; paused', () => {
    expect(transcriptMode(EMPTY_TRANSCRIPT, false)).toBe('noSession');
    expect(transcriptMode({ ...EMPTY_TRANSCRIPT, missing: true }, true)).toBe('missing');
    expect(transcriptMode({ ...EMPTY_TRANSCRIPT, missing: true, ended: true }, true)).toBe('missing');
    const withRows = onSnapshot({ ...EMPTY_TRANSCRIPT, missing: true }, { entries: [e(0)], start: 0, end: 10, hasMore: false });
    expect(withRows.missing).toBe(false);
    expect(transcriptMode({ ...withRows, ended: true }, true)).toBe('ended');
    expect(transcriptMode({ ...withRows, paused: true }, true)).toBe('paused');
    expect(transcriptMode(withRows, true)).toBe('following');
  });

  it('entries before any snapshot (reconnect) - start comes from the first entry', () => {
    const s = onEntries(EMPTY_TRANSCRIPT, [e(40), e(80)]);
    expect(s.start).toBe(40);
    expect(keys(s)).toEqual(['40:0', '80:0']);
  });
});
