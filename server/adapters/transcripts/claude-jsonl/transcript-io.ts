import { watch } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';

// The disk-touching part of the transcript reader, injected through the constructor: unit tests swap in a fake (no disk needed, can build two
// folders that differ only in case), the bench wraps `read` to count the bytes actually read.

export interface TranscriptFile {
  /** Read at most `length` bytes from `position`; at end of file returns fewer. */
  read(position: number, length: number): Promise<Buffer>;
  close(): Promise<void>;
}

export interface TranscriptIo {
  /** Names of the subfolders of `dir`; `dir` missing → []. */
  listDirs(dir: string): Promise<string[]>;
  /** File size; missing or not a file → null. */
  stat(path: string): Promise<{ size: number } | null>;
  open(path: string): Promise<TranscriptFile>;
  /** Call `onChange` whenever the file changes; if it cannot be watched, return an empty handle (the caller still has the fallback `stat` poll). */
  watch(path: string, onChange: () => void): { close(): void };
}

export const nodeTranscriptIo: TranscriptIo = {
  async listDirs(dir) {
    try {
      return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return [];
    }
  },
  async stat(path) {
    try {
      const s = await stat(path);
      return s.isFile() ? { size: s.size } : null;
    } catch {
      return null;
    }
  },
  async open(path) {
    const handle = await open(path, 'r');
    return {
      async read(position, length) {
        const buf = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buf, 0, length, position);
        return bytesRead === length ? buf : buf.subarray(0, bytesRead);
      },
      close: () => handle.close(),
    };
  },
  watch(path, onChange) {
    try {
      const w = watch(path, () => onChange());
      w.on('error', () => w.close());
      return { close: () => w.close() };
    } catch {
      return { close() {} };
    }
  },
};
