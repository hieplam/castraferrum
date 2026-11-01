// Oracle of scripts/process-review.mjs (R5, goal G14, spec 2.12, decision 21). Every test runs the script as a child
// process on the 40-row fixture. No model runs, and the real database is not read here.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeGh } from '../support/fake-gh-kit.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = join(root, 'scripts', 'process-review.mjs');
const eventsFile = join(root, 'tests', 'fixtures', 'process-review', 'events.json');
const fixture = (name: string) => join(root, 'tests', 'tools', 'fixtures', 'process-first-pass', `${name}.json`);
const CHECK = { kind: 'test', name: 'x.test.ts', replay: 'npx vitest run x.test.ts' };
const EVENT = { id: 'a1', at: '2026-10-20T00:00:00Z', loop: 'l', status: 'failed', text: 'x' };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lc-process-review-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(...args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function json(dir: string, name: string, value: unknown): string {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(value));
  return file;
}
function firstPassArgs(out: string, events = eventsFile) {
  return ['first-pass', '--events', events, '--repo', 'o/r', '--from', '2026-10-19T00:00:00Z', '--to', '2026-10-23T00:00:00Z', '--out', out];
}
function firstPass(events = eventsFile) {
  const out = join(temp(), 'first-pass.json');
  const r = run(...firstPassArgs(out, events));
  expect(r.err).toBe('');
  expect(r.code).toBe(0);
  return { file: out, text: readFileSync(out, 'utf8'), value: JSON.parse(readFileSync(out, 'utf8')) };
}
function assembleExpectRefused(groups: string) {
  const out = join(temp(), 'review.json');
  const r = run('assemble', '--first-pass', firstPass().file, '--groups', groups, '--out', out);
  expect(r.code).toBe(2);
  expect(existsSync(out)).toBe(false);
  return r;
}
function assembled() {
  const out = join(temp(), 'review.json');
  const r = run('assemble', '--first-pass', firstPass().file, '--groups', fixture('groups'), '--out', out);
  expect(r.err).toBe('');
  expect(r.code).toBe(0);
  return { file: out, value: JSON.parse(readFileSync(out, 'utf8')) };
}
const cluster = (value: { clusters: Array<{ id: string }> }, id: string) => value.clusters.find((c) => c.id === id) as Record<string, any>;

describe('process-review first-pass', () => {
  it('puts both limit forms into one usage-limit cluster of 12 ids', () => {
    const c = cluster(firstPass().value, 'usage-limit');
    expect(c.ids).toHaveLength(12);
    const events = JSON.parse(readFileSync(eventsFile, 'utf8')) as Array<{ id: string; text: string }>;
    const texts: string[] = c.ids.map((id: string) => events.find((e) => e.id === id)!.text);
    expect(texts.filter((t) => t.includes('weekly limit'))).toHaveLength(3);
    expect(texts.filter((t) => t.includes('session limit'))).toHaveLength(9);
  });

  it('puts all 14 Smart App Control rows into one cluster', () => {
    const c = cluster(firstPass().value, 'smart-app-control');
    expect(c.ids).toHaveLength(14);
    expect(c.cause).toBe('Windows Smart App Control blocked an unsigned binary.');
  });

  it('leaves the 14 other rows in rest, whole', () => {
    const { value } = firstPass();
    const events = JSON.parse(readFileSync(eventsFile, 'utf8')) as Array<{ id: string }>;
    const ruled = new Set(value.clusters.flatMap((c: { ids: string[] }) => c.ids));
    expect(value.rest).toHaveLength(14);
    expect(value.rest).toEqual(events.filter((e) => !ruled.has(e.id)));
  });

  it('gives identical output in 3 runs', () => {
    const texts = [firstPass().text, firstPass().text, firstPass().text];
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).toBe(texts[0]);
  });

  it('follows the rule order and the event order, and a rule with no match gives no cluster', () => {
    const dir = temp();
    const rules = json(dir, 'rules.json', {
      v: 1,
      rules: [
        { id: 'second-word', cause: 'b', pattern: 'beta', flags: '', check: CHECK },
        { id: 'never', cause: 'n', pattern: 'no such text', flags: '', check: CHECK },
        { id: 'first-word', cause: 'a', pattern: 'alpha', flags: '', check: CHECK },
      ],
    });
    const rows = [
      { ...EVENT, id: 'r1', text: 'alpha' },
      { ...EVENT, id: 'r2', text: 'alpha beta' },
      { ...EVENT, id: 'r3', text: 'beta' },
      { ...EVENT, id: 'r4', text: 'alpha' },
    ];
    // The body of GET /api/process/events is `{ events }`, so this form must work too.
    const events = json(dir, 'events.json', { events: rows });
    const out = join(dir, 'out.json');
    const r = run(...firstPassArgs(out, events), '--rules', rules);
    expect(r.code).toBe(0);
    const value = JSON.parse(readFileSync(out, 'utf8'));
    expect(value.clusters.map((c: { id: string; ids: string[] }) => [c.id, c.ids])).toEqual([
      ['second-word', ['r2', 'r3']],
      ['first-word', ['r1', 'r4']],
    ]);
    expect(value).toMatchObject({ v: 1, repo: 'o/r', from: '2026-10-19T00:00:00Z', to: '2026-10-23T00:00:00Z', rest: [] });
  });

  it('exits 2 and writes nothing on a bad rules file', () => {
    const dir = temp();
    const good = { id: 'one', cause: 'c', pattern: 'x', flags: '', check: CHECK };
    const { flags: _flags, ...noFlags } = good;
    const bad = {
      badRegex: [{ ...good, pattern: '(' }],
      badFlags: [{ ...good, flags: 'q' }],
      // A `g` or `y` regex keeps state between tests, so it skips every second match.
      statefulFlag: [{ ...good, flags: 'g' }],
      repeatedId: [good, good],
      missingKey: [noFlags],
      missingCheck: [{ ...good, check: undefined }],
    };
    for (const [name, rules] of Object.entries(bad)) {
      const out = join(dir, `${name}.out.json`);
      const r = run(...firstPassArgs(out), '--rules', json(dir, `${name}.json`, { v: 1, rules }));
      expect([name, r.code]).toEqual([name, 2]);
      expect(existsSync(out)).toBe(false);
    }
  });

  it('takes the typographic apostrophe, and a limit line that is not the first line', () => {
    const dir = temp();
    const events = json(dir, 'events.json', [
      { ...EVENT, id: 't1', text: 'You’ve hit your session limit' },
      { ...EVENT, id: 't2', text: "The run stopped.\nYou've hit your weekly limit" },
      { ...EVENT, id: 't3', text: 'The docs say that you have hit your limit.' },
    ]);
    const { value } = firstPass(events);
    expect(cluster(value, 'usage-limit').ids).toEqual(['t1', 't2']);
    expect(value.rest.map((e: { id: string }) => e.id)).toEqual(['t3']);
  });
});

