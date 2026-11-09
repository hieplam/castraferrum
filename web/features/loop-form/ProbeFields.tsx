// The Probe group of the editor (goal G28, spec 2.1): the switch, then the probe command, the claim and release commands (one argument
// per line), what a restart does, the base port, the token budget and the lane environment. A loop that works now gets the group disabled with the hint
// that says to stop it first: the server refuses a probe change on an active loop. The server's messages sit under their field.
import { useT } from '../../prefs/prefs';
import { FieldCell, Input, Segmented, Switch, Textarea } from '../../ui/kit/Field';
import type { ProbeErrors, ProbeField, ProbeFormValues } from './probe-form';

export function ProbeFields({
  values,
  errors,
  disabled,
  set,
  formId,
}: {
  values: ProbeFormValues;
  errors: ProbeErrors;
  /** The loop is active: the group shows its values and changes nothing. */
  disabled: boolean;
  set: <K extends keyof ProbeFormValues>(key: K, value: ProbeFormValues[K], field?: ProbeField) => void;
  formId: string;
}) {
  const t = useT();
  const on = values.enabled;
  return (
    <>
      <div className="cell">
        <Switch on={on} disabled={disabled} testId="probe-enabled" onToggle={() => set('enabled', !on)}>
          {t('goalLoop.editor.enabled')}
        </Switch>
      </div>
      {on ? (
        <>
          <FieldCell label={t('goalLoop.editor.command')} htmlFor="probe-command" error={errors.command} hints={[{ text: t('goalLoop.editor.commandHint') }]}>
            <Textarea id="probe-command" form={formId} value={values.command} disabled={disabled} invalid={!!errors.command} onChange={(v) => set('command', v, 'command')} />
          </FieldCell>
          <FieldCell label={t('goalLoop.editor.claim')} htmlFor="probe-claim" error={errors.claim} hints={[{ text: t('goalLoop.editor.claimHint') }]}>
            <Textarea id="probe-claim" form={formId} value={values.claim} disabled={disabled} invalid={!!errors.claim} onChange={(v) => set('claim', v, 'claim')} />
          </FieldCell>
          <FieldCell label={t('goalLoop.editor.release')} htmlFor="probe-release" error={errors.release} hints={[{ text: t('goalLoop.editor.releaseHint') }]}>
            <Textarea id="probe-release" form={formId} value={values.release} disabled={disabled} invalid={!!errors.release} onChange={(v) => set('release', v, 'release')} />
          </FieldCell>
          <FieldCell label={t('goalLoop.editor.restart')}>
            <Segmented
              label={t('goalLoop.editor.restart')}
              testId="probe-restart"
              value={values.restart}
              disabled={disabled}
              options={[
                { value: 'stop', label: t('goalLoop.editor.restartStop'), testId: 'probe-restart-stop' },
                { value: 'resume', label: t('goalLoop.editor.restartResume'), testId: 'probe-restart-resume' },
              ]}
              onChange={(v) => set('restart', v)}
            />
          </FieldCell>
          <FieldCell row label={t('goalLoop.editor.basePort')} htmlFor="probe-base-port" error={errors.laneBasePort} hints={[{ text: t('goalLoop.editor.basePortHint') }]}>
            <Input id="probe-base-port" form={formId} type="number" placeholder={t('editor.noLimit')} value={values.basePort} disabled={disabled} invalid={!!errors.laneBasePort} onChange={(v) => set('basePort', v, 'laneBasePort')} />
          </FieldCell>
          <FieldCell row label={t('goalLoop.editor.tokenBudget')} htmlFor="probe-token-budget" error={errors.tokenBudget} hints={[{ text: t('goalLoop.editor.tokenBudgetHint') }]}>
            <Input id="probe-token-budget" form={formId} type="number" placeholder={t('editor.noLimit')} value={values.tokenBudget} disabled={disabled} invalid={!!errors.tokenBudget} onChange={(v) => set('tokenBudget', v, 'tokenBudget')} />
          </FieldCell>
          <FieldCell label={t('goalLoop.editor.laneEnv')} htmlFor="probe-lane-env" error={errors.laneEnv} hints={[{ text: t('goalLoop.editor.laneEnvHint') }]}>
            <Textarea id="probe-lane-env" form={formId} value={values.laneEnv} disabled={disabled} invalid={!!errors.laneEnv} onChange={(v) => set('laneEnv', v, 'laneEnv')} />
          </FieldCell>
        </>
      ) : null}
    </>
  );
}
