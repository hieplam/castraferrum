// The schedule of the editor (spec 5.6, UC-02): Repeat (a native select of the six kinds), the fields of that kind, the time zone,
// and the description card under the group: the sentence, the stored cron, the warnings and the next 5 runs (or the error). Every
// sentence comes from shared/domain through `evaluateDraft` (schedule-draft.ts); this file only draws.
import { useMemo, type ReactNode } from 'react';
import type { Weekday } from '../../../shared/domain/schedule';
import { fmtRelative } from '../../prefs/format';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Chip, FieldCell, HintLine, Input, Select, StepperCell } from '../../ui/kit/Field';
import { DRAFT_KINDS, WEEK_ORDER, switchKind, toggleDay, type DraftInput, type DraftResult, type ScheduleDraft } from './schedule-draft';
import { tzOptions } from './time-zones';

const WEEKDAY_OF: Record<string, Weekday> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Five runs spread over more than 60 days (a monthly schedule) also show the year. */
const FAR_MS = 60 * 86_400_000;

/** One next run in the loop's time zone: weekday, `dd/mm` (or `dd/mm/yyyy`), `HH:MM`. */
function runParts(at: Date, timeZone: string, withYear: boolean): { dow: Weekday; date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('day')}/${get('month')}${withYear ? `/${get('year')}` : ''}`;
  return { dow: WEEKDAY_OF[get('weekday')] ?? 0, date, time: `${get('hour')}:${get('minute')}` };
}

/** A whole number typed with leading zeros ("05") is shown as the number field shows it ("5"). */
const asNumber = (s: string) => s.replace(/^0+(?=\d)/, '');

/** The rows of the schedule group: Repeat, the fields of the kind, Time zone. */
export function ScheduleFields({
  draft,
  timezone,
  result,
  serverError,
  onChange,
  onTimezone,
  formId,
}: {
  draft: ScheduleDraft;
  timezone: string;
  result: DraftResult;
  /** Errors the server returned at `cron` or `timezone` (rare: the editor already checked). */
  serverError?: { schedule?: string; timezone?: string };
  onChange: (next: ScheduleDraft) => void;
  onTimezone: (tz: string) => void;
  formId: string;
}) {
  const t = useT();
  const err = (k: DraftInput) => (result.ok ? undefined : result.errors[k]);
  const zones = useMemo(() => tzOptions(timezone).map((z) => ({ value: z, label: z })), [timezone]);
  const set = (k: 'minutes' | 'hours' | 'atMinute' | 'time' | 'day' | 'cron') => (v: string) => onChange({ ...draft, [k]: v });
  const time = (
    <FieldCell key="time" row label={t('editor.at')} htmlFor="sched-time" error={err('time')}>
      <Input id="sched-time" form={formId} time value={draft.time} invalid={!!err('time')} onChange={set('time')} />
    </FieldCell>
  );
  const stepper = (k: 'minutes' | 'hours', meta: MessageKey, max: number) => (
    <StepperCell
      key={k}
      title={t('editor.every')}
      meta={t(meta)}
      id={`sched-${k}`}
      form={formId}
      value={draft[k]}
      onChange={set(k)}
      label={t('editor.every')}
      fewer={t('editor.fewer')}
      more={t('editor.more')}
      min={1}
      max={max}
      invalid={!!err(k)}
      error={err(k)}
      errorTestId={`error-sched-${k}`}
    />
  );

  let fields: ReactNode[] = [];
  if (draft.kind === 'minutes') fields = [stepper('minutes', 'editor.minutes', 59)];
  if (draft.kind === 'hours') {
    fields = [
      stepper('hours', 'editor.hours', 23),
      <FieldCell key="at-minute" row label={t('editor.atMinute')} htmlFor="sched-at-minute" error={err('atMinute')}>
        <Input id="sched-at-minute" form={formId} type="number" value={asNumber(draft.atMinute)} invalid={!!err('atMinute')} onChange={set('atMinute')} />
      </FieldCell>,
    ];
  }
  if (draft.kind === 'daily') fields = [time];
  if (draft.kind === 'weekly') {
    fields = [
      <FieldCell key="days" label={t('editor.on')} error={err('days')} errorFor="sched-days">
        <div className="chips" role="group" aria-label={t('editor.on')} data-testid="sched-days">
          {WEEK_ORDER.map((d) => (
            <Chip key={d} on={draft.days.includes(d)} onToggle={() => onChange(toggleDay(draft, d))} testId={`sched-day-${d}`}>
              {t(`day.short.${d}` as MessageKey)}
            </Chip>
          ))}
        </div>
      </FieldCell>,
      time,
    ];
  }
  if (draft.kind === 'monthly') {
    fields = [
      <FieldCell key="day" row label={t('editor.dayOfMonth')} htmlFor="sched-day" error={err('day')}>
        <Input id="sched-day" form={formId} type="number" value={asNumber(draft.day)} invalid={!!err('day')} onChange={set('day')} />
      </FieldCell>,
      time,
    ];
  }
  if (draft.kind === 'advanced') {
    const e = err('cron') ?? serverError?.schedule;
    fields = [
      <FieldCell
        key="cron"
        label={t('editor.cron')}
        htmlFor="sched-cron"
        hints={e ? [{ text: `${t('error.INVALID_CRON')}: ${e}`, tone: 'err', testId: 'sched-cron-error' }] : [{ text: t('editor.cronHint') }]}
      >
        <Input id="sched-cron" form={formId} value={draft.cron} invalid={!!e} onChange={set('cron')} />
      </FieldCell>,
    ];
  }

  const tzError = err('timezone') ?? serverError?.timezone;
  return (
    <>
      <FieldCell row label={t('editor.repeat')} htmlFor="sched-kind">
        <Select
          id="sched-kind"
          form={formId}
          value={draft.kind}
          options={DRAFT_KINDS.map((k) => ({ value: k, label: t(`editor.kind.${k}` as MessageKey) }))}
          onChange={(k) => onChange(switchKind(draft, k as ScheduleDraft['kind']))}
        />
      </FieldCell>
      {fields}
      <FieldCell row label={t('editor.timeZone')} htmlFor="sched-tz" error={tzError}>
        <Select id="sched-tz" form={formId} value={timezone} options={zones} invalid={!!tzError} onChange={onTimezone} />
      </FieldCell>
    </>
  );
}

/** The description card: the sentence, the stored cron, the warnings and the next 5 runs; or the error and no runs. */
export function ScheduleOut({ draft, timezone, result, now }: { draft: ScheduleDraft; timezone: string; result: DraftResult; now: Date }) {
  const t = useT();
  if (!result.ok) {
    const advanced = draft.kind === 'advanced';
    return (
      <div className="card is-pad" data-testid="sched-out" data-state="error">
        <p className="sched-desc">-</p>
        <HintLine hint={{ text: t(advanced ? 'error.INVALID_CRON' : 'sched.out.invalid'), tone: 'err' }} />
        <HintLine hint={{ text: t(advanced ? 'sched.out.none' : 'sched.out.noneFields') }} />
      </div>
    );
  }
  const far = (result.nextRuns.at(-1)?.getTime() ?? 0) - now.getTime() > FAR_MS;
  return (
    <div className="card is-pad" data-testid="sched-out" data-state="ok">
      <p className="sched-desc" data-testid="sched-desc">
        {result.description}
      </p>
      <p className="note">{t.node('editor.stored', { cron: <span data-testid="sched-cron-out">{result.cron}</span>, tz: timezone })}</p>
      {result.warnings.map((w) => (
        <HintLine key={w.code} hint={{ text: w.message, tone: 'warn', testId: `sched-warn-${w.code}` }} />
      ))}
      <ol className="next-runs" data-testid="sched-next" aria-label={t('editor.nextRuns')}>
        {result.nextRuns.map((at) => {
          const p = runParts(at, timezone, far);
          return (
            <li key={at.getTime()} data-at={at.toISOString()}>
              <span data-testid="sched-next-when">{`${t(`day.short.${p.dow}` as MessageKey)} ${p.date} · ${p.time}`}</span>
              <span>{fmtRelative(t, Math.floor((at.getTime() - now.getTime()) / 1000))}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
