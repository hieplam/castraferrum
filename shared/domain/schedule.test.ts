// Table tests for the schedule domain. Fixed reference point: Sunday 18 Oct 2026 09:00 Vietnam time (02:00 UTC).
// Vietnamese expectations are read from shared/i18n/vi.ts (golden tables and sentence builders), never typed here.
import cronstrue from 'cronstrue';
import { describe as group, expect, test } from 'vitest';
import { viAdvancedGolden, viSchedule, viScheduleGolden } from '../i18n/vi';
import {
  describe,
  fromCron,
  isValidTimeZone,
  nextRuns,
  normalizeSpec,
  preview,
  ScheduleSpecError,
  toCron,
  validate,
  validateSpec,
  warnings,
  type ScheduleSpec,
} from './schedule';

const VN = 'Asia/Ho_Chi_Minh';
const FROM = new Date('2026-10-18T02:00:00Z'); // Sun 18 Oct 2026 09:00 in Vietnam

/** "YYYY-MM-DD HH:mm" in the local time of `tz`. */
function local(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}
const runs = (cron: string, tz = VN, from = FROM, n = 5) => nextRuns(cron, tz, from, n).map((d) => local(d, tz));
const codes = (cron: string) => warnings(cron).map((w) => w.code);

// ------------------------------------------------------------------ every choice of the schedule builder

type Row = {
  name: string;
  spec: ScheduleSpec;
  cron: string;
  en: string;
  next: string[];
  warn?: string[];
};

