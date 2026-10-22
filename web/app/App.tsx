// The UI switch (UI uplift, task U13): the classic routes or the new ones, as web/main.tsx decided from `uiVersion()`.
// With ClassicRoutes, the only file outside the classic list allowed to import it (rule no-new-ui-to-classic).
import type { UiVersion } from '../prefs/ui-version';
import { AppRoutes } from './AppRoutes';
import { ClassicRoutes } from './ClassicRoutes';

export function App({ ui }: { ui: UiVersion }) {
  return ui === 'new' ? <AppRoutes /> : <ClassicRoutes />;
}
