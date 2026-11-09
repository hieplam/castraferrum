// The transcript stream of a skipped run, when the schedule tick records the skip late (a slow ticker, as in a loaded full verify).
// The server ticks every 1.5 s, slower than the 1 s default limit of `vi.waitFor`. The test drives its wait by finished ticks, so it does not depend on the speed of the ticker.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loopBody, openSse, resetApi, skippedRunAfterClockMove, startApi, type ApiServer } from '../support/api-kit';

let server: ApiServer;
let base: string;
beforeAll(async () => {
  server = await startApi({ tickEveryMs: 1500 });
  base = await server.listen();
});
afterAll(async () => {
  await server?.shutdown();
});

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('GET /api/runs/:id/transcript/stream of a skipped run that the slow ticker records after more than 1 s', () => {
  it('no session file -> missing then ended with status skipped', async () => {
    await resetApi(server);
    const loop = await call('POST', '/api/loops', loopBody({ cron: '* * * * *' }));
    await call('POST', `/api/loops/${loop.id}/start`);
    const skipped = await skippedRunAfterClockMove(server, base, loop.id as string);
    const none = await openSse(`${base}/api/runs/${skipped}/transcript/stream`);
    await none.waitEnd(3000);
    expect(none.data().map((e) => e.event)).toEqual(['missing', 'ended']);
    expect(none.data()[1]!.data).toEqual({ runId: skipped, status: 'skipped' });
    await call('POST', `/api/loops/${loop.id}/stop`);
  }, 30_000);
});
