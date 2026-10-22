// The Stop confirmation (D29): it opens only while a run is working, as a dialog on the desktop and a sheet on the phone. It keeps the
// logic of the classic StopDialog (which runs, which texts) with the new keys of spec Appendix B. When the run ends while the
// sheet is open there is nothing left to cancel, so the sheet closes (pressing Stop again stops at once).
import { useEffect } from 'react';
import type { LoopDto } from '../../../shared/contracts/loops';
import { useT } from '../../prefs/prefs';
import { Button } from '../../ui/kit/Button';
import { useLayout } from '../../ui/kit/Layout';
import { Dialog } from '../../ui/kit/Overlay';
import { fmtMmss, roundList } from '../loop-detail/format';
import { useNow } from './use-now';

export function StopSheet({ loop, onCancel, onConfirm }: { loop: LoopDto | undefined; onCancel(): void; onConfirm(): void }) {
  const t = useT();
  const layout = useLayout();
  const now = useNow();
  const run = loop?.activeRun ?? null;
  const execution = loop?.currentExecution ?? null;
  const open = loop !== undefined && run !== null && execution !== null;
  useEffect(() => {
    if (!open) onCancel();
  }, [open, onCancel]);
  if (!loop || !run || !execution) return null;

  const body =
    loop.activeRuns.length > 1
      ? t('stop.bodyMany', { c: loop.activeRuns.length, list: roundList(loop.activeRuns), k: execution.seq })
      : t('stop.body', { n: run.iteration ?? '', d: fmtMmss((now.getTime() - run.startedAt.getTime()) / 1000), k: execution.seq });
  const phone = layout === 'phone';
  return (
    <Dialog
      open
      onClose={onCancel}
      testId="stop-dialog"
      title={t.node('stop.title', { name: <span data-raw="">{loop.name}</span> })}
      foot={
        phone ? (
          <>
            <Button variant="danger-solid" size="lg" block onClick={onConfirm} data-testid="stop-confirm">
              {t('stop.confirm')}
            </Button>
            <Button variant="plain" size="lg" block onClick={onCancel} data-testid="stop-cancel">
              {t('stop.keep')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onCancel} data-testid="stop-cancel">
              {t('stop.keep')}
            </Button>
            <Button variant="danger-solid" onClick={onConfirm} data-testid="stop-confirm">
              {t('stop.confirm')}
            </Button>
          </>
        )
      }
    >
      {phone ? <p>{body}</p> : body}
    </Dialog>
  );
}
