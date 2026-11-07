// `/repos/:id/gate`: the gate queue and record of a repo, opened from the menu of a repo on the Repos page.
import { useParams } from 'react-router';
import { GateView } from '../features/gate/GateView';

export function GateRoute() {
  const { id = '' } = useParams();
  return <GateView key={id} repoId={id} />;
}
