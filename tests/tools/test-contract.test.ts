import { describe, expect, it } from 'vitest';
import { summarize } from '../../scripts/test-contract.mjs';

// Shape of the Vitest JSON report: testResults (per file) → assertionResults (per case, with ancestorTitles).
const ca = (side: string, title: string, status = 'passed') => ({ ancestorTitles: [side, 'RunRepository'], title, status });
const report = (...cases: ReturnType<typeof ca>[]) => ({ testResults: [{ assertionResults: cases }] });

describe('test:contract summarize', () => {
  it('both sides have the same set of cases, all green → "memory: N passed · postgres: N passed"', () => {
    const out = summarize(report(ca('memory', 'busy'), ca('memory', 'cas'), ca('postgres', 'busy'), ca('postgres', 'cas')));
    expect(out).toMatchObject({ line: 'memory: 2 passed · postgres: 2 passed', ok: true, problems: [] });
  });

  it('one side red → not ok, prints the red case count', () => {
    const out = summarize(report(ca('memory', 'busy', 'failed'), ca('postgres', 'busy')));
    expect(out.ok).toBe(false);
    expect(out.line).toBe('memory: 0 passed, 1 failed · postgres: 1 passed');
    expect(out.problems).toContain('memory: 1 failed case(s)');
  });

  it('the two sides differ in cases / one side empty / a skipped case → not ok', () => {
    expect(summarize(report(ca('memory', 'a'), ca('postgres', 'b'))).problems).toEqual([
      'only memory has: RunRepository › a',
      'only postgres has: RunRepository › b',
    ]);
    expect(summarize(report(ca('memory', 'a'))).problems).toContain('postgres: no cases');
    expect(summarize(report()).ok).toBe(false);
    expect(summarize(report(ca('memory', 'a', 'skipped'), ca('postgres', 'a'))).problems).toContain('memory: 1 skipped case(s)');
  });

  const ex = (kind: string, title: string, status = 'passed') => ({ ancestorTitles: ['executor contract', kind], title, status });

  it('filtering by file drops the repository suite entirely (only the executor suite runs) → does not require both sides, prints only the executor line', () => {
    expect(summarize(report(ex('mock', 'previous session')))).toEqual({
      ok: true,
      line: 'executor contract — mock: 1 passed',
      lines: ['executor contract — mock: 1 passed'],
      problems: [],
    });
  });

  it('full run: prints two lines - repository on both sides, then executor contract - mock', () => {
    const out = summarize(report(ca('memory', 'busy'), ca('postgres', 'busy'), ex('mock', 'cancel'), ex('mock', 'session')), { requireAll: true });
    expect(out).toMatchObject({ ok: true, lines: ['memory: 1 passed · postgres: 1 passed', 'executor contract — mock: 2 passed'] });
  });

  it('executor suite red / missing entirely on a full run / two executors differ in cases → not ok', () => {
    const red = summarize(report(ca('memory', 'a'), ca('postgres', 'a'), ex('mock', 'cancel', 'failed')), { requireAll: true });
    expect(red.problems).toEqual(['mock: 1 failed case(s)']);
    expect(red.lines[1]).toBe('executor contract — mock: 0 passed, 1 failed');
    expect(summarize(report(ca('memory', 'a'), ca('postgres', 'a')), { requireAll: true }).problems).toEqual([
      'executor contract: no cases',
    ]);
    expect(summarize(report(ca('memory', 'a'), ca('postgres', 'a')), { requireAll: false }).ok).toBe(true);
    const mismatch = summarize(report(ex('mock', 'cancel'), ex('mock', 'session'), ex('claude-agent-sdk', 'cancel')));
    expect(mismatch.problems).toEqual(['only mock has: session']);
    expect(mismatch.line).toBe('executor contract — mock: 2 passed · claude-agent-sdk: 1 passed');
  });

  it('full run with the repository suite missing entirely → not ok', () => {
    expect(summarize(report(ex('mock', 'a')), { requireAll: true }).problems).toEqual([
      'memory: no cases',
      'postgres: no cases',
    ]);
  });
});
