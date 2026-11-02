// Domain types of the goal-driven loop (spec 2.1) and the parser of the probe line.
// No zod here: a service cannot import it (.dependency-cruiser.cjs).

export const PROBE_ACTIONS = ['take', 'plan', 'skip', 'wait', 'blocked', 'hold', 'done'] as const;
export type ProbeAction = (typeof PROBE_ACTIONS)[number];

export const PROBE_STATES = [
  'active',
  'waiting',
  'blocked',
  'held',
  'budget_limited',
  'complete',
  'probe_failed',
] as const;
export type ProbeState = (typeof PROBE_STATES)[number];

/** The state that each action of a probe line gives the loop (spec 2.1). */
export const PROBE_ACTION_STATE: Record<ProbeAction, ProbeState> = {
  take: 'active',
  plan: 'active',
  skip: 'active',
  wait: 'waiting',
  blocked: 'blocked',
  hold: 'held',
  done: 'complete',
};

/** A key matches this pattern; the console reads no meaning from it. */
export const PROBE_KEY = /^[\w.-]{1,100}$/;

export const PROBE_RAW_MAX_BYTES = 2000;

// ---------------------------------------------------------------- probe settings (table loop_probes)

export const RESTART_POLICIES = ['stop', 'resume'] as const;
export type RestartPolicy = (typeof RESTART_POLICIES)[number];

/** The rank of a loop that sets none. Loops at one rank never read the plan window (rule 6). */
export const DEFAULT_RANK = 100;

/** The resource name that the console reserves for the plan window (spec 2.5). A loop setting cannot use it. */
export const RESERVED_RESOURCE = 'plan-window';

/** A resource check of a loop: the argv exits 0 when the resource is up, and runs every `everySec` seconds. */
export interface ProbeResource {
  name: string;
  check: string[];
  everySec: number;
}

/** What the owner sets for a loop's probe. Every command is an argv array with no shell. */
export interface ProbeSettings {
  command: string[];
  claim: string[];
  release: string[];
  resources: ProbeResource[];
  laneEnv: Record<string, string>;
  laneBasePort: number | null;
  restartPolicy: RestartPolicy;
  /** Spec 2.14: a smaller number is a higher rank. */
  rank: number;
  /** The tokens that the runs of the loop can use. `null` has no limit. */
  tokenBudget: number | null;
}

/** A stored probe: the settings plus what the last probe call left. */
export interface ProbeRecord extends ProbeSettings {
  loopId: string;
  state: ProbeState;
  lastLine: string | null;
  lastProbeAt: Date | null;
}

export interface ProbeTask {
  key: string;
  attempt: number;
  resources: string[];
}

export interface ProbePlan {
  key: string;
  failing: string[];
}

export interface ProbeLine {
  v: 1;
  action: ProbeAction;
  tasks: ProbeTask[];
  reason: string;
  resource: string | null;
  until: string | null;
  plan: ProbePlan | null;
  issues: string[];
  goals: { passed: number; total: number } | null;
}

export type ProbeParse = { ok: true; line: ProbeLine; raw: string } | { ok: false; reason: string; raw: string };

