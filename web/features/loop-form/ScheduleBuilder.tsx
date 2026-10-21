// Schedule builder (UC-02, preview form-sched-*): six kinds -> the fields of that kind + time zone | the "This schedule means" box with the
// description sentence, the cron to be saved, warnings and the next 5 runs - recomputed at once when any field changes, with the functions of shared/domain.
import { useMemo, type KeyboardEvent, type ReactNode } from 'react';
import type { Weekday } from '../../../shared/domain/schedule';
import { fmtRelative } from '../../prefs/format';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { cx } from '../../ui/components';
import { DRAFT_KINDS, WEEK_ORDER, switchKind, toggleDay, type DraftInput, type DraftResult, type ScheduleDraft } from './schedule-draft';
import { tzLabel, tzOptions } from './time-zones';

const WEEKDAY_OF: Record<string, Weekday> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Five runs spread over more than 60 days (e.g. monthly) also show the year - like the preview (scripts/design-states.mjs). */
const FAR_MS = 60 * 86_400_000;

/** One next run in the loop's time zone: weekday, `dd/mm` (or `dd/mm/yyyy`), `HH:MM`. */
function runParts(at: Date, timeZone: string, withYear: boolean): { dow: Weekday; date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('day')}/${get('month')}${withYear ? `/${get('year')}` : ''}`;
  return { dow: WEEKDAY_OF[get('weekday')] ?? 0, date, time: `${get('hour')}:${get('minute')}` };
}

export function ScheduleBuilder({ draft, timezone, result, now, serverError, onChange, onTimezone, formId }: {
  draft: ScheduleDraft;
  timezone: string;
  result: DraftResult;
  now: Date;
  /** Errors at field `cron` / `timezone` returned by the server (rare - the builder already checked). */
  serverError?: { schedule?: string; timezone?: string };
  onChange(next: ScheduleDraft): void;
  onTimezone(tz: string): void;
  /** Attach the input to the form (Enter saves). */
  formId?: string;
}) {
  const t = useT();
  const err = (k: DraftInput) => (result.ok ? undefined : result.errors[k]);
  // ~400 time zones: compute the label (UTC offset) once per time-zone choice, not every second with `now`.
  const zones = useMemo(() => tzOptions(timezone).map((z) => ({ z, label: tzLabel(z, new Date()) })), [timezone]);

  const text = (k: 'minutes' | 'hours' | 'atMinute' | 'time' | 'day' | 'cron', label: string, testId: string) => (
    <Field label={label} htmlFor={`sched-${k}`} error={err(k)}>
      <input
        form={formId}
        id={`sched-${k}`}
        className={cx('input mono', err(k) && 'is-error')}
        value={draft[k]}
        onChange={(e) => onChange({ ...draft, [k]: e.target.value })}
        spellCheck={false}
        autoComplete="off"
        data-testid={testId}
        aria-invalid={err(k) ? true : undefined}
      />
    </Field>
  );

  let fields: ReactNode = null;
  if (draft.kind === 'minutes') fields = text('minutes', t('sched.field.everyMin'), 'sched-minutes');
  if (draft.kind === 'hours') {
    fields = (
      <div className="form-grid">
        {text('hours', t('sched.field.everyHour'), 'sched-hours')}
        {text('atMinute', t('sched.field.atMinute'), 'sched-at-minute')}
      </div>
    );
  }
  if (draft.kind === 'daily') fields = text('time', t('sched.field.time'), 'sched-time');
  if (draft.kind === 'weekly') {
    fields = (
      <>
        <Field label={t('sched.field.days')} error={err('days')}>
          <div className="chips" role="group" aria-label={t('sched.field.days')} data-testid="sched-days">
            {WEEK_ORDER.map((d) => (
              <DayChip key={d} on={draft.days.includes(d)} onToggle={() => onChange(toggleDay(draft, d))} testId={`sched-day-${d}`}>
                {t(`day.short.${d}` as MessageKey)}
              </DayChip>
            ))}
          </div>
        </Field>
        {text('time', t('sched.field.time'), 'sched-time')}
      </>
    );
  }
  if (draft.kind === 'monthly') {
    fields = (
      <div className="form-grid">
        {text('day', t('sched.field.dom'), 'sched-day')}
        {text('time', t('sched.field.time'), 'sched-time')}
      </div>
    );
  }
  if (draft.kind === 'advanced') {
    const e = err('cron') ?? serverError?.schedule;
    fields = (
      <div className="field">
        <label className="label" htmlFor="sched-cron">{t('sched.field.cron')}</label>
        <input
          form={formId}
          id="sched-cron"
          className={cx('input mono', e && 'is-error')}
          value={draft.cron}
          onChange={(ev) => onChange({ ...draft, cron: ev.target.value })}
          spellCheck={false}
          autoComplete="off"
          data-testid="sched-cron"
          aria-invalid={e ? true : undefined}
        />
        {e ? (
          <span className="hint is-error" data-testid="sched-cron-error">{`${t('error.INVALID_CRON')} — ${e}`}</span>
        ) : (
          <>
            <span className="hint">{t('sched.field.cron.hint')}</span>
            {result.ok && result.autoAdvanced && <span className="hint">{`↳ ${t('sched.autoAdvanced')}`}</span>}
          </>
        )}
      </div>
    );
  }

  const tzError = err('timezone') ?? serverError?.timezone;
  return (
    <>
      <div className="seg" role="radiogroup" aria-label={t('form.section.schedule')} data-testid="sched-kinds">
        {DRAFT_KINDS.map((k) => (
          <SegItem key={k} on={k === draft.kind} onSelect={() => onChange(switchKind(draft, k))} testId={`sched-kind-${k}`}>
            {t(`sched.kind.${k}` as MessageKey)}
          </SegItem>
        ))}
      </div>
      <div className="form-grid">
        <div className="form-stack">
          {fields}
          <Field label={t('sched.field.tz')} htmlFor="sched-tz" error={tzError}>
            <select form={formId} id="sched-tz" className="select" value={timezone} onChange={(e) => onTimezone(e.target.value)} data-testid="sched-tz">
              {zones.map(({ z, label }) => (
                <option key={z} value={z}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ScheduleOut draft={draft} timezone={timezone} result={result} now={now} />
      </div>
    </>
  );
}

function ScheduleOut({ draft, timezone, result, now }: { draft: ScheduleDraft; timezone: string; result: DraftResult; now: Date }) {
  const t = useT();
  if (!result.ok) {
    const advanced = draft.kind === 'advanced';
    return (
      <div className="sched-out is-error" data-testid="sched-out" data-state="error">
        <span className="label">{t('sched.out.means')}</span>
        <div className="sched-desc">—</div>
        <span className="hint is-error">{t(advanced ? 'error.INVALID_CRON' : 'sched.out.invalid')}</span>
        <span className="label">{t('sched.out.next')}</span>
        <span className="hint">{t(advanced ? 'sched.out.none' : 'sched.out.noneFields')}</span>
      </div>
    );
  }
  return (
    <div className="sched-out" data-testid="sched-out" data-state="ok">
      <span className="label">{t('sched.out.means')}</span>
      <div className="sched-desc" data-testid="sched-desc">{result.description}</div>
      <span className="hint">
        {t.node('sched.out.cron', { cron: <span className="mono" data-testid="sched-cron-out">{result.cron}</span> })}
        {` · ${timezone}`}
      </span>
      {result.warnings.map((w) => (
        <span key={w.code} className="hint is-warn" data-testid={`sched-warn-${w.code}`}>
          {w.message}
        </span>
      ))}
      <span className="label">{t('sched.out.next')}</span>
      <ol className="next-runs" data-testid="sched-next">
        {result.nextRuns.map((at, _i, all) => {
          const p = runParts(at, timezone, (all.at(-1)?.getTime() ?? 0) - now.getTime() > FAR_MS);
          return (
            <li key={at.getTime()} data-at={at.toISOString()}>
              <span>
                {t(`day.short.${p.dow}` as MessageKey)} {p.date} · <b>{p.time}</b>
              </span>
              <span className="rel">{fmtRelative(t, Math.floor((at.getTime() - now.getTime()) / 1000))}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A field with a label + a hint / error below (class `.field` of the design system). */
export function Field({ label, htmlFor, error, hint, children, className, head }: {
  label: string;
  htmlFor?: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Secondary text right of the label (`.field-head`) - e.g. the prompt character count. */
  head?: ReactNode;
}) {
  const labelEl = htmlFor ? <label className="label" htmlFor={htmlFor}>{label}</label> : <span className="label">{label}</span>;
  return (
    <div className={cx('field', className)}>
      {head !== undefined ? (
        <div className="field-head">
          {labelEl}
          {head}
        </div>
      ) : (
        labelEl
      )}
      {children}
      {error ? (
        <span className="hint is-error" data-testid={htmlFor ? `error-${htmlFor}` : undefined}>
          {error}
        </span>
      ) : (
        hint
      )}
    </div>
  );
}

function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

/** One button of `.seg` - a span with a role (a <button> carries the browser's default border / background, off the preview). */
export function SegItem({ on, disabled, onSelect, children, testId }: { on: boolean; disabled?: boolean; onSelect?: () => void; children: ReactNode; testId?: string }) {
  const act = () => !disabled && onSelect?.();
  return (
    <span
      className={cx(on && 'is-on', disabled && 'is-disabled')}
      role="radio"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={act}
      onKeyDown={onActivate(act)}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

function DayChip({ on, onToggle, children, testId }: { on: boolean; onToggle(): void; children: ReactNode; testId: string }) {
  return (
    <span className={cx('chip-day', on && 'is-on')} role="checkbox" aria-checked={on} tabIndex={0} onClick={onToggle} onKeyDown={onActivate(onToggle)} data-testid={testId}>
      {children}
    </span>
  );
}
