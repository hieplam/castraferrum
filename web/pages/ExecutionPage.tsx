// /executions/:id - execution detail + every session id (UC-08).
import { useParams } from 'react-router';
import { ExecutionDetailView } from '../features/loop-detail/ExecutionDetailView';

export function ExecutionPage() {
  const { id = '' } = useParams();
  return <ExecutionDetailView key={id} id={id} />;
}
