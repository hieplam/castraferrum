// The frame of the new UI (spec 5.1): the top bar (desktop), the status banner (first inside the page), the page under it, and the
// tab bar (phone). The connection status is read once here and shared with the pages that show it (Settings).
import { Outlet } from 'react-router';
import { ServerStatusContext, useServerStatus } from '../data/connection';
import { PageTopProvider } from '../ui/kit/Layout';
import { StatusBanner } from './StatusBanner';
import { TabBar } from './TabBar';
import { TopNav } from './TopNav';

export function Frame() {
  const status = useServerStatus();
  return (
    <ServerStatusContext.Provider value={status}>
      <div className="app">
        <TopNav status={status} />
        <PageTopProvider value={<StatusBanner status={status} />}>
          <Outlet />
        </PageTopProvider>
        <TabBar />
      </div>
    </ServerStatusContext.Provider>
  );
}
