// Combobox-style select of the design system (the "the phase 2 preview additions" block of components.css: `.select.is-fake`, `.select.sm`,
// `.combo`, `.menu.is-pop`) - the approved preview draws the repo picker in the form (name + path) and the compact repo filter in the list
// with spans, not a <select>, to show two lines. No business knowledge, no i18n: items + text come in props.
// Clicking outside / Esc / choosing an item closes it.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './components';

export type ComboOption = { value: string; content: ReactNode; testId?: string };

function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function Menu({ options, current, footer, onPick }: { options: readonly ComboOption[]; current: string | null; footer?: ReactNode; onPick(v: string): void }) {
  return (
    <div className="menu is-pop" role="listbox">
      {options.map((o) => (
        <div
          key={o.value}
          role="option"
          aria-selected={o.value === current}
          data-testid={o.testId}
          onClick={(e) => {
            e.stopPropagation();
            onPick(o.value);
          }}
        >
          {o.content}
        </div>
      ))}
      {footer !== undefined && (
        <>
          <hr />
          {footer}
        </>
      )}
    </div>
  );
}

const keyToggle = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault();
    fn();
  }
};

/** The regular-size select in the form: `display` = the selected value (or the hint text), opening shows the list + `footer`. */
export function Combo({ display, options, current, footer, onSelect, error, disabled, label, testId }: {
  display: ReactNode;
  options: readonly ComboOption[];
  current: string | null;
  footer?: ReactNode;
  onSelect(value: string): void;
  error?: boolean;
  disabled?: boolean;
  label: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  const toggle = () => !disabled && setOpen((o) => !o);
  return (
    <div className="combo" ref={ref}>
      <span
        className={cx('select is-fake', error && 'is-error', open && 'is-focus', disabled && 'is-disabled')}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={keyToggle(toggle)}
        data-testid={testId}
      >
        {display}
        <span className="caret">▾</span>
      </span>
      {open && (
        <Menu
          options={options}
          current={current}
          footer={footer}
          onPick={(v) => {
            setOpen(false);
            onSelect(v);
          }}
        />
      )}
    </div>
  );
}

/** The compact filter select (`.select.sm`) on the toolbar: `label` + value; while filtering (`active`) it takes the accent color. */
export function FilterSelect({ label, display, options, current, active, disabled, onSelect, testId }: {
  label: ReactNode;
  display: ReactNode;
  options: readonly ComboOption[];
  current: string | null;
  active: boolean;
  disabled?: boolean;
  onSelect(value: string): void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLSpanElement>(open, close);
  const toggle = () => !disabled && setOpen((o) => !o);
  return (
    <span className="pop-anchor" ref={ref}>
      <span
        className={cx('select sm is-fake', active && 'is-set', disabled && 'is-disabled')}
        role="combobox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={keyToggle(toggle)}
        data-testid={testId}
        data-active={active ? 'true' : undefined}
      >
        <span className="label">{label}</span>
        {display}
        <span className="caret">▾</span>
      </span>
      {open && (
        <Menu
          options={options}
          current={current}
          onPick={(v) => {
            setOpen(false);
            onSelect(v);
          }}
        />
      )}
    </span>
  );
}
