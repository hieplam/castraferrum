// Repo page `/repos` (UC-19, UC-20 · the approved preview `repo-*`, D-UI9...D-UI11, D-UI20, D-UI21): register a path right at the top
// of the page (the name auto-fills from the last folder and is editable; the **Browse...** button opens the folder picker -, UC-29), the repo table (name,
// path + a "folder is gone" warning, loops using it, registered at, Delete). Deleting a repo no loop uses -> confirm box;
// if loops still use it -> a red banner naming each loop (the server refuses REPO_IN_USE with the names). Every error is translated by `code` / field of the
// server - the web never checks paths itself.
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RepoListItemDto } from '../../../shared/contracts/repos';
import { isApiError } from '../../api/loops-api';
import { useFolderPlaces } from '../../data/folders';
import { browserTimeZone } from '../../data/overview';
import { folderName, useCreateRepo, useDeleteRepo, useRepos } from '../../data/repos';
import { fmtDateTime } from '../../prefs/format';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button, Crumbs, cx, Dialog, EmptyState, PaneHeader, PaneSub, SectionTitle, Skeleton } from '../../ui/components';
import { useToast } from '../../ui/toast';
import { Field } from '../loop-form/ScheduleBuilder';
import { FolderPicker } from './FolderPicker';

type InUse = { name: string; loops: string[]; archived: string[] };

const PATH_ERR: Record<string, MessageKey> = { required: 'repo.val.required', invalid: 'repo.val.notAbsolute', notDirectory: 'repo.val.notFound' };
/** The machine running the console is Mac / Linux: hint in the box + the "not absolute" error in the `/Users/alice/...` style. */
const POSIX_KEY: Partial<Record<MessageKey, MessageKey>> = { 'repo.val.notAbsolute': 'repo.val.notAbsolute.posix', 'repo.add.path.placeholder': 'repo.add.path.placeholder.posix' };

