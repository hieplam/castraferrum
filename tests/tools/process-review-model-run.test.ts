// Oracle of scripts/process-review/model-run.mjs (R6, goal G14, spec 2.12, decisions 21 and 50). A scripted model takes the
// place of the real one, and the rows are the 40-row fixture or rows that carry a marker word. No model runs, and the real
// database is not read here. The real run is the Green command of the plan, because only it can prove the new-cause path.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { formatReport, modelRun, runModelCommand } from '../../scripts/process-review/model-run.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = join(root, 'scripts', 'process-review.mjs');
const harness = join(root, 'tests', 'support', 'model-run-harness.mjs');
const eventsFile = join(root, 'tests', 'fixtures', 'process-review', 'events.json');
const groupsFile = join(root, 'tests', 'tools', 'fixtures', 'process-first-pass', 'groups.json');
const RULE_IDS = ['usage-limit', 'smart-app-control'];
const CHECK = { kind: 'test', name: 'x.test.ts', replay: 'npx vitest run x.test.ts' };
const MARKER = 'markerwordxyz';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lc-model-run-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

let firstPassFile = '';
let pass: Json;
const r5Groups = readFileSync(groupsFile, 'utf8');
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-model-run-first-'));
  firstPassFile = join(dir, 'first-pass.json');
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', script, 'first-pass', '--events', eventsFile, '--repo', 'hieplam/tribe', '--from', '2026-10-19T00:00:00Z', '--to', '2026-10-23T00:00:00Z', '--out', firstPassFile],
    { cwd: root, encoding: 'utf8' },
  );
  expect(r.status).toBe(0);
  pass = JSON.parse(readFileSync(firstPassFile, 'utf8'));
});

/** A scripted `query`: one `result` message. `calls` holds what modelRun sent. */
function fakeQuery(reply: string, cost = 0.01) {
  const calls: Array<{ prompt: string; options: Json }> = [];
  async function* query(params: { prompt: string; options: Json }) {
    calls.push(params);
    yield { type: 'system', subtype: 'init' };
    yield { type: 'result', subtype: 'success', result: reply, total_cost_usd: cost };
  }
  return { query, calls };
}
const run = (reply: string, cost = 0.01, maxUsd = 1) =>
  modelRun({ rest: pass.rest, ruleIds: RULE_IDS, query: fakeQuery(reply, cost).query, model: 'haiku', maxUsd, cwd: tmpdir() });
const group = (id: string, ids: string[], over: Json = {}) => ({ id, cause: `Cause of ${id}.`, ids, check: CHECK, ...over });
const reply = (...clusters: Json[]) => JSON.stringify({ clusters });

/** Runs the command in a child process whose temp folder and current folder are `dir`. */
function harnessRun(dir: string, job: Json) {
  const jobFile = join(dir, 'job.json');
  writeFileSync(jobFile, JSON.stringify(job));
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href, harness, jobFile], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, TEMP: dir, TMP: dir, TMPDIR: dir },
  });
  rmSync(jobFile);
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? [path, ...allFiles(path)] : [path];
  });
}
const markedRest = [
  { id: 'r001', text: `${MARKER} the row text one` },
  { id: 'r002', text: `${MARKER} the row text two` },
];
const markedJob = {
  rest: markedRest,
  ruleIds: RULE_IDS,
  reply: reply(group('marked', ['r001', 'r002'], { cause: `${MARKER} is the cause.` })),
  cost: 0.02,
};
const REPORT_LINE = /^real-model (cause \d+ \d+|new causes \d+|spend-usd [\d.]+|verdict: .+)$/;