const BUILDER: Row[] = [
  {
    name: 'every 15 minutes (spec example)',
    spec: { kind: 'everyMinutes', minutes: 15 },
    cron: '*/15 * * * *',
    en: 'Every 15 minutes',
    next: ['2026-10-18 09:15', '2026-10-18 09:30', '2026-10-18 09:45', '2026-10-18 10:00', '2026-10-18 10:15'],
  },
  {
    name: 'every minute (lower bound N = 1)',
    spec: { kind: 'everyMinutes', minutes: 1 },
    cron: '*/1 * * * *',
    en: 'Every minute',
    next: ['2026-10-18 09:01', '2026-10-18 09:02', '2026-10-18 09:03', '2026-10-18 09:04', '2026-10-18 09:05'],
  },
  {
    name: 'every 59 minutes (upper bound N = 59, uneven at the end of the hour)',
    spec: { kind: 'everyMinutes', minutes: 59 },
    cron: '*/59 * * * *',
    en: 'Every 59 minutes',
    next: ['2026-10-18 09:59', '2026-10-18 10:00', '2026-10-18 10:59', '2026-10-18 11:00', '2026-10-18 11:59'],
    warn: ['unevenMinuteStep'],
  },
  {
    name: 'every 2 hours at minute 05 (spec example)',
    spec: { kind: 'everyHours', hours: 2, minute: 5 },
    cron: '5 */2 * * *',
    en: 'Every 2 hours, at minute 05',
    next: ['2026-10-18 10:05', '2026-10-18 12:05', '2026-10-18 14:05', '2026-10-18 16:05', '2026-10-18 18:05'],
  },
  {
    name: 'every hour at minute 00 (N = 1)',
    spec: { kind: 'everyHours', hours: 1, minute: 0 },
    cron: '0 */1 * * *',
    en: 'Every hour, at minute 00',
    next: ['2026-10-18 10:00', '2026-10-18 11:00', '2026-10-18 12:00', '2026-10-18 13:00', '2026-10-18 14:00'],
  },
  {
    name: 'every 23 hours at minute 59 (upper bound, uneven at the end of the day)',
    spec: { kind: 'everyHours', hours: 23, minute: 59 },
    cron: '59 */23 * * *',
    en: 'Every 23 hours, at minute 59',
    next: ['2026-10-18 23:59', '2026-10-19 00:59', '2026-10-19 23:59', '2026-10-20 00:59', '2026-10-20 23:59'],
    warn: ['unevenHourStep'],
  },
  {
    name: 'daily at 08:30 (spec example)',
    spec: { kind: 'daily', hour: 8, minute: 30 },
    cron: '30 8 * * *',
    en: 'Every day at 08:30',
    next: ['2026-10-19 08:30', '2026-10-20 08:30', '2026-10-21 08:30', '2026-10-22 08:30', '2026-10-23 08:30'],
  },
  {
    name: 'daily at 00:00 (lower bound)',
    spec: { kind: 'daily', hour: 0, minute: 0 },
    cron: '0 0 * * *',
    en: 'Every day at 00:00',
    next: ['2026-10-19 00:00', '2026-10-20 00:00', '2026-10-21 00:00', '2026-10-22 00:00', '2026-10-23 00:00'],
  },
  {
    name: 'daily at 23:59 (upper bound)',
    spec: { kind: 'daily', hour: 23, minute: 59 },
    cron: '59 23 * * *',
    en: 'Every day at 23:59',
    next: ['2026-10-18 23:59', '2026-10-19 23:59', '2026-10-20 23:59', '2026-10-21 23:59', '2026-10-22 23:59'],
  },
  {
    name: 'Mon, Wed, Fri at 08:30 (UC-02)',
    spec: { kind: 'weekly', days: [1, 3, 5], hour: 8, minute: 30 },
    cron: '30 8 * * 1,3,5',
    en: 'At 08:30 on Monday, Wednesday, Friday',
    next: ['2026-10-19 08:30', '2026-10-21 08:30', '2026-10-23 08:30', '2026-10-26 08:30', '2026-10-28 08:30'],
  },
  {
    name: 'Sat + Sun at 10:00 (Sunday = 0, the sentence orders Monday first)',
    spec: { kind: 'weekly', days: [0, 6], hour: 10, minute: 0 },
    cron: '0 10 * * 0,6',
    en: 'At 10:00 on Saturday, Sunday',
    next: ['2026-10-18 10:00', '2026-10-24 10:00', '2026-10-25 10:00', '2026-10-31 10:00', '2026-11-01 10:00'],
  },
  {
    name: 'all 7 weekdays',
    spec: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], hour: 9, minute: 0 },
    cron: '0 9 * * 0,1,2,3,4,5,6',
    en: 'At 09:00 on Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday',
    next: ['2026-10-19 09:00', '2026-10-20 09:00', '2026-10-21 09:00', '2026-10-22 09:00', '2026-10-23 09:00'],
  },
  {
    name: 'day 1 of every month at 09:00 (spec example)',
    spec: { kind: 'monthly', day: 1, hour: 9, minute: 0 },
    cron: '0 9 1 * *',
    en: 'On day 1 of every month at 09:00',
    next: ['2026-11-01 09:00', '2026-12-01 09:00', '2027-01-01 09:00', '2027-02-01 09:00', '2027-03-01 09:00'],
  },
  {
    name: 'day 28 - no warning',
    spec: { kind: 'monthly', day: 28, hour: 7, minute: 15 },
    cron: '15 7 28 * *',
    en: 'On day 28 of every month at 07:15',
    next: ['2026-10-28 07:15', '2026-11-28 07:15', '2026-12-28 07:15', '2027-01-28 07:15', '2027-02-28 07:15'],
  },
  {
    name: 'day 29 - February 2027 has none, skipped',
    spec: { kind: 'monthly', day: 29, hour: 9, minute: 0 },
    cron: '0 9 29 * *',
    en: 'On day 29 of every month at 09:00',
    next: ['2026-10-29 09:00', '2026-11-29 09:00', '2026-12-29 09:00', '2027-01-29 09:00', '2027-03-29 09:00'],
    warn: ['missingMonthDay'],
  },
  {
    name: 'day 31 - only months with 31 days',
    spec: { kind: 'monthly', day: 31, hour: 9, minute: 0 },
    cron: '0 9 31 * *',
    en: 'On day 31 of every month at 09:00',
    next: ['2026-10-31 09:00', '2026-12-31 09:00', '2027-01-31 09:00', '2027-03-31 09:00', '2027-05-31 09:00'],
    warn: ['missingMonthDay'],
  },
  {
    name: 'Advanced: Mon-Fri at 09:00 (cronstrue)',
    spec: { kind: 'advanced', cron: '0 9 * * 1-5' },
    cron: '0 9 * * 1-5',
    en: 'At 09:00, Monday through Friday',
    next: ['2026-10-19 09:00', '2026-10-20 09:00', '2026-10-21 09:00', '2026-10-22 09:00', '2026-10-23 09:00'],
  },
];

