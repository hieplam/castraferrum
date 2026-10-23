// One repo as a cell of the inset list (spec 5.7, `m-repos-light`): its name, its path (one line, cut), "Folder is gone" when the
// folder no longer exists, the number of loops that use it, and its `⋯` menu.
import type { RepoListItemDto } from '../../../shared/contracts/repos';
import { useT } from '../../prefs/prefs';
import { RowCell } from '../../ui/kit/Group';
import { Pill } from '../../ui/kit/Pill';
import { RepoMenu } from './RepoMenu';

export function RepoCell({ repo, busy, onDelete }: { repo: RepoListItemDto; busy: boolean; onDelete(repo: RepoListItemDto): void }) {
  const t = useT();
  return (
    <RowCell testId="repo-row" data={{ 'data-repo-id': repo.id, 'data-exists': String(repo.exists) }}>
      <span className="cell-main">
        <span className="cell-title" data-testid="repo-row-name" data-raw="">
          {repo.name}
        </span>
        <span className="cell-meta is-one-line is-data" data-raw="">
          {repo.path}
        </span>
        {repo.exists ? null : (
          <span className="cell-row">
            <Pill tone="warn" testId="repo-gone">
              {t('status.folderGone')}
            </Pill>
          </span>
        )}
      </span>
      <span className="cell-value" data-testid="repo-loop-count" data-n={repo.loopCount}>
        {t.tn('repos.loops', repo.loopCount)}
      </span>
      <RepoMenu repo={repo} disabled={busy} onDelete={onDelete} />
    </RowCell>
  );
}
