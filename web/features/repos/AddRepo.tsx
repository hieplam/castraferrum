// The folder picker of the Repos page (spec 5.7, `m-folder-light`; design/ds/SYSTEM.md, "Folder picker"): a wide dialog on the
// desktop, a full-height sheet on the phone. Top to bottom: the path field (typing a path and pressing Enter or Go opens that
// folder; it is also the path to register), quick access, the breadcrumb, the filter, the show-hidden switch, the folder list
// (a click or tap selects, `›` or a double-click opens), the target line, the name (filled from the folder, editable) and Add repo.
//
// What is registered (the target): the selected folder; else a path typed into the field; else the open folder. Every path comes
// from the server (`GET /api/folders`), which also says which folders are git folders and which are repos already: Add repo is
// locked for a folder already registered. A registration the server refuses shows its error at the path or the name, and Add stays
// locked until one of them changes. Keyboard (the filter): arrow keys select, Enter opens, Backspace on an empty filter goes up,
// Escape closes.
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { FolderEntryDto, FolderPlacesDto } from '../../../shared/contracts/folders';
import { isApiError } from '../../api/loops-api';
import { useFolderNav, useFolderPlaces } from '../../data/folders';
import { folderName, useCreateRepo } from '../../data/repos';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { useToast } from '../../ui/toast';
import { Button, IconButton } from '../../ui/kit/Button';
import { cx } from '../../ui/kit/cx';
import { Input, Search, Switch } from '../../ui/kit/Field';
import { Icon } from '../../ui/kit/Icon';
import { useLayout } from '../../ui/kit/Layout';
import { Dialog, FullSheet } from '../../ui/kit/Overlay';

/** The folder opened last time and the show-hidden switch, remembered in the browser (a convenience: skipped when storage fails). */
const LAST_KEY = 'loop-console.folders.last';
const HIDDEN_KEY = 'loop-console.folders.hidden';
function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // the browser refuses to store (private mode): only the remembering is lost
  }
}

const PLACE_LABEL: Record<FolderPlacesDto['places'][number]['kind'], MessageKey> = {
  home: 'picker.home',
  desktop: 'folder.place.desktop',
  documents: 'folder.place.documents',
  downloads: 'folder.place.downloads',
};
const PATH_ERR: Record<string, MessageKey> = { required: 'repo.val.required', invalid: 'repo.val.notAbsolute', notDirectory: 'repo.val.notFound' };

/** The name of the folder that holds `path` (a label that appears twice in quick access is told apart by it). */
function parentName(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2]! : '';
}

type Target = { path: string; name: string; repo: string | null };
type RegErr = { path?: string; name?: string };

