// The Agent section of the editor (spec 5.6): the executor choice (only when the server offers more than one: Mock exists in
// test mode only), then for Claude the model and the effort, for Mock its duration and failure rate; the runs at the same time
// (a stepper) and the time limit (a row, empty = no limit). Effort has five values: the segmented control from 640px, and on the
// phone a row whose value opens the list of the five (a sheet).
import type { ExecutorDto as ExecutorDescriptorDto } from '../../../shared/contracts/loops';
import { fmtDuration } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { FieldCell, Input, Segmented, StepperCell } from '../../ui/kit/Field';
import { Icon } from '../../ui/kit/Icon';
import { useLayout } from '../../ui/kit/Layout';
import { Menu } from '../../ui/kit/Overlay';
import { EFFORTS, type FormField, type FormValues } from './form-model';

/** The models in the order the editor shows them. */
const MODEL_ORDER = ['haiku', 'sonnet', 'opus'] as const;

export function AgentFields({
  values,
  executors,
  err,
  set,
  formId,
}: {
  values: FormValues;
  executors: ExecutorDescriptorDto[];
  /** The translated error of a field, if it has one. */
  err: (f: FormField) => string | undefined;
  set: <K extends keyof FormValues>(key: K, value: FormValues[K], field?: FormField) => void;
  formId: string;
}) {
  const t = useT();
  const phone = useLayout() === 'phone';
  const mock = values.executorKind === 'mock';
  const timeout = values.timeoutSec.trim();
  const timeoutNum = /^\d+$/.test(timeout) ? Number(timeout) : Number.NaN;

  const executor =
    executors.length > 1 ? (
      <FieldCell label={t('form.executor')} error={err('executor')} errorFor="f-executor">
        <Segmented
          label={t('form.executor')}
          testId="f-executor"
          value={values.executorKind}
          options={executors.map((e) => ({
            value: e.kind,
            testId: `f-executor-${e.kind}`,
            label: e.kind === 'claude' ? t('form.executor.claude') : e.kind === 'mock' ? t('form.executor.mock') : e.label,
          }))}
          onChange={(k) => set('executorKind', k, 'executor')}
        />
      </FieldCell>
    ) : null;

  const model = (
    <FieldCell label={t('editor.model')}>
      <Segmented
        label={t('editor.model')}
        testId="f-model"
        value={values.model}
        options={MODEL_ORDER.map((m) => ({ value: m, label: m, testId: `f-model-${m}` }))}
        onChange={(m) => set('model', m, 'executor')}
      />
    </FieldCell>
  );

  const effort = phone ? (
    <div className="fcell is-row">
      <span className="label" id="l-f-effort">
        {t('editor.effort')}
      </span>
      <Menu
        label={t('editor.effort')}
        items={EFFORTS.map((e) => ({ id: e, label: e, testId: `f-effort-${e}`, on: e === values.effort, onSelect: () => set('effort', e, 'executor') }))}
        trigger={(p) => (
          <button {...p} className="select" type="button" id="f-effort" data-testid="f-effort" data-value={values.effort} aria-labelledby="l-f-effort f-effort">
            {values.effort}
          </button>
        )}
      />
      <Icon name="chev" className="chev" />
    </div>
  ) : (
    <FieldCell label={t('editor.effort')}>
      <Segmented
        label={t('editor.effort')}
        testId="f-effort"
        value={values.effort}
        options={EFFORTS.map((e) => ({ value: e, label: e, testId: `f-effort-${e}` }))}
        onChange={(e) => set('effort', e, 'executor')}
      />
    </FieldCell>
  );

  const parallel = (
    <StepperCell
      title={t('editor.parallel')}
      meta={t('editor.atMost')}
      id="f-max-concurrent"
      form={formId}
      value={values.maxConcurrent}
      onChange={(v) => set('maxConcurrent', v)}
      label={t('editor.parallel')}
      fewer={t('editor.fewer')}
      more={t('editor.more')}
      min={1}
      max={10}
      invalid={!!err('maxConcurrent')}
      error={err('maxConcurrent')}
      errorTestId="error-f-max-concurrent"
    />
  );

  const limit = (
    <FieldCell
      row
      label={t('editor.limit')}
      htmlFor="f-timeout"
      error={err('timeoutSec')}
      hints={[{ text: t('editor.limitHint') }, ...(Number.isFinite(timeoutNum) ? [{ text: fmtDuration(t, timeoutNum), testId: 'hint-f-timeout' }] : [])]}
    >
      <Input id="f-timeout" form={formId} type="number" value={values.timeoutSec} placeholder={t('editor.noLimit')} invalid={!!err('timeoutSec')} onChange={(v) => set('timeoutSec', v)} />
    </FieldCell>
  );

  if (mock) {
    return (
      <>
        {executor}
        {parallel}
        {limit}
        <FieldCell row label={t('editor.mockDur')} htmlFor="f-duration" error={err('durationSec')} hints={[{ text: t('editor.mockDurHint') }]}>
          <Input id="f-duration" form={formId} type="number" value={values.durationSec} invalid={!!err('durationSec')} onChange={(v) => set('durationSec', v)} />
        </FieldCell>
        <FieldCell row label={t('editor.mockFail')} htmlFor="f-fail" error={err('failRate')} hints={[{ text: t('editor.mockFailHint') }]}>
          <Input id="f-fail" form={formId} type="number" value={values.failRate} invalid={!!err('failRate')} onChange={(v) => set('failRate', v)} />
        </FieldCell>
      </>
    );
  }
  return (
    <>
      {executor}
      {model}
      {effort}
      {parallel}
      {limit}
    </>
  );
}
