/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest';
import architecture from '../../docs/ARCHITECTURE.md?raw';
import { claimedLine, laneEnvOf, lowestFreeSlot, parseProbeLine, prNumberOf, RESUME_LINE } from './goal-loop';

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

describe('parseProbeLine: blockers (decision 52)', () => {
  const blocked = (blockers?: unknown) => line({ action: 'blocked', reason: 'red CI', issues: ['31'], ...(blockers === undefined ? {} : { blockers }) });
  const entry = { key: '31', title: 'Migration 14 fails', blocks: 3, url: 'https://github.com/acme/api/issues/31' };

  test('a missing key gives an empty list', () => {
    const r = parseProbeLine(blocked());
    expect(r.ok && r.line.blockers).toEqual([]);
  });

  test('a valid entry is kept', () => {
    const r = parseProbeLine(blocked([entry, { ...entry, key: '33', blocks: 0 }]));
    expect(r.ok && r.line.blockers).toEqual([entry, { ...entry, key: '33', blocks: 0 }]);
  });

  test('a key with a space fails the line', () => {
    expect(parseProbeLine(blocked([{ ...entry, key: 'a b' }]))).toMatchObject({ ok: false, reason: 'invalid blockers' });
  });

  test('a negative or fractional blocks fails the line', () => {
    expect(parseProbeLine(blocked([{ ...entry, blocks: -1 }]))).toMatchObject({ ok: false, reason: 'invalid blockers' });
    expect(parseProbeLine(blocked([{ ...entry, blocks: 1.5 }]))).toMatchObject({ ok: false, reason: 'invalid blockers' });
  });

  test('a url that does not start with https:// fails the line', () => {
    expect(parseProbeLine(blocked([{ ...entry, url: 'http://github.com/acme/api/issues/31' }]))).toMatchObject({ ok: false, reason: 'invalid blockers' });
    expect(parseProbeLine(blocked([{ ...entry, title: 7 }]))).toMatchObject({ ok: false, reason: 'invalid blockers' });
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

describe('lanes', () => {
  test('lowestFreeSlot: the lowest slot that no run holds, from 0', () => {
    expect(lowestFreeSlot([])).toBe(0);
    expect(lowestFreeSlot([0, 1, 3])).toBe(2);
    expect(lowestFreeSlot([1, 2])).toBe(0);
  });

  test('lowestFreeSlot: a run with no slot holds none, and a slot is reused after its run ends', () => {
    expect(lowestFreeSlot([null, 0, null])).toBe(1);
    expect(lowestFreeSlot([null])).toBe(0);
  });

  test('laneEnvOf: fills every {slot} and {port} and adds CASTRAFERRUM_SLOT', () => {
    const env = laneEnvOf({ laneEnv: { DB: 'loops_{slot}_test', URL: 'http://x:{port}/{slot}/{port}' }, laneBasePort: 7100 }, 2);
    expect(env).toEqual({ DB: 'loops_2_test', URL: 'http://x:7102/2/7102', CASTRAFERRUM_SLOT: '2' });
  });

  test('laneEnvOf: three slots give three different numbers, databases and ports', () => {
    const settings = { laneEnv: { DB: 'db_{slot}', PORT: '{port}' }, laneBasePort: 7100 };
    const envs = [0, 1, 2].map((slot) => laneEnvOf(settings, slot));
    for (const key of ['CASTRAFERRUM_SLOT', 'DB', 'PORT']) expect(new Set(envs.map((e) => e[key])).size).toBe(3);
    expect(envs.map((e) => e.PORT)).toEqual(['7100', '7101', '7102']);
  });

  test('laneEnvOf: no lane env gives only the slot, and a lane env cannot set the slot itself', () => {
    expect(laneEnvOf({ laneEnv: {}, laneBasePort: null }, 1)).toEqual({ CASTRAFERRUM_SLOT: '1' });
    expect(laneEnvOf({ laneEnv: { CASTRAFERRUM_SLOT: '9' }, laneBasePort: null }, 1)).toEqual({ CASTRAFERRUM_SLOT: '1' });
  });

  test('laneEnvOf: the gate adds CASTRAFERRUM_GATE, off gives no key, and a lane env cannot set it', () => {
    expect(laneEnvOf({ laneEnv: {}, laneBasePort: null }, 1, true)).toEqual({ CASTRAFERRUM_SLOT: '1', CASTRAFERRUM_GATE: '1' });
    expect(laneEnvOf({ laneEnv: {}, laneBasePort: null }, 1)).toEqual({ CASTRAFERRUM_SLOT: '1' });
    expect(laneEnvOf({ laneEnv: { CASTRAFERRUM_GATE: '0' }, laneBasePort: null }, 1, true).CASTRAFERRUM_GATE).toBe('1');
    expect(laneEnvOf({ laneEnv: { CASTRAFERRUM_GATE: '1' }, laneBasePort: null }, 1)).toEqual({ CASTRAFERRUM_SLOT: '1' });
  });

  test('prNumberOf: a link of the repository gives its number, with no regard to case', () => {
    expect(prNumberOf('https://github.com/o/r/pull/7', 'o/r')).toBe(7);
    expect(prNumberOf('https://GitHub.com/O/R/pull/2147483647', 'o/r')).toBe(2147483647);
  });

  test.each([
    [null],
    [''],
    ['7'],
    ['https://github.com/o/other/pull/7'],
    ['https://github.com/o/r/pull/7/files'],
    ['https://github.com/o/r/pull/7#issuecomment-1'],
    ['https://github.com/o/r/issues/7'],
    ['https://github.com/o/r/pull/0'],
    ['https://github.com/o/r/pull/2147483648'],
    ['http://github.com/o/r/pull/7'],
    ['https://github.example/o/r/pull/7'],
    ['https://evil.test/https://github.com/o/r/pull/7'],
  ])('prNumberOf: %s gives null', (link) => {
    expect(prNumberOf(link, 'o/r')).toBeNull();
  });

  test('claimedLine: the prompt line of spec 2.7, with the key and the action', () => {
    expect(claimedLine('141', 'take')).toBe(
      '[Castraferrum] The console claimed task 141 for this run (action take). Do not run next or claim. Do this task only.',
    );
    expect(claimedLine('plan-217', 'plan')).toContain('task plan-217 for this run (action plan)');
  });

  // The two lines are a contract with `tick.md`: a change in the code must change the document, and the other way round.
  const lineOf = (label: string) => new RegExp(`^\\s*- ${label}: \`([^\`]+)\``, 'm').exec(architecture)?.[1];

  test('ARCHITECTURE.md holds the prompt line of claimedLine, word for word', () => {
    const doc = lineOf('Prompt line');
    expect(doc).toBeDefined();
    expect(claimedLine('<key>', '<take or plan>' as 'take')).toBe(doc);
  });

  test('ARCHITECTURE.md holds RESUME_LINE, word for word', () => {
    expect(lineOf('Resume message')).toBe(RESUME_LINE);
    expect(RESUME_LINE).toBe('[Castraferrum] The usage limit has reset. Continue the same task from where you stopped.');
  });
});
