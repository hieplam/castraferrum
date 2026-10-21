import { spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { TranscriptEntry } from '../../../../shared/domain/transcript';
import { ClaudeJsonlTranscriptSource } from './claude-jsonl-transcript-source';
import { nodeTranscriptIo, type TranscriptIo } from './transcript-io';

// Transcript reader (G-T1). The fixture is a REAL transcript of a haiku session (D29) — see
// tests/fixtures/transcript/README.md; the per-kind entry counts below were counted independently from that file.

const FIXTURE = fileURLToPath(new URL('../../../../tests/fixtures/transcript/haiku-small.jsonl', import.meta.url));
const FIXTURE_KINDS = { user: 1, thinking: 2, tool_use: 2, tool_result: 2, assistant: 1, system: 1 };
const FIXTURE_ENTRIES = 9;
const SESSION = '4ecc03da-8197-4041-b5ef-e65c4da7540d';
const KB = 1024;

const tmp = mkdtempSync(join(tmpdir(), 'lc26-transcript-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** A fresh `projects/<dir>/` in tmp, holding a copy of the fixture (or given content) named `<id>.jsonl`. */
function project(content?: string | Buffer, id = SESSION): { root: string; path: string } {
  const root = join(tmp, `root-${++n}`);
  mkdirSync(join(root, 'C--Users-alice-repo-Atlas'), { recursive: true });
  const path = join(root, 'C--Users-alice-repo-Atlas', `${id}.jsonl`);
  if (content === undefined) copyFileSync(FIXTURE, path);
  else writeFileSync(path, content);
  return { root, path };
}

/** Real io, but counts the bytes read + the number of calls. */
function countingIo(): TranscriptIo & { bytes: number; calls: number } {
  const io = {
    bytes: 0,
    calls: 0,
    listDirs: (d: string) => (io.calls++, nodeTranscriptIo.listDirs(d)),
    stat: (p: string) => (io.calls++, nodeTranscriptIo.stat(p)),
    async open(p: string) {
      io.calls++;
      const f = await nodeTranscriptIo.open(p);
      return { read: async (pos: number, len: number) => { const b = await f.read(pos, len); io.bytes += b.length; return b; }, close: () => f.close() };
    },
    watch: nodeTranscriptIo.watch,
  };
  return io;
}

const key = (e: TranscriptEntry) => `${e.offset}:${e.block}`;
const countKinds = (entries: TranscriptEntry[]) => entries.reduce<Record<string, number>>((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
const ALL = { minEntries: 1_000_000, maxBytes: 1 << 30 };

describe('ClaudeJsonlTranscriptSource.locate', () => {
  it('finds across 2 roots × several folders, including two folders that differ only in case; a malformed id → null without touching the disk; remembers the result', async () => {
    const files = new Set([join('R2', 'C--x-repo-Atlas', 'sdk-1.jsonl'), join('R1', 'C--x-repo-atlas', 'cli-1.jsonl')]);
    const dirs: Record<string, string[]> = { R1: ['C--x-other', 'C--x-repo-atlas'], R2: ['C--x-repo-atlas', 'C--x-repo-Atlas'] };
    let calls = 0;
    const io: TranscriptIo = {
      listDirs: async (d) => (calls++, dirs[d] ?? []),
      stat: async (p) => (calls++, files.has(p) ? { size: 1 } : null),
      open: async () => { throw new Error('not used'); },
      watch: () => ({ close() {} }),
    };
    const src = new ClaudeJsonlTranscriptSource({ roots: ['R1', 'R2'], io });
    expect(await src.locate('sdk-1')).toEqual({ sessionId: 'sdk-1', path: join('R2', 'C--x-repo-Atlas', 'sdk-1.jsonl') });
    expect(await src.locate('cli-1')).toEqual({ sessionId: 'cli-1', path: join('R1', 'C--x-repo-atlas', 'cli-1.jsonl') });
    const before = calls;
    expect(await src.locate('sdk-1')).not.toBeNull();
    expect(calls).toBe(before); // remembered in RAM
    for (const bad of ['', '../x', '..', 'a/b', 'a\\b', '-abc', 'a.jsonl', 'x'.repeat(101), `${SESSION} `]) {
      expect(await src.locate(bad)).toBeNull();
    }
    expect(calls).toBe(before); // a malformed id scans nothing
    expect(await src.locate('missing')).toBeNull();
    files.add(join('R1', 'C--x-other', 'missing.jsonl'));
    expect(await src.locate('missing')).not.toBeNull(); // a "not found" result is not remembered — the file may appear later
  });

  it('on the real disk: a nonexistent root is skipped, the file sits in the second root', async () => {
    const { root, path } = project();
    const src = new ClaudeJsonlTranscriptSource({ roots: [join(tmp, 'nonexistent'), root] });
    expect(await src.locate(SESSION)).toEqual({ sessionId: SESSION, path });
  });
});

describe('ClaudeJsonlTranscriptSource.readBack', () => {
  it('reads the whole real fixture: all 9 entries of the right kinds, oldest first, start 0, end = file size', async () => {
    const { root, path } = project();
    const src = new ClaudeJsonlTranscriptSource({ roots: [root] });
    const page = await src.readBack((await src.locate(SESSION))!, null, ALL);
    expect(page.entries).toHaveLength(FIXTURE_ENTRIES);
    expect(countKinds(page.entries)).toEqual(FIXTURE_KINDS);
    expect(page).toMatchObject({ start: 0, end: statSync(path).size, hasMore: false });
    expect(page.entries.map((e) => e.offset)).toEqual([...page.entries.map((e) => e.offset)].sort((a, b) => a - b));
    expect(page.entries[0]).toMatchObject({ kind: 'user', text: readFirstUserPrompt() });
  });

  it('walks all pages with before = start: each page has enough minEntries (except the first page of the file), start aligned to a line head, union = everything, no overlap', async () => {
    const { root, path } = project();
    const bytes = readFileSync(path);
    const all = await new ClaudeJsonlTranscriptSource({ roots: [root] }).readBack({ sessionId: SESSION, path }, null, ALL);
    for (const chunk of [512, 4 * KB, 64 * KB]) {
      const src = new ClaudeJsonlTranscriptSource({ roots: [root], readBackChunkBytes: chunk });
      const ref = (await src.locate(SESSION))!;
      const pages = [];
      let before: number | null = null;
      for (let guard = 0; guard < 100; guard++) {
        const page = await src.readBack(ref, before, { minEntries: 2, maxBytes: 1 << 30 });
        pages.unshift(page);
        expect(page.start === 0 || bytes[page.start - 1] === 0x0a).toBe(true);
        if (page.hasMore) expect(page.entries.length).toBeGreaterThanOrEqual(2);
        else break;
        expect(page.start).toBeLessThan(before ?? Infinity);
        before = page.start;
      }
      expect(pages[0]!.hasMore).toBe(false);
      const union = pages.flatMap((p) => p.entries);
      expect(new Set(union.map(key)).size).toBe(union.length);
      expect(union).toEqual(all.entries);
    }
  });

  it('chunk with surplus → the page keeps only the newest lines that just reach minEntries, cut on line boundaries', async () => {
    const { root, path } = project();
    const src = new ClaudeJsonlTranscriptSource({ roots: [root] }); // 256 KB chunk > the whole 80 KB fixture
    const ref = (await src.locate(SESSION))!;
    const all = (await src.readBack(ref, null, ALL)).entries;
    for (const min of [1, 2, 3, 5]) {
      const page = await src.readBack(ref, null, { minEntries: min, maxBytes: 1 << 30 });
      expect(page.entries.length).toBeGreaterThanOrEqual(min);
      const firstLine = page.entries.filter((e) => e.offset === page.entries[0]!.offset).length;
      expect(page.entries.length - firstLine).toBeLessThan(min); // dropping the first line would fall short → no surplus line
      expect(page.start).toBe(page.entries[0]!.offset);
      expect(page.hasMore).toBe(true);
      expect(page.entries).toEqual(all.slice(all.length - page.entries.length));
      expect(page.end).toBe(statSync(path).size);
    }
  });

  it('stops when maxBytes runs out: reads ≤ the budget, returns the exact tail, hasMore', async () => {
    const { root } = project();
    const io = countingIo();
    const src = new ClaudeJsonlTranscriptSource({ roots: [root], io, readBackChunkBytes: 4 * KB });
    const ref = (await src.locate(SESSION))!;
    const all = await src.readBack(ref, null, ALL);
    io.bytes = 0;
    const page = await src.readBack(ref, null, { minEntries: 1000, maxBytes: 8 * KB });
    expect(io.bytes).toBeLessThanOrEqual(8 * KB);
    expect(page.hasMore).toBe(true);
    expect(page.entries.length).toBeGreaterThan(0);
    expect(page.entries.length).toBeLessThan(FIXTURE_ENTRIES);
    expect(page.entries).toEqual(all.entries.slice(-page.entries.length));
  });

  it('a last line without \\n is not parsed; end = after the last complete line', async () => {
    const { root, path } = project();
    const size = statSync(path).size;
    appendFileSync(path, '{"type":"user","timestamp":"2026-10-19T15:30:00.000Z","message":{"content":"half-written');
    const src = new ClaudeJsonlTranscriptSource({ roots: [root] });
    const page = await src.readBack((await src.locate(SESSION))!, null, ALL);
    expect(page.end).toBe(size);
    expect(page.entries).toHaveLength(FIXTURE_ENTRIES);
  });

  it('multi-byte UTF-8 characters cut across the 256 KB chunk boundary + 600 KB thinking → text intact, not cut', async () => {
    const fixture = readFileSync(FIXTURE);
    const long = 'Multibyte thinking text: € ≈ ✓ → — '.repeat(16 * KB); // ~700 KB, all 1–3 byte characters
    // the thinking line is built from a real assistant line of the fixture, only swapping the thinking text (haiku 5.5 writes empty thinking)
    const realThinking = fixture.toString('utf8').split('\n').find((l) => l.includes('"type":"thinking"'))!;
    const thinkingLine = JSON.stringify(withThinking(JSON.parse(realThinking), long));
    let splitCases = 0;
    for (let pad = 0; pad < 6; pad++) {
      const tailLine = JSON.stringify({ type: 'user', timestamp: '2026-10-19T15:31:00.000Z', message: { content: 'x'.repeat(pad + 1) } });
      const content = Buffer.concat([fixture, Buffer.from(`${thinkingLine}\n${tailLine}\n`)]);
      // does the first chunk boundary (end of file − 256 KB) fall on a continuation byte (10xxxxxx) of a multi-byte character?
      if (((content[content.length - 256 * KB] ?? 0) & 0xc0) === 0x80) splitCases++;
      const { root } = project(content);
      const src = new ClaudeJsonlTranscriptSource({ roots: [root] });
      const page = await src.readBack((await src.locate(SESSION))!, null, ALL);
      const thinking = page.entries.filter((e) => e.kind === 'thinking').map((e) => e.text);
      expect(thinking).toContain(long);
      expect(page.entries).toHaveLength(FIXTURE_ENTRIES + 2);
    }
    expect(splitCases).toBeGreaterThan(0);
  });
});

describe('ClaudeJsonlTranscriptSource.follow', () => {
  it('another process appends 5 lines → 5 batches, end increases, entries in order; abort signal → ends', async () => {
    const { root, path } = project();
    const src = new ClaudeJsonlTranscriptSource({ roots: [root] });
    const ref = (await src.locate(SESSION))!;
    const from = statSync(path).size;
    const ac = new AbortController();
    // a child process appends 5 lines, 300 ms apart; newline = fromCharCode(10) to avoid double escaping (template → -e)
    const writer = spawn(process.execPath, [
      '-e',
      `const fs=require('fs');let i=0;const t=setInterval(()=>{i++;fs.appendFileSync(process.argv[1],JSON.stringify({type:'user',timestamp:new Date().toISOString(),message:{content:'line '+i}})+String.fromCharCode(10));if(i===5)clearInterval(t)},300)`,
      path,
    ]);
    const exited = new Promise((r) => writer.on('exit', r)); // listen right away: the writer exits once done, possibly before the for loop
    const batches: { entries: TranscriptEntry[]; end: number }[] = [];
    for await (const b of src.follow(ref, from, ac.signal)) {
      batches.push(b);
      if (batches.length === 5) ac.abort();
    }
    await exited;
    expect(batches.map((b) => b.entries.map((e) => e.text))).toEqual([['line 1'], ['line 2'], ['line 3'], ['line 4'], ['line 5']]);
    const ends = batches.map((b) => b.end);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(new Set(ends).size).toBe(5);
    expect(ends.at(-1)).toBe(statSync(path).size);
    expect(batches[0]!.entries[0]!.offset).toBe(from);
  }, 15_000);

  it('a long line cut across the 1 MB chunk boundary, with a multi-byte character exactly on the boundary → text intact; file gone → ends', async () => {
    const MB = 1024 * KB;
    for (const shift of [1, 2]) {
      // place a 3-byte character "€" so that the 1 MB boundary falls on its `shift`-th byte
      const head = '{"type":"user","timestamp":"2026-10-19T15:32:00.000Z","message":{"content":"';
      const padLen = MB - Buffer.byteLength(head) - shift;
      const text = `${'a'.repeat(padLen)}€${'≈'.repeat(200 * KB)}`;
      const content = `${head}${text}"}}\n`;
      expect(Buffer.from(content).subarray(MB - shift, MB - shift + 3).toString()).toBe('€');
      const { root, path } = project(content);
      const src = new ClaudeJsonlTranscriptSource({ roots: [root] });
      const ref = (await src.locate(SESSION))!;
      const got: TranscriptEntry[] = [];
      const ac = new AbortController();
      const done = (async () => {
        for await (const b of src.follow(ref, 0, ac.signal)) {
          got.push(...b.entries);
          rmSync(path); // file gone → follow ends on the next stat (no abort needed)
        }
      })();
      await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('follow did not end when the file disappeared')), 3000))]);
      expect(got.map((e) => e.text)).toEqual([text]);
    }
  });

  it('file replaced by a shorter one → read again from the start; an already-aborted signal → no iteration at all', async () => {
    const { root, path } = project();
    const src = new ClaudeJsonlTranscriptSource({ roots: [root], pollMs: 50 });
    const ref = (await src.locate(SESSION))!;
    const ac = new AbortController();
    const it = src.follow(ref, statSync(path).size, ac.signal)[Symbol.asyncIterator]();
    const next = it.next();
    await new Promise((r) => setTimeout(r, 150)); // follow has done its first stat, nothing new, now waiting
    writeFileSync(path, `${JSON.stringify({ type: 'user', message: { content: 'new file' } })}\n`);
    const first = await next;
    expect(first.value?.entries.map((e: TranscriptEntry) => e.text)).toEqual(['new file']);
    expect(first.value?.entries[0]?.offset).toBe(0);
    expect(first.value?.end).toBe(statSync(path).size);
    ac.abort();
    expect((await it.next()).done).toBe(true);

    const pre = new AbortController();
    pre.abort();
    let loops = 0;
    for await (const _ of src.follow(ref, 0, pre.signal)) loops++;
    expect(loops).toBe(0);
  });
});

