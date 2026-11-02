// G6, G9: the owner's rule is "DO NOT AUTO APPROVE ANY FORKED DOWNSTREAM PR, this need human to approve". It comes before the gate.
// A PR from a fork fails at `scope` and nobody can ratify it. The control differs in one input (`isCrossRepository`) and merges.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startGateApi, type GateApi } from '../support/gate-api-world';
import { GOOD_FILES } from '../support/gate-world';

let api: GateApi;

beforeAll(async () => {
  api = await startGateApi();
});
afterEach(() => api.endCases());
afterAll(() => api?.close());

describe('gate-fork: a pull request from a fork needs a person', { timeout: 120_000 }, () => {
  it('refused: a fork PR with GOOD_FILES fails at scope, merges nothing, runs no step of its code, and cannot be ratified', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: GOOD_FILES, fork: true });
    const run = await api.runJob(c, pr);
    expect(run.job.state).toBe('failed');
    expect(run.job.failedStep).toBe('scope');
    expect(run.steps.map((row) => row.step)).toEqual(['scope']);
    expect(run.steps[0]).toMatchObject({ status: 'fail' });
    expect(run.steps[0]!.outputTail).toContain('a pull request from a fork needs a person');
    expect(c.world.mergeCalls()).toEqual([]);
    expect(c.world.bare.sha('main')).toBe(c.mainBefore);
    expect(c.world.gh.read().prs.find((p) => p.number === pr.number)!.state).toBe('OPEN');
    const ratify = await api.server.app.inject({ method: 'POST', url: `/api/gate/jobs/${run.job.id}/ratify` });
    expect(ratify.statusCode).toBe(409);
    expect(ratify.json().error.code).toBe('GATE_JOB_NOT_RATIFIABLE');
  });

  it('control: the same PR with isCrossRepository false merges', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: GOOD_FILES, fork: false });
    api.expectMerged(c, pr, await api.runJob(c, pr));
  });
});
