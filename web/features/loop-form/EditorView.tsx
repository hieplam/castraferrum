// The editor of the new UI (spec 5.6, `/loops/new`, `/loops/:id/edit`; UC-01, UC-02, UC-09, UC-10, UC-21): the sections Details
// (name, repo, description), Prompt (with its count), Schedule (repeat, the fields of that kind, time zone; the description card
// with the next 5 runs) and Agent, in `.page.is-narrow`. The desktop has a back link, the page title and Cancel with the main button
// in `.form-foot`; the phone has a navigation bar with Cancel and the title, and the main button in the action bar.
// Field errors follow the server's `details.issues` (form-model.ts); an edit sends `version`, and on `VERSION_CONFLICT` the
// conflict banner offers Reload and Overwrite: never an overwrite in silence.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { ProbeDto, ProbeInputBody } from '../../../shared/contracts/goal-loop';
import type { LoopDto } from '../../../shared/contracts/loops';
import { isApiError, type ApiError } from '../../api/loops-api';
import { useNow } from '../../data/connection';
import { useCreateLoop, useExecutors, useLoop, useUpdateLoop } from '../../data/loops';
import { useProbe, useSaveProbe } from '../../data/probe';
import { qk } from '../../data/query-keys';
import { useRepos } from '../../data/repos';
import { fmtTime } from '../../prefs/format';
import { MESSAGES, type MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Banner } from '../../ui/kit/Banner';
import { Button } from '../../ui/kit/Button';
import { FieldCell, Input, Textarea } from '../../ui/kit/Field';
import { Icon } from '../../ui/kit/Icon';
import { ActionBar, NavBar, Page, PageHead, useLayout } from '../../ui/kit/Layout';
import { useToast } from '../../ui/toast';
import { errorTitle, PageNotFound } from '../loop-detail/PushedPage';
import { AgentFields } from './AgentFields';
import { changedParts, emptyValues, errorsFromIssues, PART_LABEL, sameName, toBody, valuesFromLoop, type FormErrors, type FormField, type FormValues } from './form-model';
import { probeErrorsFromIssues, probeValuesFrom, toProbeBody, type ProbeErrors, type ProbeField, type ProbeFormValues } from './probe-form';
import { ProbeFields } from './ProbeFields';
import { RepoPicker } from './RepoPicker';
import { evaluateDraft } from './schedule-draft';
import { ScheduleFields, ScheduleOut } from './ScheduleFields';
import { DUPLICATED_STATE } from './use-duplicate-loop';

/** The form the fields and the main button belong to (`form=`), so Enter in a field saves. */
const FORM_ID = 'loop-form';
/** The longest prompt the server takes. */
const PROMPT_MAX = 20_000;

type SaveFn = (body: ReturnType<typeof toBody>, version: number | null) => Promise<LoopDto>;
/** The probe `PUT` (a body) or `DELETE` (`null`). */
type SaveProbeFn = (body: ProbeInputBody | null) => Promise<void>;

/** `/loops/new`. */
export function NewLoopEditor() {
  const navigate = useNavigate();
  const create = useCreateLoop();
  return (
    <Editor
      key="new"
      base={null}
      saving={create.isPending}
      onSave={(body) => create.mutateAsync(body)}
      onSaved={(loop) => navigate(`/loops/${loop.id}`)}
      onCancel={() => navigate('/')}
      onReloadLatest={async () => null}
    />
  );
}

