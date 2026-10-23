// `/loops/:id/settings` in the new UI: the settings and prompt of a loop.
import { useParams } from 'react-router';
import { LoopSettingsView } from '../features/loop-detail/LoopSettingsView';

export function LoopSettingsRoute() {
  const { id = '' } = useParams();
  return <LoopSettingsView key={id} id={id} />;
}
