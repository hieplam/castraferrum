// The overlays of the new UI (`.scrim`, `.sheet`, `.dialog`, `.menu`, `.popover`, `.tooltip`; design/ds/SYSTEM.md, "Overlays"):
// one component per job.
//   Tooltip   labels an icon-only button on a pointer device: hover and keyboard focus, closed by Escape, linked by
//             `aria-describedby`, never on touch.
//   Menu      a list of actions: a popover menu on the desktop, a sheet on the phone.
//   Toggletip a `?` that explains a section: a popover on the desktop, a sheet on the phone. It opens on click, so it works on touch.
//   Sheet / Dialog  modal surfaces; a Dialog is a sheet on the phone. Focus is trapped inside, Escape closes, and focus goes back
//             to the opener. They are drawn at the end of the document (a portal), outside the page, so no style of the place
//             that opens them reaches them.
// Every text is a prop (no i18n in the kit).
import { Fragment, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Icon } from './Icon';
import { useLayout } from './Layout';

/* ── Tooltip ─────────────────────────────────────────────────────────────────────────────────────── */

export type TipAnchor = {
  onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onFocus: (e: { currentTarget: HTMLElement }) => void;
  onBlur: () => void;
  'aria-describedby': string | undefined;
};

/** The wrapper that positions a tooltip over the control it labels (`.tooltip` is absolute). */
const ANCHOR_STYLE = { position: 'relative', display: 'inline-flex' } as const;

/**
 * `children` receives the props to spread on the control (a button). The tooltip shows on a mouse or pen pointer entering the
 * control and on keyboard focus (`:focus-visible`), never on touch; Escape closes it.
 */
export function Tooltip({ text, below, end, children }: { text: string; below?: boolean; end?: boolean; children: (anchor: TipAnchor) => ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const anchor: TipAnchor = {
    onPointerEnter: (e) => {
      if (e.pointerType !== 'touch') setOpen(true);
    },
    onPointerLeave: () => setOpen(false),
    onFocus: (e) => {
      if (e.currentTarget.matches(':focus-visible')) setOpen(true);
    },
    onBlur: () => setOpen(false),
    'aria-describedby': open ? id : undefined,
  };
  return (
    <span style={ANCHOR_STYLE}>
      {children(anchor)}
      {open ? (
        <span id={id} role="tooltip" className={cx('tooltip', below && 'is-below', end && 'is-end')}>
          {text}
        </span>
      ) : null}
    </span>
  );
}

/* ── Focus trap, Escape and focus return ─────────────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While `active`: focus moves into the container, Tab and Shift+Tab stay inside it, Escape calls `onClose`, and when it ends focus
 * goes back to the element that had it before. Returns the ref for the container.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const box = ref.current;
    if (!box) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    (items()[0] ?? box).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus();
    };
  }, [active]);
  return ref;
}

/* ── Sheet and Dialog ────────────────────────────────────────────────────────────────────────────── */

/**
 * A sheet from the bottom with its scrim. `title` is its heading (`h2`) and its accessible name; a sheet of actions has no heading,
 * and `label` names it instead.
 */
export function Sheet({
  open,
  onClose,
  title,
  label,
  testId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  label?: string;
  testId?: string;
  children: ReactNode;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;
  const named = title === undefined ? { 'aria-label': label } : { 'aria-labelledby': titleId };
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" {...named} tabIndex={-1} data-testid={testId}>
        <span className="sheet-grab" />
        {title === undefined ? null : <h2 id={titleId}>{title}</h2>}
        {children}
      </div>
    </>,
    document.body,
  );
}

/** A centred dialog on the desktop, a sheet on the phone. `foot` holds its buttons. */
export function Dialog({
  open,
  onClose,
  title,
  wide,
  testId,
  foot,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  wide?: boolean;
  testId?: string;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const layout = useLayout();
  const ref = useFocusTrap<HTMLDivElement>(open && layout === 'desktop', onClose);
  const titleId = useId();
  if (layout === 'phone') {
    return (
      <Sheet open={open} onClose={onClose} title={title} testId={testId}>
        {children}
        {foot}
      </Sheet>
    );
  }
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} className={cx('dialog', wide && 'is-wide')} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="dialog-body">{children}</div>
        {foot ? <div className="dialog-foot">{foot}</div> : null}
      </div>
    </>,
    document.body,
  );
}

/* ── Popover and Toggletip ───────────────────────────────────────────────────────────────────────── */

/** The wrapper that positions a popover or a menu under the control that opened it. */
const POP_STYLE = { position: 'relative', display: 'inline-flex' } as const;
const BELOW_STYLE = { position: 'absolute', top: 'calc(100% + var(--space-1))', right: 0 } as const;
/** A popover hangs from the leading edge of its opener, a little lower than a menu (the help of a section head). */
const POPOVER_STYLE = { position: 'absolute', top: 'calc(100% + var(--space-2))', left: 0 } as const;
/** A menu of a table row hangs from the row (the row is its positioned parent), over the row's trailing padding. */
const ROW_WRAP_STYLE = { display: 'inline-flex' } as const;
const ROW_STYLE = { position: 'absolute', top: 'calc(100% - var(--space-3))', right: 'var(--space-4)' } as const;

/** Closes on Escape (and gives the focus back to the control) and on a pointer press outside `box` and `opener`. */
function useDismiss(open: boolean, close: () => void, box: RefObject<HTMLElement | null>, opener: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        opener.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !opener.current?.contains(target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close, box, opener]);
}

