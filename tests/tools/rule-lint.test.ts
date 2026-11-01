import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts/rule-lint.mjs');
const FIXTURES = join(process.cwd(), 'tests/tools/fixtures/rule-lint');
const temps: string[] = [];

const lint = (...args: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: r.stdout + r.stderr };
};
const fixture = (name: string) => join(FIXTURES, name);
/** A writable copy of a fixture root, removed after the test. */
const copyOf = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-rule-lint-'));
  temps.push(dir);
  cpSync(fixture(name), dir, { recursive: true });
  return dir;
};

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('rule-lint', () => {
  it('counts the rule lines and the ones without a check', () => {
    const r = lint('--root', fixture('ok'), '--count');
    expect(r.code).toBe(0);
    expect(r.out).toContain('rule lines: 5');
    expect(r.out).toContain('without a check: 2');
  });

  it('passes a root whose unchecked rule lines are all in the baseline', () => {
    const r = lint('--root', fixture('ok'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('rule-lint: ok (rule lines 5, without a check 2, new 0)');
  });

  it('refuses a new rule line that links to no check', () => {
    const r = lint('--root', fixture('new-unlinked'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('NEW CLAUDE.md: Never merge a pull request without a review.');
  });

  it('passes a new rule line that links to an existing script', () => {
    const r = lint('--root', fixture('new-linked'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('rule-lint: ok (rule lines 6, without a check 2, new 0)');
  });

  it('refuses a link to a missing path, a missing npm script and a short "No machine check:"', () => {
    const r = lint('--root', fixture('bad-link'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('NEW CLAUDE.md: Never edit the build, see `scripts/missing.mjs`.');
    expect(r.out).toContain('NEW CLAUDE.md: You must run `npm run nothing` before a push.');
    expect(r.out).toContain('NEW CLAUDE.md: Always read the diff. No machine check: by eye.');
    expect(r.out).toContain('new 3)');
  });

  it('refuses a baseline entry whose rule line now has a check', () => {
    const r = lint('--root', fixture('stale'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/STALE [0-9a-f]{12}/);
  });

  it('refuses a baseline that holds an entry the base baseline does not hold', () => {
    const dir = copyOf('ok');
    const base = JSON.parse(readFileSync(join(dir, 'scripts/rule-lint-baseline.json'), 'utf8'));
    const grown = base.unchecked[1].id;
    base.unchecked = base.unchecked.slice(0, 1);
    const baseFile = join(dir, 'base.json');
    writeFileSync(baseFile, JSON.stringify(base));
    const r = lint('--root', dir, '--base-file', baseFile);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`GROWN ${grown}`);
    expect(lint('--root', dir, '--base-file', join(dir, 'scripts/rule-lint-baseline.json')).code).toBe(0);
  });

  it('writes a missing baseline and will not overwrite an existing one', () => {
    const dir = copyOf('ok');
    const file = join(dir, 'scripts/rule-lint-baseline.json');
    const before = readFileSync(file, 'utf8');
    const refused = lint('--root', dir, '--write-baseline');
    expect(refused.code).toBe(2);
    expect(readFileSync(file, 'utf8')).toBe(before);
    rmSync(file);
    expect(lint('--root', dir, '--write-baseline').code).toBe(2); // default rule files: no CONTRIBUTING.md here
    writeFileSync(join(dir, 'CONTRIBUTING.md'), 'Nothing to see.\n');
    const written = lint('--root', dir, '--write-baseline');
    expect(written.code).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).unchecked).toHaveLength(2);
  });

  it('exits 2 when a rule file is missing', () => {
    const dir = copyOf('ok');
    rmSync(join(dir, 'CLAUDE.md'));
    const r = lint('--root', dir);
    expect(r.code).toBe(2);
    expect(r.out).toContain('rule file missing: CLAUDE.md');
  });

  it('passes on this repository', () => {
    const r = lint();
    expect(r.out).toMatch(/rule-lint: ok \(rule lines \d+, without a check \d+, new 0\)/);
    expect(r.code).toBe(0);
  });
});
