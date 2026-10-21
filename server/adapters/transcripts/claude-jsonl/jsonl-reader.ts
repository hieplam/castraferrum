import type { TranscriptFile } from './transcript-io';

// Only knows bytes and lines (`\n`), not the Claude format: each complete line is handed to `parse`. Lines are cut on the Buffer
// before UTF-8 decoding — byte 0x0A never sits inside a multi-byte character, so a chunk boundary falling mid-character
// does not corrupt the text.

const NL = 0x0a;

export type LineParser<T> = (line: string, offset: number) => T[];

/** Split the region `data` (starting at byte `base`, made of complete lines) into lines then parse; skip empty lines. */
function parseRegion<T>(data: Buffer, base: number, parse: LineParser<T>): T[] {
  return parseLines(data, base, parse).flatMap((l) => l.items);
}

/** Like `parseRegion` but keeps each line's boundaries (line-start offset + the line's entries); lines producing no entry are dropped. */
function parseLines<T>(data: Buffer, base: number, parse: LineParser<T>): { offset: number; items: T[] }[] {
  const out: { offset: number; items: T[] }[] = [];
  let a = 0;
  while (a < data.length) {
    let b = data.indexOf(NL, a);
    if (b === -1) b = data.length;
    if (b > a) {
      const items = parse(data.toString('utf8', a, b), base + a);
      if (items.length > 0) out.push({ offset: base + a, items });
    }
    a = b + 1;
  }
  return out;
}

export type ReadBackOptions = { minItems: number; maxBytes: number; chunkBytes: number };

/**
 * Read BACKWARDS from `before` (null = end of file, size `size`) in chunks of `chunkBytes`, until `minItems` entries are collected or
 * `maxBytes` has been read. Never reads the whole file. Guarantees progress: if no line is finished yet keep reading even past the budget (a line
 * longer than `maxBytes` still comes out) — the longest line measured is 1.77 MB, the budget is 4 MB.
 *
 * The earliest chunk usually has surplus: keep only the NEWEST lines that just reach `minItems` entries (cut on lines — a line with several entries is
 * never split), leaving the older part for the next page (the transcript work: a page ≈ `minItems` entries, not a whole 256 KB chunk).
 *
 * `start` = head of the earliest line of the page; `end` = after the last complete line (a last line of the file without `\n` does not count yet).
 */
export async function readLinesBack<T>(
  file: TranscriptFile,
  size: number,
  before: number | null,
  opts: ReadBackOptions,
  parse: LineParser<T>,
): Promise<{ items: T[]; start: number; end: number }> {
  const limit = before === null ? size : Math.max(0, Math.min(before, size));
  let end: number | null = before === null ? null : limit;
  let pos = limit;
  let start = limit;
  /** Bytes [pos, pos + tail.length): the part whose earliest line's start is not yet known — waiting for the previous chunk. */
  let tail: Buffer = Buffer.alloc(0);
  const groups: { offset: number; items: T[] }[][] = [];
  let count = 0;
  let bytesRead = 0;
  let consumed = false;

  while (pos > 0) {
    if (consumed && (count >= opts.minItems || bytesRead >= opts.maxBytes)) break;
    const len = Math.min(opts.chunkBytes, pos, consumed ? opts.maxBytes - bytesRead : opts.chunkBytes);
    pos -= len;
    const chunk = await file.read(pos, len);
    bytesRead += len;
    let data: Buffer = tail.length ? Buffer.concat([chunk, tail]) : chunk;
    if (end === null) {
      const last = data.lastIndexOf(NL);
      if (last === -1) {
        tail = data;
        continue;
      }
      end = pos + last + 1;
      data = data.subarray(0, last + 1);
    }
    // `data` ends on a line boundary; the part before the first `\n` is the tail of a line that starts in the previous chunk (unless pos = 0).
    const from = pos === 0 ? 0 : data.indexOf(NL) + 1;
    if (pos > 0 && from === 0) {
      tail = data;
      continue;
    }
    tail = data.subarray(0, from);
    if (from < data.length) {
      const lines = parseLines(data.subarray(from), pos + from, parse);
      groups.unshift(lines);
      for (const l of lines) count += l.items.length;
      start = pos + from;
      consumed = true;
    }
  }
  if (end === null) return { items: [], start: 0, end: 0 };
  const lines = groups.flat();
  let drop = 0;
  while (drop < lines.length && count - lines[drop]!.items.length >= opts.minItems) count -= lines[drop++]!.items.length;
  if (drop > 0) start = lines[drop]!.offset;
  return { items: lines.slice(drop).flatMap((l) => l.items), start: Math.min(start, end), end };
}

/**
 * Read FORWARDS a growing file: take consecutive chunks, return the entries of complete lines, keep the partial part waiting for the next chunk.
 * `readPos` = the next byte to read; `end` = after the last complete line.
 */
export class ForwardLines<T> {
  private partial: Buffer = Buffer.alloc(0);
  private lineStart: number;

  constructor(
    from: number,
    private readonly parse: LineParser<T>,
  ) {
    this.lineStart = from;
  }

  get end(): number {
    return this.lineStart;
  }

  get readPos(): number {
    return this.lineStart + this.partial.length;
  }

  reset(from: number): void {
    this.partial = Buffer.alloc(0);
    this.lineStart = from;
  }

  push(chunk: Buffer): T[] {
    const data = this.partial.length ? Buffer.concat([this.partial, chunk]) : chunk;
    const last = data.lastIndexOf(NL);
    if (last === -1) {
      this.partial = data;
      return [];
    }
    const items = parseRegion(data.subarray(0, last + 1), this.lineStart, this.parse);
    this.partial = Buffer.from(data.subarray(last + 1));
    this.lineStart += last + 1;
    return items;
  }
}