export function AddRepo({ onClose }: { onClose(): void }) {
  const t = useT();
  const toast = useToast();
  const phone = useLayout() === 'phone';
  const places = useFolderPlaces();
  const nav = useFolderNav();
  const create = useCreateRepo();
  const { folder } = nav;
  const platform = places.data?.platform;
  const posix = platform !== undefined && platform !== 'win32';
  const [typed, setTyped] = useState('');
  const [typedOwn, setTypedOwn] = useState(false); // the field holds a path the user typed, not the open folder
  const [hideNavErr, setHideNavErr] = useState(false);
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(() => readStore(HIDDEN_KEY) === '1');
  const [name, setName] = useState('');
  const [nameOwn, setNameOwn] = useState(false);
  const [regErr, setRegErr] = useState<RegErr | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Going up selects the folder just left. */
  const reselect = useRef<string | null>(null);
  const opened = useRef(false);

  // Opening: the folder opened last time, then the folder that holds the most repos, then the home folder.
  useEffect(() => {
    if (opened.current || places.isPending) return;
    opened.current = true;
    const tries = [readStore(LAST_KEY), places.data?.nearRepos[0]?.path].filter((p): p is string => !!p);
    void nav.open([...new Set(tries), null]);
  }, [places.isPending, places.data, nav]);

  // Arriving at a folder: the field shows its path, the filter empties, the folder just left is selected (going up).
  useEffect(() => {
    if (!folder) return;
    setTyped(folder.path);
    setTypedOwn(false);
    setFilter('');
    setSel(reselect.current);
    reselect.current = null;
    setRegErr(null);
    writeStore(LAST_KEY, folder.path);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [folder]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const go = useCallback(
    (path: string | null, fresh?: boolean) => {
      reselect.current = null;
      setHideNavErr(false);
      return nav.go(path, fresh);
    },
    [nav],
  );
  const up = () => {
    if (!folder?.parent) return;
    reselect.current = folder.path;
    setHideNavErr(false);
    void nav.go(folder.parent);
  };

  const same = (a: string, b: string) => (platform === 'linux' ? a === b : a.toLowerCase() === b.toLowerCase());
  const entries = folder?.entries ?? [];
  const hiddenN = entries.filter((e) => e.hidden).length;
  const q = filter.trim().toLowerCase();
  const visible = entries.filter((e) => (showHidden || !e.hidden) && (!q || e.name.toLowerCase().includes(q)));
  const selected = visible.find((e) => e.path === sel) ?? null;

  const errText = (err: unknown): string | null => {
    if (!err) return null;
    if (isApiError(err, 'VALIDATION_FAILED')) {
      if (err.issueFor('path')?.code === 'invalid') return t(posix ? 'repo.val.notAbsolute.posix' : 'repo.val.notAbsolute');
      return t('repo.val.notFound');
    }
    return t(`error.${isApiError(err) ? err.code : 'NETWORK'}` as MessageKey);
  };
  const navErr = folder && !hideNavErr ? errText(nav.error) : null;
  const typedPath = typedOwn && !navErr ? typed.trim() : '';
  const target: Target | null = selected
    ? { path: selected.path, name: selected.name, repo: selected.repo }
    : typedPath
      ? { path: typedPath, name: folderName(typedPath), repo: null }
      : folder
        ? { path: folder.path, name: folder.name, repo: folder.repo }
        : null;
  const shownName = nameOwn ? name : (target?.name ?? '');
  const locked = !target || !!target.repo || regErr !== null || create.isPending || nav.loading;

  const select = (e: FolderEntryDto) => {
    setSel(e.path);
    setRegErr(null);
  };
  const open = (e: FolderEntryDto) => void go(e.path);

  const submit = () => {
    if (locked || !target) return;
    const body = { path: target.path, ...(shownName.trim() ? { name: shownName.trim() } : {}) };
    create.mutate(body, {
      onSuccess: () => onClose(),
      onError: (err) => {
        if (isApiError(err, 'VALIDATION_FAILED')) {
          const p = err.issueFor('path');
          const n = err.issueFor('name');
          const pathKey = p ? (PATH_ERR[p.code] ?? 'repo.val.notFound') : null;
          setRegErr({
            ...(pathKey ? { path: t(posix && pathKey === 'repo.val.notAbsolute' ? 'repo.val.notAbsolute.posix' : pathKey) } : {}),
            ...(n ? { name: t('repo.val.nameTooLong') } : {}),
          });
        } else if (isApiError(err, 'REPO_PATH_TAKEN')) {
          // The path is a repo already: name it, and select its folder when it is in the list.
          setRegErr({ path: t('picker.pathTaken', { name: String((err.details as { name?: unknown } | undefined)?.name ?? '') }) });
          const row = visible.find((e) => same(e.path, target.path));
          if (row) setSel(row.path);
        } else if (isApiError(err, 'REPO_NAME_TAKEN')) {
          setRegErr({ name: t('error.REPO_NAME_TAKEN') });
        } else {
          toast.show(t('toast.failed', { msg: t(`error.${isApiError(err) ? err.code : 'NETWORK'}` as MessageKey) }), 'err');
        }
      },
    });
  };

  const onPathSubmit = (e: FormEvent) => {
    e.preventDefault();
    void go(typed.trim() || null);
  };
  const onFilterKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!visible.length) return;
      const i = visible.findIndex((x) => x.path === sel);
      const next = e.key === 'ArrowDown' ? Math.min(i + 1, visible.length - 1) : i < 0 ? visible.length - 1 : Math.max(i - 1, 0);
      select(visible[next]!);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = selected ?? (visible.length === 1 ? visible[0] : null);
      if (row) open(row);
    } else if (e.key === 'Backspace' && filter === '') {
      e.preventDefault();
      up();
    }
  };

  // ── the parts ──
  const pathErr = navErr ?? regErr?.path ?? null;
  const bar = (
    <form className="picker-bar" onSubmit={onPathSubmit}>
      <div className="field">
        <Input
          id="repo-path"
          data
          label={t('picker.path')}
          invalid={pathErr !== null}
          value={typed}
          placeholder={places.data ? t(posix ? 'repo.add.path.placeholder.posix' : 'repo.add.path.placeholder') : undefined}
          attrs={{ 'data-platform': platform ?? '' }}
          onChange={(v) => {
            setTyped(v);
            setTypedOwn(true);
            setHideNavErr(true);
            setSel(null);
            setRegErr(null);
          }}
        />
        {navErr ? (
          <p className="hint is-err" data-testid="folder-error">
            {navErr}
          </p>
        ) : regErr?.path ? (
          <p className="hint is-err" data-testid="error-repo-path">
            {regErr.path}
          </p>
        ) : null}
      </div>
      <IconButton icon="up" bordered label={t('picker.up')} tooltip={phone ? false : 'above'} disabled={!folder?.parent} onClick={up} data-testid="folder-up" />
      <Button type="submit" data-testid="folder-go">
        {t('picker.go')}
      </Button>
    </form>
  );

  const placeList: { key: string; label: string; path: string }[] = places.data
    ? [
        ...places.data.places.map((p) => ({ key: p.kind, label: t(PLACE_LABEL[p.kind]), path: p.path })),
        ...places.data.roots.map((r) => ({ key: `root:${r.path}`, label: r.name, path: r.path })),
        ...places.data.nearRepos.map((n) => ({ key: `near:${n.path}`, label: n.name, path: n.path })),
      ]
    : [];
  const twice = (label: string) => placeList.filter((p) => p.label.toLowerCase() === label.toLowerCase()).length > 1;
  const placeChips = (
    <div className="picker-places" role="group" aria-label={t('picker.quick')}>
      {placeList.map((p) => {
        const on = folder !== null && same(p.path, folder.path);
        const from = twice(p.label) ? parentName(p.path) : '';
        return (
          <button key={p.key} type="button" className={cx('chip', on && 'is-on')} aria-current={on ? 'true' : undefined} data-testid="folder-place" data-path={p.path} onClick={() => void go(p.path)}>
            {p.label}
            {from ? (
              <>
                {' - '}
                <span className="data" data-raw="">
                  {from}
                </span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const crumbs = folder?.crumbs ?? [];
  const tools = (
    <div className="picker-tools">
      <nav className="crumbs" data-testid="folder-crumbs" aria-label={t('picker.path')}>
        {crumbs.map((c, i) =>
          i === crumbs.length - 1 ? (
            <b key={c.path} data-testid="folder-crumb" data-raw="">
              {c.name}
            </b>
          ) : (
            <Fragment key={c.path}>
              <span data-testid="folder-crumb" data-raw="">
                {c.name}
              </span>
              <span>›</span>
            </Fragment>
          ),
        )}
      </nav>
      <Search label={t('picker.filter')} placeholder={t('picker.filter')} value={filter} onChange={setFilter} onKeyDown={onFilterKey} testId="folder-filter" />
      {hiddenN > 0 ? (
        <Switch
          on={showHidden}
          testId="folder-show-hidden"
          onToggle={() => {
            setShowHidden(!showHidden);
            writeStore(HIDDEN_KEY, showHidden ? '0' : '1');
          }}
        >
          {t('picker.showHidden')}
        </Switch>
      ) : null}
    </div>
  );

  const listAttrs = { 'data-testid': 'folder-list', 'data-path': folder?.path ?? '', 'data-loading': String(nav.loading) };
  let list: ReactNode;
  if (folder?.unreadable) {
    const text = folder.unreadable === 'timeout' ? t('folder.timeout') : platform === 'darwin' ? t('picker.denied') : t('folder.denied');
    list = (
      <div className="picker-list" {...listAttrs}>
        <div className="banner is-warn" data-testid="folder-unreadable" data-reason={folder.unreadable} role="alert">
          <Icon name="alert" />
          <span className="banner-text">{text}</span>
          <Button size="sm" onClick={() => void go(folder.path, true)} data-testid="folder-retry">
            {t('folder.retry')}
          </Button>
        </div>
      </div>
    );
  } else if (!folder || visible.length === 0) {
    const text = !folder ? (nav.error ? errText(nav.error) : t('folder.loading')) : q ? t('folder.filterEmpty', { q: filter.trim() }) : t('folder.empty');
    list = (
      <div className="picker-list" {...listAttrs}>
        <div className={cx('empty', !folder && nav.error !== null && 'is-err')} data-testid={folder ? 'folder-empty' : nav.error ? 'folder-load-error' : undefined}>
          <span>{text}</span>
        </div>
      </div>
    );
  } else {
    list = (
      <div ref={listRef} className="picker-list group" role="listbox" aria-label={folder.path} {...listAttrs}>
        {visible.map((e) => {
          const on = e.path === sel;
          return (
            <div
              key={e.path}
              className={cx('cell', on && 'is-sel')}
              role="option"
              aria-selected={on}
              data-testid="folder-row"
              data-name={e.name}
              data-path={e.path}
              onClick={() => select(e)}
              onDoubleClick={() => open(e)}
            >
              <Icon name="folder" />
              <span className="cell-main">
                <span className="cell-title is-plain" data-raw="">
                  {e.name}
                </span>
                {e.git || e.repo ? (
                  <span className="cell-row">
                    {e.git ? <span className="tag git">{t('picker.tagGit')}</span> : null}
                    {e.repo ? <span className="tag repo">{t('picker.tagRepo')}</span> : null}
                  </span>
                ) : null}
              </span>
              <IconButton
                icon="chev"
                label={t('picker.open', { name: e.name })}
                tooltip={phone ? false : 'above'}
                data-testid="folder-open"
                onClick={(ev) => {
                  ev.stopPropagation();
                  open(e);
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  const status = <p className="picker-status">{folder?.truncated ? t('folder.truncated', { n: entries.length }) : t(phone ? 'picker.hintTouch' : 'picker.hintPointer')}</p>;
  const addButton = (
    <Button variant="primary" size={phone ? 'lg' : undefined} block={phone} disabled={locked} onClick={submit} data-testid="repo-submit">
      {t('picker.add')}
    </Button>
  );
  const foot = (
    <div className="picker-foot">
      <div className="picker-target" data-testid="folder-target" data-path={target?.path ?? ''}>
        <Icon name="folder" />
        <span>{target ? t.node('picker.target', { path: <b data-raw="">{target.path}</b>, name: <b data-raw="">{shownName}</b> }) : null}</span>
      </div>
      <div className="field">
        <label className="label" htmlFor="repo-name">
          {t('picker.name')}
        </label>
        <Input
          id="repo-name"
          invalid={!!regErr?.name}
          value={shownName}
          onChange={(v) => {
            setName(v);
            setNameOwn(true);
            setRegErr(null);
          }}
        />
        {regErr?.name ? (
          <p className="hint is-err" data-testid="error-repo-name">
            {regErr.name}
          </p>
        ) : null}
      </div>
      {phone ? addButton : null}
    </div>
  );

  if (phone) {
    return (
      <FullSheet open onClose={onClose} title={t('repos.add')} cancelLabel={t('folder.cancel')} cancelTestId="folder-cancel" testId="folder-picker">
        <div className="picker">
          {bar}
          {placeChips}
          {tools}
          {list}
          {status}
          {foot}
        </div>
      </FullSheet>
    );
  }
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={t('repos.add')}
      testId="folder-picker"
      foot={
        <>
          <Button variant="ghost" onClick={onClose} data-testid="folder-cancel">
            {t('folder.cancel')}
          </Button>
          {addButton}
        </>
      }
    >
      <div className="picker">
        {bar}
        {tools}
        {placeChips}
        {list}
        {status}
        {foot}
      </div>
    </Dialog>
  );
}
