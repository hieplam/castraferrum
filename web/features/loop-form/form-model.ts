// Model of the create / edit loop form (UC-01, UC-09): the text in each field <-> the API request body, server errors -> fields, and
// comparing two versions of a loop to say "what differs" on a version conflict. Pure functions - the component only draws.
import type { ValidationIssueDto } from '../../../shared/contracts/common';
import type { LoopDto, LoopInputBody } from '../../../shared/contracts/loops';
import type { MessageKey } from '../../prefs/messages';
import { DEFAULT_CRON, draftFromCron, draftToSpec, type ScheduleDraft } from './schedule-draft';
import { toCron, validateSpec } from '../../../shared/domain/schedule';

/**
 * Spec defaults (section "Model", form-new of the approved preview): executor Claude `opus` / `medium`, timeout left empty = no
 * limit (SPEC-phase-2). Mock (test mode only) keeps the phase 1 defaults.
 */
export const DEFAULTS = { timezone: 'Asia/Ho_Chi_Minh', executorKind: 'claude', model: 'opus', effort: 'medium', durationSec: 10, failRate: 0 } as const;
export const MODELS = ['opus', 'sonnet', 'haiku'] as const;
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type FormValues = {
  /** Repo of the loop (required - the repo picker, D-UI13); `''` = not chosen. */
  repoId: string;
  name: string;
  description: string;
  prompt: string;
  schedule: ScheduleDraft;
  timezone: string;
  /** `''` = no limit (SPEC-phase-2). */
  timeoutSec: string;
  /** Maximum parallel runs 1-10; `''` = 1. */
  maxConcurrent: string;
  executorKind: string;
  /** Executor `claude`. */
  model: string;
  effort: string;
  /** Executor `mock` (test mode only). */
  durationSec: string;
  failRate: string;
};

/** Fields of the form that can carry an error (keys of `FormErrors`). */
export type FormField = 'name' | 'repo' | 'description' | 'prompt' | 'schedule' | 'timezone' | 'timeoutSec' | 'maxConcurrent' | 'durationSec' | 'failRate' | 'executor';
export type FormErrors = Partial<Record<FormField, MessageKey>>;

export function emptyValues(): FormValues {
  return {
    repoId: '',
    name: '',
    description: '',
    prompt: '',
    schedule: draftFromCron(DEFAULT_CRON),
    timezone: DEFAULTS.timezone,
    timeoutSec: '',
    maxConcurrent: '1',
    executorKind: DEFAULTS.executorKind,
    model: DEFAULTS.model,
    effort: DEFAULTS.effort,
    durationSec: String(DEFAULTS.durationSec),
    failRate: String(DEFAULTS.failRate),
  };
}

type ExecConfig = { durationSec?: unknown; failRate?: unknown; model?: unknown; effort?: unknown };
const configOf = (loop: LoopDto): ExecConfig => (loop.executor.config && typeof loop.executor.config === 'object' ? (loop.executor.config as ExecConfig) : {});

export function valuesFromLoop(loop: LoopDto): FormValues {
  const cfg = configOf(loop);
  return {
    repoId: loop.repo.id,
    name: loop.name,
    description: loop.description,
    prompt: loop.prompt,
    schedule: draftFromCron(loop.cron),
    timezone: loop.timezone,
    timeoutSec: loop.timeoutSec === null ? '' : String(loop.timeoutSec),
    maxConcurrent: String(loop.maxConcurrent),
    executorKind: loop.executor.kind,
    model: String(cfg.model ?? DEFAULTS.model),
    effort: String(cfg.effort ?? DEFAULTS.effort),
    durationSec: String(cfg.durationSec ?? DEFAULTS.durationSec),
    failRate: String(cfg.failRate ?? DEFAULTS.failRate),
  };
}

/** Text -> number; an empty field / not a number -> NaN (JSON `null`) so the server reports the error at the field instead of silently taking the default. */
function num(s: string): number {
  const v = s.trim().replace(/[\s ,]/g, '');
  return v === '' || !/^-?\d+(\.\d+)?$/.test(v) ? Number.NaN : Number(v);
}

/** Cron to save: the builder's choice -> `toCron`; a schedule that still has errors sends the raw text so the server reports (the save button is already locked). */
export function cronOf(d: ScheduleDraft): string {
  const spec = draftToSpec(d);
  return validateSpec(spec).length === 0 ? toCron(spec) : d.kind === 'advanced' ? d.cron : '';
}

