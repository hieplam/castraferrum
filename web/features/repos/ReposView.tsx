// The Repos page of the new UI (spec 5.7, `m-repos-light`): the title and Add a repo, the explanation, and the repos as one inset
// list (name, path, "Folder is gone", the loop count, a `⋯` with Delete). Add a repo opens the folder picker (AddRepo). Deleting a
// repo no loop uses asks first (a dialog on the desktop, a sheet on the phone); a repo loops still use is sent at once and the
// server refuses it, naming those loops (REPO_IN_USE), in a banner above the list. Data comes from web/data (`GET /api/repos`).
import { useCallback, useState } from 'react';
import type { RepoListItemDto } from '../../../shared/contracts/repos';
import { isApiError } from '../../api/loops-api';
import { useDeleteRepo, useRepos } from '../../data/repos';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { useToast } from '../../ui/toast';
import { Banner } from '../../ui/kit/Banner';
import { Button, IconButton } from '../../ui/kit/Button';
import { Group } from '../../ui/kit/Group';
import { Page, PageHead, useLayout } from '../../ui/kit/Layout';
import { Dialog } from '../../ui/kit/Overlay';
import { AddRepo } from './AddRepo';
import { RepoCell } from './RepoCell';

type InUse = { loops: string[]; archived: string[] };

/** Four placeholder cells while the list loads. */
function Skeleton() {
  return (
    <div className="group" data-testid="repo-loading" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div className="cell" key={i}>
          <div className="cell-main">
            <span className="skeleton is-line" />
            <span className="skeleton is-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReposView() {
  const t = useT();
  const toast = useToast();
  const layout = useLayout();
  const phone = layout === 'phone';
  const repos = useRepos();
  const remove = useDeleteRepo();
  const [adding, setAdding] = useState(false);
  const [confirmFor, setConfirmFor] = useState<RepoListItemDto | null>(null);
  const [inUse, setInUse] = useState<InUse | null>(null);
  const closeAdd = useCallback(() => setAdding(false), []);
  const cancelDelete = useCallback(() => setConfirmFor(null), []);

  const doDelete = (repo: RepoListItemDto) => {
    setInUse(null);
    remove.mutate(repo.id, {
      onError: (err) => {
        if (isApiError(err, 'REPO_IN_USE')) {
          const d = (err.details ?? {}) as { loops?: string[]; archivedLoops?: string[] };
          setInUse({ loops: d.loops ?? [], archived: d.archivedLoops ?? [] });
        } else {
          toast.show(t('toast.failed', { msg: t(`error.${isApiError(err) ? err.code : 'NETWORK'}` as MessageKey) }), 'err');
        }
      },
    });
  };
  // No loop uses it: ask first. Loops still use it: send at once; the server refuses with their names.
  const onDelete = (repo: RepoListItemDto) => (repo.loopCount === 0 ? setConfirmFor(repo) : doDelete(repo));
  const confirmDelete = () => {
    const repo = confirmFor;
    setConfirmFor(null);
    if (repo) doDelete(repo);
  };
  const openAdd = () => {
    setInUse(null);
    setAdding(true);
  };

  let list;
  if (repos.isPending) list = <Skeleton />;
  else if (repos.isError) {
    list = (
      <div className="empty is-err" data-testid="repo-load-error" role="alert">
        <b>{t('error.NETWORK')}</b>
        <Button onClick={() => void repos.refetch()}>{t('list.error.retry')}</Button>
      </div>
    );
  } else if (repos.data.length === 0) {
    list = (
      <div className="empty" data-testid="repo-empty">
        <b>{t('repos.emptyTitle')}</b>
      </div>
    );
  } else {
    list = (
      <Group testId="repo-table">
        {repos.data.map((r) => (
          <RepoCell key={r.id} repo={r} busy={remove.isPending} onDelete={onDelete} />
        ))}
      </Group>
    );
  }

  const deleteBody = t('repos.deleteBody');
  return (
    <Page narrow>
      <PageHead title={t('repos.title')} large root>
        {phone ? (
          <IconButton icon="plus" label={t('repos.add')} tooltip={false} onClick={openAdd} data-testid="repo-add" />
        ) : (
          <Button variant="primary" icon="plus" onClick={openAdd} data-testid="repo-add">
            {t('repos.add')}
          </Button>
        )}
      </PageHead>
      <p className="page-desc">{t('repos.note')}</p>
      {inUse ? (
        <Banner tone="err" alert testId="repo-in-use">
          {t.node('repos.deleteBlocked', {
            list: inUse.loops.map((l, i) => (
              <span key={i}>
                {i > 0 ? ', ' : null}
                <b data-raw="">{inUse.archived.includes(l) ? t('repo.inUse.archived', { name: l }) : l}</b>
              </span>
            )),
          })}
        </Banner>
      ) : null}
      {list}
      {adding ? <AddRepo onClose={closeAdd} /> : null}
      <Dialog
        open={confirmFor !== null}
        onClose={cancelDelete}
        testId="repo-delete-dialog"
        title={t.node('repos.deleteTitle', { name: <span data-raw="">{confirmFor?.name ?? ''}</span> })}
        foot={
          phone ? (
            <>
              <Button variant="danger-solid" size="lg" block onClick={confirmDelete} data-testid="repo-delete-confirm">
                {t('repo.delete.confirm')}
              </Button>
              <Button variant="plain" size="lg" block onClick={cancelDelete} data-testid="repo-delete-cancel">
                {t('repo.delete.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={cancelDelete} data-testid="repo-delete-cancel">
                {t('repo.delete.cancel')}
              </Button>
              <Button variant="danger-solid" onClick={confirmDelete} data-testid="repo-delete-confirm">
                {t('repo.delete.confirm')}
              </Button>
            </>
          )
        }
      >
        {phone ? <p>{deleteBody}</p> : deleteBody}
      </Dialog>
    </Page>
  );
}
