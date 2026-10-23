// Form pieces: the segmented control (`.seg`), the field cell (`.fcell`) that holds a label and a control in a group (above it,
// or as a row: the label at the start, the value and a chevron at the end), the text field, the text area, the native select,
// the stepper, the chip (`.chip`) and the search field (`.search`). Every text is a prop (no i18n in the kit).
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type SegmentOption<V extends string> = { value: V; label: ReactNode; testId?: string };

/** Two to five exclusive choices that fit in a row. A radio group: the chosen segment has `aria-checked="true"`. */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  disabled,
}: {
  label: string;
  value: V;
  options: SegmentOption<V>[];
  onChange: (value: V) => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} data-testid={testId} data-value={value}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx(o.value === value && 'is-on')}
          data-testid={o.testId}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


/** A search field with its magnifier; `label` is the accessible name (and the placeholder text the caller passes). */
export function Search({
  label,
  placeholder,
  value,
  onChange,
  testId,
  disabled,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <label className="search">
      <Icon name="search" />
      <input type="search" data-testid={testId} placeholder={placeholder} aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** A line under a control: a hint (`tone` none), a warning or an error; `testId` names it for the tests. */
export type Hint = { text: ReactNode; tone?: 'warn' | 'err'; testId?: string };

/**
 * A label and a control as a row of a `.group`: the label above the control, or (`row`) the label at the start and the control,
 * then a chevron, at the end. `count` sits under the control (the prompt's length). `error` replaces the hints with one error
 * line, `error-<htmlFor>` (or `error-<errorFor>`). The label names the control `htmlFor`; without it, it is plain text.
 */
export function FieldCell({
  label,
  htmlFor,
  labelId,
  row,
  count,
  hints = [],
  error,
  errorFor,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  labelId?: string;
  row?: boolean;
  count?: ReactNode;
  hints?: Hint[];
  error?: ReactNode;
  errorFor?: string;
  children: ReactNode;
}) {
  const id = errorFor ?? htmlFor;
  const lines: Hint[] = error ? [{ text: error, tone: 'err', testId: id ? `error-${id}` : undefined }] : hints;
  return (
    <div className={cx('fcell', row && 'is-row')}>
      {htmlFor ? (
        <label className="label" htmlFor={htmlFor} id={labelId}>
          {label}
        </label>
      ) : (
        <span className="label" id={labelId}>
          {label}
        </span>
      )}
      {children}
      {row ? <Icon name="chev" className="chev" /> : null}
      {count !== undefined ? <span className="count">{count}</span> : null}
      {lines.map((h, i) => (
        <HintLine key={i} hint={h} />
      ))}
    </div>
  );
}

/** One hint line (`.hint`, `.hint.is-warn`, `.hint.is-err`). */
export function HintLine({ hint }: { hint: Hint }) {
  return (
    <p className={cx('hint', hint.tone === 'warn' && 'is-warn', hint.tone === 'err' && 'is-err')} data-testid={hint.testId}>
      {hint.text}
    </p>
  );
}

type FieldBase = { id: string; testId?: string; invalid?: boolean; disabled?: boolean; label?: string; form?: string };

/**
 * A one-line text field. `time` = a 24-hour `HH:MM` text field (a browser's time field shows 12 hours in an English browser);
 * `data` = the data font. An invalid field sets `aria-invalid="true"`.
 */
export function Input({
  id,
  testId,
  invalid,
  disabled,
  label,
  form,
  value,
  onChange,
  type = 'text',
  time,
  data,
  placeholder,
}: FieldBase & { value: string; onChange: (value: string) => void; type?: 'text' | 'number'; time?: boolean; data?: boolean; placeholder?: string }) {
  return (
    <input
      className={cx('input', invalid && 'is-err', data && 'is-data')}
      id={id}
      data-testid={testId ?? id}
      form={form}
      type={time ? 'text' : type}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid ? true : undefined}
      aria-label={label}
      disabled={disabled}
      autoComplete="off"
      spellCheck={false}
      {...(time ? { inputMode: 'numeric' as const, maxLength: 5, pattern: '([01][0-9]|2[0-3]):[0-5][0-9]' } : {})}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** A text area (the data font). */
export function Textarea({ id, testId, invalid, disabled, label, form, value, onChange, placeholder }: FieldBase & { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <textarea
      className={cx('textarea', invalid && 'is-err')}
      id={id}
      data-testid={testId ?? id}
      form={form}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid ? true : undefined}
      aria-label={label}
      disabled={disabled}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export type SelectOption = { value: string; label: string };

/** A native select (the iPhone shows its wheel). */
export function Select({ id, testId, invalid, disabled, label, form, value, options, onChange }: FieldBase & { value: string; options: SelectOption[]; onChange: (value: string) => void }) {
  return (
    <select
      className={cx('select', invalid && 'is-err')}
      id={id}
      data-testid={testId ?? id}
      form={form}
      value={value}
      aria-invalid={invalid ? true : undefined}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Fewer, the value as a number field, More. `value` is the text in the field; the buttons step a whole number within `min` and
 * `max` and are locked at the ends. `label` names the field; `fewer` and `more` name the buttons.
 */
export function Stepper({
  id,
  testId,
  invalid,
  form,
  value,
  onChange,
  label,
  fewer,
  more,
  min,
  max,
}: Omit<FieldBase, 'label' | 'disabled'> & { value: string; onChange: (value: string) => void; label: string; fewer: string; more: string; min: number; max: number }) {
  const n = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  const step = (d: number) => onChange(String(Math.min(max, Math.max(min, (Number.isNaN(n) ? min : n) + d))));
  return (
    <div className="stepper">
      <button type="button" aria-label={fewer} disabled={!(n > min)} onClick={() => step(-1)}>
        -
      </button>
      <input
        id={id}
        data-testid={testId ?? id}
        form={form}
        type="number"
        value={value}
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" aria-label={more} disabled={n >= max} onClick={() => step(1)}>
        +
      </button>
    </div>
  );
}

/** A row of a group with a stepper at its end: the title and a line under it at the start. `error` sits under the line. */
export function StepperCell({ title, meta, error, errorTestId, ...stepper }: Parameters<typeof Stepper>[0] & { title: ReactNode; meta?: ReactNode; error?: ReactNode; errorTestId?: string }) {
  return (
    <div className="cell">
      <span className="cell-main">
        <span className="cell-title is-plain">{title}</span>
        {meta ? <span className="cell-meta">{meta}</span> : null}
        {error ? <HintLine hint={{ text: error, tone: 'err', testId: errorTestId }} /> : null}
      </span>
      <Stepper {...stepper} />
    </div>
  );
}

/** A chip that turns on and off (a weekday): a checkbox. */
export function Chip({ on, onToggle, testId, children }: { on: boolean; onToggle: () => void; testId?: string; children: ReactNode }) {
  return (
    <button type="button" className={cx('chip', on && 'is-on')} role="checkbox" aria-checked={on} data-testid={testId} onClick={onToggle}>
      {children}
    </button>
  );
}
