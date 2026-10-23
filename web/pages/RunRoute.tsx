// `/runs/:id` in the new UI: the run page and its transcript.
import { useParams } from 'react-router';
import { RunView } from '../features/loop-detail/RunView';

export function RunRoute() {
  const { id = '' } = useParams();
  return <RunView key={id} id={id} />;
}
