// The frame of the new UI, minimal until its task (U14) draws the whole frame: the top bar with the brand, then the page.
import { Outlet } from 'react-router';

export function Frame() {
  return (
    <div className="app">
      <header className="topbar" data-testid="topbar">
        <span className="topbar-brand">Castraferrum</span>
      </header>
      <Outlet />
    </div>
  );
}
