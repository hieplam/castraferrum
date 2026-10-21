// Create / edit screen (`/loops/new`, `/loops/:id/edit`): load the loop (edit), join the form to the API. Saved -> loop detail;
// Cancel -> loop detail (edit) or "/" (create). Opened from "Duplicate" (`useDuplicateLoop`) it shows the copy note.
import { useLocation, useNavigate } from 'react-router';
import type { LoopDto } from '../../../shared/contracts/loops';
import { isApiError } from '../../api/loops-api';
import { useCreateLoop, useLoop, useUpdateLoop } from '../../data/loops';
import { useT } from '../../prefs/prefs';
import { Crumbs, EmptyState, Skeleton } from '../../ui/components';
import { LoopForm, type SaveFn } from './LoopForm';
import { DUPLICATED_STATE } from './use-duplicate-loop';

export function NewLoopScreen() {
  const navigate = useNavigate();
  const create = useCreateLoop();
  const save: SaveFn = (body) => create.mutateAsync(body);
  return (
    <LoopForm
      key="new"
      base={null}
      latest={null}
      saving={create.isPending}
      onSave={save}
      onSaved={(loop) => navigate(`/loops/${loop.id}`)}
      onCancel={() => navigate('/')}
      onReloadLatest={async () => null}
    />
  );
}

export function EditLoopScreen({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const loop = useLoop(id);
  const update = useUpdateLoop(id);
  const duplicated = (location.state as Record<string, unknown> | null)?.[DUPLICATED_STATE] === true;

  if (loop.isPending) return <FormSkeleton />;
  if (loop.isError || !loop.data) {
    const notFound = isApiError(loop.error, 'LOOP_NOT_FOUND');
    return (
      <EmptyState error glyph="✗" title={t(notFound ? 'error.LOOP_NOT_FOUND' : 'error.NETWORK')} testId="form-load-error">
        <span className="mono" data-raw>{id}</span>
      </EmptyState>
    );
  }
  const save: SaveFn = (body, version) => update.mutateAsync({ ...body, version: version ?? loop.data.version });
  const reloadLatest = async (): Promise<LoopDto | null> => (await loop.refetch()).data ?? null;
  return (
    <LoopForm
      // One form instance per loop: when the loop changes (duplicate, then open the copy) the form is rebuilt from scratch.
      key={id}
      base={loop.data}
      latest={loop.data}
      duplicated={duplicated}
      saving={update.isPending}
      onSave={save}
      onSaved={(saved) => navigate(`/loops/${saved.id}`)}
      onCancel={() => navigate(`/loops/${id}`)}
      onReloadLatest={reloadLatest}
    />
  );
}

/** The edit form while the loop loads (preview form-loading). */
export function FormSkeleton() {
  const f = (w: number) => (
    <div className="field">
      <Skeleton width={w} />
      <Skeleton size="lg" width="100%" />
    </div>
  );
  return (
    <>
      <Crumbs>
        <Skeleton width={200} />
      </Crumbs>
      <div className="ph" data-testid="form-loading">
        <Skeleton size="lg" width={280} />
      </div>
      <div className="form-grid">
        {f(60)}
        {f(80)}
        <div className="span-all">
          <Skeleton size="block" />
        </div>
      </div>
      <Skeleton size="lg" width="70%" />
      <div className="form-grid">
        {f(90)}
        <Skeleton size="block" />
      </div>
    </>
  );
}
