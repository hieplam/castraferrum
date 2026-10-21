// /loops/:id - loop detail + live log + history (UC-06 · UC-11).
import { useParams } from 'react-router';
import { LoopDetailView } from '../features/loop-detail/LoopDetailView';

export function LoopDetailPage() {
  const { id = '' } = useParams();
  return <LoopDetailView key={id} id={id} />;
}
