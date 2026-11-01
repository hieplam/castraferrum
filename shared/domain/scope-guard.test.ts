import { describe, expect, it } from 'vitest';
import {
  checkScope,
  globToRegExp,
  matchesGlob,
  parseGateConfig,
  parseVerifyFile,
  type ChangedFile,
  type ScopeInput,
} from './scope-guard';

// The list of spec 2.9, written out here on purpose: tests/tools/gate-data.test.ts compares goals/gate.json with the spec.
const GUARDED = [
  'goals/**',
  'scripts/ratchets.json',
  'scripts/ratchets.mjs',
  'scripts/*-check.mjs',
  'scripts/phone-check.mts',
  'scripts/lang-scan.mjs',
  'scripts/lang-baseline.json',
  'scripts/lang-history-allowlist.json',
  'scripts/uc-coverage.mjs',
  'scripts/api-smoke.mjs',
  'scripts/test-contract.mjs',
  'scripts/design-lint.mjs',
  'scripts/design-states.mjs',
  'scripts/design-tokens.mjs',
  'scripts/arch-lib.mjs',
  'scripts/rule-lint.mjs',
  'scripts/rule-lint-baseline.json',
  'scripts/merge-audit.mjs',
  'scripts/metrics/**',
  'design/ds/required-tokens.json',
  'design/ds/contrast-pairs.json',
  '.dependency-cruiser.cjs',
  'playwright.config.ts',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.base.json',
  'web/tsconfig.json',
  '.github/**',
  '.githooks/**',
];

/** One path that the entry must match: the entry itself, or a sample inside a glob. */
const SAMPLE: Record<string, string> = {
  'goals/**': 'goals/goal-driven-loop.json',
  'scripts/*-check.mjs': 'scripts/arch-check.mjs',
  'scripts/metrics/**': 'scripts/metrics/baseline.mjs',
  '.github/**': '.github/workflows/ci.yml',
  '.githooks/**': '.githooks/pre-commit',
};

const task = (run = 'npx vitest run x.test.ts') => ({
  green: [{ run, expect: ['7 passed'] }],
  stub: { run },
});
const verifyText = (tasks: Record<string, unknown>, v = 1) => JSON.stringify({ v, tasks });
const VERIFY = 'goals/verify/goal-driven-loop.json';

function scope(changed: ChangedFile[], rest: Partial<ScopeInput> = {}) {
  return checkScope({ changed, guarded: GUARDED, verifyChanges: [], ...rest });
}

/** A plan PR that changes one verify file from `base` to `head`. */
function plan(base: string | null, head: string | null, extra: ChangedFile[] = [], status = 'M') {
  return scope([{ status, path: VERIFY }, ...extra], { verifyChanges: [{ path: VERIFY, base, head }] });
}

const pkg = (scripts: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ name: 'x', ...extra, scripts });
const PKG_BASE = pkg({ verify: 'npm run a && npm run uc-coverage -- --min 33', a: 'node scripts/a.mjs', build: 'vite build' });
const packageScope = (head: string, base = PKG_BASE, status = 'M', path = 'package.json') =>
  scope([{ status, path }], { packageChange: { base, head } });

describe('every entry of the guarded list of spec 2.9 matches a path', () => {
  it.each(GUARDED)('%s', (entry) => {
    expect(scope([{ status: 'M', path: SAMPLE[entry] ?? entry }]).verdict).toBe('guarded');
  });

  it('the sample for the glob of metrics matches only that glob', () => {
    expect(matchesGlob('scripts/metrics/baseline.mjs', ['scripts/metrics/**'])).toBe(true);
    expect(matchesGlob('scripts/metrics/baseline.mjs', ['scripts/*-check.mjs'])).toBe(false);
  });

  it('a near miss of a literal entry does not match', () => {
    expect(scope([{ status: 'M', path: 'scripts/ratchets.jsonx' }]).verdict).toBe('pass');
  });

  it('a near miss of a glob does not match', () => {
    expect(scope([{ status: 'M', path: 'scripts/check.mjs' }]).verdict).toBe('pass');
  });

  it('the entries are the 29 of the spec', () => {
    expect(GUARDED).toHaveLength(29);
  });
});

