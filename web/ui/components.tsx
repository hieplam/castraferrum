// Components of the design system - thin React shells around exactly the CSS classes of design/components.css (class name <-> the
// component name written at the top of that file). No business knowledge, no i18n: text comes in props. No inline style
// carrying color / font size / spacing - a missing one is missing in the design system (ask the project owner, note it in design/APPROVED.md).
//
// Add a component for your screen (phase 1): a new file in web/ui/ (e.g. `LogView.tsx`), do not pile it into this file
// so three stories running in parallel do not edit one file.
import { useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── Button ────────────────────────────────────────────────────────────
export type ButtonVariant = 'default' | 'primary' | 'danger' | 'danger-solid' | 'ghost';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: boolean;
  /** React 19: ref is a normal prop, passed straight down to the <button> (e.g. focus the Register button after choosing a folder). */
  ref?: Ref<HTMLButtonElement>;
};
export function Button({ variant = 'default', size = 'md', icon, className, type = 'button', ...rest }: ButtonProps) {
  const v = variant === 'danger-solid' ? 'danger solid' : variant === 'default' ? '' : variant;
  return <button type={type} className={cx('btn', v, size === 'lg' && 'lg', icon && 'icon', className)} {...rest} />;
}

// ── TopBar: brand, toggles (VI/EN, light/dark), lights ───────────────
export function Brand({ children }: { children: ReactNode }) {
  return <span className="brand">{children}</span>;
}

/**
 * Toggle button in the top bar (`VI / EN`, `light / dark`): the `.toggle` class of the design system is bare text (no border,
 * no background) so it is drawn with a span with role=button - a <button> carries the browser's default border / background.
 */
export function Toggle({ options, current, onSelect, label, testId }: {
  options: readonly { value: string; label: string }[];
  current: string;
  onSelect(value: string): void;
  label: string;
  testId?: string;
}) {
  const next = () => {
    const i = options.findIndex((o) => o.value === current);
    const o = options[(i + 1) % options.length];
    if (o) onSelect(o.value);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      next();
    }
  };
  return (
    <span className="toggle" role="button" tabIndex={0} aria-label={label} title={label} onClick={next} onKeyDown={onKey} data-testid={testId} data-value={current}>
      {options.map((o, i) => (
        <span key={o.value}>
          {i > 0 && ' / '}
          {o.value === current ? <b>{o.label}</b> : o.label}
        </span>
      ))}
    </span>
  );
}

export type LampState = 'ok' | 'wait' | 'down';
export function Lamp({ state, children, testId }: { state: LampState; children: ReactNode; testId?: string }) {
  return (
    <span className={cx('lamp', state === 'down' && 'is-down', state === 'wait' && 'is-wait')} data-state={state} data-testid={testId}>
      {children}
    </span>
  );
}

// ── Banner (full page under the top bar / `inset` in a pane) ──────────
export type Tone = 'err' | 'warn' | 'info';
export function Banner({ tone, inset, children, aside, testId }: { tone: Tone; inset?: boolean; children: ReactNode; aside?: ReactNode; testId?: string }) {
  return (
    <div className={cx('banner', `is-${tone}`, inset && 'inset')} role={tone === 'info' ? 'status' : 'alert'} data-testid={testId}>
      {inset ? <span className="txt">{children}</span> : children}
      {aside !== undefined && (
        <>
          <span className="spacer" />
          {aside}
        </>
      )}
    </div>
  );
}

/** A neutral info box (not an error / warning). */
export function Note({ glyph, children }: { glyph?: ReactNode; children: ReactNode }) {
  return (
    <div className="note">
      {glyph !== undefined && <span className="glyph">{glyph}</span>}
      <span className="txt">{children}</span>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────
export function EmptyState({ glyph, title, children, action, size, error, testId }: {
  glyph?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  size?: 'sm';
  error?: boolean;
  testId?: string;
}) {
  return (
    <div className={cx('empty', size === 'sm' && 'sm', error && 'is-err')} data-testid={testId}>
      {glyph !== undefined && <div className="glyph">{glyph}</div>}
      {title !== undefined && <h3>{title}</h3>}
      {children !== undefined && <div>{children}</div>}
      {action}
    </div>
  );
}

// ── StatusTag ─────────────────────────────────────────────────────────
export type StatusKind =
  | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'interrupted' | 'cancelled' | 'skipped'
  | 'active' | 'stopped' | 'archived' | 'server_down';
export function StatusTag({ kind, boxed, pulse, testId, children }: { kind: StatusKind; boxed?: boolean; pulse?: boolean; testId?: string; children: ReactNode }) {
  return <span className={cx('st', kind, boxed && 'boxed', pulse && 'pulse')} data-status={testId ? kind : undefined} data-testid={testId}>{children}</span>;
}

// ── Skeleton ──────────────────────────────────────────────────────────
/** `width` is the width of the placeholder (data, not a token) — like the preview draws skeletons in % / px. */
export function Skeleton({ width, size }: { width?: number | string; size?: 'lg' | 'block' }) {
  return <span className={cx('sk', size)} style={width === undefined ? undefined : { width }} />;
}

// ── PaneHeader ────────────────────────────────────────────────────────
export function Crumbs({ children }: { children: ReactNode }) {
  return <div className="crumbs">{children}</div>;
}
export function PaneHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="ph">
      <h1>{title}</h1>
      {children}
    </div>
  );
}
export function PaneSub({ children }: { children: ReactNode }) {
  return <div className="ph-sub">{children}</div>;
}
export function SectionTitle({ title, extra, testId }: { title: ReactNode; extra?: ReactNode; testId?: string }) {
  return (
    <div className="section-title" data-testid={testId}>
      <h2>{title}</h2>
      {extra !== undefined && <span className="crumbs">{extra}</span>}
    </div>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────
/** Dialog with an overlay; Esc / clicking outside = `onCancel`. `wide` = a 720px wide dialog (`.dialog.is-wide` - the folder picker box. */
export function Dialog({ title, children, footer, onCancel, testId, wide, className }: {
  title: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onCancel(): void;
  testId?: string;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={cx('dialog', wide && 'is-wide', className)} role="dialog" aria-modal="true" tabIndex={-1} ref={ref} data-testid={testId}>
        <div className="d-head">{title}</div>
        <div className="d-body">{children}</div>
        <div className="d-foot">{footer}</div>
      </div>
    </div>
  );
}