describe('model-run', () => {
  it('gives pass with sizes 3 and 2 on the groups of R5', async () => {
    const result = await run(r5Groups);
    expect(result.verdict).toBe('pass');
    expect(result.clusters.map((c: Json) => c.ids.length)).toEqual([3, 2]);
    expect(result.newCauses).toBe(2);
  });

  it('fails on empty clusters', async () => {
    const result = await run('{"clusters":[]}');
    expect(result.verdict).toMatch(/^FAIL, /);
    expect(result.newCauses).toBe(0);
  });

  it('fails on a cluster of 1 id', async () => {
    const result = await run(reply(group('one-row', ['e06'])));
    expect(result.verdict).toMatch(/^FAIL, /);
    expect(result.newCauses).toBe(0);
  });

  it('fails on an id of a rule cluster', async () => {
    const taken = pass.clusters.find((c: Json) => c.id === 'usage-limit').ids[0];
    expect((await run(reply(group('with-rule-row', ['e06', taken])))).verdict).toMatch(/^FAIL, /);
  });

  it('fails on a reply that is not JSON', async () => {
    expect((await run('I found no repeated cause.')).verdict).toMatch(/^FAIL, /);
  });

  it('parses a json fence, also after a sentence that holds a brace', async () => {
    const result = await run(`Here is {the file}:\n\n\`\`\`json\n${r5Groups}\n\`\`\`\nDone.`);
    expect(result.verdict).toBe('pass');
  });

  it('sends the query options of the plan, the prompt, and the rows cut at 1000 characters', async () => {
    const long = { id: 'r001', loop: 'secret-loop', status: 'failed', at: '2026-10-20T00:00:00Z', text: 'x'.repeat(1500) };
    const fake = fakeQuery(r5Groups);
    await modelRun({ rest: [long], ruleIds: RULE_IDS, query: fake.query, model: 'sonnet', maxUsd: 0.5, cwd: 'some-folder' });
    expect(fake.calls).toHaveLength(1);
    const { prompt, options } = fake.calls[0]!;
    const { env, ...rest } = options;
    expect(rest).toEqual({
      model: 'sonnet',
      effort: 'low',
      tools: [],
      settingSources: [],
      persistSession: false,
      maxTurns: 1,
      maxBudgetUsd: 0.5,
      cwd: 'some-folder',
    });
    expect(env.GH_TOKEN).toBe('invalid');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.PATH ?? env.Path).toBeDefined();
    const review = readFileSync(join(root, 'scripts', 'process-review', 'prompt.md'), 'utf8');
    const line = 'Do not run a command. Reply with the content of groups.json only, as JSON.';
    expect(prompt.startsWith(review)).toBe(true);
    const tail = prompt.slice(prompt.indexOf(line) + line.length);
    expect(JSON.parse(tail)).toEqual({ rest: [{ id: 'r001', text: 'x'.repeat(1000) }] });
  });

  it('prints only counts without --show-causes: no row text, no cause, no id', async () => {
    const dir = temp();
    const r = harnessRun(dir, { ...markedJob, options: { real: true } });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    const lines = r.out.trimEnd().split(/\r?\n/);
    expect(lines).toEqual(['real rest 2', 'real-model cause 1 2', 'real-model new causes 1', 'real-model spend-usd 0.0200', 'real-model verdict: pass']);
    for (const line of lines.slice(1)) expect(line).toMatch(REPORT_LINE);
    expect(r.out).not.toContain(MARKER);
    expect(r.out).not.toContain('r001');
    expect(r.out).not.toContain('marked');
    const failed = formatReport({ verdict: 'FAIL, no cluster', clusters: [{ id: MARKER, cause: MARKER, ids: ['a', 'b'] }], newCauses: 0, spend: 0.5 });
    for (const line of failed) expect(line).toMatch(REPORT_LINE);
    expect(failed.join('\n')).not.toContain(MARKER);
    const rejected = await modelRun({
      rest: markedRest,
      ruleIds: RULE_IDS,
      query: fakeQuery(reply(group(`${MARKER}-id`, ['r001', 'r002'], { cause: '' }))).query,
      model: 'haiku',
      maxUsd: 1,
      cwd: tmpdir(),
    });
    expect(rejected.verdict).toMatch(/^FAIL, /);
    expect(rejected.verdict).not.toContain(MARKER);
    expect(rejected.verdict).not.toContain('r001');
  });

  it('prints the cause with --show-causes to stdout, and writes it in no file', () => {
    const dir = temp();
    const r = harnessRun(dir, { ...markedJob, options: { real: true, 'show-causes': true } });
    expect(r.code).toBe(0);
    expect(r.out).toContain(`real-model cause 1 2: ${MARKER} is the cause.`);
    expect(r.err).not.toContain(MARKER);
    expect(allFiles(dir)).toEqual([]);

    const hidden = temp();
    expect(harnessRun(hidden, { ...markedJob, cost: 0.03, options: { real: true, 'show-causes': true } }).out).toContain('spend-usd 0.0300');
    expect(allFiles(hidden)).toEqual([]);
  });

  it('fails when the spend is over the limit, and when the model reports no spend', async () => {
    expect((await run(r5Groups, 0.51, 0.5)).verdict).toMatch(/^FAIL, /);
    expect((await run(r5Groups, 0.5, 0.5)).verdict).toBe('pass');
    async function* noCost() {
      yield { type: 'result', subtype: 'success', result: r5Groups };
    }
    expect((await modelRun({ rest: pass.rest, ruleIds: RULE_IDS, query: noCost, model: 'haiku', maxUsd: 1, cwd: tmpdir() })).verdict).toMatch(/^FAIL, /);
    async function* stopped() {
      yield { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 0.002, errors: [] };
    }
    expect((await modelRun({ rest: pass.rest, ruleIds: RULE_IDS, query: stopped, model: 'haiku', maxUsd: 0.001, cwd: tmpdir() })).verdict).toMatch(/^FAIL, /);
  });

  it('writes groups with --record that assemble accepts, and only on pass', async () => {
    const dir = temp();
    mkdirSync(join(dir, 'sub'));
    const out = join(dir, 'sub', 'groups-recorded.json');
    const extra = JSON.parse(r5Groups);
    extra.clusters[0].events = 99;
    const printed: string[] = [];
    const deps = { query: fakeQuery(JSON.stringify(extra)).query, readRest: async () => ({ rest: pass.rest, ruleIds: RULE_IDS }), print: (l: string) => printed.push(l) };
    expect(await runModelCommand({ 'first-pass': firstPassFile, record: out }, deps)).toBe(0);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.clusters.map((c: Json) => Object.keys(c).sort())).toEqual([
      ['cause', 'check', 'id', 'ids'],
      ['cause', 'check', 'id', 'ids'],
    ]);
    expect(printed).toContain('real-model verdict: pass');

    const reviewFile = join(dir, 'review.json');
    const r = spawnSync(process.execPath, ['--import', 'tsx', script, 'assemble', '--first-pass', firstPassFile, '--groups', out, '--out', reviewFile], { cwd: root, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(reviewFile, 'utf8')).clusters).toHaveLength(4);

    const refused = join(dir, 'refused.json');
    const code = await runModelCommand({ 'first-pass': firstPassFile, record: refused }, { ...deps, query: fakeQuery('{"clusters":[]}').query });
    expect(code).toBe(1);
    expect(existsSync(refused)).toBe(false);
  });

  it('exits 2 with the usage on --real with --record, also with --show-causes', () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', script, 'model-run', '--real', '--show-causes', '--record', join(tmpdir(), 'never-written.json')], { cwd: root, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage:');
    expect(r.stderr).toContain('--show-causes');
  });

  it('fails on a cluster id equal to a rule id, also when the rule took no row', async () => {
    expect((await run(reply(group('usage-limit', ['e06', 'e18'])))).verdict).toMatch(/^FAIL, /);
    const noRow = await modelRun({
      rest: pass.rest,
      ruleIds: ['rule-with-no-row'],
      query: fakeQuery(reply(group('rule-with-no-row', ['e06', 'e18']))).query,
      model: 'haiku',
      maxUsd: 1,
      cwd: tmpdir(),
    });
    expect(noRow.verdict).toMatch(/^FAIL, /);
  });
});
