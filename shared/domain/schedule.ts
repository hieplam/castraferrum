// Schedule domain (spec section "Schedules a human can read"): builder <-> cron, description sentence, next runs,
// validation. Pure functions shared by the server and the browser: only imports croner + cronstrue, no Node module.
// English is the default locale; the Vietnamese texts live in shared/i18n/vi.ts.
import { Cron } from 'croner';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/vi.js';
import { viCronMonth, viCronPhrases, viSchedule } from '../i18n/vi';

export type Locale = 'en' | 'vi';

/** 0 = Sunday ... 6 = Saturday (cron also accepts 7 = Sunday; `fromCron` maps 7 to 0). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The six kinds of the schedule builder. Cron is only the storage format - see the table in the spec. */
export type ScheduleSpec =
  | { kind: 'everyMinutes'; minutes: number } // */N * * * *       N = 1-59
  | { kind: 'everyHours'; hours: number; minute: number } // M */N * * *  N = 1-23
  | { kind: 'daily'; hour: number; minute: number } // MM HH * * *
  | { kind: 'weekly'; days: Weekday[]; hour: number; minute: number } // MM HH * * 1,3,5
  | { kind: 'monthly'; day: number; hour: number; minute: number } // MM HH D * *       D = 1-31
  | { kind: 'advanced'; cron: string }; // typed by hand

export type ScheduleKind = ScheduleSpec['kind'];

export type ScheduleErrorCode =
  | 'empty' // empty cron
  | 'alias' // @daily, @hourly...
  | 'fieldCount' // not exactly 5 fields
  | 'field' // one field is wrong
  | 'syntax' // wrong, but no single field can be blamed
  | 'never' // valid but never runs (31/2)
  | 'range' // a builder cell is out of range
  | 'timezone'; // time zone is not an IANA name

/** Cron field name (when code = 'field') or builder cell name (when code = 'range'). */
export type ScheduleField =
  | 'minute'
  | 'hour'
  | 'dayOfMonth'
  | 'month'
  | 'dayOfWeek'
  | 'minutes'
  | 'hours'
  | 'day'
  | 'days'
  | 'timezone';

export type ScheduleError = { code: ScheduleErrorCode; field?: ScheduleField; message: string };

export type ScheduleWarningCode =
  | 'unevenMinuteStep' // every N minutes, 60 is not divisible by N
  | 'unevenHourStep' // every N hours, 24 is not divisible by N
  | 'missingMonthDay' // day 29-31
  | 'dayOrWeekday'; // day + weekday both restricted -> runs when EITHER matches (OR)

export type ScheduleWarning = { code: ScheduleWarningCode; message: string };

export type ValidateResult = { ok: true; cron: string } | { ok: false; error: ScheduleError };

export class ScheduleSpecError extends Error {
  constructor(readonly errors: ScheduleError[]) {
    super(errors.map((e) => e.message).join('; '));
    this.name = 'ScheduleSpecError';
  }
}

// ---------------------------------------------------------------- texts (English here, Vietnamese in vi.ts)

const CRON_FIELDS = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const;

