// G7: empty work cannot merge. Each refusal has a control that differs in one input and that merges (plan K11).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startGateApi, type GateApi } from '../support/gate-api-world';
import { EXAM, GOOD_FILES } from '../support/gate-world';

const TEST_PATH = 'tests/e.test.mjs';
/** A test with the expected text that reads no implementation. */
const ALWAYS_TRUE = `console.log('e passed');\n`;
const OTHER_TEXT = `import { ok } from '../impl.mjs';\nconsole.log(ok ? 'all good' : 'bad');\nprocess.exit(ok ? 0 : 1);\n`;

let api: GateApi;

beforeAll(async () => {
  api = await startGateApi();
});
afterEach(() => api.endCases());
afterAll(() => api?.close());

describe('gate-stub', { timeout: 120_000 }, () => {
  it('refused: no implementation file, at green', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: { [TEST_PATH]: GOOD_FILES[TEST_PATH]! } });
    api.expectRefused(c, pr, await api.runJob(c, pr), 'green');
  });

  it('refused: the tests print other text, at green', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: { ...GOOD_FILES, [TEST_PATH]: OTHER_TEXT } });
    api.expectRefused(c, pr, await api.runJob(c, pr), 'green');
  });

  it('refused: a task key with no entry, at green', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr();
    const run = await api.runJob(c, pr, '999');
    api.expectRefused(c, pr, run, 'green');
    expect(run.steps.at(-1)?.outputTail).toContain('no entry for task "999"');
  });

  it('refused: an always-true test next to an implementation file, at stub', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: { ...GOOD_FILES, [TEST_PATH]: ALWAYS_TRUE } });
    const run = await api.runJob(c, pr);
    api.expectRefused(c, pr, run, 'stub');
    expect(run.steps.at(-1)?.outputTail).toContain('e passed');
  });

  it('refused: only test files changed, at stub', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr({ files: { [TEST_PATH]: ALWAYS_TRUE } });
    api.expectRefused(c, pr, await api.runJob(c, pr), 'stub');
  });

  it('control: GOOD_FILES merges, and verify sees the implementation', async () => {
    const c = await api.newCase();
    const pr = c.world.openPr();
    const run = await api.runJob(c, pr);
    api.expectMerged(c, pr, run);
    expect(run.steps.find((row) => row.step === 'verify')?.outputTail).toContain('verify sees impl.mjs');
    expect(run.steps.find((row) => row.step === 'stub')?.status).toBe('pass');
    expect(c.world.bare.show('main', 'impl.mjs')).toBe(GOOD_FILES['impl.mjs']);
  });

  it('control: an entry with stub.none merges an always-true test, and the stub row is skip', async () => {
    const c = await api.newCase();
    c.world.setEntry('141', { green: EXAM.green, stub: { none: 'nothing to stub' } });
    const pr = c.world.openPr({ files: { [TEST_PATH]: ALWAYS_TRUE } });
    const run = await api.runJob(c, pr);
    api.expectMerged(c, pr, run);
    expect(run.steps.find((row) => row.step === 'stub')).toMatchObject({ status: 'skip', outputTail: 'nothing to stub' });
    expect(run.steps.find((row) => row.step === 'green')?.outputTail).toContain('e passed');
  });
});