group('schedule builder -> cron + sentence + 5 next runs + warnings', () => {
  test.each(BUILDER)('$name', ({ spec, cron, en, next, warn }) => {
    expect(toCron(spec)).toBe(cron);
    expect(describe(spec)).toBe(en); // English is the default locale
    expect(describe(spec, 'en')).toBe(en);
    expect(describe(spec, 'vi')).toBe(viScheduleGolden[cron]);
    expect(describe(cron)).toBe(en); // reopened from the database it reads the same as when built
    expect(runs(cron)).toEqual(next);
    expect(codes(cron)).toEqual(warn ?? []);
    expect(fromCron(cron)).toEqual(normalizeSpec(spec)); // round-trip build -> cron -> build
  });

  test('weekdays picked out of order or twice -> cron sorted ascending, round-trip gives the normalised set', () => {
    const spec: ScheduleSpec = { kind: 'weekly', days: [5, 1, 3, 1], hour: 8, minute: 30 };
    expect(toCron(spec)).toBe('30 8 * * 1,3,5');
    expect(fromCron(toCron(spec))).toEqual({ kind: 'weekly', days: [1, 3, 5], hour: 8, minute: 30 });
  });

  test('every 7 minutes: the 5 next runs show the 4-minute gap at the end of the hour', () => {
    const spec: ScheduleSpec = { kind: 'everyMinutes', minutes: 7 };
    expect(runs(toCron(spec), VN, new Date('2026-10-18T02:50:00Z'))).toEqual([
      '2026-10-18 09:56',
      '2026-10-18 10:00',
      '2026-10-18 10:07',
      '2026-10-18 10:14',
      '2026-10-18 10:21',
    ]);
    expect(warnings(toCron(spec))[0]!.message).toBe(
      'Uneven gap at the end of each hour: every 7 minutes, but 60 is not divisible by 7, so each hour restarts at :00',
    );
    expect(warnings(toCron(spec), 'vi')[0]!.message).toBe(viSchedule.unevenMinuteStep(7));
  });
});

// ------------------------------------------------------------------ odd / hand-typed cron -> the right kind or Advanced

group('fromCron: matches a kind or falls back to Advanced', () => {
  test.each([
    ['extra spaces', '  30   8 * * 1,3,5 ', { kind: 'weekly', days: [1, 3, 5], hour: 8, minute: 30 }],
    ['leading zero (08)', '30 08 * * *', { kind: 'daily', hour: 8, minute: 30 }],
    ['weekday 7 = Sunday', '0 9 * * 7', { kind: 'weekly', days: [0], hour: 9, minute: 0 }],
    ['weekdays 0 and 7 merge', '0 9 * * 0,7', { kind: 'weekly', days: [0], hour: 9, minute: 0 }],
    ['weekdays out of order', '0 9 * * 5,1,3', { kind: 'weekly', days: [1, 3, 5], hour: 9, minute: 0 }],
    ['every hour */1', '0 */1 * * *', { kind: 'everyHours', hours: 1, minute: 0 }],
  ] as const)('%s: "%s"', (_name, cron, spec) => {
    expect(fromCron(cron)).toEqual(spec);
  });

  test.each([
    ['* * * * *', 'every minute - not text the builder produces'],
    ['0 9 * * 1-5', 'weekday range'],
    ['0 9 * * MON', 'weekday name'],
    ['0 9 13 * 5', 'day + weekday together'],
    ['0 9 1 1 *', 'month restriction'],
    ['*/60 * * * *', 'N outside 1-59'],
    ['0 */24 * * *', 'N outside 1-23'],
    ['0,30 * * * *', 'list of minutes'],
    ['0 9 L * *', 'last day of the month'],
    ['5 */2 1 * *', 'every N hours but only on day 1'],
    ['0 0 * * * *', '6 fields'],
    ['60 9 * * *', 'an invalid cron keeps its text'],
    ['0 0 32 * *', 'day 32'],
    ['abc', 'garbage'],
  ])('"%s" (%s) -> Advanced, text kept', (cron) => {
    expect(fromCron(cron)).toEqual({ kind: 'advanced', cron });
  });

  test('a cron that matches a kind but is written differently: toCron(fromCron(c)) is the same schedule as c', () => {
    for (const cron of ['30 08 * * *', '0 9 * * 7', '0 9 * * 0,7', '0 9 * * 5,1,3', '05 */02 * * *', '0 9 07 * *']) {
      const back = toCron(fromCron(cron));
      expect(fromCron(cron).kind).not.toBe('advanced');
      expect(runs(back, VN, FROM, 10)).toEqual(runs(cron, VN, FROM, 10));
    }
  });

  test('round-trip of every valid choice of the numeric cells (build -> cron -> build)', () => {
    const specs: ScheduleSpec[] = [];
    for (let n = 1; n <= 59; n++) specs.push({ kind: 'everyMinutes', minutes: n });
    for (let h = 1; h <= 23; h++) specs.push({ kind: 'everyHours', hours: h, minute: (h * 7) % 60 });
    for (let h = 0; h <= 23; h++) specs.push({ kind: 'daily', hour: h, minute: (h * 11) % 60 });
    for (let d = 1; d <= 31; d++) specs.push({ kind: 'monthly', day: d, hour: d % 24, minute: d });
    for (let mask = 1; mask < 128; mask++) {
      const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << d)) as (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
      specs.push({ kind: 'weekly', days, hour: 8, minute: 30 });
    }
    for (const spec of specs) expect(fromCron(toCron(spec))).toEqual(spec);
    expect(specs).toHaveLength(59 + 23 + 24 + 31 + 127);
  });
});