const en = {
  fieldName: {
    minute: 'minute',
    hour: 'hour',
    dayOfMonth: 'day of month',
    month: 'month',
    dayOfWeek: 'day of week',
    minutes: 'minutes',
    hours: 'hours',
    day: 'day',
    days: 'days',
    timezone: 'time zone',
  },
  fieldHint: {
    minute: '0–59',
    hour: '0–23',
    dayOfMonth: '1–31',
    month: '1–12 or JAN–DEC',
    dayOfWeek: '0–7 (0 and 7 = Sunday) or SUN–SAT',
  },
  empty: 'Enter a cron expression',
  alias: (a: string) => `Shorthand ${a} is not supported — type all 5 fields: minute hour day month weekday`,
  fieldCount: (n: number) => `A cron expression needs exactly 5 fields (minute hour day month weekday), got ${n}`,
  field: (name: string, value: string, hint: string) => `Invalid ${name} field: "${value}" (accepts ${hint})`,
  syntax: 'Invalid cron expression',
  never: 'This schedule never runs (e.g. February 31)',
  range: (name: string, min: number, max: number) => `${name} must be a whole number from ${min} to ${max}`,
  noDays: 'Pick at least one day of the week',
  timezone: (tz: string) => `Invalid time zone: "${tz}" (use an IANA name, e.g. Asia/Ho_Chi_Minh)`,
  weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  everyMinutes: (n: number) => (n === 1 ? 'Every minute' : `Every ${n} minutes`),
  everyHours: (n: number, mm: string) => (n === 1 ? `Every hour, at minute ${mm}` : `Every ${n} hours, at minute ${mm}`),
  daily: (t: string) => `Every day at ${t}`,
  weekly: (t: string, days: string) => `At ${t} on ${days}`,
  monthly: (d: number, t: string) => `On day ${d} of every month at ${t}`,
  unevenMinuteStep: (n: number) =>
    `Uneven gap at the end of each hour: every ${n} minutes, but 60 is not divisible by ${n}, so each hour restarts at :00`,
  unevenHourStep: (n: number) =>
    `Uneven gap at the end of each day: every ${n} hours, but 24 is not divisible by ${n}, so each day restarts at 00:00`,
  missingMonthDay: (d: number) => `Months without day ${d} will be skipped`,
  dayOrWeekday: 'Both day of month and day of week are set: it runs when EITHER matches (not both)',
  nextRunsCount: (n: number) => `n must be a whole number >= 0, got ${n}`,
  // The short form of a builder kind, for one line of a loop row (describeShort).
  short: {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    everyMinutes: (n: number) => (n === 1 ? 'every minute' : `every ${n} min`),
    everyHours: (n: number, mm: string) => (n === 1 ? `every hour at :${mm}` : `every ${n} hours at :${mm}`),
    daily: (t: string) => `every day at ${t}`,
    weekly: (t: string, days: string) => `${days} at ${t}`,
    monthly: (d: number, t: string) => `day ${d} monthly at ${t}`,
  },
};

const TEXT = { en, vi: viSchedule };

// Advanced sentences in Vietnamese: cronstrue's stock `vi` locale is clumsy (see the golden table in vi.ts for the stock
// sentences) and misstates croner's day/weekday OR rule, so the phrases in shared/i18n/vi.ts replace exactly those
//; the weekday names equal the hand-written sentences above.
type CronstrueLocale = (typeof cronstrue.locales)[string];
// Node loads the CJS build through ESM, so `locales` sits on `.default` (the `vi.js` locale file registers there too);
// Vite does not need it.
const cronstrueLocales: typeof cronstrue.locales =
  cronstrue.locales ?? (cronstrue as unknown as { default: typeof cronstrue }).default.locales;
const viBase = cronstrueLocales['vi']!;
const viNatural: CronstrueLocale = Object.assign(Object.create(viBase) as CronstrueLocale, viCronPhrases, {
  daysOfTheWeek: () => [...viSchedule.weekday],
  monthsOfTheYear: () => Array.from({ length: 12 }, (_, i) => viCronMonth(i + 1)),
});
cronstrueLocales['vi-natural'] = viNatural;

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmm = (hour: number, minute: number) => `${pad2(hour)}:${pad2(minute)}`;

/** Normalises whitespace: trims the ends and collapses runs of spaces into one. */
export function normalizeCron(cron: string): string {
  return cron.trim().split(/\s+/).join(' ');
}

// ---------------------------------------------------------------- builder -> cron

/** Errors of each builder cell (empty = valid). The Advanced kind is checked with `validate`. */
export function validateSpec(spec: ScheduleSpec, locale: Locale = 'en'): ScheduleError[] {
  const t = TEXT[locale];
  const errors: ScheduleError[] = [];
  const check = (field: ScheduleField, value: number, min: number, max: number) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push({ code: 'range', field, message: t.range(t.fieldName[field], min, max) });
    }
  };
  switch (spec.kind) {
    case 'everyMinutes':
      check('minutes', spec.minutes, 1, 59);
      break;
    case 'everyHours':
      check('hours', spec.hours, 1, 23);
      check('minute', spec.minute, 0, 59);
      break;
    case 'daily':
      check('hour', spec.hour, 0, 23);
      check('minute', spec.minute, 0, 59);
      break;
    case 'weekly':
      if (spec.days.length === 0) errors.push({ code: 'range', field: 'days', message: t.noDays });
      else if (spec.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        errors.push({ code: 'range', field: 'days', message: t.range(t.fieldName.days, 0, 6) });
      }
      check('hour', spec.hour, 0, 23);
      check('minute', spec.minute, 0, 59);
      break;
    case 'monthly':
      check('day', spec.day, 1, 31);
      check('hour', spec.hour, 0, 23);
      check('minute', spec.minute, 0, 59);
      break;
    case 'advanced': {
      const r = validate(spec.cron, locale);
      if (!r.ok) errors.push(r.error);
      break;
    }
  }
  return errors;
}

