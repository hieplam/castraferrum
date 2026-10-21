// Pure functions of the form: schedule builder <-> cron (round-trip, field errors, Advanced) and form <-> request body / server errors.
import { describe, expect, it } from 'vitest';
import { nextRuns } from '../../../shared/domain/schedule';
import { changedParts, cronOf, emptyValues, errorsFromIssues, toBody, valuesFromLoop } from './form-model';
import { draftFromCron, evaluateDraft, switchKind, toggleDay, type ScheduleDraft } from './schedule-draft';
import type { LoopDto } from '../../../shared/contracts/loops';
import { FAKE_REPO } from '../../api/fake-loops-api';

const NOW = new Date('2026-10-18T14:00:42+07:00');
const TZ = 'Asia/Ho_Chi_Minh';
const ok = (d: ScheduleDraft) => {
  const r = evaluateDraft(d, TZ, NOW, 'en');
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('schedule builder (UC-02)', () => {
  it('Mon, Wed, Fri at 08:30 -> 30 8 * * 1,3,5 + the sentence + the next 5 runs of the domain', () => {
    let d = switchKind(draftFromCron('*/30 * * * *'), 'weekly');
    d = toggleDay(toggleDay(d, 5), 3); // Monday is on by default
    d = { ...d, time: '08:30' };
    const r = ok(d);
    expect(r.cron).toBe('30 8 * * 1,3,5');
    expect(r.description).toBe('At 08:30 on Monday, Wednesday, Friday');
    expect(r.nextRuns).toEqual(nextRuns('30 8 * * 1,3,5', TZ, NOW, 5));
  });

  it.each([
    ['*/30 * * * *', 'minutes'],
    ['*/7 * * * *', 'minutes'],
    ['5 */2 * * *', 'hours'],
    ['30 8 * * *', 'daily'],
    ['30 8 * * 1,3,5', 'weekly'],
    ['0 9 31 * *', 'monthly'],
    ['0 9-17/2 * * 1-5', 'advanced'],
  ] as const)('reopening %s -> kind %s, rebuilds exactly the cron (round-trip)', (cron, kind) => {
    const d = draftFromCron(cron);
    expect(d.kind).toBe(kind);
    expect(cronOf(d)).toBe(cron);
    expect(ok(d).autoAdvanced).toBe(kind === 'advanced');
  });

  it('keeps the text the user typed ("05") and switching kind does not lose the fields of another kind', () => {
    const d = draftFromCron('5 */2 * * *');
    expect([d.hours, d.atMinute]).toEqual(['2', '05']);
    const back = switchKind(switchKind(d, 'daily'), 'hours');
    expect(cronOf(back)).toBe('5 */2 * * *');
  });

  it('switching to Advanced carries the cron being built', () => {
    expect(switchKind(draftFromCron('30 8 * * *'), 'advanced').cron).toBe('30 8 * * *');
  });

  it('an error lands on exactly its field: minute out of range, malformed time, no weekday chosen, day 32, a mistyped cron, an unknown time zone', () => {
    const err = (d: ScheduleDraft, tz = TZ) => {
      const r = evaluateDraft(d, tz, NOW, 'en');
      return r.ok ? {} : r.errors;
    };
    const base = draftFromCron('*/30 * * * *');
    expect(Object.keys(err({ ...base, minutes: '0' }))).toEqual(['minutes']);
    expect(Object.keys(err({ ...base, kind: 'daily', time: 'eight' }))).toEqual(['time']);
    expect(Object.keys(err({ ...base, kind: 'hours', hours: '2', atMinute: '75' }))).toEqual(['atMinute']);
    expect(err({ ...base, kind: 'weekly', days: [] }).days).toBe('Pick at least one day of the week');
    expect(Object.keys(err({ ...base, kind: 'monthly', day: '32' }))).toEqual(['day']);
    expect(err({ ...base, kind: 'advanced', cron: '61 8 * * 1-5' }).cron).toBe('Invalid minute field: "61" (accepts 0–59)');
    expect(Object.keys(err(base, 'Mars/Olympus'))).toEqual(['timezone']);
  });

  it('domain warnings: */7, day 31', () => {
    expect(ok(draftFromCron('*/7 * * * *')).warnings.map((w) => w.code)).toEqual(['unevenMinuteStep']);
    expect(ok(draftFromCron('0 9 31 * *')).warnings.map((w) => w.code)).toEqual(['missingMonthDay']);
  });
});

const LOOP: LoopDto = {
  id: '4f0b2c6e-9a51-4d7e-8c3a-1e2f7b9d0a64',
  name: 'Game pilot backlog',
  description: 'description',
  prompt: 'prompt',
  repo: FAKE_REPO,
  cron: '30 8 * * 1,3,5',
  timezone: TZ,
  timeoutSec: 900,
  maxConcurrent: 1,
  executor: { kind: 'mock', config: { durationSec: 100, failRate: 5 } },
  status: 'stopped',
  nextRunAt: null,
  version: 3,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  iterations: 0,
  executionCount: 0,
  currentExecution: null,
  activeRun: null,
  activeRuns: [],
  lastRun: null,
};

describe('form model (UC-01, UC-09)', () => {
  it('new form: the phase 2 spec defaults (every 30 minutes, Asia/Ho_Chi_Minh, no repo chosen, Claude opus / medium, empty timeout = no limit)', () => {
    expect(toBody({ ...emptyValues(), name: 'a', prompt: 'b' })).toEqual({
      name: 'a',
      description: '',
      prompt: 'b',
      cron: '*/30 * * * *',
      timezone: TZ,
      timeoutSec: null,
      maxConcurrent: 1,
      executor: { kind: 'claude', config: { model: 'opus', effort: 'medium' } },
    });
  });

  it('choose a repo + Claude haiku / low + timeout 600 -> the right request body; reopening a Claude loop gives the right fields', () => {
    const body = toBody({ ...emptyValues(), repoId: FAKE_REPO.id, name: 'a', prompt: 'b', model: 'haiku', effort: 'low', timeoutSec: '600' });
    expect(body).toMatchObject({ repoId: FAKE_REPO.id, timeoutSec: 600, executor: { kind: 'claude', config: { model: 'haiku', effort: 'low' } } });
    const v = valuesFromLoop({ ...LOOP, timeoutSec: null, executor: { kind: 'claude', config: { model: 'sonnet', effort: 'max' } } });
    expect([v.executorKind, v.model, v.effort, v.timeoutSec]).toEqual(['claude', 'sonnet', 'max', '']);
  });

  it('opening a saved loop and saving it unchanged -> every field the same', () => {
    const body = toBody(valuesFromLoop(LOOP));
    expect(body).toEqual({ repoId: FAKE_REPO.id, name: LOOP.name, description: LOOP.description, prompt: LOOP.prompt, cron: LOOP.cron, timezone: TZ, timeoutSec: 900, maxConcurrent: 1, executor: LOOP.executor });
  });

  it('maximum parallel runs: default 1; opening a loop with N = 3 gives field "3" and saves 3; empty -> 1; text -> 0 (the server reports out of range at the field); a server error -> field maxConcurrent; a different N is a different part on conflict', () => {
    expect(emptyValues().maxConcurrent).toBe('1');
    const v = valuesFromLoop({ ...LOOP, maxConcurrent: 3 });
    expect(v.maxConcurrent).toBe('3');
    expect(toBody(v).maxConcurrent).toBe(3);
    expect(toBody({ ...v, maxConcurrent: ' ' }).maxConcurrent).toBe(1);
    expect(toBody({ ...v, maxConcurrent: 'three' }).maxConcurrent).toBe(0);
    expect(errorsFromIssues([{ field: 'maxConcurrent', code: 'outOfRange', message: 'x' }]).errors).toEqual({ maxConcurrent: 'val.maxConcurrentRange' });
    expect(changedParts(LOOP, { ...LOOP, maxConcurrent: 2 })).toEqual(['maxConcurrent']);
  });

  it('empty timeout = no limit (null); text -> 0 so the server reports the error at the field; a Mock field with text -> NaN (never silently the default)', () => {
    expect(toBody({ ...emptyValues(), timeoutSec: '' }).timeoutSec).toBeNull();
    expect(toBody({ ...emptyValues(), timeoutSec: 'abc' }).timeoutSec).toBe(0);
    const body = toBody({ ...emptyValues(), executorKind: 'mock', failRate: 'abc' });
    expect((body.executor?.config as { failRate: number }).failRate).toBeNaN();
  });

  it('server error -> field + sentence translated by code; an odd field goes to `rest`', () => {
    const { errors, rest } = errorsFromIssues([
      { field: 'name', code: 'required', message: 'x' },
      { field: 'repoId', code: 'unknownRepo', message: 'x' },
      { field: 'prompt', code: 'tooLong', message: 'x' },
      { field: 'timeoutSec', code: 'outOfRange', message: 'x' },
      { field: 'executor.config.failRate', code: 'invalid', message: 'x' },
      { field: 'executor.config.durationSec', code: 'invalid', message: 'x' },
      { field: 'cron', code: 'invalid', message: 'x' },
      { field: 'version', code: 'required', message: 'x' },
    ]);
    expect(errors).toEqual({
      name: 'val.required',
      repo: 'val.repoRequired',
      prompt: 'val.promptTooLong',
      timeoutSec: 'val.timeoutRangeOptional',
      failRate: 'val.failRange',
      durationSec: 'val.durRange',
      schedule: 'error.INVALID_CRON',
    });
    expect(rest.map((i) => i.field)).toEqual(['version']);
  });

  it('conflict: shows the part that differs between the two versions', () => {
    expect(changedParts(LOOP, { ...LOOP, prompt: 'other', cron: '*/15 * * * *' })).toEqual(['prompt', 'schedule']);
    expect(changedParts(LOOP, { ...LOOP, executor: { kind: 'mock', config: { durationSec: 100, failRate: 6 } } })).toEqual(['executor']);
  });
});

describe('time zone', () => {
  it('Asia/Ho_Chi_Minh has exactly one row even though the browser calls it Asia/Saigon; the label carries the UTC offset', async () => {
    const { tzOptions, tzLabel } = await import('./time-zones');
    const zones = tzOptions(TZ);
    expect(zones.filter((z) => z === TZ)).toHaveLength(1);
    expect(zones).not.toContain('Asia/Saigon');
    expect(zones).toContain('UTC');
    expect(tzLabel(TZ, NOW)).toBe('Asia/Ho_Chi_Minh (UTC+07:00)');
    expect(tzLabel('America/New_York', NOW)).toBe('America/New_York (UTC-04:00)');
  });
});
