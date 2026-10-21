// Create / edit loop form (UC-01, UC-02, UC-09, UC-10, UC-21 - preview form-*): Info (name · repo required - D-UI13) ·
// Schedule (the schedule builder) · Execution (the executor comes from `GET /api/executors`: Claude model / effort, optional timeout;
// Mock exists only in test mode). Field errors follow the server's `details.issues`; an edit sends `version`, and when the server returns `VERSION_CONFLICT`
// it shows the conflict banner (Reload / Overwrite) - never an overwrite in silence.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { LoopDto } from '../../../shared/contracts/loops';
import { isApiError, type ApiError } from '../../api/loops-api';
import { useNow } from '../../data/connection';
import { useExecutors } from '../../data/loops';
import { qk } from '../../data/query-keys';
import { useRepos } from '../../data/repos';
import { Combo } from '../../ui/Combo';
import { fmtDuration, fmtNumber, fmtTime } from '../../prefs/format';
import { MESSAGES, type MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button, Crumbs, Note, PaneHeader, SectionTitle, cx } from '../../ui/components';
import { useToast } from '../../ui/toast';
import {
  changedParts,
  EFFORTS,
  emptyValues,
  errorsFromIssues,
  MODELS,
  PART_LABEL,
  sameName,
  toBody,
  valuesFromLoop,
  type FormErrors,
  type FormField,
  type FormValues,
} from './form-model';
import { evaluateDraft } from './schedule-draft';
import { Field, ScheduleBuilder, SegItem } from './ScheduleBuilder';

/** id of the hidden form - the inputs + the save button attach to it with `form={FORM_ID}`. */
export const FORM_ID = 'loop-form';

export type SaveFn = (body: ReturnType<typeof toBody>, version: number | null) => Promise<LoopDto>;