/** Distinct weekdays in ascending order - the canonical form for comparing round-trips. */
export function normalizeSpec(spec: ScheduleSpec): ScheduleSpec {
  if (spec.kind === 'weekly') return { ...spec, days: [...new Set(spec.days)].sort((a, b) => a - b) };
  if (spec.kind === 'advanced') return { kind: 'advanced', cron: normalizeCron(spec.cron) };
  return spec;
}

/** The 5-field cron to store. A cell out of range throws `ScheduleSpecError` (check first with `validateSpec`). */
export function toCron(spec: ScheduleSpec): string {
  const errors = validateSpec(spec);
  if (errors.length > 0) throw new ScheduleSpecError(errors);
  switch (spec.kind) {
    case 'everyMinutes':
      return `*/${spec.minutes} * * * *`;
    case 'everyHours':
      return `${spec.minute} */${spec.hours} * * *`;
    case 'daily':
      return `${spec.minute} ${spec.hour} * * *`;
    case 'weekly': {
      const days = (normalizeSpec(spec) as Extract<ScheduleSpec, { kind: 'weekly' }>).days;
      return `${spec.minute} ${spec.hour} * * ${days.join(',')}`;
    }
    case 'monthly':
      return `${spec.minute} ${spec.hour} ${spec.day} * *`;
    case 'advanced':
      return normalizeCron(spec.cron);
  }
}

// ---------------------------------------------------------------- cron -> builder

/** A plain decimal integer of 1-2 digits (a leading zero such as `05` is fine) within [min, max], otherwise null. */
function plainInt(field: string, min: number, max: number): number | null {
  if (!/^\d{1,2}$/.test(field)) return null;
  const n = Number(field);
  return n >= min && n <= max ? n : null;
}

/** `*\/N` with N within [min, max], otherwise null. */
function everyStep(field: string, min: number, max: number): number | null {
  const m = /^\*\/(\d{1,2})$/.exec(field);
  return m ? plainInt(m[1]!, min, max) : null;
}

/**
 * Reopens a stored cron as a builder choice. Only recognises the text the builder produces (plain numbers, weekdays as
 * a list of 0-7, `05` allowed and 7 = Sunday); every other cron - including an invalid one - falls back to the Advanced
 * kind and keeps the typed text. Invariant: kind != Advanced implies `toCron(fromCron(c))` is the same schedule as `c`;
 * `fromCron(toCron(s))` equals `normalizeSpec(s)`.
 */
export function fromCron(cron: string): ScheduleSpec {
  const parts = normalizeCron(cron).split(' ');
  const advanced: ScheduleSpec = { kind: 'advanced', cron: normalizeCron(cron) };
  if (parts.length !== 5) return advanced;
  const [mi, ho, dom, mon, dow] = parts as [string, string, string, string, string];
  if (mon !== '*') return advanced;

  if (ho === '*' && dom === '*' && dow === '*') {
    const minutes = everyStep(mi, 1, 59);
    return minutes === null ? advanced : { kind: 'everyMinutes', minutes };
  }
  const minute = plainInt(mi, 0, 59);
  if (minute === null) return advanced;
  if (dom === '*' && dow === '*') {
    const hours = everyStep(ho, 1, 23);
    if (hours !== null) return { kind: 'everyHours', hours, minute };
  }
  const hour = plainInt(ho, 0, 23);
  if (hour === null) return advanced;
  if (dom === '*' && dow === '*') return { kind: 'daily', hour, minute };
  if (dom === '*') {
    if (!/^[0-7](,[0-7])*$/.test(dow)) return advanced;
    const set = [...new Set(dow.split(',').map((d) => (Number(d) % 7) as Weekday))].sort((a, b) => a - b);
    return { kind: 'weekly', days: set, hour, minute };
  }
  if (dow === '*') {
    const day = plainInt(dom, 1, 31);
    return day === null ? advanced : { kind: 'monthly', day, hour, minute };
  }
  return advanced;
}

