// The actions on a loop in the new UI, shared by the Loops page and the loop page (UC-03, 10, 11; D29):
// Start; Stop (the sheet while a run is working, at once otherwise); Duplicate (opens the copy in the editor); Archive and Restore.
// A refused action shows a toast translated by its `code` (D-UI3). Every write goes through `useLoopAction` (web/data): the screen
// never computes a loop's state itself. It follows the classic web/features/loop-detail/actions.tsx, rebuilt without its components.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import type { LoopDto } from '../../../shared/contracts/loops';
import { isApiError } from '../../api/loops-api';
import { useLoopAction, type LoopAction } from '../../data/loops';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { useToast } from '../../ui/toast';
import { DUPLICATED_STATE } from '../loop-form/use-duplicate-loop';

export type LoopActions = {
  /** Start, Stop (at once), Duplicate, Archive or Restore a loop. */
  run(action: LoopAction, id: string): void;
  /** Clicking Stop: a run is working -> the sheet asks first (D29); otherwise the loop stops at once. */
  requestStop(loop: Pick<LoopDto, 'id' | 'activeRun'>): void;
  /** The loop whose Stop sheet is open. */
  confirmId: string | null;
  cancelStop(): void;
  confirmStop(): void;
  /** An action of this loop is on its way to the server: its buttons are locked. */
  isBusy(id: string): boolean;
  /** Stop was pressed and the run is being cancelled (at most 5 seconds). */
  isStopping(id: string): boolean;
};

function toggled(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function useLoopActions(): LoopActions {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const mutation = useLoopAction();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  const { mutateAsync } = mutation;

  const run = useCallback(
    (action: LoopAction, id: string) => {
      setBusy((s) => toggled(s, id, true));
      if (action === 'stop') setStopping((s) => toggled(s, id, true));
      mutateAsync({ action, id })
        .then((result) => {
          // UC-10: open the edit form of the copy right away, with the note "Copy created..."
          if (action === 'duplicate' && result) navigate(`/loops/${(result as { id: string }).id}/edit`, { state: { [DUPLICATED_STATE]: true } });
        })
        .catch((err: unknown) => {
          const code = isApiError(err) ? err.code : 'NETWORK';
          toast.show(t('toast.failed', { msg: t(`error.${code}` as MessageKey) }), 'err');
        })
        .finally(() => {
          setBusy((s) => toggled(s, id, false));
          setStopping((s) => toggled(s, id, false));
        });
    },
    [mutateAsync, navigate, toast, t],
  );

  return {
    run,
    requestStop: (loop) => (loop.activeRun ? setConfirmId(loop.id) : run('stop', loop.id)),
    confirmId,
    cancelStop: useCallback(() => setConfirmId(null), []),
    confirmStop: () => {
      if (confirmId) run('stop', confirmId);
      setConfirmId(null);
    },
    isBusy: (id) => busy.has(id),
    isStopping: (id) => stopping.has(id),
  };
}
