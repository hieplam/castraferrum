// Form pieces used from Settings on: the segmented control (`.seg`), the field cell (`.fcell`) that holds a label and a control
// in a group, and the search field (`.search`). The editor's fields come with its task.
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
}: {
  label: string;
  value: V;
  options: SegmentOption<V>[];
  onChange: (value: V) => void;
  testId?: string;
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
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A label over a control, as a row of a `.group`. */
export function FieldCell({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="fcell">
      <span className="label">{label}</span>
      {children}
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
