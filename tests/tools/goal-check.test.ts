import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = join(root, 'scripts', 'goal-check.mjs');
const fixture = (name: string) => `tests/tools/fixtures/goal-check/${name}.json`;

function goalCheck(name: string, extra: string[] = [], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [script, fixture(name), ...extra], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('goal-check', () => {
  it('an all-pass manifest of two goals prints both passes and exits 0', () => {
    const r = goalCheck('all-pass');
    expect(r.out).toContain('G1 pass');
    expect(r.out).toContain('G2 pass');
    expect(r.out.trim().split('\n').at(-1)).toBe('goals passed: 2/2');
    expect(r.code).toBe(0);
  });

  it('a missing expect text fails that goal only and exits 1', () => {
    const r = goalCheck('expect-miss');
    expect(r.out).toContain('G1 pass');
    expect(r.out).toContain('G2 FAIL');
    expect(r.out).toContain('needle');
    expect(r.out).toContain('something else');
    expect(r.out).toContain('goals passed: 1/2');
    expect(r.code).toBe(1);
  });

  it('a wrong exit code fails', () => {
    const r = goalCheck('wrong-exit');
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toMatch(/exit 3/);
    expect(r.out).toContain('goals passed: 0/1');
    expect(r.code).toBe(1);
  });

  it('output where empty is required fails', () => {
    const r = goalCheck('not-empty');
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toContain('leftover');
    expect(r.out).toContain('goals passed: 0/1');
    expect(r.code).toBe(1);
  });

  it('stdout over maxStdoutBytes fails', () => {
    const r = goalCheck('too-large');
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toMatch(/100 bytes/);
    expect(r.out).toContain('goals passed: 0/1');
    expect(r.code).toBe(1);
  });

  it('a missing file fails', () => {
    const r = goalCheck('missing-file');
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toContain('no-such-file.txt');
    expect(r.out).toContain('goals passed: 0/1');
    expect(r.code).toBe(1);
  });

  it('a file without the text fails', () => {
    const r = goalCheck('contains-miss');
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toContain('text that is not there');
    expect(r.out).toContain('goals passed: 0/1');
    expect(r.code).toBe(1);
  });

  it('a failing setup command fails every goal', () => {
    const r = goalCheck('setup-fails');
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toContain('G2 FAIL');
    expect(r.out).toContain('setup');
    expect(r.out).toContain('goals passed: 0/2');
    expect(r.code).toBe(1);
  });

  it('a goal after a failing one still runs', () => {
    const marker = join(mkdtempSync(join(tmpdir(), 'goal-check-')), 'marker.txt');
    const r = goalCheck('keeps-going', [], { GOAL_CHECK_MARKER: marker });
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toContain('G2 pass');
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toBe('ran');
    expect(r.out).toContain('goals passed: 1/2');
    expect(r.code).toBe(1);
  });

  it('a long failing output shows its first and last 20 lines', () => {
    const r = goalCheck('long-output');
    const shown = r.out.split(/\r?\n/).map((l) => l.trim());
    expect(r.out).toContain('G1 FAIL');
    for (const k of [1, 20, 41, 60]) expect(shown).toContain(`line ${k}`);
    for (const k of [21, 30, 40]) expect(shown).not.toContain(`line ${k}`);
    expect(r.out).toContain('(20 lines left out)');
  });

  it('--only runs one goal', () => {
    const r = goalCheck('expect-miss', ['--only', 'G1']);
    expect(r.out).toContain('G1 pass');
    expect(r.out).not.toContain('G2');
    expect(r.out).toContain('goals passed: 1/1');
    expect(r.code).toBe(0);
  });
});

function bare(args: string[]) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const oldFixtures = [
  'all-pass',
  'contains-miss',
  'expect-miss',
  'keeps-going',
  'long-output',
  'missing-file',
  'not-empty',
  'setup-fails',
  'too-large',
  'wrong-exit',
];
const goldenExit: Record<string, number> = { 'all-pass': 0 };

describe('goal-check exit 2', () => {
  it('no manifest prints usage on stderr, nothing on stdout, and exits 2', () => {
    const r = bare([]);
    expect(r.err).toContain('usage: node scripts/goal-check.mjs');
    expect(r.out).toBe('');
    expect(r.code).toBe(2);
  });

  it('--json with no manifest still prints usage on stderr, nothing on stdout, and exits 2', () => {
    const r = bare(['--json']);
    expect(r.err).toContain('usage: node scripts/goal-check.mjs');
    expect(r.out).toBe('');
    expect(r.code).toBe(2);
  });

  it('a manifest with no goal exits 2 and prints nothing on stdout', () => {
    const r = goalCheck('no-goals', ['--json']);
    expect(r.err).toContain('no goal');
    expect(r.out).toBe('');
    expect(r.code).toBe(2);
  });
});

describe('goal-check --json', () => {
  it('prints one line with the rows, the totals and the short sha', () => {
    const r = goalCheck('all-pass', ['--json']);
    expect(r.out.endsWith('\n')).toBe(true);
    expect(r.out.trim().split('\n')).toHaveLength(1);
    const j = JSON.parse(r.out);
    expect(j.goals).toEqual([
      { id: 'G1', pass: true, value: null, of: null, line: 'G1 pass' },
      { id: 'G2', pass: true, value: null, of: null, line: 'G2 pass' },
    ]);
    expect(j.passed).toBe(2);
    expect(j.total).toBe(2);
    expect(j.sha).toMatch(/^([0-9a-f]{7}|unknown)$/);
    expect(r.code).toBe(0);
  });

  it('keeps exit 1 and marks the failing row', () => {
    const r = goalCheck('expect-miss', ['--json']);
    const j = JSON.parse(r.out);
    expect(j.goals.map((g: { id: string; pass: boolean; line: string }) => [g.id, g.pass, g.line])).toEqual([
      ['G1', true, 'G1 pass'],
      ['G2', false, 'G2 FAIL'],
    ]);
    expect(j.passed).toBe(1);
    expect(j.total).toBe(2);
    expect(r.code).toBe(1);
  });
});

describe('goal-check score', () => {
  it('takes value and of from the first match and prints the match in the human line', () => {
    const j = JSON.parse(goalCheck('score', ['--json']).out);
    expect(j.goals[0]).toEqual({ id: 'G4', pass: true, value: 72, of: 240, line: 'G4 72/240 screens' });
    expect(j.goals[2]).toEqual({ id: 'G6', pass: true, value: null, of: null, line: 'G6 pass' });
    expect(goalCheck('score').out).toContain('G4 pass (72/240 screens)\n');
  });

  it('a failing check keeps its score, in both outputs', () => {
    const j = JSON.parse(goalCheck('score', ['--json']).out);
    expect(j.goals[1]).toEqual({ id: 'G5', pass: false, value: 5, of: 10, line: 'G5 5/10 screens' });
    const human = goalCheck('score');
    expect(human.out).toContain('G5 FAIL');
    expect(human.out).toContain('    score 5/10 screens\n');
    expect(human.code).toBe(1);
  });

  it('a score that does not match fails the goal', () => {
    const r = goalCheck('score-nomatch');
    expect(r.out).toContain('G1 FAIL');
    expect(r.out).toContain('score: no match');
    expect(r.code).toBe(1);
    const j = JSON.parse(goalCheck('score-nomatch', ['--json']).out);
    expect(j.goals[0]).toMatchObject({ id: 'G1', pass: false, value: null, of: null, line: 'G1 FAIL' });
  });
});

describe('goal-check cadence', () => {
  it('--cadence nightly runs only the nightly goal', () => {
    const r = goalCheck('cadence', ['--cadence', 'nightly']);
    expect(r.out).toContain('G2 pass');
    expect(r.out).not.toContain('G1');
    expect(r.out).toContain('goals passed: 1/1');
    expect(r.code).toBe(0);
  });

  it('--cadence merge runs the goal without a cadence key', () => {
    const r = goalCheck('cadence', ['--cadence', 'merge']);
    expect(r.out).toContain('G1 pass');
    expect(r.out).not.toContain('G2');
    expect(r.out).toContain('goals passed: 1/1');
  });

  it('an unknown cadence exits 2', () => {
    const r = goalCheck('cadence', ['--cadence', 'weekly']);
    expect(r.out).toBe('');
    expect(r.err).toContain('unknown cadence');
    expect(r.code).toBe(2);
  });

  it('a cadence with no goal exits 2', () => {
    const r = goalCheck('all-pass', ['--cadence', 'nightly']);
    expect(r.out).toBe('');
    expect(r.err).toContain('no goal');
    expect(r.code).toBe(2);
  });
});

describe('goal-check d7', () => {
  it('a d7 goal passes with its checks and says it is not measured yet', () => {
    const r = goalCheck('d7');
    expect(r.out).toContain('G7 pass (not measured yet)\n');
    expect(r.code).toBe(0);
    const j = JSON.parse(goalCheck('d7', ['--json']).out);
    expect(j.goals[0]).toEqual({
      id: 'G7',
      pass: true,
      value: null,
      of: null,
      line: 'G7 pass (not measured yet)',
      d7: true,
    });
  });
});

describe('goal-check golden output', () => {
  it('the 10 old manifests print exactly what they printed before the change', () => {
    const marker = join(mkdtempSync(join(tmpdir(), 'goal-check-')), 'marker.txt');
    expect(oldFixtures).toHaveLength(10);
    for (const name of oldFixtures) {
      const golden = readFileSync(join(root, 'tests', 'tools', 'fixtures', 'goal-check', 'golden', `${name}.out`), 'utf8');
      const r = goalCheck(name, [], { GOAL_CHECK_MARKER: marker });
      expect(r.out, name).toBe(golden);
      expect(r.code, name).toBe(goldenExit[name] ?? 1);
    }
  });
});
