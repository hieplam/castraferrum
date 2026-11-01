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

/** A key matches this pattern; the console reads no meaning from it. */
export const PROBE_KEY = /^[\w.-]{1,100}$/;

export const PROBE_RAW_MAX_BYTES = 2000;

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
