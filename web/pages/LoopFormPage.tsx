// /loops/new · /loops/:id/edit - create / edit form + schedule builder (UC-01 · 02 · 09 · 10).
import { useParams } from 'react-router';
import { EditLoopScreen, NewLoopScreen } from '../features/loop-form/LoopFormScreen';

export function LoopFormPage() {
  const { id } = useParams();
  return id ? <EditLoopScreen key={id} id={id} /> : <NewLoopScreen />;
}