describe('ClaudeJsonlTranscriptSource.readForward', () => {
  it('from 0 = all 9 entries of the fixture; from the end = empty; a half-written line is not parsed; file gone → empty, end = from', async () => {
    const { root, path } = project();
    const src = new ClaudeJsonlTranscriptSource({ roots: [root] });
    const ref = (await src.locate(SESSION))!;
    const size = statSync(path).size;
    const all = await src.readForward(ref, 0);
    expect(all.entries).toHaveLength(FIXTURE_ENTRIES);
    expect(countKinds(all.entries)).toEqual(FIXTURE_KINDS);
    expect(all.end).toBe(size);
    expect(all.entries.map(key)).toEqual((await src.readBack(ref, null, ALL)).entries.map(key));
    expect(await src.readForward(ref, size)).toEqual({ entries: [], end: size });

    const line = `${JSON.stringify({ type: 'user', message: { content: 'just added' } })}\n`;
    appendFileSync(path, `${line}{"type":"user","mess`);
    const more = await src.readForward(ref, size);
    expect(more.entries.map((e) => [e.offset, e.text])).toEqual([[size, 'just added']]);
    expect(more.end).toBe(size + Buffer.byteLength(line));

    rmSync(path);
    expect(await src.readForward(ref, 123)).toEqual({ entries: [], end: 123 });
  });
});

function readFirstUserPrompt(): string {
  for (const l of readFileSync(FIXTURE, 'utf8').split('\n')) {
    if (!l) continue;
    const o = JSON.parse(l);
    if (o.type === 'user' && typeof o.message?.content === 'string') return o.message.content;
  }
  throw new Error('fixture has no prompt');
}

function withThinking(row: { message: { content: { type: string; thinking?: string }[] } }, text: string) {
  return { ...row, message: { ...row.message, content: row.message.content.map((b) => (b.type === 'thinking' ? { ...b, thinking: text } : b)) } };
}
