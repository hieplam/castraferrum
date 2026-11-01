// G6: no PR merges with a failing check. Each refusal has a control that differs in one input and that merges (plan K11).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { VerifyTask } from '../../shared/domain/scope-guard';
import { RED_MAIN_TITLE, startGateApi, type GateApi, type GateCase } from '../support/gate-api-world';

const check = (conclusion: string, name = 'checks') => ({ name, status: 'completed', conclusion });

/** A second task. Main holds the files of task 141 after its merge, so the same files have nothing left to stub. */
const SECOND_KEY = '142';
const SECOND_LINE = 'node tests/f.test.mjs';
const SECOND_EXAM: VerifyTask = { green: [{ run: SECOND_LINE, expect: ['f passed'] }], stub: { run: SECOND_LINE } };
const SECOND_FILES = {
  'impl2.mjs': 'export const ok = true;\n',
  'tests/f.test.mjs': `import { ok } from '../impl2.mjs';\nconsole.log(ok ? 'f passed' : 'f failed');\nprocess.exit(ok ? 0 : 1);\n`,
};

let api: GateApi;

beforeAll(async () => {
  api = await startGateApi();
});
afterEach(() => api.endCases());
afterAll(() => api?.close());

const redIssues = (c: GateCase) => c.world.gh.read().issues.filter((issue) => issue.title === RED_MAIN_TITLE);
const redMain = (c: GateCase, conclusion = 'failure') => c.world.setChecks(c.world.bare.sha('main'), [check(conclusion)]);

describe('gate-red: a red check on the PR', { timeout: 120_000 }, () => {
  it.each(['failure', 'cancelled', 'timed_out', 'action_required'])('refused: ci conclusion %s', async (conclusion) => {
    const c = await api.newCase();
    const pr = c.world.openPr({ checks: [check(conclusion)] });
    api.expectRefused(c, pr, await api.runJob(c, pr), 'ci');
  });

  it('refused: one red run among green ones', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ checks: [check('success', 'a'), check('failure', 'b'), check('success', 'c')] });
    api.expectRefused(c, pr, await api.runJob(c, pr), 'ci');
  });

  it.each(['success', 'skipped', 'neutral'])('control: ci conclusion %s', async (conclusion) => {
    const c = await api.newCase();
    const pr = c.world.openPr({ checks: [check(conclusion)] });
    api.expectMerged(c, pr, await api.runJob(c, pr));
  });
});

describe('gate-red: a red main', { timeout: 120_000 }, () => {
  it('refused: the first PR on a red main, and the gate opens one issue', async () => {
    const c = await api.newCase();
    redMain(c);
    const pr = c.world.openPr();
    api.expectRefused(c, pr, await api.runJob(c, pr), 'base');
    expect(redIssues(c)).toHaveLength(1);
  });

  it('refused: a second PR on a red main, and still one issue', async () => {
    const c = await api.newCase();
    redMain(c);
    const first = c.world.openPr();
    await api.runJob(c, first);
    const second = c.world.openPr();
    api.expectRefused(c, second, await api.runJob(c, second), 'base');
    expect(redIssues(c)).toHaveLength(1);
  });

  it('refused: a PR that closes another issue on a red main', async () => {
    const c = await api.newCase();
    redMain(c);
    const issue = api.openRedIssue(c);
    const pr = c.world.openPr({ closing: [issue + 1000] });
    api.expectRefused(c, pr, await api.runJob(c, pr), 'base');
    expect(redIssues(c)).toHaveLength(1);
  });

  it('control: the PR that closes the issue of the red main merges', async () => {
    const c = await api.newCase();
    redMain(c);
    const issue = api.openRedIssue(c);
    const pr = c.world.openPr({ closing: [issue] });
    api.expectMerged(c, pr, await api.runJob(c, pr));
    expect(redIssues(c)).toHaveLength(1);
  });

  it('control: after that fix, an ordinary PR merges', async () => {
    const c = await api.newCase();
    c.world.setEntry(SECOND_KEY, SECOND_EXAM);
    redMain(c);
    const issue = api.openRedIssue(c);
    const fix = c.world.openPr({ closing: [issue] });
    api.expectMerged(c, fix, await api.runJob(c, fix));
    const ordinary = c.world.openPr({ files: SECOND_FILES });
    api.expectMerged(c, ordinary, await api.runJob(c, ordinary, SECOND_KEY));
  });

  it('control: a pending run on main merges', async () => {
    const c = await api.newCase();
    c.world.setChecks(c.world.bare.sha('main'), [{ name: 'checks', status: 'in_progress', conclusion: null }]);
    const pr = c.world.openPr();
    api.expectMerged(c, pr, await api.runJob(c, pr));
    expect(redIssues(c)).toEqual([]);
  });
});

describe('gate-red: the audit', { timeout: 120_000 }, () => {
  it('refused: a PR merged by hand is one incident, next to a gated merge', async () => {
    const c = await api.newCase();
    const gated = c.world.openPr();
    const planted = c.world.openPr({ files: { 'planted.txt': 'no gate\n' } });
    api.expectMerged(c, gated, await api.runJob(c, gated));
    api.mergeByHand(c, planted);

    const audit = api.audit(c);
    expect(audit.exit).toBe(1);
    expect(audit.output.merged).toBe(2);
    expect(audit.output.incidents).toEqual([expect.objectContaining({ pr: planted.number, why: 'no status' })]);
  });

  it('control: gated merges only, no incident', async () => {
    const c = await api.newCase();
    const gated = c.world.openPr();
    c.world.openPr({ files: { 'planted.txt': 'no gate\n' } });
    api.expectMerged(c, gated, await api.runJob(c, gated));

    const audit = api.audit(c);
    expect(audit.exit).toBe(0);
    expect(audit.output.merged).toBe(1);
    expect(audit.output.incidents).toEqual([]);
  });
});

describe('gate-red: from a run to the gate', { timeout: 120_000 }, () => {
  it('refused: a run that ends PR_OPEN on a red check fails at ci, and its task is released', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ closing: [141], checks: [check('failure')] });
    const chain = await api.runChain(c, pr);

    api.expectRefused(c, pr, chain, 'ci');
    expect(chain.comments).toEqual([expect.stringContaining('Gate failed at ci.')]);
    expect(chain.releases).toHaveLength(1);
    const release = JSON.parse(chain.releases[0]!) as string[];
    expect(release[release.indexOf('--reason') + 1]).toMatch(/^gate: ci/);
    expect(chain.claimClosed).toBe(true);
  });

  it('control: a run that ends PR_OPEN on a green check merges, and no release happens', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ closing: [141] });
    const chain = await api.runChain(c, pr);

    api.expectMerged(c, pr, chain);
    expect(chain.claimClosed).toBe(true);
    expect(chain.comments).toEqual([]);
    expect(chain.releases).toEqual([]);
  });
});
