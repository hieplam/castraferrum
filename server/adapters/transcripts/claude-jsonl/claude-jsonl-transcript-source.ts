import { join } from 'node:path';
import type { TranscriptEntry, TranscriptPage } from '../../../../shared/domain/transcript';
import type { TranscriptPageOptions, TranscriptRef, TranscriptSource } from '../../../ports/transcript-source';
import { parseClaudeLine } from './claude-line';
import { ForwardLines, readLinesBack } from './jsonl-reader';
import { nodeTranscriptIo, type TranscriptIo } from './transcript-io';

/** Path-traversal guard: a session id consists only of letters, digits, `_`, `-` (Claude Code's UUIDs match). */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export type ClaudeJsonlOptions = {
  /** The `projects/` folders to search (default as composed: `${CLAUDE_CONFIG_DIR ?? ~/.claude}/projects`). */
  roots: string[];
  io?: TranscriptIo;
  /** Chunk for reading backwards (default 256 KB) and chunk for reading forwards when following (default 1 MB). */
  readBackChunkBytes?: number;
  followChunkBytes?: number;
  /** Fallback `stat` poll for `fs.watch` (default 500 ms) and debounce of watch events (default 50 ms). */
  pollMs?: number;
  debounceMs?: number;
};

/**
 * TranscriptSource over the JSONL files Claude Code writes itself (D24–D29): finds a session id across every project folder
 * (the folder name cannot be derived from cwd — `claude -p` yields `…-atlas-…`, the SDK yields `…-Atlas-…`), reads backwards in chunks, follows
 * with `fs.watch` + a `stat` poll. Stores nothing outside RAM.
 */
export class ClaudeJsonlTranscriptSource implements TranscriptSource {
  private readonly io: TranscriptIo;
  private readonly found = new Map<string, TranscriptRef>();
  private readonly readBackChunk: number;
  private readonly followChunk: number;
  private readonly pollMs: number;
  private readonly debounceMs: number;

  constructor(private readonly opts: ClaudeJsonlOptions) {
    this.io = opts.io ?? nodeTranscriptIo;
    this.readBackChunk = opts.readBackChunkBytes ?? 256 * 1024;
    this.followChunk = opts.followChunkBytes ?? 1024 * 1024;
    this.pollMs = opts.pollMs ?? 500;
    this.debounceMs = opts.debounceMs ?? 50;
  }

  async locate(sessionId: string): Promise<TranscriptRef | null> {
    if (!SESSION_ID.test(sessionId)) return null;
    const hit = this.found.get(sessionId);
    if (hit) return hit;
    for (const root of this.opts.roots) {
      for (const dir of await this.io.listDirs(root)) {
        const path = join(root, dir, `${sessionId}.jsonl`);
        if (await this.io.stat(path)) {
          const ref = { sessionId, path };
          this.found.set(sessionId, ref);
          return ref;
        }
      }
    }
    return null;
  }

  async readBack(ref: TranscriptRef, before: number | null, opts: TranscriptPageOptions): Promise<TranscriptPage> {
    const st = await this.io.stat(ref.path);
    if (!st) return { entries: [], start: 0, end: 0, hasMore: false };
    const file = await this.io.open(ref.path);
    try {
      const { items, start, end } = await readLinesBack(
        file,
        st.size,
        before,
        { minItems: opts.minEntries, maxBytes: opts.maxBytes, chunkBytes: this.readBackChunk },
        parseClaudeLine,
      );
      return { entries: items, start, end, hasMore: start > 0 };
    } finally {
      await file.close();
    }
  }

  async readForward(ref: TranscriptRef, from: number): Promise<{ entries: TranscriptEntry[]; end: number }> {
    const lines = new ForwardLines(from, parseClaudeLine);
    const entries = await this.readNew(ref, lines, new AbortController().signal);
    return { entries: entries ?? [], end: lines.end };
  }

    async *follow(ref: TranscriptRef, from: number, signal: AbortSignal): AsyncIterable<{ entries: TranscriptEntry[]; end: number }> {
    if (signal.aborted) return;
    const wake = new Waker();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const watcher = this.io.watch(ref.path, () => {
      clearTimeout(debounce);
      debounce = setTimeout(wake.fire, this.debounceMs);
    });
    const poll = setInterval(wake.fire, this.pollMs);
    signal.addEventListener('abort', wake.fire);
    const lines = new ForwardLines(from, parseClaudeLine);
    try {
      while (!signal.aborted) {
        const entries = await this.readNew(ref, lines, signal);
        if (entries === null) return;
        if (entries.length > 0 && !signal.aborted) yield { entries, end: lines.end };
        await wake.wait();
      }
    } finally {
      clearTimeout(debounce);
      clearInterval(poll);
      watcher.close();
      signal.removeEventListener('abort', wake.fire);
    }
  }

  /**
   * Read the file from `lines.readPos` to the current size in chunks ≤ `followChunk`, pushing them through `lines` (keeping the partial line).
   * File replaced by a shorter one → read again from the start. File gone → null.
   */
  private async readNew(ref: TranscriptRef, lines: ForwardLines<TranscriptEntry>, signal: AbortSignal): Promise<TranscriptEntry[] | null> {
    const st = await this.io.stat(ref.path);
    if (!st) return null;
    if (st.size < lines.readPos) lines.reset(0); // file was replaced (got shorter) → read again from the start
    const entries: TranscriptEntry[] = [];
    if (st.size <= lines.readPos) return entries;
    const file = await this.io.open(ref.path).catch(() => null);
    if (!file) return null;
    try {
      while (lines.readPos < st.size && !signal.aborted) {
        const buf = await file.read(lines.readPos, Math.min(this.followChunk, st.size - lines.readPos));
        if (buf.length === 0) break;
        entries.push(...lines.push(buf));
      }
    } finally {
      await file.close();
    }
    return entries;
  }
}

/** Wake-up flag: if `fire` comes before anyone `wait`s, the next `wait` returns immediately — no change is missed between two reads. */
class Waker {
  private pending = false;
  private resolve: (() => void) | null = null;

  readonly fire = (): void => {
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r();
    } else this.pending = true;
  };

  wait(): Promise<void> {
    if (this.pending) {
      this.pending = false;
      return Promise.resolve();
    }
    return new Promise((r) => {
      this.resolve = r;
    });
  }
}