// ------------------------------------------------------------------ validation

group('validate: 5 fields only, the error names the wrong field', () => {
  test.each([
    ['', 'empty', undefined, 'Enter a cron expression'],
    ['   ', 'empty', undefined, 'Enter a cron expression'],
    ['@daily', 'alias', undefined, 'Shorthand @daily is not supported — type all 5 fields: minute hour day month weekday'],
    ['* * * *', 'fieldCount', undefined, 'A cron expression needs exactly 5 fields (minute hour day month weekday), got 4'],
    ['0 * * * * *', 'fieldCount', undefined, 'A cron expression needs exactly 5 fields (minute hour day month weekday), got 6'],
    ['60 * * * *', 'field', 'minute', 'Invalid minute field: "60" (accepts 0–59)'],
    ['*/0 * * * *', 'field', 'minute', 'Invalid minute field: "*/0" (accepts 0–59)'],
    ['0 24 * * *', 'field', 'hour', 'Invalid hour field: "24" (accepts 0–23)'],
    ['0 0 0 * *', 'field', 'dayOfMonth', 'Invalid day of month field: "0" (accepts 1–31)'],
    ['0 0 ? * 1', 'field', 'dayOfMonth', 'Invalid day of month field: "?" (accepts 1–31)'],
    ['0 0 * 13 *', 'field', 'month', 'Invalid month field: "13" (accepts 1–12 or JAN–DEC)'],
    ['0 0 * * 8', 'field', 'dayOfWeek', 'Invalid day of week field: "8" (accepts 0–7 (0 and 7 = Sunday) or SUN–SAT)'],
    ['0 0 31 2 *', 'never', undefined, 'This schedule never runs (e.g. February 31)'],
  ])('"%s" -> %s', (cron, code, field, message) => {
    const r = validate(cron);
    expect(r).toEqual({ ok: false, error: field ? { code, field, message } : { code, message } });
  });

  test.each([
    [' 0  9 * *  * ', '0 9 * * *'],
    ['0 0 29 2 *', '0 0 29 2 *'], // leap years only, but it still has runs
    ['0 9 * * MON-FRI', '0 9 * * MON-FRI'],
    ['0 0 L * *', '0 0 L * *'],
  ])('"%s" is valid -> %s', (cron, norm) => {
    expect(validate(cron)).toEqual({ ok: true, cron: norm });
  });

  test('the same errors in Vietnamese come from vi.ts', () => {
    expect(validate('0 24 * * *', 'vi')).toEqual({
      ok: false,
      error: { code: 'field', field: 'hour', message: viSchedule.field(viSchedule.fieldName.hour, '24', viSchedule.fieldHint.hour) },
    });
    const text = (cron: string) => {
      const r = validate(cron, 'vi');
      return r.ok ? '' : r.error.message;
    };
    expect(text('')).toBe(viSchedule.empty);
    expect(text('@daily')).toBe(viSchedule.alias('@daily'));
    expect(text('* * * *')).toBe(viSchedule.fieldCount(4));
    expect(text('0 0 31 2 *')).toBe(viSchedule.never);
  });

  test('every error has an English text and one in the other language', () => {
    const en = (cron: string) => {
      const r = validate(cron, 'en');
      return r.ok ? '' : r.error.message;
    };
    expect(en('')).toBe('Enter a cron expression');
    expect(en('@hourly')).toBe('Shorthand @hourly is not supported — type all 5 fields: minute hour day month weekday');
    expect(en('* *')).toBe('A cron expression needs exactly 5 fields (minute hour day month weekday), got 2');
    expect(en('0 0 30 2 *')).toBe('This schedule never runs (e.g. February 31)');
    expect(validateSpec({ kind: 'weekly', days: [], hour: 8, minute: 0 }, 'en')[0]!.message).toBe(
      'Pick at least one day of the week',
    );
    const p = preview({ kind: 'everyMinutes', minutes: 5 }, { tz: 'Nowhere/City', from: FROM, locale: 'en' });
    expect(!p.ok && p.errors[0]!.message).toBe(
      'Invalid time zone: "Nowhere/City" (use an IANA name, e.g. Asia/Ho_Chi_Minh)',
    );
    expect(warnings('*/7 * * * *', 'en')[0]!.message).toBe(
      'Uneven gap at the end of each hour: every 7 minutes, but 60 is not divisible by 7, so each hour restarts at :00',
    );
  });

  test('croner accepts 6 fields (seconds first) - we still block them, in nextRuns too', () => {
    expect(() => nextRuns('0 0 9 * * *', VN, FROM, 1)).toThrow('exactly 5 fields');
  });
});

