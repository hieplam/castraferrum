// One loop row in the list pane - exactly the markup of the approved preview (`loopRow` in design/preview/preview.js): name ·
// status | schedule sentence · execution #k running for how long · ✓ ✗ ⊘ ↷ | latest run -> next run. Actions (Start / Stop +
// the ... menu) show only on hover (D-UI2 - CSS `.row:hover .row-actions`); while a menu or confirm box is open it keeps `is-hover`.
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { describe } from '../../../shared/domain/schedule';
import { fmtClock, fmtDuration } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Button, cx, StatusTag } from '../../ui/components';
import type { RowModel } from './row-model';

export type RowMenuAction = 'open' | 'edit' | 'duplicate' | 'archive' | 'restore';

export function LoopRow({ row, selected, hover, menuOpen, busy, onOpen, onStart, onStop, onMenu, onMenuAction }: {
  row: RowModel;
  selected: boolean;
  /** Keep the actions shown (the ... menu / the Stop confirm box of this row is open). */
  hover: boolean;
  menuOpen: boolean;
  /** Sending Start / Stop - lock the button. */
  busy: boolean;
  onOpen(): void;
  onStart(): void;
  onStop(): void;
  onMenu(open: boolean): void;
  onMenuAction(action: RowMenuAction): void;
}) {
  const t = useT();
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const s = row.status;
  let st: ReactNode;
  if (s.kind === 'stopping') st = <StatusTag kind="cancelled" pulse>{t('list.row.stopping', { n: s.iteration })}</StatusTag>;
  else if (s.kind === 'running') {
    // several parallel runs -> `×k` after the newest iteration
    st = <StatusTag kind="running" pulse>#{s.iteration} {fmtClock(s.elapsedSec)}{s.count > 1 ? ` ×${s.count}` : ''}</StatusTag>;
  }
  else if (s.kind === 'archived') st = <StatusTag kind="archived">{t('list.row.archived')}</StatusTag>;
  else if (s.kind === 'idle') st = <StatusTag kind="active">{t('list.row.idle')}</StatusTag>;
  else if (s.kind === 'server_down') st = <StatusTag kind="server_down">{t('list.row.serverDown')}</StatusTag>;
  else st = <StatusTag kind="stopped">{t('list.row.stopped')}</StatusTag>;

  const ex = row.execution;
  const c = row.counts;
  return (
    <div
      className={cx('row', selected && 'is-sel', hover && 'is-hover', row.archived && 'is-archived')}
      onClick={onOpen}
      data-testid="loop-row"
      data-loop-id={row.id}
      data-status={s.kind}
    >
      <span className="row-name has-repo">
        <span className="nm" data-raw>
          {row.name}
        </span>
        <span className="repo-tag" data-raw data-testid="row-repo">
          {row.repoName}
        </span>
      </span>
      {st}
      <span className="row-meta" data-testid="row-meta">
        {describe(row.cron, t.lang)} · <span data-testid="row-exec">{ex ? t('list.row.exec', { k: ex.seq, d: fmtDuration(t, ex.elapsedSec) }) : t('list.row.never')}</span>
        {c && (
          <>
            {' · '}
            <span className="counts" data-testid="row-counts">
              <span className="c-ok">✓{c.ok}</span> <span className="c-err">✗{c.err}</span> ⊘{c.cancel} ↷{c.skip}
            </span>
          </>
        )}
      </span>
      <span className="row-meta row-right" data-testid="row-right">
        {row.last ? <StatusTag kind={row.last.status}>{row.last.at}</StatusTag> : '—'}
        {row.next && ` → ${row.next}`}
      </span>
      <div className="row-actions">
        {row.active ? (
          <Button variant="danger" onClick={stop(onStop)} disabled={busy} data-testid="row-stop">
            {t('action.stop')}
          </Button>
        ) : (
          <Button onClick={stop(onStart)} disabled={busy || row.archived} data-testid="row-start">
            {t('action.start')}
          </Button>
        )}
        <span className="pop-anchor">
          <Button icon onClick={stop(() => onMenu(!menuOpen))} aria-haspopup="menu" aria-expanded={menuOpen} data-testid="row-menu">
            ⋯
          </Button>
          {menuOpen && <RowMenu row={row} onClose={() => onMenu(false)} onAction={onMenuAction} />}
        </span>
      </div>
    </div>
  );
}

function RowMenu({ row, onClose, onAction }: { row: RowModel; onClose(): void; onAction(a: RowMenuAction): void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const item = (a: RowMenuAction, label: string, disabled = false) => (
    <div
      role="menuitem"
      aria-disabled={disabled || undefined}
      className={disabled ? 'is-disabled' : undefined}
      data-testid={`menu-${a}`}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClose();
        onAction(a);
      }}
    >
      {label}
    </div>
  );
  return (
    <div className="menu is-pop" role="menu" ref={ref}>
      {item('open', t('menu.open'))}
      {item('edit', t('menu.edit'))}
      {item('duplicate', t('menu.duplicate'))}
      <hr />
      {row.archived
        ? item('restore', t('menu.restore'))
        : row.active
          ? item('archive', t('menu.archiveBlocked'), true)
          : item('archive', t('menu.archive'))}
    </div>
  );
}
