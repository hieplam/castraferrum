// ProbeService (settings only): rules of spec 2.1 on top of the memory repositories. probe-tick.test.ts holds the tick.
import { beforeEach, describe, expect, it } from 'vitest';
import { flush, makeKit, type Kit } from '../../tests/support/service-kit';
import type { ProbeInput, ProbeService } from './contracts';

let k: Kit;
let probes: ProbeService;
beforeEach(() => {
  k = makeKit();
  probes = k.probeService;
});

const input = (over: Partial<ProbeInput> = {}): ProbeInput => ({ command: ['node', 'probe.mjs'], ...over });
const stoppedLoop = async () => (await k.loopService.create(k.input())).id;

async function issuesOf(p: Promise<unknown>): Promise<string[]> {
  const err = await p.then(
    () => null,
    (e: unknown) => e as { code: string; details: { issues: { field: string; code: string }[] } },
  );
  expect(err?.code).toBe('VALIDATION_FAILED');
  return err!.details.issues.map((i) => `${i.field}:${i.code}`);
}

describe('ProbeService', () => {
  it('get: a loop with no probe gives null', async () => {
    expect(await probes.get(await stoppedLoop())).toBeNull();
  });

  it('get: an unknown loop throws LOOP_NOT_FOUND', async () => {
    await expect(probes.get('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'LOOP_NOT_FOUND' });
  });

  it('save: stores the settings, fills the defaults, and starts in state active', async () => {
    const id = await stoppedLoop();
    const saved = await probes.save(id, input());
    expect(saved).toEqual({
      loopId: id,
      command: ['node', 'probe.mjs'],
      claim: [],
      release: [],
      resources: [],
      laneEnv: {},
      laneBasePort: null,
      restartPolicy: 'stop',
      rank: 100,
      tokenBudget: null,
      state: 'active',
      lastLine: null,
      lastProbeAt: null,
    });
    expect(await probes.get(id)).toEqual(saved);
    expect(k.db.probes.get(id)).toEqual(saved);
  });

  it('save: a second save replaces the settings and keeps one row', async () => {
    const id = await stoppedLoop();
    await probes.save(id, input({ restartPolicy: 'resume', laneBasePort: 7200 }));
    const saved = await probes.save(id, input({ command: ['node', 'next.mjs'], claim: ['gh', 'claim', '{key}'] }));
    expect(saved).toMatchObject({ command: ['node', 'next.mjs'], claim: ['gh', 'claim', '{key}'], restartPolicy: 'stop', laneBasePort: null });
    expect(k.db.probes.size).toBe(1);
  });

  it('save: an active loop throws LOOP_IS_ACTIVE and stores nothing', async () => {
    const id = await stoppedLoop();
    await k.loopService.start(id);
    await flush();
    await expect(probes.save(id, input())).rejects.toMatchObject({ code: 'LOOP_IS_ACTIVE' });
    expect(k.db.probes.size).toBe(0);
  });

  it('save: an archived loop throws LOOP_ARCHIVED and stores nothing', async () => {
    const id = await stoppedLoop();
    await k.loopService.archive(id);
    await expect(probes.save(id, input())).rejects.toMatchObject({ code: 'LOOP_ARCHIVED' });
    expect(k.db.probes.size).toBe(0);
  });

  it('save: reports every rule at once as claim:missingKey, release:missingKey, release:missingReason, resources:reserved and command:required', async () => {
    const id = await stoppedLoop();
    expect(
      await issuesOf(
        probes.save(id, {
          command: [],
          claim: ['gh', 'claim'],
          release: ['gh', 'release'],
          resources: [{ name: 'plan-window', check: ['true'], everySec: 30 }],
        }),
      ),
    ).toEqual(['command:required', 'claim:missingKey', 'release:missingKey', 'release:missingReason', 'resources:reserved']);
    expect(await issuesOf(probes.save(id, input({ release: ['gh', 'release', '{key}'] })))).toEqual(['release:missingReason']);
    expect(k.db.probes.size).toBe(0);
  });

  it('save: {port} in lane_env with no base port throws laneEnv:missingBasePort and stores nothing (decision 24)', async () => {
    const id = await stoppedLoop();
    expect(await issuesOf(probes.save(id, input({ laneEnv: { LANE_PORT: 'x:{port}' } })))).toEqual(['laneEnv:missingBasePort']);
    expect(await probes.get(id)).toBeNull();
    await expect(probes.save(id, input({ laneEnv: { LANE_PORT: '{port}' }, laneBasePort: 7100 }))).resolves.toMatchObject({ laneBasePort: 7100 });
  });

  it('remove: deletes the row, accepts a loop with no probe, and refuses an active loop', async () => {
    const id = await stoppedLoop();
    await probes.save(id, input());
    await probes.remove(id);
    await probes.remove(id);
    expect(await probes.get(id)).toBeNull();

    await probes.save(id, input());
    await k.loopService.start(id);
    await flush();
    await expect(probes.remove(id)).rejects.toMatchObject({ code: 'LOOP_IS_ACTIVE' });
    expect(k.db.probes.size).toBe(1);
  });
});
