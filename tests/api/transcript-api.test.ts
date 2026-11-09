// Transcript of a run through the API: `GET /api/runs/:id/transcript` (one page) + `/transcript/stream` (SSE).
// Real server from composeServer, the transcript root is a temp folder; the file is a copy of the REAL fixture
// (tests/fixtures/transcript/haiku-small.jsonl - 9 entries, the count per kind is in the README next to the fixture) placed under exactly the session id
// the Mock reports for the run. The tests append lines to the file like Claude Code does. Every wait is event-driven - no hard sleeps.
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopBody, MOCK_TICK_MS, openSse, resetApi, skippedRunAfterClockMove, startApi, type ApiServer, type SseEvent } from '../support/api-kit';

const FIXTURE = fileURLToPath(new URL('../fixtures/transcript/haiku-small.jsonl', import.meta.url));
const FIXTURE_KINDS = { user: 1, thinking: 2, tool_use: 2, tool_result: 2, assistant: 1, system: 1 };
const FIXTURE_ENTRIES = 9;
const FIXTURE_SIZE = statSync(FIXTURE).size;
const FIXTURE_LINES = readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean);
/** Real fixture lines: the prompt (1 `user` entry) and the answer (a `text` block -> 1 `assistant` entry). */
const PROMPT_LINE = FIXTURE_LINES.find((l) => l.startsWith('{') && JSON.parse(l).type === 'user' && typeof JSON.parse(l).message?.content === 'string')!;
const ANSWER_LINE = FIXTURE_LINES.find((l) => JSON.parse(l).type === 'assistant' && JSON.parse(l).message.content.some((b: { type: string }) => b.type === 'text'))!;
const PAGE = 3; // small page so the 9-entry fixture spans several pages
const MISSING = '00000000-0000-4000-8000-000000000000';

