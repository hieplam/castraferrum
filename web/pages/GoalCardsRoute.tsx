// `/repos/:id/goal-cards`: the goal card of a repo that waits for an answer, and the earlier cards, opened from the menu of a repo on the Repos page.
import { useParams } from 'react-router';
import { GoalCardView } from '../features/goal-cards/GoalCardView';

export function GoalCardsRoute() {
  const { id = '' } = useParams();
  return <GoalCardView key={id} repoId={id} />;
}
