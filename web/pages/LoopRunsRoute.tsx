// `/loops/:id/runs` in the new UI: All runs of a loop.
import { useParams } from 'react-router';
import { LoopRunsView } from '../features/loop-detail/LoopRunsView';

export function LoopRunsRoute() {
  const { id = '' } = useParams();
  return <LoopRunsView key={id} id={id} />;
}
