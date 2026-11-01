import { describe, expect, test } from 'vitest';
import { parseProbeLine } from './goal-loop';

const base = {
  v: 1,
  reason: '',
  resource: null,
  until: null,
  plan: null,
  issues: [],
  goals: { passed: 3, total: 8 },
};
const task = { key: '141', attempt: 1, resources: ['docker'] };
const line = (o: Record<string, unknown>) => JSON.stringify({ ...base, ...o });

describe('parseProbeLine: valid actions', () => {
  test('take', () => {
    const r = parseProbeLine(line({ action: 'take', tasks: [task] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line.action).toBe('take');
      expect(r.line.tasks).toEqual([task]);
      expect(r.line.goals).toEqual({ passed: 3, total: 8 });
    }
  });

  test('plan', () => {
    const r = parseProbeLine(line({ action: 'plan', plan: { key: 'plan-217', failing: ['G4'] } }));
    expect(r.ok && r.line.plan).toEqual({ key: 'plan-217', failing: ['G4'] });
  });

  test('skip', () => {
    const r = parseProbeLine(line({ action: 'skip' }));
    expect(r.ok && r.line.action).toBe('skip');
  });

  test('wait', () => {
    const r = parseProbeLine(line({ action: 'wait', reason: 'needs a login' }));
    expect(r.ok && r.line.reason).toBe('needs a login');
  });

  test('blocked', () => {
    const r = parseProbeLine(line({ action: 'blocked', reason: 'red CI', issues: ['212', '213'] }));
    expect(r.ok && r.line.issues).toEqual(['212', '213']);
  });

  test('hold', () => {
    const r = parseProbeLine(
      line({
        action: 'hold',
        resource: 'docker',
        reason: 'daemon down',
        until: '2026-11-02T00:00:00Z',
      }),
    );
    expect(r.ok && [r.line.resource, r.line.until]).toEqual(['docker', '2026-11-02T00:00:00Z']);
  });

  test('done', () => {
    const r = parseProbeLine(line({ action: 'done' }));
    expect(r.ok && r.line.action).toBe('done');
  });
});

describe('parseProbeLine: other input', () => {
  test('reads the last non-empty line after log lines', () => {
    const r = parseProbeLine(`checking...\n{"not":"this"}\n${line({ action: 'skip' })}\r\n\n  \n`);
    expect(r.ok && r.line.action).toBe('skip');
  });

  test.each([
    ['take without tasks', { action: 'take' }],
    ['plan without plan', { action: 'plan' }],
    ['wait without reason', { action: 'wait' }],
    ['blocked without issues', { action: 'blocked', reason: 'x' }],
    ['hold without resource', { action: 'hold', reason: 'x' }],
  ])('rejects %s', (_name, o) => {
    expect(parseProbeLine(line(o)).ok).toBe(false);
  });

  test('rejects text that is not JSON', () => {
    expect(parseProbeLine('all good')).toMatchObject({
      ok: false,
      raw: 'all good',
    });
  });

  test('rejects version 2', () => {
    expect(parseProbeLine(line({ v: 2, action: 'skip' })).ok).toBe(false);
  });

  test('rejects an unknown action', () => {
    expect(parseProbeLine(line({ action: 'run' })).ok).toBe(false);
  });

  test('rejects a key with a space', () => {
    expect(parseProbeLine(line({ action: 'take', tasks: [{ ...task, key: 'a b' }] })).ok).toBe(false);
  });

  test('rejects a key of 101 characters and accepts 100', () => {
    expect(parseProbeLine(line({ action: 'take', tasks: [{ ...task, key: 'k'.repeat(101) }] })).ok).toBe(false);
    expect(parseProbeLine(line({ action: 'take', tasks: [{ ...task, key: 'k'.repeat(100) }] })).ok).toBe(true);
  });

  test('rejects empty output', () => {
    expect(parseProbeLine('')).toMatchObject({ ok: false, raw: '' });
  });

  test('ignores extra keys', () => {
    expect(parseProbeLine(line({ action: 'skip', extra: { a: 1 } })).ok).toBe(true);
  });

  test('cuts raw at 2000 bytes on a character edge', () => {
    // U+20AC is 3 bytes in UTF-8, so 2000 is not a multiple of the character size.
    const r = parseProbeLine(line({ action: 'skip', note: '€'.repeat(1000) }));
    expect(r.ok).toBe(true);
    const bytes = new TextEncoder().encode(r.raw).length;
    expect(bytes).toBeLessThanOrEqual(2000);
    expect(bytes).toBeGreaterThan(1996);
    expect(r.raw).not.toContain('�');
  });
});