export function ReposScreen() {
  const t = useT();
  const toast = useToast();
  const repos = useRepos();
  const create = useCreateRepo();
  const remove = useDeleteRepo();
  const places = useFolderPlaces();
  const posix = places.data !== undefined && places.data.platform !== 'win32';
  const osKey = (k: MessageKey): MessageKey => (posix ? (POSIX_KEY[k] ?? k) : k);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [pathFocus, setPathFocus] = useState(false);
  const [pathErr, setPathErr] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<RepoListItemDto | null>(null);
  const [inUse, setInUse] = useState<InUse | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const cancel = useCallback(() => setConfirmFor(null), []);
  const closeBrowse = useCallback(() => setBrowsing(false), []);
  // After choosing: fill the path (the name auto-fills as if typed), focus the Register button - Enter registers; it never registers by itself (D-UI40).
  const pickFolder = useCallback((picked: string) => {
    setBrowsing(false);
    setPath(picked);
    setPathErr(null);
    requestAnimationFrame(() => submitRef.current?.focus());
  }, []);

  const auto = nameTouched ? '' : folderName(path);
  const shownName = nameTouched ? name : auto;

  const failToast = (err: unknown) => {
    const code = isApiError(err) ? err.code : 'NETWORK';
    toast.show(t('toast.failed', { msg: t(`error.${code}` as MessageKey) }), 'err');
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!path.trim() || create.isPending) return;
    setInUse(null);
    create.mutate(
      { path: path.trim(), ...(shownName.trim() ? { name: shownName.trim() } : {}) },
      {
        onSuccess: () => {
          setPath('');
          setName('');
          setNameTouched(false);
          setPathErr(null);
          setNameErr(null);
        },
        onError: (err) => {
          setPathErr(null);
          setNameErr(null);
          if (isApiError(err, 'VALIDATION_FAILED')) {
            const p = err.issueFor('path');
            const n = err.issueFor('name');
            if (p) setPathErr(t(osKey(PATH_ERR[p.code] ?? 'repo.val.notFound')));
            if (n) setNameErr(t('repo.val.nameTooLong'));
          } else if (isApiError(err, 'REPO_PATH_TAKEN')) {
            // D-UI21: a duplicate path is reported only at the path field, naming the repo that already exists.
            setPathErr(t('repo.val.pathTaken', { name: String((err.details as { name?: unknown } | undefined)?.name ?? '') }));
          } else if (isApiError(err, 'REPO_NAME_TAKEN')) {
            setNameErr(t('repo.val.nameTaken'));
          } else failToast(err);
        },
      },
    );
  };

  const doDelete = (repo: RepoListItemDto) => {
    setInUse(null);
    remove.mutate(repo.id, {
      onError: (err) => {
        if (isApiError(err, 'REPO_IN_USE')) {
          const d = (err.details ?? {}) as { loops?: string[]; archivedLoops?: string[] };
          setInUse({ name: repo.name, loops: d.loops ?? [], archived: d.archivedLoops ?? [] });
        } else failToast(err);
      },
    });
  };
  // D-UI20: no loop uses it -> ask again; loops still use it -> send at once, the server refuses with the loop names -> red banner.
  const onDelete = (repo: RepoListItemDto) => (repo.loopCount === 0 ? setConfirmFor(repo) : doDelete(repo));

  const list = repos.data ?? [];
  let table: ReactNode;
  if (repos.isPending) {
    table = (
      <div style={{ border: 'var(--border-w) solid var(--border)' }} data-testid="repo-loading">
        {[0, 1, 2, 3].map((i) => (
          <div className="row" key={i}>
            <Skeleton width={`${[62, 48, 70, 55][i]}%`} />
            <Skeleton width={64} />
            <Skeleton width={`${[85, 72, 80, 66][i]}%`} />
            <Skeleton width={84} />
          </div>
        ))}
      </div>
    );
  } else if (repos.isError) {
    table = (
      <EmptyState error glyph="✗" title={t('error.NETWORK')} testId="repo-load-error"
        action={<Button onClick={() => void repos.refetch()}>{t('list.error.retry')}</Button>} />
    );
  } else if (list.length === 0) {
    table = <EmptyState glyph="▣" title={t('repo.empty.title')} testId="repo-empty">{t('repo.empty.body')}</EmptyState>;
  } else {
    const tz = browserTimeZone();
    table = (
      <table className="table" data-testid="repo-table">
        <tbody>
          <tr>
            <th>{t('repo.th.name')}</th>
            <th>{t('repo.th.path')}</th>
            <th>{t('repo.th.loops')}</th>
            <th>{t('repo.th.added')}</th>
            <th />
          </tr>
          {list.map((r) => (
            <tr key={r.id} data-testid="repo-row" data-repo-id={r.id} data-exists={String(r.exists)}>
              <td>
                <span className="repo-tag" data-raw="">{r.name}</span>
              </td>
              <td>
                <span data-raw="">{r.path}</span>
                {!r.exists && (
                  <>
                    {' '}
                    <span className="hint is-warn" data-testid="repo-gone">{t('repo.gone')}</span>
                  </>
                )}
              </td>
              <td data-testid="repo-loop-count" data-n={r.loopCount}>
                {r.loopCount ? t('repo.loops.count', { n: r.loopCount }) : <span className="faint">{t('repo.loops.none')}</span>}
              </td>
              <td>{fmtDateTime(r.createdAt, tz)}</td>
              <td className="act">
                <Button variant="ghost" onClick={() => onDelete(r)} disabled={remove.isPending} data-testid="repo-delete">
                  {t('repo.delete')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <Crumbs>{t('crumb.repos')}</Crumbs>
      <PaneHeader title={t('repo.title')} />
      <PaneSub>{t('repo.lead')}</PaneSub>
      {inUse && (
        <div className="banner inset is-err" role="alert" data-testid="repo-in-use">
          <span className="txt">
            {t.node('repo.inUse', {
              name: <span data-raw="">{inUse.name}</span>,
              n: inUse.loops.length,
              loops: inUse.loops.map((l, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  <b data-raw="">{inUse.archived.includes(l) ? t('repo.inUse.archived', { name: l }) : l}</b>
                </span>
              )),
            })}
          </span>
        </div>
      )}
      <SectionTitle title={t('repo.section.add')} />
      <form className="form-grid repo-add" onSubmit={submit} noValidate data-testid="repo-add">
        <Field label={t('repo.add.path')} htmlFor="repo-path" error={pathErr ?? undefined} hint={<span className="hint">{t('repo.add.path.hint')}</span>}>
          <div className="affix">
            <input
              id="repo-path"
              className={cx('input mono', pathErr && 'is-error', pathFocus && !pathErr && 'is-focus')}
              onFocus={() => setPathFocus(true)}
              onBlur={() => setPathFocus(false)}
              placeholder={places.data ? t(osKey('repo.add.path.placeholder')) : undefined}
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setPathErr(null);
              }}
              autoComplete="off"
              spellCheck={false}
              data-testid="repo-path"
              data-platform={places.data?.platform ?? ''}
              data-raw=""
            />
            <Button title={t('repo.add.browse.title')} onClick={() => setBrowsing(true)} data-testid="repo-browse">
              {t('repo.add.browse')}
            </Button>
          </div>
        </Field>
        <Field
          label={t('repo.add.name')}
          htmlFor="repo-name"
          error={nameErr ?? undefined}
          hint={<span className="hint">{auto ? t('repo.add.name.auto', { folder: auto }) : t('repo.add.name.hint')}</span>}
        >
          <input
            id="repo-name"
            className={cx('input', nameErr && 'is-error')}
            value={shownName}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
              setNameErr(null);
            }}
            autoComplete="off"
            data-testid="repo-name"
            data-raw=""
          />
        </Field>
        <div className="field">
          <span className="label">&nbsp;</span>
          <Button type="submit" variant="primary" ref={submitRef} disabled={!path.trim() || create.isPending} data-testid="repo-submit">
            {t('repo.add.submit')}
          </Button>
        </div>
      </form>
      <SectionTitle title={t('repo.section.list')} extra={repos.isPending || list.length === 0 ? undefined : String(list.length)} />
      {table}
      {browsing && createPortal(<FolderPicker start={path} onPick={pickFolder} onClose={closeBrowse} />, document.body)}
      {confirmFor &&
        createPortal(
          <Dialog
            testId="repo-delete-dialog"
            title={t.node('repo.delete.title', { name: <span data-raw="">{confirmFor.name}</span> })}
            onCancel={cancel}
            footer={
              <>
                <Button variant="ghost" onClick={cancel} data-testid="repo-delete-cancel">
                  {t('repo.delete.cancel')}
                </Button>
                <Button
                  variant="danger-solid"
                  data-testid="repo-delete-confirm"
                  onClick={() => {
                    const r = confirmFor;
                    setConfirmFor(null);
                    doDelete(r);
                  }}
                >
                  {t('repo.delete.confirm')}
                </Button>
              </>
            }
          >
            {t.node('repo.delete.body', { path: <span className="mono" data-raw="">{confirmFor.path}</span> })}
          </Dialog>,
          document.body,
        )}
    </>
  );
}
