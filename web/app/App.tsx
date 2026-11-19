// The app: the routes of the UI (web/app/AppRoutes.tsx). Since the cut-over (UI uplift, task U25) there is one UI. The session
// keeps the live connection and the cache in step with sign-in and Sign out (web/data/auth.ts, remote-access task R5).
import { useAuthSync } from '../data/auth';
import { AppRoutes } from './AppRoutes';

export function App() {
  useAuthSync();
  return <AppRoutes />;
}