group('validateSpec + toCron: cells out of range', () => {
  test.each([
    [{ kind: 'everyMinutes', minutes: 0 }, 'minutes', 'minutes must be a whole number from 1 to 59'],
    [{ kind: 'everyMinutes', minutes: 60 }, 'minutes', 'minutes must be a whole number from 1 to 59'],
    [{ kind: 'everyMinutes', minutes: 1.5 }, 'minutes', 'minutes must be a whole number from 1 to 59'],
    [{ kind: 'everyHours', hours: 24, minute: 0 }, 'hours', 'hours must be a whole number from 1 to 23'],
    [{ kind: 'everyHours', hours: 2, minute: 60 }, 'minute', 'minute must be a whole number from 0 to 59'],
    [{ kind: 'daily', hour: -1, minute: 0 }, 'hour', 'hour must be a whole number from 0 to 23'],
    [{ kind: 'weekly', days: [], hour: 8, minute: 0 }, 'days', 'Pick at least one day of the week'],
    [{ kind: 'weekly', days: [7], hour: 8, minute: 0 }, 'days', 'days must be a whole number from 0 to 6'],
    [{ kind: 'monthly', day: 0, hour: 9, minute: 0 }, 'day', 'day must be a whole number from 1 to 31'],
    [{ kind: 'monthly', day: 32, hour: 9, minute: 0 }, 'day', 'day must be a whole number from 1 to 31'],
    [{ kind: 'advanced', cron: '0 24 * * *' }, 'hour', 'Invalid hour field: "24" (accepts 0–23)'],
  ] as [ScheduleSpec, string, string][])('%o -> error at cell %s', (spec, field, message) => {
    expect(validateSpec(spec)).toEqual([expect.objectContaining({ field, message })]);
    expect(() => toCron(spec)).toThrow(ScheduleSpecError);
    expect(describe(spec)).toBe(message);
  });

  test('several wrong cells at once -> one error each, in Vietnamese too', () => {
    const errors = validateSpec({ kind: 'monthly', day: 40, hour: 25, minute: 61 }, 'en');
    expect(errors.map((e) => e.field)).toEqual(['day', 'hour', 'minute']);
    expect(errors[0]!.message).toBe('day must be a whole number from 1 to 31');
    const vn = validateSpec({ kind: 'monthly', day: 40, hour: 25, minute: 61 }, 'vi');
    expect(vn[0]!.message).toBe(viSchedule.range(viSchedule.fieldName.day, 1, 31));
  });
});

// ------------------------------------------------------------------ warnings

