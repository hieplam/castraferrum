// UC-10 - Duplicate: call `POST /loops/:id/duplicate`, then open the edit form of the copy (preview form-duplicate: the note
// "Copy created..."). The "Duplicate" button sits in the ... menu of a list row and of the loop detail - both call
// this hook for one behaviour. Refused -> a red toast by `code` (D-UI3).
import { useNavigate } from 'react-router';
import { isApiError } from '../../api/loops-api';
import { useLoopAction } from '../../data/loops';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { useToast } from '../../ui/toast';

/** Key in `location.state` of `/loops/:id/edit` right after a duplicate. */
export const DUPLICATED_STATE = 'duplicated';

export function useDuplicateLoop(): { duplicate(id: string): Promise<void>; pending: boolean } {
  const action = useLoopAction();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  return {
    pending: action.isPending,
    async duplicate(id: string) {
      try {
        const copy = await action.mutateAsync({ action: 'duplicate', id });
        if (copy) navigate(`/loops/${copy.id}/edit`, { state: { [DUPLICATED_STATE]: true } });
      } catch (err) {
        toast.show(t('toast.failed', { msg: isApiError(err) ? t(`error.${err.code}` as MessageKey) : String(err) }), 'err');
      }
    },
  };
}