describe('process-review assemble', () => {
  it('gives the golden fingerprints of the two rule clusters', () => {
    const { value } = assembled();
    expect(cluster(value, 'usage-limit')).toMatchObject({ fingerprint: '58237cb2147d', events: 12 });
    expect(cluster(value, 'smart-app-control')).toMatchObject({ fingerprint: '0f274a882e6b', events: 14 });
  });

  it('gives the golden fingerprints and the counts of the model clusters, and ignores numbers that the model wrote', () => {
    const { value } = assembled();
    expect(cluster(value, 'skipped-runs')).toMatchObject({
      fingerprint: '99bba937603b',
      events: 3,
      runIds: ['e06', 'e18', 'e23'],
      firstAt: '2026-10-19T20:45:00Z',
      lastAt: '2026-10-21T08:30:00Z',
      repo: 'o/r',
    });
    expect(cluster(value, 'cancelled-from-console')).toMatchObject({ fingerprint: '8fad049b186e', events: 2 });

    const dir = temp();
    const groups = JSON.parse(readFileSync(fixture('groups'), 'utf8'));
    Object.assign(groups.clusters[0], { events: 99, runIds: ['e99'], firstAt: '2020-01-01T00:00:00Z', fingerprint: 'aaaaaaaaaaaa', repo: 'x/y' });
    const out = join(dir, 'review.json');
    const r = run('assemble', '--first-pass', firstPass().file, '--groups', json(dir, 'groups.json', groups), '--out', out);
    expect(r.code).toBe(0);
    expect(cluster(JSON.parse(readFileSync(out, 'utf8')), 'skipped-runs')).toEqual(cluster(value, 'skipped-runs'));
  });

  it('exits 2 and writes nothing on an unknown id, an id in two groups, or a bad cluster id', () => {
    expect(assembleExpectRefused(fixture('groups-bad-id')).err).toContain('e99');

    const dir = temp();
    const { clusters } = JSON.parse(readFileSync(fixture('groups'), 'utf8'));
    const twice = { clusters: [clusters[0], { ...clusters[1], ids: ['e14', 'e18'] }] };
    expect(assembleExpectRefused(json(dir, 'twice.json', twice)).err).toContain('e18');
    for (const id of ['Upper-Case', 'a'.repeat(41), '']) {
      assembleExpectRefused(json(dir, 'bad-cluster-id.json', { clusters: [{ ...clusters[0], id }] }));
    }
  });

  it('exits 2 and writes nothing on an id of a rule cluster', () => {
    expect(assembleExpectRefused(fixture('groups-ruled-id')).err).toContain('e08');
  });

  it('writes the keys of spec 2.12, which process-file-issues accepts, and the prompt names that path', () => {
    const { file, value } = assembled();
    expect(Object.keys(value).sort()).toEqual(['clusters', 'from', 'to', 'v']);
    expect(value.clusters.map((c: { id: string }) => c.id)).toEqual(['usage-limit', 'smart-app-control', 'skipped-runs', 'cancelled-from-console']);
    for (const c of value.clusters) {
      expect(Object.keys(c).sort()).toEqual(['cause', 'check', 'events', 'fingerprint', 'firstAt', 'id', 'lastAt', 'repo', 'runIds']);
      expect(Object.keys(c.check).sort()).toEqual(['kind', 'name', 'replay']);
      expect(c.runIds).toHaveLength(c.events);
    }

    const gh = createFakeGh();
    cleanups.push(() => gh.dispose());
    const filed = spawnSync(process.execPath, [join(root, 'scripts', 'process-file-issues.mjs'), file, '--dry-run'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world },
    });
    expect(filed.stderr).toBe('');
    expect(filed.status).toBe(0);
    expect(JSON.parse(filed.stdout).created).toEqual(['58237cb2147d', '0f274a882e6b', '99bba937603b', '8fad049b186e']);

    const prompt = readFileSync(join(root, 'scripts', 'process-review', 'prompt.md'), 'utf8').toLowerCase();
    for (const words of ['`rest`', 'groups.json', 'process-review.mjs assemble', 'process-file-issues.mjs', 'never write a count, date, hash or id']) {
      expect(prompt).toContain(words);
    }
  });
});
