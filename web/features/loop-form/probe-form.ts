// Model of the Probe group of the editor (goal G28, spec 2.1): the text in each field <-> the body of `PUT /loops/:id/probe`, and the
// server's `details.issues` of the probe -> fields. Pure functions: the component only draws. The `resources` setting has no field in
// the editor (it stays API only), so a save sends back the resources that the probe already has.
import type { ValidationIssueDto } from '../../../shared/contracts/common';
import type { ProbeDto, ProbeInputBody } from '../../../shared/contracts/goal-loop';
import type { RestartPolicy } from '../../../shared/domain/goal-loop';
import type { MessageKey } from '../../prefs/messages';

export type ProbeFormValues = {
  /** The switch: a loop with a probe, or one that gets a probe on Save. */
  enabled: boolean;
  /** One argument per line. */
  command: string;
  claim: string;
  release: string;
  restart: RestartPolicy;
  /** `''` = no base port. */
  basePort: string;
  /** `KEY=value` per line. */
  laneEnv: string;
  /** `''` = no limit (`null`). */
  tokenBudget: string;
};

/** Fields of the group that can carry a server error. */
export type ProbeField = 'command' | 'claim' | 'release' | 'laneEnv' | 'laneBasePort' | 'tokenBudget';
export type ProbeErrors = Partial<Record<ProbeField, string>>;

/** An argv as the editor shows it: one argument per line. */
export const argvToText = (argv: readonly string[]): string => argv.join('\n');

/** The text of a field as an argv: each line is one argument, with no shell, so a space stays in its argument. Blank lines are dropped. */
export function textToArgv(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim() !== '');
}

/** `KEY=value` per line, sorted by key (the database does not keep the order of the keys). */
export const envToText = (env: Readonly<Record<string, string>>): string =>
  Object.entries(env)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

/** `KEY=value` per line. The first `=` splits the line, so a value can hold `=`. A blank line, and a line with no key or no `=`, is dropped. */
export function textToEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const at = line.indexOf('=');
    const key = at < 0 ? '' : line.slice(0, at).trim();
    if (key) env[key] = line.slice(at + 1);
  }
  return env;
}

export function emptyProbeValues(): ProbeFormValues {
  return { enabled: false, command: '', claim: '', release: '', restart: 'stop', basePort: '', laneEnv: '', tokenBudget: '' };
}

export function probeValuesFrom(probe: ProbeDto | null): ProbeFormValues {
  if (!probe) return emptyProbeValues();
  return {
    enabled: true,
    command: argvToText(probe.command),
    claim: argvToText(probe.claim),
    release: argvToText(probe.release),
    restart: probe.restartPolicy,
    basePort: probe.laneBasePort === null ? '' : String(probe.laneBasePort),
    laneEnv: envToText(probe.laneEnv),
    tokenBudget: probe.tokenBudget === null ? '' : String(probe.tokenBudget),
  };
}

/** Base port field: empty = none; text that is not a whole number gives 0, so the server reports `laneBasePort:outOfRange` at the field. */
function portOf(text: string): number | null {
  const s = text.trim();
  if (s === '') return null;
  return /^\d+$/.test(s) ? Number(s) : 0;
}

/** Token budget field: empty = no limit (`null`); text that is not a whole number gives 0, so the server also reports `tokenBudget:outOfRange`. */
function budgetOf(text: string): number | null {
  const s = text.trim();
  if (s === '') return null;
  return /^\d+$/.test(s) ? Number(s) : 0;
}

/** The error key of the token budget field, or `null` when it is empty (no limit) or a whole number of 1 or more. */
export function tokenBudgetError(text: string): MessageKey | null {
  const s = text.trim();
  return s === '' || (/^\d+$/.test(s) && Number(s) >= 1) ? null : 'goalLoop.editor.tokenBudgetError';
}

/**
 * The editor shows no field for `resources` yet, so a save sends the resources of the saved probe: an omitted field takes its server
 * default. The token budget is the field `probe-token-budget`: empty is `null`, no limit.
 */
export function toProbeBody(v: ProbeFormValues, kept?: Pick<ProbeDto, 'resources'>): ProbeInputBody {
  return {
    command: textToArgv(v.command),
    claim: textToArgv(v.claim),
    release: textToArgv(v.release),
    resources: kept?.resources ?? [],
    tokenBudget: budgetOf(v.tokenBudget),
    laneEnv: textToEnv(v.laneEnv),
    laneBasePort: portOf(v.basePort),
    restartPolicy: v.restart,
  };
}

/**
 * The probe issues that have a field (`command:required`, `claim:missingKey`, `release:missingKey`, `release:missingReason`,
 * `laneEnv:missingBasePort`, `laneBasePort:outOfRange`, `tokenBudget:outOfRange`) with the server's message; the others (`resources:reserved`) go to `rest`.
 */
export function probeErrorsFromIssues(issues: ValidationIssueDto[]): { errors: ProbeErrors; rest: ValidationIssueDto[] } {
  const errors: ProbeErrors = {};
  const rest: ValidationIssueDto[] = [];
  for (const i of issues) {
    if (i.field === 'command' || i.field === 'claim' || i.field === 'release' || i.field === 'laneEnv' || i.field === 'laneBasePort' || i.field === 'tokenBudget') {
      errors[i.field] ??= i.message;
    } else rest.push(i);
  }
  return { errors, rest };
}
