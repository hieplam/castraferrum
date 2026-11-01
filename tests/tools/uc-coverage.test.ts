import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPECS, coverage, greenUcIds, main, readUcIds } from '../../scripts/uc-coverage.mjs';

type Result = { status: string };
const spec = (title: string, tags: string[], tests: { status: string; results: Result[] }[]) => ({ title, tags, tests });
const pass = { status: 'expected', results: [{ status: 'passed' }] };

// Shape of the Playwright JSON report: nested suites → specs → tests (one test per project) → results.
const report = {
  suites: [
    {
      title: 'a.spec.ts',
      specs: [
        spec('create loop', ['UC-01'], [pass]),
        spec('red schedule', ['UC-02'], [{ status: 'unexpected', results: [{ status: 'failed' }] }]),
        spec('skipped', ['UC-03'], [{ status: 'skipped', results: [{ status: 'skipped' }] }]),
        spec('flaky', ['UC-04'], [{ status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }]),
        spec('home page', ['smoke'], [pass]),
      ],
      suites: [
        {
          title: 'nested',
          specs: [
            spec('tag in name @UC-05', [], [pass]),
            spec('one project red', ['UC-06'], [pass, { status: 'unexpected', results: [{ status: 'failed' }] }]),
            spec('unknown UC', ['UC-99'], [pass]),
          ],
        },
      ],
    },
  ],
};

describe('uc-coverage', () => {
  it('reads all 34 UC ids from docs/USE-CASES.md (UC-33 is not written yet; UC-34 came with the phone layout)', () => {
    const ids = readUcIds(readFileSync(DEFAULT_SPECS[0]!, 'utf8'));
    expect(ids).toHaveLength(34);
    expect(ids[0]).toBe('UC-01');
    expect(ids.at(-1)).toBe('UC-35');
  });

  it('reads docs/USE-CASES.md by default: 34 UC ids, the last 16 are UC-19…UC-32, UC-34 and UC-35', () => {
    const ids = readUcIds(DEFAULT_SPECS.map((f) => readFileSync(f, 'utf8')).join('\n'));
    expect(ids).toHaveLength(34);
    expect(ids.slice(-16)).toEqual(['UC-19', 'UC-20', 'UC-21', 'UC-22', 'UC-23', 'UC-24', 'UC-25', 'UC-26', 'UC-27', 'UC-28', 'UC-29', 'UC-30', 'UC-31', 'UC-32', 'UC-34', 'UC-35']);
  });

  it('counts green tests only: drops red, skipped, flaky, red in one project; recognises a tag in the name', () => {
    expect([...greenUcIds(report)].sort()).toEqual(['UC-01', 'UC-05', 'UC-99']);
  });

  it('a UC missing from the spec is not counted', () => {
    const result = coverage(['UC-01', 'UC-02', 'UC-05'], greenUcIds(report));
    expect(result.covered).toEqual(['UC-01', 'UC-05']);
    expect(result.missing).toEqual(['UC-02']);
    expect(result.unknown).toEqual(['UC-99']);
  });

  describe('command line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uc-coverage-'));
    const reportFile = join(dir, 'e2e.json');
    writeFileSync(reportFile, JSON.stringify(report));

    const run = (...args: string[]) => {
      const out: string[] = [];
      const code = main(['--report', reportFile, ...args], (m: string) => out.push(m), (m: string) => out.push(m));
      return { code, out: out.join('\n') };
    };

    it('prints k/34 and the list of missing ones', () => {
      const { code, out } = run();
      expect(code).toBe(0);
      expect(out).toContain('UCs with a green e2e: 2/34');
      expect(out).toMatch(/Missing: UC-02 UC-03 UC-04 UC-06/);
    });

    it('--min: meets the threshold → 0, falls below it → 1', () => {
      expect(run('--min', '2').code).toBe(0);
      expect(run('--min', '3').code).toBe(1);
    });

    it('no report yet → exit 2, says to run e2e first', () => {
      const out: string[] = [];
      expect(main(['--report', join(dir, 'missing.json')], () => {}, (m: string) => out.push(m))).toBe(2);
      expect(out.join()).toMatch(/npm run test:e2e/);
    });

    it('runs via node scripts/uc-coverage.mjs', () => {
      const script = fileURLToPath(new URL('../../scripts/uc-coverage.mjs', import.meta.url));
      const res = spawnSync(process.execPath, [script, '--report', reportFile, '--min', '3'], { encoding: 'utf8' });
      expect(res.stdout).toContain('UCs with a green e2e: 2/34');
      expect(res.status).toBe(1);
    });
  });
});
