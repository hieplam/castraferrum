// The repo of the editor (spec 5.6, D-UI13: every loop runs inside one repo). From 640px a select-like button (`button.select` in
// a `.combo`) that opens a menu as wide as the field; on the phone a row that opens a sheet. Each repo shows its name and path, and
// a repo whose folder is gone says so. "Manage repos" opens the Repos page. With no repo registered the field is locked.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import type { RepoListItemDto as RepoDto } from '../../../shared/contracts/repos';
import { useT } from '../../prefs/prefs';
import { cx } from '../../ui/kit/cx';
import { FieldCell, HintLine } from '../../ui/kit/Field';
import { Icon } from '../../ui/kit/Icon';
import { useLayout } from '../../ui/kit/Layout';
import { Sheet } from '../../ui/kit/Overlay';

type Props = {
  repos: RepoDto[];
  /** The chosen repo's id; `''` = none. */
  value: string;
  onChange: (id: string) => void;
  /** No repo registered yet: the field is locked. */
  none: boolean;
  error?: string;
};

/** Name, path and "Folder is gone" of one repo. */
function RepoText({ repo }: { repo: RepoDto }) {
  const t = useT();
  return (
    <span className="cell-main">
      <span className="cell-title is-plain" data-testid="repo-opt-name" data-raw="">
        {repo.name}
      </span>
      <span className="cell-meta" data-raw="">
        {repo.path}
      </span>
      {repo.exists ? null : <span className="hint is-warn">{t('editor.repoGone')}</span>}
    </span>
  );
}

export function RepoPicker(props: Props) {
  return useLayout() === 'phone' ? <RepoSheet {...props} /> : <RepoMenu {...props} />;
}

function shown(t: ReturnType<typeof useT>, { repos, value, none }: Props): string {
  if (none) return t('editor.repoNone');
  return repos.find((r) => r.id === value)?.name ?? t('editor.repoPlaceholder');
}

/** From 640px: the combobox and its menu. */
function RepoMenu(props: Props) {
  const { repos, value, onChange, none, error } = props;
  const t = useT();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // Escape and a press outside the field close the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      opener.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>('.menu-item')];
    const at = list.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
  };
  return (
    <FieldCell label={t('editor.repo')} htmlFor="f-repo" error={error} errorFor="f-repo">
      <div className="combo" ref={box} onKeyDown={onKeyDown}>
        <button
          ref={opener}
          className={cx('select', error && 'is-err')}
          type="button"
          id="f-repo"
          data-testid="f-repo"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          disabled={none}
          onClick={() => setOpen((v) => !v)}
        >
          {shown(t, props)}
        </button>
        {open ? (
          <div className="menu" role="menu" aria-label={t('editor.repo')}>
            {repos.map((r) => (
              <button
                key={r.id}
                type="button"
                className={cx('menu-item', r.id === value && 'is-on')}
                role="menuitemradio"
                aria-checked={r.id === value}
                data-testid={`repo-opt-${r.id}`}
                onClick={() => {
                  onChange(r.id);
                  close();
                  opener.current?.focus();
                }}
              >
                <RepoText repo={r} />
              </button>
            ))}
            <hr />
            <Link className="menu-item" role="menuitem" to="/repos" data-testid="repo-manage">
              {t('editor.repoManage')}
            </Link>
          </div>
        ) : null}
      </div>
    </FieldCell>
  );
}

/** The phone: a row of the group and a sheet of the repos. */
function RepoSheet(props: Props) {
  const { repos, value, onChange, none, error } = props;
  const t = useT();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="cell" type="button" data-testid="f-repo" aria-haspopup="dialog" aria-expanded={open} aria-invalid={error ? true : undefined} disabled={none} onClick={() => setOpen(true)}>
        <span className="cell-main">
          <span className="cell-title is-plain">{t('editor.repo')}</span>
          {error ? <HintLine hint={{ text: error, tone: 'err', testId: 'error-f-repo' }} /> : null}
        </span>
        <span className="cell-value" data-raw="">
          {shown(t, props)}
        </span>
        <Icon name="chev" className="chev" />
      </button>
      <Sheet open={open} onClose={close} title={t('editor.repo')}>
        <div className="group">
          {repos.map((r) => (
            <button
              key={r.id}
              type="button"
              className={cx('cell', r.id === value && 'is-sel')}
              aria-current={r.id === value ? true : undefined}
              data-testid={`repo-opt-${r.id}`}
              onClick={() => {
                onChange(r.id);
                close();
              }}
            >
              <RepoText repo={r} />
            </button>
          ))}
        </div>
        <Link className="btn lg block plain" to="/repos" data-testid="repo-manage">
          {t('editor.repoManage')}
        </Link>
      </Sheet>
    </>
  );
}