/** Cuts `text` to at most `max` UTF-8 bytes, on a character edge. */
export function cutBytes(text: string, max: number): string {
  if (new TextEncoder().encode(text).length <= max) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const n = new TextEncoder().encode(ch).length;
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isKey(v: unknown): v is string {
  return typeof v === 'string' && PROBE_KEY.test(v);
}

function stringList(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return null;
  return v as string[];
}

function parseTasks(v: unknown): ProbeTask[] | null {
  if (!Array.isArray(v)) return null;
  const tasks: ProbeTask[] = [];
  for (const t of v) {
    if (!isObject(t) || !isKey(t.key)) return null;
    const attempt = t.attempt === undefined ? 1 : t.attempt;
    if (typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < 1) return null;
    const resources = t.resources === undefined ? [] : stringList(t.resources);
    if (resources === null) return null;
    tasks.push({ key: t.key, attempt, resources });
  }
  return tasks;
}

function parsePlan(v: unknown): ProbePlan | null {
  if (!isObject(v) || !isKey(v.key)) return null;
  const failing = v.failing === undefined ? [] : stringList(v.failing);
  if (failing === null) return null;
  return { key: v.key, failing };
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Parses the last non-empty line of a probe's stdout. Never throws. */
export function parseProbeLine(stdout: string): ProbeParse {
  const lines = stdout.split(/\r\n|\r|\n/);
  let last = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    if ((lines[i] ?? '').trim() !== '') {
      last = (lines[i] ?? '').trim();
      break;
    }
  }
  const raw = cutBytes(last, PROBE_RAW_MAX_BYTES);
  const fail = (reason: string): ProbeParse => ({ ok: false, reason, raw });

  if (last === '') return fail('empty output');
  let value: unknown;
  try {
    value = JSON.parse(last);
  } catch {
    return fail('last line is not JSON');
  }
  if (!isObject(value)) return fail('last line is not a JSON object');
  if (value.v !== 1) return fail('unsupported version');
  const action = value.action;
  if (typeof action !== 'string' || !(PROBE_ACTIONS as readonly string[]).includes(action)) {
    return fail('unknown action');
  }

  const tasks = value.tasks === undefined ? [] : parseTasks(value.tasks);
  if (tasks === null) return fail('invalid tasks');
  const issues = value.issues === undefined ? [] : stringList(value.issues);
  if (issues === null) return fail('invalid issues');
  const plan = value.plan === undefined || value.plan === null ? null : parsePlan(value.plan);
  if (value.plan !== undefined && value.plan !== null && plan === null) return fail('invalid plan');
  const reason = value.reason === undefined || value.reason === null ? '' : value.reason;
  if (typeof reason !== 'string') return fail('invalid reason');
  const resource = value.resource === undefined || value.resource === null ? null : value.resource;
  if (resource !== null && typeof resource !== 'string') return fail('invalid resource');
  const until = value.until === undefined || value.until === null ? null : value.until;
  if (until !== null && typeof until !== 'string') return fail('invalid until');
  let goals: ProbeLine['goals'] = null;
  if (value.goals !== undefined && value.goals !== null) {
    const g = value.goals;
    if (!isObject(g) || typeof g.passed !== 'number' || typeof g.total !== 'number') {
      return fail('invalid goals');
    }
    goals = { passed: g.passed, total: g.total };
  }

  if (action === 'take' && tasks.length === 0) return fail('take needs tasks');
  if (action === 'plan' && plan === null) return fail('plan needs plan');
  if (action === 'wait' && !nonEmptyString(reason)) return fail('wait needs reason');
  if (action === 'blocked' && (!nonEmptyString(reason) || issues.length === 0)) {
    return fail('blocked needs reason and issues');
  }
  if (action === 'hold' && (!nonEmptyString(resource) || !nonEmptyString(reason))) {
    return fail('hold needs resource and reason');
  }

  return {
    ok: true,
    raw,
    line: {
      v: 1,
      action: action as ProbeAction,
      tasks,
      reason,
      resource,
      until,
      plan,
      issues,
      goals,
    },
  };
}

// ---------------------------------------------------------------- lanes (spec 2.7)

/** The lowest slot, from 0, that no active run holds. A run with no slot (a manual or scheduled run) holds none. */
export function lowestFreeSlot(used: readonly (number | null)[]): number {
  const held = new Set(used);
  let slot = 0;
  while (held.has(slot)) slot++;
  return slot;
}

/**
 * The env of a claimed run: `lane_env` with every `{slot}` and `{port}` filled in (`port` = `lane_base_port + slot`), plus `CASTRAFERRUM_SLOT`,
 * and `CASTRAFERRUM_GATE=1` when the gate of the repository is on (decision 19). These two come last, so a lane env cannot change them. Without a base port, `{port}` stays as written (a save refuses that, decision 24).
 */
export function laneEnvOf(settings: Pick<ProbeSettings, 'laneEnv' | 'laneBasePort'>, slot: number, gateOn = false): Record<string, string> {
  const port = settings.laneBasePort === null ? null : String(settings.laneBasePort + slot);
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(settings.laneEnv)) {
    const filled = value.split('{slot}').join(String(slot));
    env[name] = port === null ? filled : filled.split('{port}').join(port);
  }
  env.CASTRAFERRUM_SLOT = String(slot);
  delete env.CASTRAFERRUM_GATE;
  if (gateOn) env.CASTRAFERRUM_GATE = '1';
  return env;
}

/** The largest number that the column `gate_jobs.pr_number` holds. */
const MAX_PR_NUMBER = 2_147_483_647;

/**
 * Decision 47: the number of a pull request link of the repository `githubRepo` (`o/r`), compared with no regard to case. Any other text gives `null`,
 * because a number from another repository names the wrong pull request.
 */
export function prNumberOf(endPr: string | null, githubRepo: string): number | null {
  const m = /^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/([1-9]\d*)$/i.exec(endPr ?? '');
  if (!m || m[1]!.toLowerCase() !== githubRepo.toLowerCase()) return null;
  const number = Number(m[2]);
  return number <= MAX_PR_NUMBER ? number : null;
}

/** The first line of the prompt of a claimed run. `docs/ARCHITECTURE.md` holds the same text, and `tick.md` relies on it (spec 2.7). */
export function claimedLine(key: string, action: 'take' | 'plan'): string {
  return `[Castraferrum] The console claimed task ${key} for this run (action ${action}). Do not run next or claim. Do this task only.`;
}

/** `runs.end_result` of a run that hit a usage limit with no session id: nothing can resume it, so it fails, and its release is excused (decision 26). */
export const USAGE_LIMIT_END = 'USAGE_LIMIT';

/** The message that resumes a run after a usage limit (spec 2.7). */
export const RESUME_LINE = '[Castraferrum] The usage limit has reset. Continue the same task from where you stopped.';
