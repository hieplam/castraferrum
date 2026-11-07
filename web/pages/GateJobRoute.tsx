// `/repos/:id/gate/jobs/:jobId`: the record of one gate job, opened from a cell of the gate page.
import { useParams } from 'react-router';
import { GateJobView } from '../features/gate/GateJobView';

export function GateJobRoute() {
  const { id = '', jobId = '' } = useParams();
  return <GateJobView key={jobId} repoId={id} jobId={jobId} />;
}
