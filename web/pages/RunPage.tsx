// /runs/:id - run detail + the whole log (UC-07).
import { useParams } from 'react-router';
import { RunDetailView } from '../features/loop-detail/RunDetailView';

export function RunPage() {
  const { id = '' } = useParams();
  return <RunDetailView key={id} id={id} />;
}
