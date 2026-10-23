// Which of the three tab roots the current path belongs to (spec 4.6): the Loops tab also holds the loop, active period and run
// pages and the editor. An unknown path belongs to none.
export type Tab = 'loops' | 'repos' | 'settings';

export function activeTab(pathname: string): Tab | null {
  if (pathname === '/' || /^\/(loops|executions|runs)(\/|$)/.test(pathname)) return 'loops';
  if (pathname === '/repos' || pathname.startsWith('/repos/')) return 'repos';
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
  return null;
}

/**
 * A page pushed from a tab root (spec 4.6): the loop, All runs, a loop's settings, an active period, a run and the editor. On the
 * phone it shows a navigation bar with the way back instead of the tab bar.
 */
export function isPushed(pathname: string): boolean {
  return /^\/(loops|executions|runs)\/./.test(pathname);
}
