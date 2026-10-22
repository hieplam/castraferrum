// The `⋯` menu of a table row (desktop): Open, Edit, Duplicate, and Archive or Restore. A loop that is active cannot be archived: the
// item says so ("Archive (stop it first)") and is disabled.
import { useNavigate } from 'react-router';
import type { LoopAction } from '../../data/loops';
import { useT } from '../../prefs/prefs';
import { IconButton } from '../../ui/kit/Button';
import { Menu, type MenuItem } from '../../ui/kit/Overlay';
import type { LoopItem } from './row-view';

export function RowMenu({ item, onAction }: { item: LoopItem; onAction(action: LoopAction): void }) {
  const t = useT();
  const navigate = useNavigate();
  const { loop, row } = item;
  const items: MenuItem[] = [
    { id: 'open', label: t('act.open'), testId: 'menu-open', onSelect: () => navigate(`/loops/${loop.id}`) },
    { id: 'edit', label: t('act.edit'), testId: 'menu-edit', onSelect: () => navigate(`/loops/${loop.id}/edit`) },
    { id: 'duplicate', label: t('act.duplicate'), testId: 'menu-duplicate', onSelect: () => onAction('duplicate') },
    row.archived
      ? { id: 'restore', label: t('act.restore'), testId: 'menu-restore', separatorBefore: true, onSelect: () => onAction('restore') }
      : {
          id: 'archive',
          label: row.active ? t('act.archiveLocked') : t('act.archive'),
          testId: 'menu-archive',
          separatorBefore: true,
          disabled: row.active,
          onSelect: () => onAction('archive'),
        },
  ];
  return (
    <Menu
      label={t('act.more')}
      items={items}
      hangsFrom="row"
      trigger={(props) => <IconButton icon="more" label={t('act.more')} data-testid="row-menu" {...props} />}
    />
  );
}
