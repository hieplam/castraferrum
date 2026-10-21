// Stop confirm box when the loop has a running run (D-UI1, preview `list-stop-confirm`): iteration #N, running for this long, will be
// cancelled (<= 5 seconds), execution #k closes with the reason "User Stop".
import { fmtClock } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Button, Dialog } from '../../ui/components';

export function StopDialog({ name, iteration, elapsedSec, count = 1, list = '', executionSeq, onCancel, onConfirm }: {
  name: string;
  iteration: number;
  elapsedSec: number;
  /** Number of running runs + their iterations; > 1 -> the sentence "k runs are running (...) will be cancelled". */
  count?: number;
  list?: string;
  executionSeq: number;
  onCancel(): void;
  onConfirm(): void;
}) {
  const t = useT();
  return (
    <Dialog
      testId="stop-dialog"
      title={t('dialog.stop.title', { name })}
      onCancel={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} data-testid="stop-cancel">
            {t('dialog.stop.cancel')}
          </Button>
          <Button variant="danger-solid" onClick={onConfirm} data-testid="stop-confirm">
            {t('dialog.stop.confirm')}
          </Button>
        </>
      }
    >
      {count > 1
        ? t.node('dialog.stop.bodyMany', { c: count, list, k: executionSeq, reason: <span className="mono">{t('reason.stopped')}</span> })
        : t.node('dialog.stop.body', {
            n: iteration,
            t: fmtClock(elapsedSec),
            k: executionSeq,
            reason: <span className="mono">{t('reason.stopped')}</span>,
          })}
    </Dialog>
  );
}
