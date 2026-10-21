// Top bar: brand · navigation Loop | Repo (D-UI9, with the repo count) · overview (features/overview -
// phase 1) · VI/EN · light/dark · server + db lights.
import { Link, useLocation } from 'react-router';
import type { ServerStatus } from '../data/connection';
import { useRepos } from '../data/repos';
import { TopStats } from '../features/overview/TopStats';
import type { Lang } from '../prefs/messages';
import { usePrefs, useT, type Theme } from '../prefs/prefs';
import { Brand, cx, Lamp, Toggle } from '../ui/components';

export function TopBar({ status }: { status: ServerStatus }) {
  const t = useT();
  const { lang, theme, setLang, setTheme } = usePrefs();
  const onRepos = useLocation().pathname.startsWith('/repos');
  const repos = useRepos().data;
  return (
    <header className="topbar" data-testid="topbar">
      <Brand>{t('app.title')}</Brand>
      <nav className="topnav">
        <Link to="/" className={cx(!onRepos && 'is-on')} data-testid="nav-loops">
          {t('nav.loops')}
        </Link>
        <Link to="/repos" className={cx(onRepos && 'is-on')} data-testid="nav-repos">
          {t('nav.repos')}
          <span className="n" data-testid="nav-repos-count">{repos ? repos.length : '–'}</span>
        </Link>
      </nav>
      <TopStats stale={status.stale} />
      <span className="spacer" />
      <Toggle
        label={t('top.lang.label')}
        testId="toggle-lang"
        current={lang}
        options={[
          { value: 'en', label: t('top.lang.en') },
          { value: 'vi', label: t('top.lang.vi') },
        ]}
        onSelect={(v) => setLang(v as Lang)}
      />
      <Toggle
        label={t('top.theme.label')}
        testId="toggle-theme"
        current={theme}
        options={[
          { value: 'light', label: t('top.theme.light') },
          { value: 'dark', label: t('top.theme.dark') },
        ]}
        onSelect={(v) => setTheme(v as Theme)}
      />
      <Lamp state={status.server} testId="lamp-server">
        {t('top.lamp.server')}
      </Lamp>
      <Lamp state={status.db} testId="lamp-db">
        {t('top.lamp.db')}
      </Lamp>
    </header>
  );
}
