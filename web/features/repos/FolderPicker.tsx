// Folder picker box - the "Browse..." button of the Repo page (UC-29 · preview `repo-browse*`, D-UI34...D-UI41). The browser does not
// tell a web page the absolute path of the folder the user picked, so the server (same machine) lists folders; this box only
// draws + navigates. Every path (parent, breadcrumb, child folders, drives) comes from the server - the box never joins / splits paths,
// so it behaves the same with Windows `C:\...` and Mac `/Users/alice/...`.
//
// Keyboard (the Filter box is the center - clicking a row also returns focus here): type = filter · up/down = select a row · Enter = open the selected row
// (if the filter leaves exactly one row, open that row) · Backspace on an empty filter / Alt+Up / Cmd+Up = go to the parent · Ctrl/Cmd+Enter = Choose · Esc =
// clear the filter, with an empty filter close the box. Path bar: Enter = go to, Esc = return to the open folder.
import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { FolderEntryDto, FolderPlacesDto } from '../../../shared/contracts/folders';
import { isApiError } from '../../api/loops-api';
import { useFolderNav, useFolderPlaces } from '../../data/folders';
import { folderName } from '../../data/repos';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button, cx, Dialog, EmptyState, Skeleton } from '../../ui/components';

/** The folder opened last time + the "show hidden folders" switch - remembered in the browser (a convenience, not required: on error skip it). */
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
    // the browser blocks saving (private mode) - only the "remember" part is lost, the box still works
  }
}

const PLACE_GLYPH: Record<FolderPlacesDto['places'][number]['kind'], string> = { home: '⌂', desktop: '▭', documents: '≡', downloads: '↓' };
const PLACE_LABEL: Record<Exclude<FolderPlacesDto['places'][number]['kind'], 'home'>, MessageKey> = {
  desktop: 'folder.place.desktop',
  documents: 'folder.place.documents',
  downloads: 'folder.place.downloads',
};

type Target = { path: string; name: string; repo: string | null };

/** "Will choose": the parent part faded (cut with "…" when long) + the folder name bold (always visible). Only cuts the string the server returned, does not understand paths. */
function splitTarget(t: Target): [head: string, tail: string] {
  return t.path.endsWith(t.name) && t.path.length > t.name.length ? [t.path.slice(0, t.path.length - t.name.length), t.name] : ['', t.path];
}

