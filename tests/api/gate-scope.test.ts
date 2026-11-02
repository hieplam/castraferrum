// G9: a PR cannot lower its own bar. One PR per guarded path of the real `goals/gate.json`, and each refusal has a control that differs in one input (plan K11).
// Limit (issue 339): these tests prove what the gate does after a ratification, not who may call the route. A run can post to the route from a script file,
// and the merge guard reads only the command text. The second layer for that point is the `ratified` list of `scripts/merge-audit.mjs`.
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseGateConfig } from '../../shared/domain/scope-guard';
import { sampleGuardedPath, startGateApi, type GateApi, type GateCase } from '../support/gate-api-world';
import { EXAM, GOOD_FILES } from '../support/gate-world';

const { guarded, testGlobs } = parseGateConfig(readFileSync('goals/gate.json', 'utf8'));
const RATCHETS = 'scripts/ratchets.json';
const realRatchets = readFileSync(RATCHETS, 'utf8');
const VERIFY_PATH = 'goals/verify/e.json';
/** An exam that passes with no implementation, written by the PR that it must judge. */
const OWN_EXAM = `${JSON.stringify({ v: 1, tasks: { 141: { green: [{ run: `node -e "console.log('own exam')"`, expect: ['own exam'] }], stub: { none: 'own exam' } } } }, null, 2)}\n`;

const packageText = (min: number, dependencies: Record<string, string> = {}) =>
  `${JSON.stringify({ scripts: { test: 'node tests/verify.mjs', verify: `uc-coverage --min ${min}` }, dependencies }, null, 2)}\n`;

let api: GateApi;

beforeAll(async () => {
  api = await startGateApi();
});
afterEach(() => api.endCases());
afterAll(() => api?.close());

/** A case with the real guard of the repository. */
const guardedCase = async (): Promise<GateCase> => {
  const c = await api.newCase();
  c.world.setGate({ guarded, testGlobs });
  return c;
};

describe('gate-scope: guarded paths', { timeout: 120_000 }, () => {
  it.each(guarded)('refused: a PR that changes %s', async (entry) => {
    const c = await guardedCase();
    const path = sampleGuardedPath(entry);
    const pr = c.world.openPr({ files: { ...GOOD_FILES, [path]: 'changed by the PR\n' } });
    const run = await api.runJob(c, pr);
    api.expectRefused(c, pr, run, 'scope');
    expect(run.steps.at(-1)?.outputTail).toContain(path);
  });

  it('refused: a PR that raises maxContrast from 0 to 5', async () => {
    const c = await guardedCase();
    c.world.commitMain({ [RATCHETS]: realRatchets });
    const raised = realRatchets.replace('"maxContrast": 0', '"maxContrast": 5');
    expect(raised).not.toBe(realRatchets);
    const pr = c.world.openPr({ files: { ...GOOD_FILES, [RATCHETS]: raised } });
    const run = await api.runJob(c, pr);
    api.expectRefused(c, pr, run, 'scope');
    expect(run.steps.at(-1)?.outputTail).toContain(RATCHETS);
  });

  it('refused: a package.json that lowers --min', async () => {
    const c = await guardedCase();
    c.world.commitMain({ 'package.json': packageText(34) });
    const pr = c.world.openPr({ files: { ...GOOD_FILES, 'package.json': packageText(33) } });
    const run = await api.runJob(c, pr);
    api.expectRefused(c, pr, run, 'scope');
    expect(run.steps.at(-1)?.outputTail).toContain('package.json');
  });
});

describe('gate-scope: controls', { timeout: 120_000 }, () => {
  it('control: GOOD_FILES merges', async () => {
    const c = await guardedCase();
    const pr = c.world.openPr();
    api.expectMerged(c, pr, await api.runJob(c, pr));
  });

  it('control: GOOD_FILES with scripts/a.mjs and scripts/sub/zz-check.mjs merges', async () => {
    const c = await guardedCase();
    const pr = c.world.openPr({ files: { ...GOOD_FILES, 'scripts/a.mjs': 'a\n', 'scripts/sub/zz-check.mjs': 'a\n' } });
    api.expectMerged(c, pr, await api.runJob(c, pr));
  });

  it('control: a package.json that raises --min to 36 merges', async () => {
    const c = await guardedCase();
    c.world.commitMain({ 'package.json': packageText(34) });
    const pr = c.world.openPr({ files: { ...GOOD_FILES, 'package.json': packageText(36) } });
    api.expectMerged(c, pr, await api.runJob(c, pr));
  });

  it('control: a package.json with a new dependency merges', async () => {
    const c = await guardedCase();
    c.world.commitMain({ 'package.json': packageText(34) });
    const pr = c.world.openPr({ files: { ...GOOD_FILES, 'package.json': packageText(34, { 'left-pad': '1.3.0' }) } });
    api.expectMerged(c, pr, await api.runJob(c, pr));
  });
});

describe('gate-scope: a ratification skips only scope', { timeout: 120_000 }, () => {
  it('refused: a ratified PR that rewrites its own exam fails green, because the exam is the one of main', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: { [VERIFY_PATH]: OWN_EXAM } });
    const stopped = await api.runJob(c, pr);
    api.expectRefused(c, pr, stopped, 'scope');

    const run = await api.ratifyAndRun(c, stopped.job.id);
    expect(run.job).toMatchObject({ state: 'failed', failedStep: 'green' });
    expect(run.steps.at(-1)).toMatchObject({ step: 'green', status: 'fail' });
    expect(run.steps.at(-1)?.outputTail).toContain(EXAM.green[0]!.run);
    expect(c.world.mergeCalls()).toEqual([]);
    expect(c.world.bare.sha('main')).toBe(c.mainBefore);
  });

  it('control: the same PR with the implementation merges, the scope row is skip, and the audit lists it', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: { ...GOOD_FILES, [VERIFY_PATH]: OWN_EXAM } });
    const stopped = await api.runJob(c, pr);
    api.expectRefused(c, pr, stopped, 'scope');

    const run = await api.ratifyAndRun(c, stopped.job.id);
    api.expectMerged(c, pr, run);
    expect(run.steps.filter((row) => row.step === 'scope').map((row) => row.status)).toEqual(['fail', 'skip']);
    expect(c.world.statuses(pr.headSha).at(-1)?.description).toMatch(/^gate: ratified \S+$/);

    const audit = api.audit(c);
    expect(audit.exit).toBe(0);
    expect(audit.output.incidents).toEqual([]);
    expect(audit.output.ratified.map((row) => row.pr)).toEqual([pr.number]);
  });
});