/** `/loops/:id/edit`. Opened from Duplicate, it shows the note of the copy. */
export function EditLoopEditor({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const loop = useLoop(id);
  const probe = useProbe(id);
  const saveProbe = useSaveProbe(id);
  const update = useUpdateLoop(id);
  const duplicated = (location.state as Record<string, unknown> | null)?.[DUPLICATED_STATE] === true;
  if (loop.isPending || probe.isPending) return <EditorSkeleton />;
  if (loop.isError || !loop.data) return <PageNotFound title={errorTitle(t, loop.error, 'error.LOOP_NOT_FOUND')} testId="form-load-error" />;
  const data = loop.data;
  return (
    <Editor
      key={id}
      base={data}
      latest={data}
      probe={probe.data ?? null}
      onSaveProbe={(body) => saveProbe.mutateAsync(body)}
      duplicated={duplicated}
      saving={update.isPending || saveProbe.isPending}
      onSave={(body, version) => update.mutateAsync({ ...body, version: version ?? data.version })}
      onSaved={(saved) => navigate(`/loops/${saved.id}`)}
      onCancel={() => navigate(`/loops/${id}`)}
      onReloadLatest={async () => (await loop.refetch()).data ?? null}
    />
  );
}

/** The editor while the loop loads: placeholder lines in a group. */
function EditorSkeleton() {
  const t = useT();
  const phone = useLayout() === 'phone';
  return (
    <>
      {phone ? (
        <NavBar
          back={
            <Link className="navbar-back" to="/">
              <Icon name="back" />
              {t('nav.loops')}
            </Link>
          }
        />
      ) : null}
      <Page narrow>
        <div className="page-head">
          <span className="skeleton is-line" />
        </div>
        <div className="group" data-testid="form-loading" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div className="cell" key={i}>
              <div className="cell-main">
                <span className="skeleton is-line" />
                <span className="skeleton is-line" />
              </div>
            </div>
          ))}
        </div>
        <span className="skeleton is-block" />
      </Page>
    </>
  );
}

/** A section: its title (from 640px) or caption (phone), a group of rows, and what follows the group. */
function Section({ title, after, children }: { title: string; after?: ReactNode; children: ReactNode }) {
  const phone = useLayout() === 'phone';
  return (
    <>
      {phone ? (
        <p className="group-cap">{title}</p>
      ) : (
        <div className="section-head">
          <h2>{title}</h2>
        </div>
      )}
      <div className="group">{children}</div>
      {after}
    </>
  );
}