export function FolderPicker({ start, onPick, onClose }: { start: string; onPick(path: string): void; onClose(): void }) {
  const t = useT();
  const places = useFolderPlaces();
  const nav = useFolderNav();
  const { folder } = nav;
  const platform = places.data?.platform;
  const [typed, setTyped] = useState(start);
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(() => readStore(HIDDEN_KEY) === '1');
  const pathRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Going up to the parent preselects the folder just left (like Explorer / Finder). */
  const reselect = useRef<string | null>(null);

  // Opening the box: the path already in the field -> the folder opened last time -> the folder next to the most-registered repo -> the home folder.
  useEffect(() => {
    const tries = [start.trim(), readStore(LAST_KEY), places.data?.nearRepos[0]?.path].filter((p): p is string => !!p);
    void nav.open([...new Set(tries), null]);
    const id = requestAnimationFrame(() => filterRef.current?.focus());
    return () => cancelAnimationFrame(id);
    // only once when the box opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving at a new folder: path bar = the canonical path, clear the filter, reselect the folder just left (when going up), scroll to the top.
  useEffect(() => {
    if (!folder) return;
    setTyped(folder.path);
    setFilter('');
    setSel(reselect.current);
    reselect.current = null;
    if (listRef.current) listRef.current.scrollTop = 0;
    if (document.activeElement !== pathRef.current) filterRef.current?.focus();
  }, [folder]);

  useEffect(() => {
    listRef.current?.querySelector('.fp-row.is-sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const go = useCallback((path: string | null, fresh?: boolean) => {
    reselect.current = null;
    return nav.go(path, fresh);
  }, [nav]);
  const up = () => {
    if (!folder?.parent) return;
    reselect.current = folder.path; // the [folder] effect reselects when the parent folder finishes loading
    void nav.go(folder.parent);
  };

  const same = (a: string, b: string) => (platform === 'linux' ? a === b : a.toLowerCase() === b.toLowerCase());
  const entries = folder?.entries ?? [];
  const hiddenN = entries.filter((e) => e.hidden).length;
  const q = filter.trim().toLowerCase();
  const visible = entries.filter((e) => (showHidden || !e.hidden) && (!q || e.name.toLowerCase().includes(q)));
  const selected = visible.find((e) => e.path === sel) ?? null;
  const target: Target | null = selected ?? (folder ? { path: folder.path, name: folder.name, repo: folder.repo } : null);

  const choose = () => {
    if (!folder || !target || target.repo) return;
    writeStore(LAST_KEY, folder.path);
    onPick(target.path);
  };
  const open = (e: FolderEntryDto) => void go(e.path);

  const onFilterKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.altKey || e.metaKey) && e.key === 'ArrowUp') {
      e.preventDefault();
      up();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!visible.length) return;
      const i = visible.findIndex((x) => x.path === sel);
      const next = e.key === 'ArrowDown' ? Math.min(i + 1, visible.length - 1) : i < 0 ? visible.length - 1 : Math.max(i - 1, 0);
      setSel(visible[next]!.path);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) return choose();
      const row = selected ?? (visible.length === 1 ? visible[0] : null);
      if (row) open(row);
    } else if (e.key === 'Backspace' && filter === '') {
      e.preventDefault();
      up();
    } else if (e.key === 'Escape' && filter) {
      e.stopPropagation(); // clear the filter first, do not close the box yet
      setFilter('');
    }
  };
  const onPathKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void go(typed.trim() || null).then((ok) => ok && filterRef.current?.focus());
    } else if (e.key === 'Escape' && folder && typed !== folder.path) {
      e.stopPropagation();
      setTyped(folder.path);
    }
  };

  const errText = (err: unknown): string | null => {
    if (!err) return null;
    if (isApiError(err, 'VALIDATION_FAILED')) {
      if (err.issueFor('path')?.code === 'invalid') return t(platform && platform !== 'win32' ? 'repo.val.notAbsolute.posix' : 'repo.val.notAbsolute');
      return t('repo.val.notFound');
    }
    return t(`error.${isApiError(err) ? err.code : 'NETWORK'}` as MessageKey);
  };
  const barErr = folder ? errText(nav.error) : null;

  const place = (key: string, glyph: string, label: string, path: string, sub?: string) => (
    <button
      type="button"
      key={key}
      className={cx('fp-place', folder && same(path, folder.path) && 'is-on')}
      title={path}
      onClick={() => void go(path)}
      data-testid="folder-place"
      data-path={path}
    >
      <span className="g">{glyph}</span>
      <span className="nm">
        {label}
        {sub && <span className="sub"> · {sub}</span>}
      </span>
    </button>
  );

  let list;
  if (!folder) {
    list = nav.error ? (
      <EmptyState size="sm" error glyph="✗" testId="folder-load-error">
        {errText(nav.error)}
      </EmptyState>
    ) : (
      [62, 45, 70, 50, 38].map((w, i) => (
        <div className="fp-row" key={i}>
          <span />
          <Skeleton width={`${w}%`} />
          <span />
          <span />
        </div>
      ))
    );
  } else if (folder.unreadable) {
    list = (
      <div className="note" data-testid="folder-unreadable" data-reason={folder.unreadable}>
        <span className="glyph">⊘</span>
        <span className="txt">{t(folder.unreadable === 'timeout' ? 'folder.timeout' : platform === 'darwin' ? 'folder.denied.darwin' : 'folder.denied')}</span>
        <Button onClick={() => void go(folder.path, true)} data-testid="folder-retry">
          {t('folder.retry')}
        </Button>
      </div>
    );
  } else if (!visible.length) {
    list = (
      <EmptyState size="sm" testId="folder-empty">
        {q ? t('folder.filterEmpty', { q: filter.trim() }) : t('folder.empty')}
      </EmptyState>
    );
  } else {
    list = visible.map((e) => (
      <div
        key={e.path}
        className={cx('fp-row', e.git && 'is-git', e.hidden && 'is-hidden', e.path === sel && 'is-sel')}
        title={e.path}
        role="option"
        aria-selected={e.path === sel}
        onClick={() => {
          setSel(e.path);
          filterRef.current?.focus();
        }}
        onDoubleClick={() => open(e)}
        data-testid="folder-row"
        data-name={e.name}
        data-path={e.path}
      >
        <span className="g">{e.git ? '▣' : '▢'}</span>
        <span className="nm">{e.name}</span>
        <span className="tags">
          {e.git && <span className="tag-git">{t('folder.tag.git')}</span>}
          {e.repo && <span className="tag-repo">{t('folder.tag.repo', { name: e.repo })}</span>}
        </span>
        <span
          className="go"
          title={t('folder.open', { name: e.name })}
          onClick={(ev) => {
            ev.stopPropagation();
            open(e);
          }}
          data-testid="folder-open"
        >
          ›
        </span>
      </div>
    ));
  }

  const [head, tail] = target ? splitTarget(target) : ['', ''];
  return (
    <Dialog
      wide
      className="fp"
      testId="folder-picker"
      title={t('folder.title')}
      onCancel={onClose}
      footer={
        <>
          <div className="fp-target" data-testid="folder-target" data-path={target?.path ?? ''}>
            <span className="label">{t('folder.target')}</span>
            <span className="path">
              <span className="head">{head}</span>
              <span className="tail">{tail}</span>
            </span>
            {target?.repo && <span className="hint is-warn">{t('folder.target.taken', { name: target.repo })}</span>}
          </div>
          <Button variant="ghost" onClick={onClose} data-testid="folder-cancel">
            {t('folder.cancel')}
          </Button>
          <Button variant="primary" onClick={choose} disabled={!target || !!target.repo || nav.loading} data-testid="folder-choose">
            {t('folder.choose')}
          </Button>
        </>
      }
    >
      <div className="fp-bar">
        <Button icon title={t('folder.up')} aria-label={t('folder.up')} onClick={up} disabled={!folder?.parent} data-testid="folder-up">
          ↑
        </Button>
        <input
          ref={pathRef}
          className={cx('input mono', barErr && 'is-error')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onPathKey}
          aria-label={t('folder.path')}
          autoComplete="off"
          spellCheck={false}
          data-testid="folder-path"
          data-raw=""
        />
        <Button onClick={() => void go(typed.trim() || null)} data-testid="folder-go">
          {t('folder.go')}
        </Button>
      </div>
      {barErr && (
        <span className="hint is-error" data-testid="folder-error">
          {barErr}
        </span>
      )}
      <nav className="fp-crumbs" data-testid="folder-crumbs">
        {folder?.crumbs.map((c, i) =>
          i === folder.crumbs.length - 1 ? (
            <span className="is-cur" key={c.path} data-raw="">
              {c.name}
            </span>
          ) : (
            <Fragment key={c.path}>
              <button type="button" onClick={() => void go(c.path)} data-testid="folder-crumb" data-raw="">
                {c.name}
              </button>
              <span>›</span>
            </Fragment>
          ),
        )}
      </nav>
      <div className="fp-main">
        <aside className="fp-side" data-testid="folder-side">
          {places.data && (
            <>
              <span className="label">{t('folder.side.places')}</span>
              {places.data.places.map((p) =>
                place(p.kind, PLACE_GLYPH[p.kind], p.kind === 'home' ? folderName(p.path) || p.path : t(PLACE_LABEL[p.kind]), p.path),
              )}
              <span className="label">{t('folder.side.roots')}</span>
              {places.data.roots.map((r) => place(`root:${r.path}`, '◫', r.name, r.path))}
              {places.data.nearRepos.length > 0 && (
                <>
                  <span className="label">{t('folder.side.near')}</span>
                  {places.data.nearRepos.map((n) => place(`near:${n.path}`, '▣', n.name, n.path, n.repos.join(', ')))}
                </>
              )}
            </>
          )}
        </aside>
        <div className="fp-pane">
          <div className="fp-tools">
            <input
              ref={filterRef}
              className="input"
              placeholder={t('folder.filter')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={onFilterKey}
              aria-label={t('folder.filter')}
              autoComplete="off"
              spellCheck={false}
              data-testid="folder-filter"
            />
            {hiddenN > 0 && (
              <label className="fp-check">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => {
                    setShowHidden(e.target.checked);
                    writeStore(HIDDEN_KEY, e.target.checked ? '1' : '0');
                  }}
                  data-testid="folder-show-hidden"
                />
                {t('folder.showHidden', { n: hiddenN })}
              </label>
            )}
          </div>
          <div
            ref={listRef}
            className={cx('fp-list', nav.loading && folder && 'is-stale')}
            role="listbox"
            aria-label={folder?.path}
            data-testid="folder-list"
            data-path={folder?.path ?? ''}
            data-loading={String(nav.loading)}
          >
            {list}
          </div>
          <div className="fp-status">
            <span>{t('folder.count', { n: folder && !folder.unreadable ? visible.length : 0 })}</span>
            <span className="spacer" />
            <span>{folder?.truncated ? t('folder.truncated', { n: entries.length }) : t('folder.keys')}</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