const roots = mkdtempSync(join(tmpdir(), 'lc27-transcripts-'));
let server: ApiServer;
let base: string;
beforeAll(async () => {
  server = await startApi({ transcriptRoots: [join(roots, 'nope'), roots], transcriptPage: { minEntries: PAGE, maxBytes: 4 * 1024 * 1024 } });
  base = await server.listen();
});
afterAll(async () => {
  await server?.shutdown();
  rmSync(roots, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: string, url: string, body?: unknown): Promise<{ status: number; body: Json }> {
  const res = await fetch(base + url, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json };
}
const data = (e: SseEvent) => e.data as Json;
const key = (e: Json) => `${e.offset}:${e.block}`;
const countKinds = (entries: Json[]) => entries.reduce<Record<string, number>>((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});

/** A Mock run in progress (600 "seconds") that already has a session id `mock-...`. */
async function runningRun() {
  const loop = (await call('POST', '/api/loops', loopBody())).body;
  const runId = (await call('POST', `/api/loops/${loop.id}/start`)).body.activeRun.id as string;
  const sessionId = await vi.waitFor(async () => {
    const run = (await call('GET', `/api/runs/${runId}`)).body;
    expect(run.sessionId).toMatch(/^mock-/);
    return run.sessionId as string;
  });
  return { loopId: loop.id as string, runId, sessionId };
}

/** Copy the fixture to `<root>/<project folder>/<session>.jsonl` like Claude Code writes it. */
function placeTranscript(sessionId: string, dir = 'C--Users-alice-repo-Atlas'): string {
  mkdirSync(join(roots, dir), { recursive: true });
  const path = join(roots, dir, `${sessionId}.jsonl`);
  copyFileSync(FIXTURE, path);
  return path;
}

describe('GET /api/runs/:id/transcript', () => {
  it('nonexistent run -> 404 RUN_NOT_FOUND (both REST and stream, the stream answers JSON before opening)', async () => {
    for (const id of [MISSING, 'xyz']) {
      expect([(await call('GET', `/api/runs/${id}/transcript`)).status, (await call('GET', `/api/runs/${id}/transcript`)).body.error.code]).toEqual([404, 'RUN_NOT_FOUND']);
      const res = await fetch(`${base}/api/runs/${id}/transcript/stream`);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      expect(((await res.json()) as Json).error.code).toBe('RUN_NOT_FOUND');
    }
  });

  it('skipped run (no session) and a run with a session but no file -> 404 TRANSCRIPT_NOT_FOUND; bad before -> VALIDATION_FAILED', async () => {
    const loop = (await call('POST', '/api/loops', loopBody({ cron: '* * * * *' }))).body;
    const runId = (await call('POST', `/api/loops/${loop.id}/start`)).body.activeRun.id as string;
    await call('POST', '/api/__test/clock', { advanceMs: 61_000 }); // cron tick while round #1 is still running -> skipped run
    const skipped = await vi.waitFor(async () => {
      const runs = (await call('GET', `/api/loops/${loop.id}/runs`)).body.items as Json[];
      expect(runs[0]).toMatchObject({ status: 'skipped', sessionId: null });
      return runs[0]!.id as string;
    });
    const noSession = await call('GET', `/api/runs/${skipped}/transcript`);
    expect([noSession.status, noSession.body.error.code]).toEqual([404, 'TRANSCRIPT_NOT_FOUND']);

    await vi.waitFor(async () => expect((await call('GET', `/api/runs/${runId}`)).body.sessionId).toMatch(/^mock-/));
    const noFile = await call('GET', `/api/runs/${runId}/transcript`);
    expect([noFile.status, noFile.body.error.code]).toEqual([404, 'TRANSCRIPT_NOT_FOUND']);

    for (const before of ['-1', 'abc', '1.5']) {
      const bad = await call('GET', `/api/runs/${runId}/transcript?before=${before}`);
      expect([bad.status, bad.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
    }
    await call('POST', `/api/loops/${loop.id}/stop`);
  });

  it('last page first (oldest first, start/end/hasMore); walk before = start down to start 0: no overlap, union = all 9 fixture entries', async () => {
    const { loopId, runId, sessionId } = await runningRun();
    placeTranscript(sessionId);
    const last = (await call('GET', `/api/runs/${runId}/transcript`)).body;
    expect(last.end).toBe(FIXTURE_SIZE);
    expect(last.hasMore).toBe(true);
    expect(last.start).toBeGreaterThan(0);
    expect(last.entries.length).toBeGreaterThanOrEqual(PAGE);
    expect(last.entries.map((e: Json) => e.offset)).toEqual([...last.entries.map((e: Json) => e.offset)].sort((a, b) => a - b));

    const pages = [last];
    let page = last;
    while (page.hasMore) {
      page = (await call('GET', `/api/runs/${runId}/transcript?before=${page.start}`)).body;
      expect(page.end).toBe(pages.at(-1)!.start); // the older page joins the next one, aligned to a line start
      pages.push(page);
    }
    expect(page.start).toBe(0);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const all = pages.reverse().flatMap((p) => p.entries as Json[]);
    expect(new Set(all.map(key)).size).toBe(all.length);
    expect(all).toHaveLength(FIXTURE_ENTRIES);
    expect(countKinds(all)).toEqual(FIXTURE_KINDS);
    const toolUse = all.filter((e) => e.kind === 'tool_use').map((e) => e.toolName);
    expect(toolUse).toEqual(['Read', 'Bash']);
    expect(all.find((e) => e.kind === 'user')!.text).toBe(JSON.parse(PROMPT_LINE).message.content);
    await call('POST', `/api/loops/${loopId}/stop`);
  });
});

describe('GET /api/runs/:id/transcript/stream', () => {
  it('two streams at once: snapshot then entries <= 2 seconds after the file is appended; Last-Event-ID resume has no overlap; run finished -> drain + ended then close; followers back to 0', async () => {
    const { loopId, runId, sessionId } = await runningRun();
    const path = placeTranscript(sessionId);
    const page = (await call('GET', `/api/runs/${runId}/transcript`)).body;
    const a = await openSse(`${base}/api/runs/${runId}/transcript/stream`);
    const b = await openSse(`${base}/api/runs/${runId}/transcript/stream`);
    expect(a.res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    for (const s of [a, b]) {
      const snap = await s.waitFor((e) => e.event === 'snapshot');
      expect(snap.id).toBe(String(FIXTURE_SIZE));
      expect(data(snap)).toEqual(page); // same last page as REST
    }
    expect(server.inspect.transcriptFollowers()).toBe(2);

    // Append one line like Claude Code -> both streams receive it, <= 2 seconds.
    const t0 = Date.now();
    appendFileSync(path, `${PROMPT_LINE}\n`);
    const firstEnd = FIXTURE_SIZE + Buffer.byteLength(`${PROMPT_LINE}\n`);
    for (const s of [a, b]) {
      const ev = await s.waitFor((e) => e.event === 'entries', 2000);
      expect(Date.now() - t0).toBeLessThanOrEqual(2000);
      expect(ev.id).toBe(String(firstEnd));
      expect(data(ev).entries.map((e: Json) => [e.offset, e.kind])).toEqual([[FIXTURE_SIZE, 'user']]);
    }

    // Resume from the snapshot id: no snapshot, receives exactly what was written after.
    const resumed = await openSse(`${base}/api/runs/${runId}/transcript/stream`, { 'last-event-id': String(FIXTURE_SIZE) });
    const caught = await resumed.waitFor((e) => e.event === 'entries');
    expect(data(caught).entries.map((e: Json) => e.offset)).toEqual([FIXTURE_SIZE]);
    expect(server.inspect.transcriptFollowers()).toBe(3);

    // A line written right before the run ends still arrives (final drain), then ended + the server closes the stream.
    appendFileSync(path, `${ANSWER_LINE}\n`);
    await call('POST', `/api/loops/${loopId}/stop`);
    for (const s of [a, b, resumed]) {
      const ended = await s.waitFor((e) => e.event === 'ended', 5000);
      expect(data(ended)).toEqual({ runId, status: 'cancelled' });
      await s.waitEnd();
      const got = s.data().filter((e) => e.event === 'entries').flatMap((e) => data(e).entries as Json[]);
      expect(got.map((e) => [e.offset, e.kind])).toEqual([
        [FIXTURE_SIZE, 'user'],
        [firstEnd, 'assistant'],
      ]);
      expect(s.data().filter((e) => e.event === 'snapshot')).toHaveLength(s === resumed ? 0 : 1);
      expect(s.data().at(-1)!.event).toBe('ended');
    }
    await vi.waitFor(() => expect(server.inspect.transcriptFollowers()).toBe(0));
  });

  it('no file yet -> missing; file appears -> snapshot; listener closes -> followers back to 0', async () => {
    const { loopId, runId, sessionId } = await runningRun();
    const s = await openSse(`${base}/api/runs/${runId}/transcript/stream`);
    await s.waitFor((e) => e.event === 'missing');
    placeTranscript(sessionId, 'C--Users-alice-repo-atlas'); // project folder with different letter case (claude -p)
    const snap = await s.waitFor((e) => e.event === 'snapshot', 3000);
    expect(data(snap)).toMatchObject({ end: FIXTURE_SIZE, hasMore: true });
    expect(server.inspect.transcriptFollowers()).toBe(1);
    await s.close();
    await vi.waitFor(() => expect(server.inspect.transcriptFollowers()).toBe(0));
    await call('POST', `/api/loops/${loopId}/stop`);
  });

  it('finished run: file present -> snapshot then ended at once; resume -> only the later part; no session -> missing then ended', async () => {
    const { loopId, runId, sessionId } = await runningRun();
    placeTranscript(sessionId);
    await call('POST', `/api/loops/${loopId}/stop`);
    await vi.waitFor(async () => expect((await call('GET', `/api/runs/${runId}`)).body.status).toBe('cancelled'));

    const done = await openSse(`${base}/api/runs/${runId}/transcript/stream`);
    await done.waitEnd(3000);
    expect(done.data().map((e) => e.event)).toEqual(['snapshot', 'ended']);
    expect(data(done.data()[1]!)).toEqual({ runId, status: 'cancelled' });

    const lastLine = FIXTURE_LINES.at(-1)!;
    const resumeAt = FIXTURE_SIZE - Buffer.byteLength(`${lastLine}\n`);
    const resumed = await openSse(`${base}/api/runs/${runId}/transcript/stream?after=${resumeAt}`);
    await resumed.waitEnd(3000);
    expect(resumed.data().map((e) => e.event)).not.toContain('snapshot');
    expect(resumed.data().at(-1)!.event).toBe('ended');
    for (const e of resumed.data().filter((x) => x.event === 'entries')) {
      for (const entry of data(e).entries as Json[]) expect(entry.offset).toBeGreaterThanOrEqual(resumeAt);
    }

    const l2 = (await call('POST', '/api/loops', loopBody({ cron: '* * * * *' }))).body;
    await call('POST', `/api/loops/${l2.id}/start`);
    const skipped = await skippedRunAfterClockMove(server, base, l2.id as string);
    const none = await openSse(`${base}/api/runs/${skipped}/transcript/stream`);
    await none.waitEnd(3000);
    expect(none.data().map((e) => e.event)).toEqual(['missing', 'ended']);
    expect(data(none.data()[1]!)).toEqual({ runId: skipped, status: 'skipped' });
    await call('POST', `/api/loops/${l2.id}/stop`);
  }, 20 * MOCK_TICK_MS + 15_000);
});

// Runs last in the file: shuts down the real server (afterAll calls shutdown() again - idempotent).
describe('shutting down the server while a transcript stream is open', () => {
  it('shutdown() finishes in <= 2 seconds, the stream is closed, followers back to 0', async () => {
    const { runId, sessionId } = await runningRun();
    placeTranscript(sessionId);
    const s = await openSse(`${base}/api/runs/${runId}/transcript/stream`);
    await s.waitFor((e) => e.event === 'snapshot');
    expect(server.inspect.transcriptFollowers()).toBe(1);
    const t0 = Date.now();
    await server.shutdown();
    expect(Date.now() - t0).toBeLessThanOrEqual(2000);
    await s.waitEnd(2000);
    expect(server.inspect.transcriptFollowers()).toBe(0);
  });
});