describe('path forms', () => {
  const guardedAfter = (changed: ChangedFile) => {
    const verdict = scope([changed]);
    expect(verdict.verdict).toBe('guarded');
  };

  it('a rename out of a guarded path is guarded (oldPath)', () => {
    guardedAfter({ status: 'R100', path: 'docs/moved.json', oldPath: 'goals/a.json' });
  });

  it('a delete of a guarded path is guarded', () => {
    guardedAfter({ status: 'D', path: 'goals/a.json' });
  });

  it('Goals/x is guarded (case)', () => {
    guardedAfter({ status: 'M', path: 'Goals/x' });
  });

  it('backslashes are guarded', () => {
    guardedAfter({ status: 'M', path: 'goals\\x.json' });
  });

  it('./goals/x is guarded', () => {
    guardedAfter({ status: 'M', path: './goals/x' });
  });

  it('a/../goals/x is guarded', () => {
    guardedAfter({ status: 'M', path: 'a/../goals/x' });
  });
});

describe('paths that pass', () => {
  it.each(['server/x.ts', 'scripts/a.mjs', 'scripts/sub/a-check.mjs', 'goalsx/a.json'])('%s', (path) => {
    expect(scope([{ status: 'M', path }])).toEqual({ verdict: 'pass' });
  });
});

describe('plan PR', () => {
  it('a task key was added', () => {
    expect(plan(verifyText({ '1': task() }), verifyText({ '1': task(), '2': task() }))).toEqual({
      verdict: 'plan',
      addedKeys: ['2'],
    });
  });

  it('a new file adds its keys', () => {
    expect(plan(null, verifyText({ '3': task(), '4': task() }), [], 'A')).toEqual({ verdict: 'plan', addedKeys: ['3', '4'] });
  });

  it('a plan PR may also change docs/plans', () => {
    const verdict = plan(verifyText({}), verifyText({ '5': task() }), [{ status: 'M', path: 'docs/plans/2026-11-01-x.md' }]);
    expect(verdict).toEqual({ verdict: 'plan', addedKeys: ['5'] });
  });

  it('docs/plans alone touches nothing guarded and passes', () => {
    expect(scope([{ status: 'M', path: 'docs/plans/x.md' }])).toEqual({ verdict: 'pass' });
  });

  it('the order of keys does not matter', () => {
    const base = '{"tasks":{"1":{"stub":{"run":"r"},"green":[{"expect":["e"],"run":"r"}]}},"v":1}';
    const head = JSON.stringify({
      tasks: { '2': task(), '1': { green: [{ run: 'r', expect: ['e'] }], stub: { run: 'r' } } },
      v: 1,
    });
    expect(plan(base, head)).toEqual({ verdict: 'plan', addedKeys: ['2'] });
  });
});

describe('plan PR that is guarded', () => {
  const base = verifyText({ '1': task() });

  it('a key was changed', () => {
    expect(plan(base, verifyText({ '1': task('npx vitest run y.test.ts') })).verdict).toBe('guarded');
  });

  it('a key was removed', () => {
    expect(plan(base, verifyText({})).verdict).toBe('guarded');
  });

  it('v changed', () => {
    expect(plan(base, verifyText({ '1': task() }, 2)).verdict).toBe('guarded');
  });

  it('the head is bad JSON', () => {
    expect(plan(base, '{"v":1,').verdict).toBe('guarded');
  });

  it('the verify file was deleted', () => {
    expect(scope([{ status: 'D', path: VERIFY }], { verifyChanges: [{ path: VERIFY, base, head: null }] }).verdict).toBe('guarded');
  });

  it('the verify file was renamed', () => {
    const changed = [{ status: 'R090', path: VERIFY, oldPath: 'goals/verify/old.json' }];
    expect(scope(changed, { verifyChanges: [{ path: VERIFY, base, head: base }] }).verdict).toBe('guarded');
  });

  it('a server file changed with the verify file', () => {
    expect(plan(base, verifyText({ '1': task(), '2': task() }), [{ status: 'M', path: 'server/x.ts' }]).verdict).toBe('guarded');
  });

  it('gate.json changed with the verify file', () => {
    expect(plan(base, verifyText({ '1': task(), '2': task() }), [{ status: 'M', path: 'goals/gate.json' }]).verdict).toBe('guarded');
  });

  it('there is no verifyChanges row', () => {
    expect(scope([{ status: 'M', path: VERIFY }]).verdict).toBe('guarded');
  });

  it('an added key has an empty green', () => {
    const empty = { green: [], stub: { run: 'x' } };
    expect(plan(base, verifyText({ '1': task(), '2': empty })).verdict).toBe('guarded');
  });
});

