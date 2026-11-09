// The probe world of the design-system shots keeps its seeded probe row while the ticker of the real server runs (issue 421).
// The seeded probe command is `node probe.mjs`, which does not exist. The ticker probes a loop each 60 s of the server clock, and the
// seed puts the last probe 58 s before `PREVIEW_NOW`. So a tick during a slow test replaced the seeded state with `probe_failed`, and
// the last probe time on the page with the time of the tick. The test makes that tick happen on demand: it moves the server clock
// 120 s after the seed and waits for more than one beat of the ticker (1 s). The row must stay as it was seeded. No page is drawn.
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { seedProbeState, type ProbeSeedState } from '../../support/goal-loop-probe-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';

const STATES: ProbeSeedState[] = ['waiting', 'held', 'blocked', 'complete'];
const BEATS_MS = 4_000;

test('a tick of the probe ticker after the seed leaves the seeded probe row as it is, in each state', async () => {
  const config = realpathSync(mkdtempSync(join(tmpdir(), 'cf-ds-probe-tick-')));
  const sp = await ServerProcess.launch({ env: { CLAUDE_CONFIG_DIR: config } });
  const db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  const row = async () => (await db.query('SELECT state, last_line, last_probe_at FROM loop_probes')).rows;
  try {
    for (const state of STATES) {
      await seedProbeState(sp, db, state, { projectsDir: join(config, 'projects') });
      const seeded = await row();
      expect(seeded, `${state}: one seeded probe row`).toHaveLength(1);
      expect(seeded[0].state, `${state}: the seeded state`).toBe(state);
      expect((await sp.api('POST', '/api/__test/clock', { advanceMs: 120_000 })).status).toBe(200);
      const end = Date.now() + BEATS_MS;
      while (Date.now() < end) {
        expect(await row(), `${state}: a tick must not change the seeded probe row`).toEqual(seeded);
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  } finally {
    await sp.stop();
    await db.end();
  }
});
