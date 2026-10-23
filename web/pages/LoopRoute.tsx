// `/loops/:id` in the new UI: the loop page.
import { useParams } from 'react-router';
import { LoopView } from '../features/loop-detail/LoopView';

export function LoopRoute() {
  const { id = '' } = useParams();
  return <LoopView key={id} id={id} />;
}