describe('package.json', () => {
  it('a dependency bump passes', () => {
    expect(packageScope(pkg(JSON.parse(PKG_BASE).scripts, { dependencies: { a: '2.0.0' } }))).toEqual({ verdict: 'pass' });
  });

  it('a different order of the keys in scripts passes', () => {
    const scripts = JSON.parse(PKG_BASE).scripts as Record<string, string>;
    const reversed = Object.fromEntries(Object.entries(scripts).reverse());
    expect(packageScope(pkg(reversed))).toEqual({ verdict: 'pass' });
  });

  it('a higher --min passes', () => {
    expect(packageScope(PKG_BASE.replace('--min 33', '--min 40'))).toEqual({ verdict: 'pass' });
  });

  it('a lower --min is guarded', () => {
    expect(packageScope(PKG_BASE.replace('--min 33', '--min 32')).verdict).toBe('guarded');
  });

  it('a higher --min plus a new step is guarded', () => {
    expect(packageScope(PKG_BASE.replace('--min 33', '--min 40 && node scripts/evil.mjs')).verdict).toBe('guarded');
  });

  it('another script changed', () => {
    expect(packageScope(PKG_BASE.replace('vite build', 'echo ok')).verdict).toBe('guarded');
  });

  it('a script was added', () => {
    expect(packageScope(pkg({ ...JSON.parse(PKG_BASE).scripts, extra: 'echo' })).verdict).toBe('guarded');
  });

  it('the head is bad JSON', () => {
    expect(packageScope('{"scripts":').verdict).toBe('guarded');
  });

  it('package.json was deleted', () => {
    expect(packageScope(PKG_BASE, PKG_BASE, 'D').verdict).toBe('guarded');
  });

  it('package.json was renamed', () => {
    const renamed = scope([{ status: 'R100', path: 'pkg.json', oldPath: 'package.json' }], { packageChange: { base: PKG_BASE, head: PKG_BASE } });
    expect(renamed.verdict).toBe('guarded');
  });

  it('there is no packageChange', () => {
    expect(scope([{ status: 'M', path: 'package.json' }]).verdict).toBe('guarded');
  });

  it('./Package.json with a changed script is guarded', () => {
    expect(packageScope(PKG_BASE.replace('vite build', 'echo ok'), PKG_BASE, 'M', './Package.json').verdict).toBe('guarded');
  });
});

describe('globs', () => {
  it('* stops at /', () => {
    expect(globToRegExp('scripts/*-check.mjs').test('scripts/sub/a-check.mjs')).toBe(false);
    expect(globToRegExp('scripts/*-check.mjs').test('scripts/a-check.mjs')).toBe(true);
  });

  it('** crosses /', () => {
    expect(globToRegExp('goals/**').test('goals/a/b/c.json')).toBe(true);
  });

  it('a leading **/ also matches no directory', () => {
    expect(globToRegExp('**/*.test.ts').test('a.test.ts')).toBe(true);
    expect(globToRegExp('**/*.test.ts').test('server/a/b.test.ts')).toBe(true);
  });
});

describe('parsers', () => {
  const gate = {
    v: 1,
    setup: ['npm ci'],
    verify: ['npm run verify'],
    env: { A: 'b' },
    guarded: ['goals/**'],
    testGlobs: ['tests/**'],
  };

  it('parseGateConfig reads a good file', () => {
    expect(parseGateConfig(JSON.stringify(gate)).guarded).toEqual(['goals/**']);
  });

  it('parseGateConfig throws on a bad shape', () => {
    const { guarded: _guarded, ...missing } = gate;
    expect(() => parseGateConfig(JSON.stringify(missing))).toThrow(/guarded/);
    expect(() => parseGateConfig(JSON.stringify({ ...gate, setup: 'npm ci' }))).toThrow(/setup/);
    expect(() => parseGateConfig('[]')).toThrow();
  });

  it('parseVerifyFile reads a good file', () => {
    expect(Object.keys(parseVerifyFile(verifyText({ '1': task(), '2': { green: [{ run: 'x', expect: [] }], stub: { none: 'docs' } } })).tasks)).toEqual(['1', '2']);
  });

  it('parseVerifyFile throws on a bad shape', () => {
    expect(() => parseVerifyFile(verifyText({ '1': { green: [] } }))).toThrow(/stub/);
    expect(() => parseVerifyFile(verifyText({}, 2))).toThrow(/"v"/);
  });

  it('parseVerifyFile throws on bad JSON', () => {
    expect(() => parseVerifyFile('{"v":1,')).toThrow(/JSON/);
  });
});