group('warnings', () => {
  test.each([
    ['*/15 * * * *', []],
    ['*/7 * * * *', ['unevenMinuteStep']],
    ['0 */5 * * *', ['unevenHourStep']],
    ['0 */6 * * *', []],
    ['0 9 30 * *', ['missingMonthDay']],
    ['0 9 1,15,31 * *', ['missingMonthDay']],
    ['0 9 13 * 5', ['dayOrWeekday']],
    ['0 9 */2 * 1', ['dayOrWeekday']], // croner applies OR even with */2
    ['61 * * * *', []], // invalid cron: no warning, only the error
  ])('"%s" -> %o', (cron, expected) => {
    expect(codes(cron)).toEqual(expected);
  });

  test('warning sentences per language', () => {
    expect(warnings('0 9 30 * *')[0]!.message).toBe('Months without day 30 will be skipped');
    expect(warnings('0 9 30 * *', 'vi')[0]!.message).toBe(viSchedule.missingMonthDay(30));
    expect(warnings('0 */5 * * *', 'en')[0]!.message).toContain('every 5 hours');
    expect(warnings('0 9 13 * 5')[0]!.message).toContain('EITHER');
    expect(warnings('0 9 13 * 5', 'vi')[0]!.message).toBe(viSchedule.dayOrWeekday);
  });
});

// ------------------------------------------------------------------ next runs + time zones

group('nextRuns: time zones, edges, day + weekday', () => {
  test('daily 08:30: Asia/Ho_Chi_Minh is 01:30 UTC, UTC is 08:30 UTC', () => {
    const from = new Date('2026-10-18T00:00:00Z');
    expect(nextRuns('30 8 * * *', VN, from, 2).map((d) => d.toISOString())).toEqual([
      '2026-10-18T01:30:00.000Z',
      '2026-10-19T01:30:00.000Z',
    ]);
    expect(nextRuns('30 8 * * *', 'UTC', from, 2).map((d) => d.toISOString())).toEqual([
      '2026-10-18T08:30:00.000Z',
      '2026-10-19T08:30:00.000Z',
    ]);
  });

  test('does not count `from` itself, but counts the run right after it', () => {
    const at = new Date('2026-10-18T01:30:00Z'); // exactly 08:30 in Vietnam
    expect(nextRuns('30 8 * * *', VN, at, 1)[0]!.toISOString()).toBe('2026-10-19T01:30:00.000Z');
    expect(nextRuns('30 8 * * *', VN, new Date(at.getTime() - 1), 1)[0]!.toISOString()).toBe('2026-10-18T01:30:00.000Z');
  });

  test('New York at the start of daylight saving (8 Mar 2026): 02:30 does not exist -> runs at 03:30', () => {
    const ny = 'America/New_York';
    expect(runs('30 2 * * *', ny, new Date('2026-03-07T00:00:00Z'), 3)).toEqual([
      '2026-03-07 02:30',
      '2026-03-08 03:30',
      '2026-03-09 02:30',
    ]);
  });

  test('New York back to standard time (1 Nov 2026): 01:30 repeats -> runs once', () => {
    const got = nextRuns('30 1 * * *', 'America/New_York', new Date('2026-10-31T12:00:00Z'), 2);
    expect(got.map((d) => d.toISOString())).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z']);
  });

  test('weekday 0 and weekday 7 are both Sunday', () => {
    expect(runs('0 9 * * 7')).toEqual(runs('0 9 * * 0'));
    expect(runs('0 9 * * 7', VN, FROM, 2)).toEqual(['2026-10-25 09:00', '2026-11-01 09:00']);
  });

  test('day + weekday together: runs when the day is the 13th OR a Friday (croner default OR)', () => {
    expect(runs('0 9 13 * 5', VN, FROM, 6)).toEqual([
      '2026-10-23 09:00',
      '2026-10-30 09:00',
      '2026-11-06 09:00',
      '2026-11-13 09:00', // both the 13th and a Friday
      '2026-11-20 09:00',
      '2026-11-27 09:00',
    ]);
    expect(runs('0 9 13 * 5', VN, new Date('2026-11-28T00:00:00Z'), 3)).toEqual([
      '2026-12-04 09:00',
      '2026-12-11 09:00',
      '2026-12-13 09:00', // the 13th is a Sunday and still runs
    ]);
  });

  test('n = 0 -> empty; a bad n, cron or time zone throws', () => {
    expect(nextRuns('*/5 * * * *', VN, FROM, 0)).toEqual([]);
    expect(() => nextRuns('*/5 * * * *', VN, FROM, -1)).toThrow('n must be a whole number');
    expect(() => nextRuns('60 * * * *', VN, FROM, 5)).toThrow('Invalid minute field');
    expect(() => nextRuns('*/5 * * * *', 'Mars/Olympus', FROM, 5)).toThrow('Invalid time zone');
  });

  test.each([
    ['Asia/Ho_Chi_Minh', true],
    ['UTC', true],
    ['America/New_York', true],
    ['Mars/Olympus', false],
    ['', false],
  ])('isValidTimeZone("%s") = %s', (tz, ok) => {
    expect(isValidTimeZone(tz)).toBe(ok);
  });
});

