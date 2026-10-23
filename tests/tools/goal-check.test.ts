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
