// npm run bench:transcript: the benchmark for reading the last page of a 75 MB transcript WITHOUT reading the whole
// file. It generates a file in a temp folder with measured proportions (about 2/3 of the lines are internal types,
// lines up to 1 MB, sparse conversation entries at the tail), then measures `locate + readBack(last page)` on a
// byte-counting io.
// Exit 1 when the bytes read exceed 4 194 304 or the time to the first entry exceeds 500 ms.
import { mkdirSync, mkdtempSync, openSync, rmSync, statSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_TRANSCRIPT_PAGE } from '../shared/domain/transcript.ts';
import { ClaudeJsonlTranscriptSource } from '../server/adapters/transcripts/claude-jsonl/claude-jsonl-transcript-source.ts';
import { nodeTranscriptIo } from '../server/adapters/transcripts/claude-jsonl/transcript-io.ts';

const TARGET = 75 * 1024 * 1024;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_MS = 500;
const SESSION = '0b5e7c1a-75mb-4bench-a11c-transcript0';

const filler = (n) => 'Filler context text - '.repeat(Math.ceil(n / 22)).slice(0, n);
const at = (i) => new Date(Date.UTC(2026, 9, 19, 12, 0, 0) + i * 1000).toISOString();
const row = (o) => `${JSON.stringify(o)}\n`;

/** One "turn" is 3 conversation lines + 6 internal lines (2/3); every 10th turn adds one 1 MB internal line. */
function turn(i) {
  const lines = [
    row({ type: 'attachment', attachment: { type: 'skill_listing', content: filler(75_000) }, timestamp: at(i) }),
    row({ type: 'api-request-blob', message: { role: 'user', content: [{ type: 'text', text: filler(30_000) }] } }),
    row({ type: 'api-request', requestId: `req_${i}`, body: filler(1_500) }),
    row({ type: 'atis-latch', value: i }),
    row({ type: 'last-prompt', prompt: filler(140) }),
    row({ type: 'assistant', timestamp: at(i), message: { model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: filler(2_000), signature: 'sig' }] } }),
    row({ type: 'assistant', timestamp: at(i), message: { content: [{ type: 'tool_use', id: `toolu_${i}`, name: 'Bash', input: { command: `echo ${i}` } }] } }),
    row({ type: 'user', timestamp: at(i), message: { content: [{ type: 'tool_result', tool_use_id: `toolu_${i}`, content: filler(8_000) }] } }),
    row({ type: 'mode', mode: 'default' }),
  ];
  if (i % 10 === 0) lines.splice(2, 0, row({ type: 'api-request-shape', shape: filler(1024 * 1024) }));
  return lines.join('');
}

const tmp = mkdtempSync(join(tmpdir(), 'lc-bench-transcript-'));
try {
  const root = join(tmp, 'projects');
  for (let d = 0; d < 30; d++) mkdirSync(join(root, `C--Users-alice-repo-${d}`), { recursive: true });
  const dir = join(root, 'C--Users-alice-repo-demo');
  mkdirSync(dir);
  const path = join(dir, `${SESSION}.jsonl`);
  const fd = openSync(path, 'w');
  let size = 0;
  for (let i = 1; ; i++) {
    const t = turn(i);
    if (size + Buffer.byteLength(t) > TARGET - 100) break;
    size += writeSync(fd, t);
  }
  // a last internal line pads the file to exactly 75 MB (long internal lines at the tail are normal: up to 1.77 MB was measured)
  const head = '{"type":"cost-state","pad":"';
  size += writeSync(fd, `${head}${'x'.repeat(TARGET - size - head.length - 3)}"}\n`);
  closeSync(fd);

  let bytesRead = 0;
  const io = {
    ...nodeTranscriptIo,
    async open(p) {
      const f = await nodeTranscriptIo.open(p);
      return { read: async (pos, len) => { const b = await f.read(pos, len); bytesRead += b.length; return b; }, close: () => f.close() };
    },
  };
  const t0 = performance.now();
  const src = new ClaudeJsonlTranscriptSource({ roots: [root], io });
  const ref = await src.locate(SESSION);
  if (!ref) throw new Error('locate did not find the file just generated');
  const page = await src.readBack(ref, null, DEFAULT_TRANSCRIPT_PAGE);
  const ms = performance.now() - t0;

  const mb = (statSync(path).size / 1024 / 1024).toFixed(1);
  console.log(`${mb} MB · bytes read: ${bytesRead} · first entry: ${Math.round(ms)} ms · ${page.entries.length} entries, hasMore ${page.hasMore}`);
  const ok = bytesRead <= MAX_BYTES && ms <= MAX_MS && page.entries.length > 0;
  if (!ok) console.error(`RED: need bytes read <= ${MAX_BYTES}, first entry <= ${MAX_MS} ms, at least 1 entry`);
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
