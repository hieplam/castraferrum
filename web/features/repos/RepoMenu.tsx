// The `⋯` menu of a repo (spec 5.7): Merge gate (opens the gate page of the repo), Goal cards (opens the goal cards page) and Delete. A popover menu on the desktop, a sheet of actions on the phone.
import { useNavigate } from 'react-router';
import type { RepoListItemDto } from '../../../shared/contracts/repos';
import { useT } from '../../prefs/prefs';
import { IconButton } from '../../ui/kit/Button';
import { useLayout } from '../../ui/kit/Layout';
import { Menu } from '../../ui/kit/Overlay';

export function RepoMenu({ repo, disabled, onDelete }: { repo: RepoListItemDto; disabled?: boolean; onDelete(repo: RepoListItemDto): void }) {
  const t = useT();
  const layout = useLayout();
  const navigate = useNavigate();
  return (
    <Menu
      label={t('act.more')}
      phoneSheet="items"
      items={[
        { id: 'gate', label: t('goalLoop.gate.title'), testId: 'repo-gate', onSelect: () => navigate(`/repos/${repo.id}/gate`) },
        { id: 'goal-cards', label: t('goalLoop.cards.menu'), testId: 'repo-goal-cards', onSelect: () => navigate(`/repos/${repo.id}/goal-cards`) },
        { id: 'delete', label: t('repos.delete'), testId: 'repo-delete', danger: true, disabled, onSelect: () => onDelete(repo) },
      ]}
      trigger={(props) => <IconButton icon="more" label={t('act.more')} tooltip={layout === 'phone' ? false : 'above'} data-testid="repo-menu" {...props} />}
    />
  );
}