function Editor({
  base,
  latest = null,
  probe,
  onSaveProbe,
  duplicated,
  saving,
  onSave,
  onSaved,
  onCancel,
  onReloadLatest,
}: {
  /** The version of the loop the editor opened (edit): the `version` it sends comes from here; `null` = a new loop. */
  base: LoopDto | null;
  /** The newest version from the server: only to say "running", it never overwrites what is being typed. */
  latest?: LoopDto | null;
  /** The probe of the loop (`null` = none yet). `undefined` = a new loop: it has no Probe group until it exists. */
  probe?: ProbeDto | null;
  onSaveProbe?: SaveProbeFn;
  duplicated?: boolean;
  saving: boolean;
  onSave: SaveFn;
  onSaved: (loop: LoopDto) => void;
  onCancel: () => void;
  /** Loads the newest version from the server (after `VERSION_CONFLICT`). */
  onReloadLatest: () => Promise<LoopDto | null>;
}) {
  const t = useT();
  const toast = useToast();
  const now = useNow(1_000);
  const phone = useLayout() === 'phone';
  const client = useQueryClient();
  const [opened, setOpened] = useState<LoopDto | null>(base);
  const [values, setValues] = useState<FormValues>(() => (base ? valuesFromLoop(base) : emptyValues()));
  const [errors, setErrors] = useState<FormErrors>({});
  const [probeValues, setProbeValues] = useState<ProbeFormValues>(() => probeValuesFrom(probe ?? null));
  const [probeErrors, setProbeErrors] = useState<ProbeErrors>({});
  const [takenName, setTakenName] = useState<string | null>(null);
  const [conflict, setConflict] = useState<LoopDto | null>(null);
  const repos = useRepos();
  const executorsQ = useExecutors();
  const executors = useMemo(() => executorsQ.data ?? [], [executorsQ.data]);
  const repoList = repos.data ?? [];
  const noRepos = repos.data !== undefined && repoList.length === 0;
  const repo = repoList.find((r) => r.id === values.repoId) ?? null;

  // The chosen repo was just deleted (it left the list): back to "not chosen".
  useEffect(() => {
    if (values.repoId && repos.data && !repos.data.some((r) => r.id === values.repoId)) setValues((v) => ({ ...v, repoId: '' }));
  }, [values.repoId, repos.data]);
  // A new loop runs on Claude; a server without it gives its first executor.
  useEffect(() => {
    const first = executors[0];
    if (first && !executors.some((e) => e.kind === values.executorKind)) setValues((v) => ({ ...v, executorKind: first.kind }));
  }, [executors, values.executorKind]);

  const schedule = useMemo(() => evaluateDraft(values.schedule, values.timezone, now, t.lang), [values.schedule, values.timezone, now, t.lang]);

  const shown: FormErrors = { ...errors };
  if (takenName !== null && sameName(values.name, takenName)) shown.name = 'error.LOOP_NAME_TAKEN';
  const errorCount = Object.keys(shown).length + Object.keys(probeErrors).length;
  const err = (f: FormField) => (shown[f] ? t(shown[f]) : undefined);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K], field: FormField = key as FormField) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[field]) setErrors(({ [field]: _gone, ...rest }) => rest);
  };

  const setProbe = <K extends keyof ProbeFormValues>(key: K, value: ProbeFormValues[K], field?: ProbeField) => {
    setProbeValues((v) => ({ ...v, [key]: value }));
    if (field && probeErrors[field]) setProbeErrors(({ [field]: _gone, ...rest }) => rest);
  };
  // A probe change needs a stopped loop (the server refuses it otherwise), so the group of an active loop only shows its values.
  const probeLocked = latest?.status === 'active';

  const errorText = (e: ApiError) => {
    const key = `error.${e.code}` as MessageKey;
    return t('toast.failed', { msg: key in MESSAGES[t.lang] ? t(key) : e.message });
  };

  async function save(version: number | null) {
    try {
      const saved = await onSave(toBody(values), version);
      setErrors({});
      setConflict(null);
      // The loop is saved: then the probe, or its removal when the switch is off. A refusal keeps the page, and the new version.
      const body = probeValues.enabled ? toProbeBody(probeValues, probe?.resources) : probe ? null : undefined;
      if (probe !== undefined && onSaveProbe && !probeLocked && body !== undefined) {
        try {
          await onSaveProbe(body);
          setProbeErrors({});
        } catch (e) {
          setOpened(saved);
          if (!isApiError(e)) throw e;
          if (e.code === 'VALIDATION_FAILED') {
            const { errors: next, rest } = probeErrorsFromIssues(e.issues);
            setProbeErrors(next);
            if (rest.length > 0) toast.show(errorText(e), 'err');
          } else {
            toast.show(errorText(e), 'err');
          }
          return;
        }
      }
      onSaved(saved);
    } catch (e) {
      if (!isApiError(e)) throw e;
      if (e.code === 'VALIDATION_FAILED') {
        const { errors: next, rest } = errorsFromIssues(e.issues);
        setErrors(next);
        // The repo was just deleted elsewhere (unknownRepo): reload the repos, so the picker goes back to "not chosen".
        if (next.repo) void client.invalidateQueries({ queryKey: qk.repos() });
        if (rest.length > 0) toast.show(errorText(e), 'err');
      } else if (e.code === 'LOOP_NAME_TAKEN') {
        setTakenName(values.name);
      } else if (e.code === 'VERSION_CONFLICT') {
        setConflict((await onReloadLatest()) ?? opened);
      } else {
        toast.show(errorText(e), 'err');
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

  const isEdit = opened !== null;
  const title = isEdit ? t('editor.edit', { name: opened.name }) : t('editor.new');
  const running = latest?.status === 'active' && latest.activeRun ? latest.activeRun.iteration : null;
  const locked = saving || noRepos || !schedule.ok;
  const num = (n: number) => n.toLocaleString(t.lang === 'vi' ? 'vi-VN' : 'en-US');

  let banner: ReactNode = null;
  if (conflict) {
    const parts = opened ? changedParts(opened, conflict) : [];
    banner = (
      <div className="banner is-warn" data-testid="form-conflict" role="alert">
        <Icon name="alert" />
        <span className="banner-text">
          {t('editor.conflict', { t: fmtTime(conflict.updatedAt, conflict.timezone) })}
          {parts.length > 0 ? ` ${t('editor.conflictFields', { fields: parts.map((p) => t(PART_LABEL[p])).join(', ') })}` : ''}
        </span>
        <Button size="sm" onClick={reload} data-testid="conflict-reload">
          {t('form.conflict.reload')}
        </Button>
        <Button size="sm" variant="danger" disabled={saving} onClick={() => void save(conflict.version)} data-testid="conflict-overwrite">
          {t('form.conflict.overwrite')}
        </Button>
      </div>
    );
  } else if (errorCount > 0) {
    banner = (
      <div className="banner is-err" data-testid="form-errors" role="alert">
        <Icon name="alert" />
        <span className="banner-text">{t.tn('editor.errSummary', errorCount)}</span>
      </div>
    );
  } else if (duplicated) {
    banner = <p className="note">{t('editor.duplicated')}</p>;
  } else if (running !== null) {
    banner = (
      <Banner tone="info" testId="form-edit-running">
        {t('editor.editRunning', { n: running })}
      </Banner>
    );
  }

  const submit = (
    <Button type="submit" form={FORM_ID} variant="primary" size={phone ? 'lg' : undefined} block={phone} disabled={locked} data-testid="form-submit">
      {saving ? t('form.saving') : t(isEdit ? 'editor.save' : 'editor.create')}
    </Button>
  );
  const back = isEdit ? { to: `/loops/${opened.id}`, label: <span data-raw="">{opened.name}</span> } : { to: '/', label: t('nav.loops') };

  return (
    <>
      {phone ? (
        <NavBar
          back={
            <button className="navbar-back" type="button" onClick={onCancel} data-testid="form-cancel">
              {t('editor.cancel')}
            </button>
          }
          title={title}
        />
      ) : null}
      <Page narrow>
        {phone ? null : (
          <>
            <Link className="backlink" to={back.to}>
              <Icon name="back" />
              {back.label}
            </Link>
            <PageHead title={title} />
          </>
        )}
        {banner}
        <form
          id={FORM_ID}
          data-testid="loop-form"
          noValidate
          style={{ display: 'contents' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!locked) void save(opened ? opened.version : null);
          }}
        >
          <Section
            title={t('editor.details')}
            after={
              repo ? (
                <p className="group-note" data-raw="">
                  {t('editor.repoNote', { path: repo.path })}
                </p>
              ) : noRepos ? (
                <Link className="btn" to="/repos" data-testid="repo-go-register">
                  {t('editor.repoRegister')}
                </Link>
              ) : null
            }
          >
            <FieldCell label={t('editor.name')} htmlFor="f-name" error={err('name')}>
              <Input id="f-name" form={FORM_ID} value={values.name} invalid={!!shown.name} onChange={(v) => set('name', v)} />
            </FieldCell>
            <RepoPicker repos={repoList} value={values.repoId} none={noRepos} error={err('repo')} onChange={(id) => set('repoId', id, 'repo')} />
            <FieldCell label={t('editor.description')} htmlFor="f-description" error={err('description')}>
              <Input
                id="f-description"
                form={FORM_ID}
                value={values.description}
                placeholder={t('editor.descriptionHint')}
                invalid={!!shown.description}
                onChange={(v) => set('description', v)}
              />
            </FieldCell>
          </Section>
          <Section title={t('editor.prompt')}>
            <FieldCell
              label={t('editor.promptLabel')}
              htmlFor="f-prompt"
              error={err('prompt')}
              count={t('editor.count', { n: num([...values.prompt].length), max: num(PROMPT_MAX) })}
            >
              <Textarea id="f-prompt" form={FORM_ID} value={values.prompt} invalid={!!shown.prompt} onChange={(v) => set('prompt', v)} />
            </FieldCell>
          </Section>
          <Section title={t('editor.schedule')} after={<ScheduleOut draft={values.schedule} timezone={values.timezone} result={schedule} now={now} />}>
            <ScheduleFields
              draft={values.schedule}
              timezone={values.timezone}
              result={schedule}
              serverError={{ schedule: err('schedule'), timezone: err('timezone') }}
              onChange={(d) => set('schedule', d)}
              onTimezone={(tz) => set('timezone', tz)}
              formId={FORM_ID}
            />
          </Section>
          <Section title={t('editor.agent')} after={values.executorKind === 'mock' ? <p className="note">{t('editor.mockHint')}</p> : null}>
            <AgentFields values={values} executors={executors} err={err} set={set} formId={FORM_ID} />
          </Section>
          {probe !== undefined ? (
            <Section title={t('goalLoop.editor.title')} after={probeLocked ? <p className="group-note" data-testid="probe-stop-first">{t('goalLoop.editor.stopFirst')}</p> : null}>
              <ProbeFields values={probeValues} errors={probeErrors} disabled={probeLocked} set={setProbe} formId={FORM_ID} />
            </Section>
          ) : null}
        </form>
        {phone ? (
          <ActionBar>{submit}</ActionBar>
        ) : (
          <div className="form-foot">
            <Button variant="ghost" onClick={onCancel} data-testid="form-cancel">
              {t('editor.cancel')}
            </Button>
            {submit}
          </div>
        )}
      </Page>
    </>
  );
}
