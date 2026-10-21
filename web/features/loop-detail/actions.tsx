// Actions on a loop in the detail screen: Start / Stop (D-UI1: ask only when a run is running; D-UI5: while stopping -> the button is
// locked + a yellow banner), duplicate (opens the edit form of the copy), archive / restore (UC-11). A server error -> a red toast translated by
// `code` (D-UI3). Every write goes through `useLoopAction` (web/data) - the screen never computes state itself.
import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import type { LoopDetailDto } from '../../../shared/contracts/loops';
import { isApiError } from '../../api/loops-api';
import { useLoopAction, type LoopAction } from '../../data/loops';
import type { MessageKey } from '../../prefs/messages';
import { fmtClock } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Button, Dialog } from '../../ui/components';
import { roundList } from './format';
import { useToast } from '../../ui/toast';
import { DUPLICATED_STATE } from '../loop-form/use-duplicate-loop';

export type LoopActions = {
  run(action: LoopAction): void;
  /** Clicking Stop: a run is running -> open the confirm box; otherwise stop right away. */
  requestStop(): void;
  /** Waiting for the server's Stop (<= 5 seconds). */
  stopping: boolean;
  busy: boolean;
  /** The Stop confirm box (placed at the end of the screen). */
  dialog: ReactNode;
};

export function useLoopActions(loop: LoopDetailDto, now: Date): LoopActions {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const mutation = useLoopAction();
  const [confirm, setConfirm] = useState(false);
  // keep the function stable across redraws (the clock redraws every second): Dialog refocuses every time `onCancel` changes
  const cancel = useCallback(() => setConfirm(false), []);

  const run = (action: LoopAction) => {
    mutation.mutate(
      { action, id: loop.id },
      {
        onSuccess: (data) => {
          // UC-10: open the edit form of the copy right away, with the note "Copy created..."
          if (action === 'duplicate' && data) navigate(`/loops/${data.id}/edit`, { state: { [DUPLICATED_STATE]: true } });
        },
        onError: (err) => {
          const code = isApiError(err) ? err.code : 'NETWORK';
          toast.show(t('toast.failed', { msg: t(`error.${code}` as MessageKey) }), 'err');
        },
      },
    );
  };

  const active = loop.activeRun;
  const exec = loop.currentExecution;
  // The dialog attaches to <body> like the preview (the fixed overlay must cover the viewport - inside `.pane-main` it would be
  // clipped by the pane's `max-width`).
  const dialog =
    confirm && active && exec ? createPortal(
      <Dialog
        testId="stop-dialog"
        title={t.node('dialog.stop.title', { name: <span data-raw="">{loop.name}</span> })}
        onCancel={cancel}
        footer={
          <>
            <Button variant="ghost" onClick={cancel} data-testid="stop-cancel">
              {t('dialog.stop.cancel')}
            </Button>
            <Button
              variant="danger-solid"
              data-testid="stop-confirm"
              onClick={() => {
                setConfirm(false);
                run('stop');
              }}
            >
              {t('dialog.stop.confirm')}
            </Button>
          </>
        }
      >
        {loop.activeRuns.length > 1
          ? t.node('dialog.stop.bodyMany', {
              c: loop.activeRuns.length,
              list: roundList(loop.activeRuns),
              k: exec.seq,
              reason: <span className="mono">{t('reason.stopped')}</span>,
            })
          : t.node('dialog.stop.body', {
              n: active.iteration ?? '',
              t: fmtClock((now.getTime() - active.startedAt.getTime()) / 1000),
              k: exec.seq,
              reason: <span className="mono">{t('reason.stopped')}</span>,
            })}
      </Dialog>,
      document.body,
    ) : null;

  return {
    run,
    requestStop: () => (loop.activeRun ? setConfirm(true) : run('stop')),
    stopping: mutation.isPending && mutation.variables?.action === 'stop',
    busy: mutation.isPending,
    dialog,
  };
}