// ------------------------------------------------------------------ Advanced sentences + the form preview

group('describe Advanced + preview', () => {
  test.each([
    ['*/30 9-17 * * 1-5', 'Every 30 minutes, between 09:00 and 17:59, Monday through Friday'],
    ['0 0 L * *', 'At 00:00, on the last day of the month'],
    ['* * * * *', 'Every minute'],
  ])('"%s" -> cronstrue en', (cron, en) => {
    expect(describe(cron)).toBe(en);
    expect(describe(cron, 'en')).toBe(en);
  });

  // Issue cronstrue's stock `vi` locale is clumsy and misstates the day/weekday OR rule. Column 3 is the stock
  // sentence (to show it was replaced); the golden table lives in vi.ts.
  test.each(viAdvancedGolden)('"%s" -> natural Vietnamese sentence', (cron, vi, cronstrueVi) => {
    expect(describe(cron, 'vi')).toBe(vi);
    if (cronstrueVi !== '') {
      expect(cronstrue.toString(cron, { locale: 'vi', use24HourTimeFormat: true })).toBe(cronstrueVi);
    }
  });

  test('day + weekday together: the sentence says OR, matching the dayOrWeekday warning and the real runs', () => {
    expect(codes('0 0 13 * 5')).toEqual(['dayOrWeekday']);
    expect(describe('0 0 13 * 5', 'vi')).toContain(viSchedule.weekday[5]);
    expect(describe('0 0 13 * 5', 'en')).toBe('At 00:00, on day 13 of the month, and on Friday');
  });

  test('weekday names in the Advanced sentence equal the hand-written ones', () => {
    for (const [d, name] of viSchedule.weekday.entries()) {
      expect(describe(`0 9 13 * ${d}`, 'vi').endsWith(name)).toBe(true);
    }
  });

  test('an invalid cron -> the description is the error sentence', () => {
    expect(describe('0 9 * *')).toBe('A cron expression needs exactly 5 fields (minute hour day month weekday), got 4');
    expect(describe('0 9 * *', 'vi')).toBe(viSchedule.fieldCount(4));
  });

  test('preview gathers cron + sentence + 5 runs + warnings (UC-02)', () => {
    const p = preview({ kind: 'weekly', days: [1, 3, 5], hour: 8, minute: 30 }, { tz: VN, from: FROM });
    expect(p.ok && p.cron).toBe('30 8 * * 1,3,5');
    expect(p.ok && p.description).toBe('At 08:30 on Monday, Wednesday, Friday');
    expect(p.ok && p.nextRuns.map((d) => local(d, VN))).toEqual(BUILDER[9]!.next);
    expect(p.ok && p.warnings).toEqual([]);
    const vn = preview({ kind: 'weekly', days: [1, 3, 5], hour: 8, minute: 30 }, { tz: VN, from: FROM, locale: 'vi' });
    expect(vn.ok && vn.description).toBe(viScheduleGolden['30 8 * * 1,3,5']);
    const en = preview({ kind: 'monthly', day: 31, hour: 9, minute: 0 }, { tz: 'UTC', from: FROM, locale: 'en', count: 2 });
    expect(en.ok && en.nextRuns.map((d) => d.toISOString())).toEqual(['2026-10-31T09:00:00.000Z', '2026-12-31T09:00:00.000Z']);
    expect(en.ok && en.warnings.map((w) => w.message)).toEqual(['Months without day 31 will be skipped']);
  });

  test('preview with errors: collects cell errors and the time zone, never throws', () => {
    const p = preview({ kind: 'daily', hour: 24, minute: 0 }, { tz: 'Nowhere/City', from: FROM });
    expect(p).toEqual({
      ok: false,
      errors: [
        { code: 'range', field: 'hour', message: 'hour must be a whole number from 0 to 23' },
        { code: 'timezone', field: 'timezone', message: 'Invalid time zone: "Nowhere/City" (use an IANA name, e.g. Asia/Ho_Chi_Minh)' },
      ],
    });
  });
});
