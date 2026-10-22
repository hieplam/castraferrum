// The tab bar of the phone (spec 4.5, Tab bar): Loops, Repos, Settings, fixed at the bottom. A `nav`; the current tab has
// `aria-current="page"`. CSS hides it from 640px, where the top bar takes over.
import { Link, useLocation } from 'react-router';
import { useT } from '../prefs/prefs';
import { cx } from '../ui/kit/cx';
import { Icon, type IconName } from '../ui/kit/Icon';
import { activeTab, type Tab } from './active-tab';

export function TabBar() {
  const t = useT();
  const tab = activeTab(useLocation().pathname);
  const item = (key: Tab, to: string, id: string, icon: IconName, label: string) => (
    <Link to={to} className={cx('tabbar-item', tab === key && 'is-on')} aria-current={tab === key ? 'page' : undefined} data-testid={id}>
      <Icon name={icon} />
      {label}
    </Link>
  );
  return (
    <nav className="tabbar" data-testid="tabbar">
      {item('loops', '/', 'tab-loops', 'loops', t('nav.loops'))}
      {item('repos', '/repos', 'tab-repos', 'folder', t('nav.repos'))}
      {item('settings', '/settings', 'tab-settings', 'settings', t('nav.settings'))}
    </nav>
  );
}
