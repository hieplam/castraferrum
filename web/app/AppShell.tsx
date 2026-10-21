// App frame (the layout, the approved preview): top bar 44px -> connection status banner -> split: list pane
// 520px (every path) | main pane by path. Below 1100px components.css drops the split: "/" shows only the list
// (`.split.at-root`), other screens show only the main pane + a "<- List" button.
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useServerStatus } from '../data/connection';
import { LoopListPane } from '../features/loop-list/LoopListPane';
import { useT } from '../prefs/prefs';
import { Button, cx } from '../ui/components';
import { ConnectionBanner } from './ConnectionBanner';
import { TopBar } from './TopBar';

export function AppShell() {
  const t = useT();
  const status = useServerStatus();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const root = pathname === '/';
  return (
    <div className="app">
      <TopBar status={status} />
      <ConnectionBanner status={status} />
      <div className={cx('split', root && 'at-root')}>
        <aside className="pane-list" data-testid="pane-list">
          <LoopListPane />
        </aside>
        <main className="pane-main" data-testid="pane-main">
          {!root && (
            <Button variant="ghost" className="back-link" onClick={() => navigate('/')}>
              {t('list.back')}
            </Button>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