// ---------------------------------------------------------------- validation

/**
 * Checks a hand-typed cron expression. Accepts **5 fields** only (croner also takes 6-7 fields with seconds first, and
 * `@daily`) - blocked here first. The error names the wrong field. Valid but never running (31/2) is an error too.
 */
export function validate(cron: string, locale: Locale = 'en'): ValidateResult {
  const t = TEXT[locale];
  const norm = normalizeCron(cron);
  if (norm === '') return { ok: false, error: { code: 'empty', message: t.empty } };
  const parts = norm.split(' ');
  if (parts.length === 1 && norm.startsWith('@')) {
    return { ok: false, error: { code: 'alias', message: t.alias(norm) } };
  }
  if (parts.length !== 5) return { ok: false, error: { code: 'fieldCount', message: t.fieldCount(parts.length) } };

  // Try each field alone (the others are *) to learn which one is wrong. `?` is blocked: croner treats it as "any value"
  // but NOT like `*` in the day/weekday OR rule (`0 0 ? * 1` runs every day) - against the cronstrue sentence ("Mondays only").
  for (const [i, field] of CRON_FIELDS.entries()) {
    const probe = CRON_FIELDS.map((_, j) => (j === i ? parts[i]! : '*')).join(' ');
    if (parts[i]!.includes('?') || !parses(probe)) {
      const error = { code: 'field', field, message: t.field(t.fieldName[field], parts[i]!, t.fieldHint[field]) } as const;
      return { ok: false, error };
    }
  }
  let job: Cron;
  try {
    job = new Cron(norm, { timezone: 'UTC' });
  } catch {
    return { ok: false, error: { code: 'syntax', message: t.syntax } };
  }
  if (job.nextRun(new Date(Date.UTC(2000, 0, 1))) === null) {
    return { ok: false, error: { code: 'never', message: t.never } };
  }
  return { ok: true, cron: norm };
}