export function LoopForm({ base, latest, duplicated, saving, onSave, onSaved, onCancel, onReloadLatest }: {
  /** The loop version the form opened (edit) - the `version` it sends comes from here; `null` = create. */
  base: LoopDto | null;
  /** The newest version from the server (live) - only to say "running", it never overwrites text being typed. */
  latest: LoopDto | null;
  duplicated?: boolean;
  saving: boolean;
  onSave: SaveFn;
  onSaved(loop: LoopDto): void;
  onCancel(): void;
  /** Load the newest version from the server (after `VERSION_CONFLICT`). */
  onReloadLatest(): Promise<LoopDto | null>;
}) {
  const t = useT();
  const toast = useToast();
  const now = useNow(1_000);
  const [opened, setOpened] = useState<LoopDto | null>(base);
  const [values, setValues] = useState<FormValues>(() => (base ? valuesFromLoop(base) : emptyValues()));
  const [errors, setErrors] = useState<FormErrors>({});
  const [takenName, setTakenName] = useState<string | null>(null);
  const [conflict, setConflict] = useState<LoopDto | null>(null);
  const isEdit = opened !== null;
  const navigate = useNavigate();
  const client = useQueryClient();
  const repos = useRepos();
  const executorsQ = useExecutors();
  const executors = useMemo(() => executorsQ.data ?? [], [executorsQ.data]);
  const repoList = repos.data ?? [];
  const noRepos = repos.data !== undefined && repoList.length === 0;
  const repo = repoList.find((r) => r.id === values.repoId) ?? null;
  // The selected repo was just deleted (no longer in the list) -> back to "not chosen" like preview form-errors.
  useEffect(() => {
    if (values.repoId && repos.data && !repos.data.some((r) => r.id === values.repoId)) setValues((v) => ({ ...v, repoId: '' }));
  }, [values.repoId, repos.data]);
  // Executor of a new loop: Claude (the spec default); if the server has no such executor, take the first one it has.
  useEffect(() => {
    const first = executors[0];
    if (first && !executors.some((e) => e.kind === values.executorKind)) setValues((v) => ({ ...v, executorKind: first.kind }));
  }, [executors, values.executorKind]);

  const schedule = useMemo(() => evaluateDraft(values.schedule, values.timezone, now, t.lang), [values.schedule, values.timezone, now, t.lang]);

  const shown: FormErrors = { ...errors };
  if (takenName !== null && sameName(values.name, takenName)) shown.name = 'error.LOOP_NAME_TAKEN';
  const errorCount = Object.keys(shown).length;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K], field: FormField = key as FormField) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[field]) setErrors(({ [field]: _gone, ...rest }) => rest);
  };

  const errorText = (err: ApiError) => {
    const key = `error.${err.code}` as MessageKey;
    return t('toast.failed', { msg: key in MESSAGES[t.lang] ? t(key) : err.message });
  };

  async function save(version: number | null) {
    try {
      const saved = await onSave(toBody(values), version);
      setErrors({});
      setConflict(null);
      onSaved(saved);
    } catch (err) {
      if (!isApiError(err)) throw err;
      if (err.code === 'VALIDATION_FAILED') {
        const { errors: next, rest } = errorsFromIssues(err.issues);
        setErrors(next);
        // the repo was just deleted elsewhere (unknownRepo) -> reload the repo list so the picker goes back to "not chosen"
        if (next.repo) void client.invalidateQueries({ queryKey: qk.repos() });
        if (rest.length > 0) toast.show(errorText(err), 'err');
      } else if (err.code === 'LOOP_NAME_TAKEN') {
        setTakenName(values.name);
      } else if (err.code === 'VERSION_CONFLICT') {
        setConflict((await onReloadLatest()) ?? opened);
      } else {
        toast.show(errorText(err), 'err');
      }
    }
  }

  const reload = () => {
    if (!conflict) return;
    setOpened(conflict);
    setValues(valuesFromLoop(conflict));
    setErrors({});
    setTakenName(null);
    setConflict(null);
  };

  const err = (f: FormField) => (shown[f] ? t(shown[f]) : undefined);
  const hint = (s: string) => <span className="hint">{s}</span>;
  const timeoutNum = Number(values.timeoutSec);
  const timeoutEmpty = values.timeoutSec.trim() === '';
  const goRepos = () => navigate('/repos');
  // Optional timeout (SPEC-phase-2): empty = no limit.
  const timeoutField = (
    <NumberField
      id="f-timeout"
      label={t('form.timeout')}
      unit={t('form.unit.sec')}
      value={values.timeoutSec}
      placeholder={t('form.timeout.placeholder')}
      onChange={(v) => set('timeoutSec', v)}
      error={err('timeoutSec')}
      hint={timeoutEmpty ? t('form.timeout.optionalHint') : t('form.timeout.hint', { d: Number.isFinite(timeoutNum) ? fmtDuration(t, timeoutNum) : '—' })}
    />
  );
  // maximum parallel runs - next to the timeout in both executors.
  const concurrentField = (
    <NumberField
      id="f-max-concurrent"
      label={t('form.maxConcurrent')}
      unit={t('form.unit.runs')}
      value={values.maxConcurrent}
      onChange={(v) => set('maxConcurrent', v)}
      error={err('maxConcurrent')}
      hint={t('form.maxConcurrent.hint')}
    />
  );
  const running = latest?.status === 'active' && latest.activeRun ? latest.activeRun.iteration : null;
  const name = opened?.name ?? '';
  const scheduleBlocked = !schedule.ok;

  let banner: ReactNode = null;
  if (conflict) {
    const parts = opened ? changedParts(opened, conflict) : [];
    banner = (
      <div className="banner inset is-warn" role="alert" data-testid="form-conflict">
        <span className="txt">
          {t('form.conflict', { t: fmtTime(conflict.updatedAt, conflict.timezone) })}
          {parts.length > 0 && (
            <>
              <br />
              {t('form.conflict.fields', { fields: parts.map((p) => t(PART_LABEL[p])).join(', ') })}
            </>
          )}
        </span>
        <Button onClick={reload} data-testid="conflict-reload">{t('form.conflict.reload')}</Button>
        <Button variant="danger" onClick={() => void save(conflict.version)} disabled={saving} data-testid="conflict-overwrite">
          {t('form.conflict.overwrite')}
        </Button>
      </div>
    );
  } else if (errorCount > 0) {
    banner = (
      <div className="banner inset is-err" role="alert" data-testid="form-errors">
        <span className="txt">{t('form.errSummary', { n: errorCount })}</span>
      </div>
    );
  } else if (duplicated) {
    banner = <Note glyph="⧉">{t('form.duplicated')}</Note>;
  } else if (running !== null) {
    banner = (
      <div className="banner inset is-info" role="status" data-testid="form-edit-running">
        <span className="txt">{`▶ ${t('form.editRunning', { n: running ?? '' })}`}</span>
      </div>
    );
  }

  return (
    <>
      {/* Empty (hidden) form: the inputs attach with the form= attribute so Enter saves, yet the fields stay direct children of
          .pane-main like the preview (rule .pane-main > .seg / > * of components.css). */}
      <form
        id={FORM_ID}
        hidden
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving && !scheduleBlocked) void save(opened ? opened.version : null);
        }}
        data-testid="loop-form"
      />
      <Crumbs>
        <Link to="/">{t('crumb.loops')}</Link>
        {' / '}
        {isEdit ? (
          <>
            <Link to={`/loops/${opened.id}`} data-raw>{name}</Link>
            {' / '}
            {t('form.crumbEdit')}
          </>
        ) : (
          t('form.crumbNew')
        )}
      </Crumbs>
      <PaneHeader title={isEdit ? t.node('form.editTitle', { name: <span data-raw>{name}</span> }) : t('form.createTitle')} />
      {banner}

      <SectionTitle title={t('form.section.info')} />
      <div className="form-grid">
        <Field label={t('form.name')} htmlFor="f-name" error={err('name')} hint={hint(t('form.name.hint'))}>
          <input form={FORM_ID} id="f-name" className={cx('input', shown.name && 'is-error')} value={values.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" data-testid="f-name" data-raw />
        </Field>
        <Field
          label={t('form.repo')}
          error={err('repo')}
          hint={
            noRepos ? (
              <div className="field-act">
                <Button variant="primary" onClick={goRepos} data-testid="repo-go-register">
                  {t('form.repo.goRegister')}
                </Button>
              </div>
            ) : (
              <span className="hint">
                {t('form.repo.hint')} ·{' '}
                <span className="copy" role="link" onClick={goRepos} data-testid="repo-manage">
                  {t('form.repo.manage')}
                </span>
              </span>
            )
          }
        >
          <Combo
            label={t('form.repo')}
            testId="f-repo"
            disabled={noRepos}
            error={shown.repo !== undefined}
            current={values.repoId || null}
            display={
              noRepos ? (
                <span className="faint">{t('form.repo.none')}</span>
              ) : repo ? (
                <span data-raw="">
                  <b>{repo.name}</b> <span className="opt-path">{repo.path}</span>
                </span>
              ) : (
                <span className="faint">{t('form.repo.placeholder')}</span>
              )
            }
            options={repoList.map((r) => ({
              value: r.id,
              testId: `repo-opt-${r.id}`,
              content: (
                <>
                  <b data-raw="">{r.name}</b>
                  <span className="opt-path" data-raw="">
                    {r.path}
                  </span>
                  {!r.exists && <span className="hint is-warn">{t('form.repo.goneHint')}</span>}
                </>
              ),
            }))}
            footer={
              <div className="copy" onClick={goRepos}>
                {t('form.repo.manage')}
              </div>
            }
            onSelect={(id) => set('repoId', id, 'repo')}
          />
        </Field>
        <Field label={t('form.desc')} htmlFor="f-description" className="span-all" error={err('description')} hint={hint(t('form.desc.hint'))}>
          <input form={FORM_ID} id="f-description" className={cx('input', shown.description && 'is-error')} value={values.description} onChange={(e) => set('description', e.target.value)} autoComplete="off" data-testid="f-description" data-raw />
        </Field>
        <Field
          label={t('form.prompt')}
          htmlFor="f-prompt"
          className="span-all"
          error={err('prompt')}
          head={<span className="hint mono">{t('form.prompt.count', { n: fmtNumber(t.lang, [...values.prompt].length) })}</span>}
        >
          <textarea
            id="f-prompt"
            className={cx('textarea mono', shown.prompt && 'is-error')}
            placeholder={t('form.prompt.placeholder')}
            value={values.prompt}
            onChange={(e) => set('prompt', e.target.value)}
            spellCheck={false}
            data-testid="f-prompt"
            data-raw
          />
        </Field>
      </div>

      <SectionTitle title={t('form.section.schedule')} />
      <ScheduleBuilder
        draft={values.schedule}
        timezone={values.timezone}
        result={schedule}
        now={now}
        serverError={{ schedule: err('schedule'), timezone: err('timezone') }}
        onChange={(d) => set('schedule', d)}
        onTimezone={(tz) => set('timezone', tz)}
        formId={FORM_ID}
      />

      <SectionTitle title={t('form.section.exec')} />
      <Field label={t('form.executor')} error={err('executor')}>
        <div className="seg" role="radiogroup" aria-label={t('form.executor')} data-testid="f-executor">
          {executors.map((e) => (
            <SegItem key={e.kind} on={values.executorKind === e.kind} onSelect={() => set('executorKind', e.kind, 'executor')} testId={`f-executor-${e.kind}`}>
              {e.kind === 'claude' ? t('form.executor.claude') : e.kind === 'mock' ? t('form.executor.mock') : e.label}
            </SegItem>
          ))}
        </div>
      </Field>
      {values.executorKind === 'mock' ? (
        <>
          <div className="form-grid" style={{ ['--cols' as string]: 3 }}>
            {timeoutField}
            {concurrentField}
            <NumberField id="f-duration" label={t('form.mockDur')} unit={t('form.unit.sec')} value={values.durationSec} onChange={(v) => set('durationSec', v)} error={err('durationSec')} hint={t('form.mockDur.hint')} />
            <NumberField id="f-fail" label={t('form.mockFail')} unit={t('form.unit.pct')} value={values.failRate} onChange={(v) => set('failRate', v)} error={err('failRate')} hint={t('form.mockFail.hint')} />
          </div>
          <Note glyph="◇">{t('form.executor.mockHint')}</Note>
        </>
      ) : (
        <>
          <div className="form-grid">
            <Field label={t('form.model')} hint={hint(t('form.model.hint'))}>
              <div className="seg" role="radiogroup" aria-label={t('form.model')} data-testid="f-model" data-value={values.model}>
                {MODELS.map((m) => (
                  <SegItem key={m} on={values.model === m} onSelect={() => set('model', m, 'executor')} testId={`f-model-${m}`}>
                    {m}
                  </SegItem>
                ))}
              </div>
            </Field>
            <Field label={t('form.effort')} hint={hint(t('form.effort.hint'))}>
              <div className="seg" role="radiogroup" aria-label={t('form.effort')} data-testid="f-effort" data-value={values.effort}>
                {EFFORTS.map((m) => (
                  <SegItem key={m} on={values.effort === m} onSelect={() => set('effort', m, 'executor')} testId={`f-effort-${m}`}>
                    {m}
                  </SegItem>
                ))}
              </div>
            </Field>
            {timeoutField}
            {concurrentField}
          </div>
          <Note glyph="◆">{t('form.claude.fixed')}</Note>
        </>
      )}

      <div className="form-foot">
        <Button variant="ghost" onClick={onCancel} data-testid="form-cancel">{t('form.cancel')}</Button>
        <Button type="submit" form={FORM_ID} variant="primary" size="lg" disabled={saving || scheduleBlocked || noRepos} data-testid="form-submit">
          {saving ? t('form.saving') : isEdit ? t('form.save') : t('form.create')}
        </Button>
      </div>
    </>
  );
}

function NumberField({ id, label, unit, value, onChange, error, hint, placeholder }: { id: string; label: string; unit: string; value: string; onChange(v: string): void; error?: string | undefined; hint: string; placeholder?: string }) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={<span className="hint">{hint}</span>}>
      <div className="affix">
        <input form={FORM_ID} id={id} className={cx('input mono', error && 'is-error')} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} inputMode="numeric" autoComplete="off" data-testid={id} />
        <span>{unit}</span>
      </div>
    </Field>
  );
}
