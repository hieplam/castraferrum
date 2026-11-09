// `/loops/:id/goals`: the goals page of a loop (goal G11), opened from a cell of the loop page.
import { useParams } from 'react-router';
import { GoalsView } from '../features/goals/GoalsView';

export function GoalsRoute() {
  const { id = '' } = useParams();
  return <GoalsView key={id} id={id} />;
}