function parses(pattern: string): boolean {
  try {
    new Cron(pattern);
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone that both the browser and Node understand. */
export function isValidTimeZone(tz: string): boolean {
  if (tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- warnings

/**
 * Warnings for a valid cron (spec: `*\/7`, day 29-31; plus `*\/N` hours and day + weekday together). An invalid cron gives [].
 * croner's OR rule applies to every day/weekday field other than `*` - `*\/2` included (Vixie cron differs) - so the
 * warning follows it.
 */
export function warnings(cron: string, locale: Locale = 'en'): ScheduleWarning[] {
  if (!validate(cron).ok) return [];
  const t = TEXT[locale];
  const [mi, ho, dom, , dow] = normalizeCron(cron).split(' ') as [string, string, string, string, string];
  const out: ScheduleWarning[] = [];
  const minuteStep = everyStep(mi, 1, 59);
  if (minuteStep !== null && 60 % minuteStep !== 0) {
    out.push({ code: 'unevenMinuteStep', message: t.unevenMinuteStep(minuteStep) });
  }
  const hourStep = everyStep(ho, 1, 23);
  if (hourStep !== null && 24 % hourStep !== 0) {
    out.push({ code: 'unevenHourStep', message: t.unevenHourStep(hourStep) });
  }
  const days = dom.split(',').map((d) => plainInt(d, 1, 31));
  const late = days.filter((d): d is number => d !== null && d >= 29);
  if (late.length > 0) out.push({ code: 'missingMonthDay', message: t.missingMonthDay(Math.min(...late)) });
  if (dom !== '*' && dow !== '*') out.push({ code: 'dayOrWeekday', message: t.dayOrWeekday });
  return out;
}

// ---------------------------------------------------------------- description sentence

/**
 * The sentence in the UI language. Takes a builder choice or a stored cron (a cron that matches a kind is described as
 * that kind). The five builder kinds use the hand-written sentences; Advanced uses cronstrue (`en`; `vi` through the
 * `vi-natural` locale above, 24-hour clock). An invalid cron gives the error sentence.
 */
export function describe(input: ScheduleSpec | string, locale: Locale = 'en'): string {
  const spec = typeof input === 'string' ? fromCron(input) : normalizeSpec(input);
  const t = TEXT[locale];
  const specErrors = validateSpec(spec, locale);
  if (specErrors.length > 0) return specErrors[0]!.message;
  switch (spec.kind) {
    case 'everyMinutes':
      return t.everyMinutes(spec.minutes);
    case 'everyHours':
      return t.everyHours(spec.hours, pad2(spec.minute));
    case 'daily':
      return t.daily(hhmm(spec.hour, spec.minute));
    case 'weekly': {
      const mondayFirst = [...spec.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return t.weekly(hhmm(spec.hour, spec.minute), mondayFirst.map((d) => t.weekday[d]).join(', '));
    }
    case 'monthly':
      return t.monthly(spec.day, hhmm(spec.hour, spec.minute));
    case 'advanced':
      return cronstrue.toString(spec.cron, {
        locale: locale === 'vi' ? 'vi-natural' : locale,
        use24HourTimeFormat: true,
        throwExceptionOnParseError: false,
      });
  }
}

/**
 * One short line for a loop row ("every 10 min", "every 2 hours at :05", "Mon, Wed, Fri at 08:30"); the board of the
 * Loops page shows this form. The five builder kinds have a short form; Advanced has none, so it gives the full sentence.
 */
export function describeShort(input: ScheduleSpec | string, locale: Locale = 'en'): string {
  const spec = typeof input === 'string' ? fromCron(input) : normalizeSpec(input);
  if (validateSpec(spec, locale).length > 0 || spec.kind === 'advanced') return describe(spec, locale);
  const s = TEXT[locale].short;
  switch (spec.kind) {
    case 'everyMinutes':
      return s.everyMinutes(spec.minutes);
    case 'everyHours':
      return s.everyHours(spec.hours, pad2(spec.minute));
    case 'daily':
      return s.daily(hhmm(spec.hour, spec.minute));
    case 'weekly': {
      const mondayFirst = [...spec.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return s.weekly(hhmm(spec.hour, spec.minute), mondayFirst.map((d) => s.weekday[d]).join(', '));
    }
    case 'monthly':
      return s.monthly(spec.day, hhmm(spec.hour, spec.minute));
  }
}

// ---------------------------------------------------------------- next runs

/**
 * The `n` next runs **after** `from` (`from` itself is not counted), computed in the time zone `tz` (IANA) - 08:30 in
 * Asia/Ho_Chi_Minh is 01:30 UTC. A time that does not exist when daylight saving starts runs at the next valid time; a
 * repeated time runs once. A bad cron or time zone throws (check first with `validate` / `isValidTimeZone`).
 */
export function nextRuns(cron: string, tz: string, from: Date, n: number): Date[] {
  const r = validate(cron);
  if (!r.ok) throw new Error(r.error.message);
  if (!isValidTimeZone(tz)) throw new Error(TEXT.en.timezone(tz));
  if (!Number.isInteger(n) || n < 0) throw new Error(TEXT.en.nextRunsCount(n));
  return new Cron(r.cron, { timezone: tz }).nextRuns(n, from);
}

// ---------------------------------------------------------------- combined for the form

export type SchedulePreview =
  | { ok: true; cron: string; description: string; nextRuns: Date[]; warnings: ScheduleWarning[] }
  | { ok: false; errors: ScheduleError[] };

/** Everything the builder shows as soon as a choice changes: cron, sentence, 5 next runs, warnings - or errors at the cells. */
export function preview(
  spec: ScheduleSpec,
  opts: { tz: string; from: Date; locale?: Locale; count?: number },
): SchedulePreview {
  const locale = opts.locale ?? 'en';
  const errors = validateSpec(spec, locale);
  if (!isValidTimeZone(opts.tz)) {
    errors.push({ code: 'timezone', field: 'timezone', message: TEXT[locale].timezone(opts.tz) });
  }
  if (errors.length > 0) return { ok: false, errors };
  const cron = toCron(spec);
  return {
    ok: true,
    cron,
    description: describe(spec, locale),
    nextRuns: nextRuns(cron, opts.tz, opts.from, opts.count ?? 5),
    warnings: warnings(cron, locale),
  };
}
