// State of the schedule builder (UC-02, spec section "Friendly schedule"): the text the user typed in each field <-> the domain's `ScheduleSpec`.
// Everything shown - cron, description sentence, the next 5 runs, warnings, field errors - comes from `shared/domain/schedule.ts`
// (one source with the server); this file only reads field -> spec and says which field an error belongs to.
import {
  fromCron,
  normalizeCron,
  preview,
  toCron,
  validateSpec,
  type Locale,
  type ScheduleError,
  type ScheduleSpec,
  type ScheduleWarning,
  type Weekday,
} from '../../../shared/domain/schedule';

/** The six buttons of the builder - in the preview's order (`sched.kind.<kind>`). */
export const DRAFT_KINDS = ['minutes', 'hours', 'daily', 'weekly', 'monthly', 'advanced'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

/** Fields of the builder that can carry an error. */
export type DraftInput = 'minutes' | 'hours' | 'atMinute' | 'time' | 'days' | 'day' | 'cron' | 'timezone';

/** The text in each field (kept as typed - "05", "08:30"); changing kind does not lose the fields of the other kinds. */
export type ScheduleDraft = {
  kind: DraftKind;
  minutes: string;
  hours: string;
  atMinute: string;
  /** HH:MM - shared by Daily / Weekdays / Monthly. */
  time: string;
  days: Weekday[];
  day: string;
  cron: string;
};

/** D-UI6: the default schedule when creating a new loop. */
export const DEFAULT_CRON = '*/30 * * * *';
/** Order of the weekday chips: Mon ... Sat, Sun. */
export const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const pad2 = (n: number) => String(n).padStart(2, '0');
// Field values of the kinds not chosen (switching to that kind shows them) - the default schedule of a new loop is D-UI6.
const BLANK: ScheduleDraft = { kind: 'minutes', minutes: '30', hours: '2', atMinute: '00', time: '09:00', days: [1], day: '1', cron: DEFAULT_CRON };

const KIND_OF: Record<ScheduleSpec['kind'], DraftKind> = {
  everyMinutes: 'minutes',
  everyHours: 'hours',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  advanced: 'advanced',
};

/** Open a saved cron: whichever kind it matches, it goes to that kind; no match -> Advanced keeping the raw text (`fromCron`). */
export function draftFromCron(cron: string): ScheduleDraft {
  const spec = fromCron(cron);
  const d: ScheduleDraft = { ...BLANK, kind: KIND_OF[spec.kind], cron: normalizeCron(cron) };
  switch (spec.kind) {
    case 'everyMinutes':
      return { ...d, minutes: String(spec.minutes) };
    case 'everyHours':
      return { ...d, hours: String(spec.hours), atMinute: pad2(spec.minute) };
    case 'daily':
      return { ...d, time: `${pad2(spec.hour)}:${pad2(spec.minute)}` };
    case 'weekly':
      return { ...d, days: spec.days, time: `${pad2(spec.hour)}:${pad2(spec.minute)}` };
    case 'monthly':
      return { ...d, day: String(spec.day), time: `${pad2(spec.hour)}:${pad2(spec.minute)}` };
    case 'advanced':
      return d;
  }
}

/** An unsigned integer of 1-2 digits; any other text -> NaN so `validateSpec` reports "must be a whole number from ... to ...". */
function int(s: string): number {
  const v = s.trim();
  return /^\d{1,2}$/.test(v) ? Number(v) : Number.NaN;
}
function hm(s: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : { hour: Number.NaN, minute: Number.NaN };
}

/** The fields as shown -> the domain's choice (not yet checked). */
export function draftToSpec(d: ScheduleDraft): ScheduleSpec {
  switch (d.kind) {
    case 'minutes':
      return { kind: 'everyMinutes', minutes: int(d.minutes) };
    case 'hours':
      return { kind: 'everyHours', hours: int(d.hours), minute: int(d.atMinute) };
    case 'daily':
      return { kind: 'daily', ...hm(d.time) };
    case 'weekly':
      return { kind: 'weekly', days: d.days, ...hm(d.time) };
    case 'monthly':
      return { kind: 'monthly', day: int(d.day), ...hm(d.time) };
    case 'advanced':
      return { kind: 'advanced', cron: d.cron };
  }
}

/** Switch kind. Switching to Advanced puts the cron of the current choice (if valid) in the cron field - the user continues editing from it. */
export function switchKind(d: ScheduleDraft, kind: DraftKind): ScheduleDraft {
  if (kind === d.kind) return d;
  if (kind === 'advanced' && validateSpec(draftToSpec(d)).length === 0) return { ...d, kind, cron: toCron(draftToSpec(d)) };
  return { ...d, kind };
}

export function toggleDay(d: ScheduleDraft, day: Weekday): ScheduleDraft {
  const days = d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day];
  return { ...d, days: [...days].sort((a, b) => a - b) };
}

/** Domain error -> the builder field being shown. */
export function inputOf(kind: DraftKind, err: ScheduleError): DraftInput {
  if (err.code === 'timezone') return 'timezone';
  if (kind === 'advanced') return 'cron';
  switch (err.field) {
    case 'minutes':
      return 'minutes';
    case 'hours':
      return 'hours';
    case 'days':
      return 'days';
    case 'day':
      return 'day';
    case 'minute':
      return kind === 'hours' ? 'atMinute' : 'time';
    default:
      return 'time';
  }
}

export type DraftResult =
  | { ok: true; cron: string; description: string; nextRuns: Date[]; warnings: ScheduleWarning[]; autoAdvanced: boolean }
  | { ok: false; errors: Partial<Record<DraftInput, string>> };

/**
 * Everything the builder shows as soon as the choice changes: cron, sentence, the next 5 runs after `now` in time zone `tz`, warnings - or
 * errors per field. `autoAdvanced`: the cron in Advanced matches no prebuilt kind (reopening such a cron goes to Advanced).
 */
export function evaluateDraft(d: ScheduleDraft, tz: string, now: Date, locale: Locale): DraftResult {
  const r = preview(draftToSpec(d), { tz, from: now, locale });
  if (!r.ok) {
    const errors: Partial<Record<DraftInput, string>> = {};
    for (const e of r.errors) errors[inputOf(d.kind, e)] ??= e.message;
    return { ok: false, errors };
  }
  return { ...r, autoAdvanced: d.kind === 'advanced' && fromCron(r.cron).kind === 'advanced' };
}
