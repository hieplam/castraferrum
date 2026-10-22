// Placeholder of the new UI for every path whose screen is not built yet (tasks U15 to U19): it names the path, inside the frame.
import { useLocation } from 'react-router';
import { Page, PageHead } from '../ui/kit/Layout';

export function PendingRoute() {
  const { pathname } = useLocation();
  return (
    <Page testId="pending-route">
      <PageHead title={pathname} />
    </Page>
  );
}
