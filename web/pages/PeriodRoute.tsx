// `/executions/:id` in the new UI: the active period page.
import { useParams } from 'react-router';
import { PeriodView } from '../features/loop-detail/PeriodView';

export function PeriodRoute() {
  const { id = '' } = useParams();
  return <PeriodView key={id} id={id} />;
}