/** A popover: a small raised panel of text under its opener (the desktop's toggletip body). `label` is its accessible name. */
export function Popover({ id, label, testId, ref, children }: { id?: string; label?: string; testId?: string; ref?: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={ref} id={id} className="popover" role="dialog" aria-label={label} style={POPOVER_STYLE} data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * The `?` of a section head (`.help`): `label` is its accessible name, `title` and `children` the explanation, `closeLabel` the
 * sheet's button. Click or Enter opens it, so it works on touch and from the keyboard; Escape and a press outside close it, and the
 * focus goes back to the `?`. On the phone the `?` stays a direct child of the section head and the sheet traps the focus.
 */
export function Toggletip({
  label,
  title,
  closeLabel,
  testId,
  sheetTestId,
  children,
}: {
  label: string;
  title: ReactNode;
  closeLabel: string;
  testId?: string;
  sheetTestId?: string;
  children: ReactNode;
}) {
  const layout = useLayout();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const opener = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(open && layout === 'desktop', close, box, opener);
  const button = (
    <button
      ref={opener}
      type="button"
      className="help"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      data-testid={testId}
      onClick={() => setOpen((v) => !v)}
    >
      <Icon name="help" />
    </button>
  );
  if (layout === 'phone') {
    return (
      <>
        {button}
        <Sheet open={open} onClose={close} title={title} testId={sheetTestId}>
          {children}
          <button type="button" className="btn lg block" onClick={close}>
            {closeLabel}
          </button>
        </Sheet>
      </>
    );
  }
  return (
    <span style={POP_STYLE}>
      {button}
      {open ? (
        <Popover ref={box} id={id} label={typeof title === 'string' ? title : undefined} testId={sheetTestId}>
          <b>{title}</b>
          {children}
        </Popover>
      ) : null}
    </span>
  );
}

/* ── Menu ────────────────────────────────────────────────────────────────────────────────────────── */

export type MenuItem = {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  testId?: string;
  danger?: boolean;
  disabled?: boolean;
  /** The chosen one of a list of choices (a filter). */
  on?: boolean;
  /** A rule above this item, on the desktop's menu (the phone's sheet lists the cells without one). */
  separatorBefore?: boolean;
};

/**
 * A list of actions behind a trigger: a popover menu on the desktop (arrow keys move, Escape closes, focus returns), a sheet of
 * cells on the phone. `trigger` receives the props to spread on the button that opens it.
 */
export function Menu({
  label,
  items,
  testId,
  hangsFrom = 'button',
  phoneSheet = 'cells',
  trigger,
}: {
  label: string;
  items: MenuItem[];
  testId?: string;
  /** Where the desktop's menu hangs: under its button (default), or from the table row that holds the button. */
  hangsFrom?: 'button' | 'row';
  /**
   * The phone's sheet: `cells` (default) = a heading and a group of cells, for a list of choices (a filter); `items` = the menu's
   * own items with no heading, for the actions of a page.
   */
  phoneSheet?: 'cells' | 'items';
  trigger: (props: { ref: RefObject<HTMLButtonElement | null>; onClick: () => void; 'aria-haspopup': 'menu' | 'dialog'; 'aria-expanded': boolean }) => ReactNode;
}) {
  const layout = useLayout();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const opener = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(open && layout === 'desktop', close, box, opener);
  useEffect(() => {
    if (open && layout === 'desktop') box.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [open, layout]);
  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    close();
    item.onSelect();
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')];
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    e.preventDefault();
    next?.focus();
  };
  const props = { ref: opener, onClick: () => setOpen((v) => !v), 'aria-haspopup': layout === 'phone' ? ('dialog' as const) : ('menu' as const), 'aria-expanded': open };
  // On the phone the trigger stays a direct child of its parent (a toolbar's grid places it), so there is no wrapper.
  if (layout === 'phone' && phoneSheet === 'items') {
    return (
      <>
        {trigger(props)}
        <Sheet open={open} onClose={close} label={label} testId={testId}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={cx('menu-item', item.danger && 'is-danger', item.on && 'is-on')}
              aria-disabled={item.disabled || undefined}
              data-testid={item.testId}
              onClick={() => choose(item)}
            >
              {item.label}
            </button>
          ))}
        </Sheet>
      </>
    );
  }
  if (layout === 'phone') {
    return (
      <>
        {trigger(props)}
        <Sheet open={open} onClose={close} title={label} testId={testId}>
          <div className="group">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx('cell', item.on && 'is-sel')}
                aria-disabled={item.disabled || undefined}
                data-testid={item.testId}
                onClick={() => choose(item)}
              >
                <span className="cell-title is-plain">{item.label}</span>
              </button>
            ))}
          </div>
        </Sheet>
      </>
    );
  }
  return (
    <span style={hangsFrom === 'row' ? ROW_WRAP_STYLE : POP_STYLE}>
      {trigger(props)}
      {open ? (
        <div ref={box} className="menu" role="menu" aria-label={label} style={hangsFrom === 'row' ? ROW_STYLE : BELOW_STYLE} data-testid={testId} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <Fragment key={item.id}>
              {item.separatorBefore ? <hr /> : null}
              <button
                type="button"
                role="menuitem"
                className={cx('menu-item', item.danger && 'is-danger', item.on && 'is-on')}
                aria-disabled={item.disabled || undefined}
                data-testid={item.testId}
                onClick={() => choose(item)}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </span>
  );
}
