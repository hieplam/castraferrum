// `/loops/new` and `/loops/:id/edit` in the new UI: the editor.
import { useParams } from 'react-router';
import { EditLoopEditor, NewLoopEditor } from '../features/loop-form/EditorView';

export function EditorRoute() {
  const { id } = useParams();
  return id ? <EditLoopEditor key={id} id={id} /> : <NewLoopEditor />;
}
