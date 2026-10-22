// The repo filter of the toolbar (UC-25): a menu on the desktop, a sheet on the phone (the same Menu, drawn by width).
// The button shows the repo being filtered; `data-active` says whether a repo is chosen.
import type { RepoDto } from '../../../shared/contracts/repos';
import { useT } from '../../prefs/prefs';
import { Button, IconButton } from '../../ui/kit/Button';
import { Icon } from '../../ui/kit/Icon';
import { useLayout } from '../../ui/kit/Layout';
import { Menu, type MenuItem } from '../../ui/kit/Overlay';

export function RepoFilter({ repos, value, onChange, disabled }: { repos: readonly RepoDto[]; value: string | null; onChange(repoId: string | null): void; disabled: boolean }) {
  const t = useT();
  const layout = useLayout();
  const picked = repos.find((r) => r.id === value) ?? null;
  const items: MenuItem[] = [
    { id: 'all', label: t('loops.repoAll'), testId: 'repo-filter-all', on: picked === null, onSelect: () => onChange(null) },
    ...repos.map((r) => ({ id: r.id, label: <span data-raw="">{r.name}</span>, testId: `repo-filter-${r.id}`, on: r.id === picked?.id, onSelect: () => onChange(r.id) })),
  ];
  const active = picked !== null ? 'true' : 'false';
  return (
    <Menu
      label={t('loops.repoFilter')}
      items={items}
      trigger={(props) =>
        layout === 'phone' ? (
          <IconButton bordered icon="filter" label={t('loops.repoFilter')} tooltip={false} disabled={disabled} data-testid="repo-filter" data-active={active} {...props} />
        ) : (
          <Button disabled={disabled} data-testid="repo-filter" data-active={active} {...props}>
            {picked ? <span data-raw="">{picked.name}</span> : t('loops.repoAll')}
            <Icon name="down" />
          </Button>
        )
      }
    />
  );
}
