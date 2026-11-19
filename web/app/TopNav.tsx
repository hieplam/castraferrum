// The top bar of the desktop (spec 4.5, App frame): the brand, the three links with their counts, the connection status and the
// theme button, then, when the console asks for sign-in, the signed-in user and Sign out (remote-access task R5). The phone shows
// the tab bar instead (CSS hides this bar there); its Sign out is the Account group of Settings.
import { Link, useLocation } from 'react-router';
import type { ServerStatus } from '../data/connection';
import { signedInUser, useLogout, useSession } from '../data/auth';
import { useOverview } from '../data/overview';
import { useRepos } from '../data/repos';
import { usePrefs, useT } from '../prefs/prefs';
import { Button, IconButton } from '../ui/kit/Button';
import { cx } from '../ui/kit/cx';
import { activeTab, type Tab } from './active-tab';

/** The connection as the `conn` element shows it: the class, the text key and the two states the tests read. */
export function connOf(status: ServerStatus) {
  if (status.server === 'down') return { tone: 'is-lost', text: 'conn.lost', server: 'down', db: 'wait' } as const;
  if (status.db === 'down') return { tone: 'is-db-down', text: 'conn.dbDown', server: 'ok', db: 'down' } as const;
  if (status.server === 'ok' && status.db === 'ok') return { tone: 'is-ok', text: 'conn.ok', server: 'ok', db: 'ok' } as const;
  return { tone: false, text: 'conn.lost', server: status.server, db: status.db } as const;
}

export function TopNav({ status }: { status: ServerStatus }) {
  const t = useT();
  const { theme, setTheme } = usePrefs();
  const tab = activeTab(useLocation().pathname);
  const loops = useOverview().data?.loops.all;
  const repos = useRepos().data?.length;
  const conn = connOf(status);
  const user = signedInUser(useSession().data);
  const logout = useLogout();
  const link = (key: Tab, to: string, id: string, label: string, count?: { value: number | undefined; testId?: string }) => (
    <Link to={to} className={cx('topbar-link', tab === key && 'is-on')} aria-current={tab === key ? 'page' : undefined} data-testid={id}>
      {label}
      {count?.value !== undefined ? <span data-testid={count.testId}>{count.value}</span> : null}
    </Link>
  );
  return (
    <header className="topbar" data-testid="topbar">
      <span className="topbar-brand">{t('app.title')}</span>
      <nav className="topbar-nav">
        {link('loops', '/', 'nav-loops', t('nav.loops'), { value: loops })}
        {link('repos', '/repos', 'nav-repos', t('nav.repos'), { value: repos, testId: 'nav-repos-count' })}
        {link('settings', '/settings', 'nav-settings', t('nav.settings'))}
      </nav>
      <div className="topbar-end">
        <span className={cx('conn', conn.tone)} data-testid="conn" data-server={conn.server} data-db={conn.db}>
          {t(conn.text)}
        </span>
        <IconButton icon="theme" label={t('theme.switch')} tooltip="below-end" data-testid="toggle-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        {user !== null ? (
          <>
            <span className="topbar-user" data-testid="topbar-user">
              {t.node('signin.signedInAs', { name: <b>{user}</b> })}
            </span>
            <Button size="sm" data-testid="topbar-signout" disabled={logout.isPending} onClick={() => logout.mutate()}>
              {t('signin.signOut')}
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
}
