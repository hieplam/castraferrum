// The health file `goals/health.json` (spec 2.10, decision 51): standing goals that a repository must keep passing.
import { DomainError } from './errors';
import { shellArgv } from './gate-commands';
import { isValidTimeZone, nextRuns, validate } from './schedule';

/** One row, with its command as an argv that runs in the shell of the platform. */
export type HealthRow = { id: string; outcome: string; run: string[]; timeoutSec: number; verbatim: boolean };

export type HealthFile = {
  v: 1;
  cron: string;
  timezone: string;
  epic: number;
  maxNewIssuesPerPass: number;
  rows: HealthRow[];
};

const MAX_TIMEOUT_SEC = 86_400;
const MAX_ISSUES = 10;
const SINCE = /--since\s+(\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?)(?=\s|$)/;

function bad(message: string): never {
  throw new DomainError('VALIDATION_FAILED', `goals/health.json: ${message}`);
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
const inRange = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** Reads the text of the health file. `{repo}` in a `run` becomes `repo`. Throws `VALIDATION_FAILED` for any fault. */
export function parseHealthFile(text: string, repo: string, platform: string): HealthFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return bad(`not valid JSON (${(e as Error).message})`);
  }
  if (!isObject(raw)) return bad('the top level must be an object');
  if (raw.v !== 1) return bad('"v" must be 1');
  const { cron, timezone, epic } = raw;
  if (!isText(cron) || !validate(cron).ok) return bad(`cron ${JSON.stringify(cron)} is not a valid cron`);
  if (!isText(timezone) || !isValidTimeZone(timezone)) return bad(`timezone ${JSON.stringify(timezone)} is not a time zone`);
  try {
    nextRuns(cron, timezone, new Date(0), 1);
  } catch (e) {
    return bad(`cron and timezone are refused: ${(e as Error).message}`);
  }
  if (!Number.isInteger(epic) || (epic as number) < 0) return bad('"epic" must be a whole number, 0 or more');
  const max = raw.maxNewIssuesPerPass;
  if (!inRange(max, 1, MAX_ISSUES)) return bad(`maxNewIssuesPerPass must be a whole number from 1 to ${MAX_ISSUES}`);
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) return bad('"rows" must hold at least one row');

  const seen = new Set<string>();
  const verbatim = platform === 'win32';
  const rows = raw.rows.map((r: unknown, i): HealthRow => {
    if (!isObject(r)) return bad(`row ${i + 1} must be an object`);
    if (!isText(r.id)) return bad(`row ${i + 1} has no id`);
    if (seen.has(r.id)) return bad(`row id ${r.id} is repeated`);
    seen.add(r.id);
    if (!isText(r.outcome)) return bad(`row ${r.id} has no outcome`);
    if (!isText(r.run)) return bad(`row ${r.id} has no run`);
    if (!inRange(r.timeoutSec, 1, MAX_TIMEOUT_SEC)) return bad(`row ${r.id}: timeoutSec must be a whole number from 1 to ${MAX_TIMEOUT_SEC}`);
    // Old merges have no gate status: an audit with no fixed start date would report them all as incidents.
    if (r.run.includes('merge-audit.mjs')) {
      const m = SINCE.exec(r.run);
      if (!m || Number.isNaN(Date.parse(m[1]!))) return bad(`row ${r.id} runs merge-audit.mjs and needs --since <ISO date>`);
    }
    const line = r.run.replaceAll('{repo}', repo);
    return { id: r.id, outcome: r.outcome, run: shellArgv(line, platform), timeoutSec: r.timeoutSec, verbatim };
  });
  return { v: 1, cron, timezone, epic: epic as number, maxNewIssuesPerPass: max, rows };
}
