// DropMenu - the ... button that opens a pop-up menu of the design system (`.pop-anchor`, `.menu.is-pop`, `.menu .is-disabled`, `.menu hr`).
// Clicking outside / Esc / choosing an item closes it. No business knowledge, no i18n: items + labels come in props.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, cx } from './components';

export type DropMenuItem =
  | { kind?: 'item'; label: ReactNode; onSelect(): void; disabled?: boolean; testId?: string }
  | { kind: 'separator' };

export function DropMenu({ items, label, disabled, testId }: { items: readonly DropMenuItem[]; label: string; disabled?: boolean; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className="pop-anchor" ref={ref}>
      <Button icon aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)} data-testid={testId}>
        ⋯
      </Button>
      {open && (
        <div className="menu is-pop" role="menu">
          {items.map((it, i) =>
            it.kind === 'separator' ? (
              <hr key={i} />
            ) : (
              <div
                key={i}
                role="menuitem"
                aria-disabled={it.disabled ? 'true' : undefined}
                className={cx(it.disabled && 'is-disabled')}
                data-testid={it.testId}
                onClick={() => {
                  if (it.disabled) return;
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.label}
              </div>
            ),
          )}
        </div>
      )}
    </span>
  );
}