export function toBody(v: FormValues): LoopInputBody {
  return {
    ...(v.repoId ? { repoId: v.repoId } : {}),
    name: v.name,
    description: v.description,
    prompt: v.prompt,
    cron: cronOf(v.schedule),
    timezone: v.timezone,
    timeoutSec: timeoutOf(v.timeoutSec),
    maxConcurrent: maxConcurrentOf(v.maxConcurrent),
    executor:
      v.executorKind === 'mock'
        ? { kind: 'mock', config: { durationSec: num(v.durationSec), failRate: num(v.failRate) } }
        : v.executorKind === 'claude'
          ? { kind: 'claude', config: { model: v.model, effort: v.effort } }
          : { kind: v.executorKind },
  };
}

/** Timeout field: empty = no limit (`null`); text that is not a number -> 0 so the server reports "out of range" at the field (never silently no limit). */
function timeoutOf(s: string): number | null {
  if (s.trim() === '') return null;
  const n = num(s);
  return Number.isNaN(n) ? 0 : n;
}

/** Parallel field: empty = 1 (default); text that is not a number -> 0 so the server reports "out of range" at the field. */
function maxConcurrentOf(s: string): number {
  if (s.trim() === '') return 1;
  const n = num(s);
  return Number.isNaN(n) ? 0 : n;
}

const FIELD_OF: Record<string, FormField> = {
  name: 'name',
  description: 'description',
  prompt: 'prompt',
  cron: 'schedule',
  timezone: 'timezone',
  timeoutSec: 'timeoutSec',
  maxConcurrent: 'maxConcurrent',
  repoId: 'repo',
  'executor.config.model': 'executor',
  'executor.config.effort': 'executor',
  'executor.config.durationSec': 'durationSec',
  'executor.config.failRate': 'failRate',
  'executor.kind': 'executor',
  executor: 'executor',
  'executor.config': 'executor',
};

/** The sentence of a field error - translated by field + `code` (the web never shows the server's `message`). */
function messageOf(field: FormField, code: ValidationIssueDto['code']): MessageKey {
  if (field === 'repo') return 'val.repoRequired'; // repo missing or just deleted (unknownRepo) - choose another repo
  if (code === 'required' && field !== 'timeoutSec' && field !== 'maxConcurrent' && field !== 'durationSec' && field !== 'failRate') return 'val.required';
  switch (field) {
    case 'name':
      return 'val.nameTooLong';
    case 'description':
      return 'val.descTooLong';
    case 'prompt':
      return 'val.promptTooLong';
    case 'schedule':
      return 'error.INVALID_CRON';
    case 'timezone':
      return 'val.timezone';
    case 'timeoutSec':
      return 'val.timeoutRangeOptional';
    case 'maxConcurrent':
      return 'val.maxConcurrentRange';
    case 'durationSec':
      return 'val.durRange';
    case 'failRate':
      return 'val.failRange';
    case 'executor':
      return 'val.invalid';
  }
}

/** `VALIDATION_FAILED.details.issues` -> errors per field (the first error of each field). An odd field (`version`, `body`...) -> `rest`. */
export function errorsFromIssues(issues: readonly ValidationIssueDto[]): { errors: FormErrors; rest: ValidationIssueDto[] } {
  const errors: FormErrors = {};
  const rest: ValidationIssueDto[] = [];
  for (const issue of issues) {
    const field = FIELD_OF[issue.field];
    if (!field) rest.push(issue);
    else errors[field] ??= messageOf(field, issue.code);
  }
  return { errors, rest };
}

/** Two names counted as one (the server compares case-insensitively, trimming leading / trailing whitespace). */
export const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The groups of information that differ between two versions of the same loop - the sentence "differs in: Prompt, Schedule" on a conflict. */
export type ChangedPart = 'name' | 'repo' | 'description' | 'prompt' | 'schedule' | 'timezone' | 'timeoutSec' | 'maxConcurrent' | 'executor';
export function changedParts(a: LoopDto, b: LoopDto): ChangedPart[] {
  const out: ChangedPart[] = [];
  if (a.name !== b.name) out.push('name');
  if (a.repo.id !== b.repo.id) out.push('repo');
  if (a.description !== b.description) out.push('description');
  if (a.prompt !== b.prompt) out.push('prompt');
  if (a.cron !== b.cron) out.push('schedule');
  if (a.timezone !== b.timezone) out.push('timezone');
  if (a.timeoutSec !== b.timeoutSec) out.push('timeoutSec');
  if (a.maxConcurrent !== b.maxConcurrent) out.push('maxConcurrent');
  if (a.executor.kind !== b.executor.kind || JSON.stringify(a.executor.config) !== JSON.stringify(b.executor.config)) out.push('executor');
  return out;
}
export const PART_LABEL: Record<ChangedPart, MessageKey> = {
  name: 'form.name',
  repo: 'form.repo',
  description: 'form.desc',
  prompt: 'form.prompt',
  schedule: 'form.section.schedule',
  timezone: 'sched.field.tz',
  timeoutSec: 'form.timeout',
  maxConcurrent: 'form.maxConcurrent',
  executor: 'form.executor',
};
