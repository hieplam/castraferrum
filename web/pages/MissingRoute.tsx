// Placeholder of the new UI for every path whose screen is not built yet (tasks U14 to U19): it names the path.
import { useLocation } from 'react-router';

export function MissingRoute() {
  const { pathname } = useLocation();
  return (
    <main className="page" data-testid="missing-route">
      <h1 className="page-title">{pathname}</h1>
    </main>
  );
}
