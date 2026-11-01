import { DomainError } from '../../shared/domain/errors';
import { firstFailingLine } from '../../shared/domain/fingerprint';
import { GitHostError, type GitHost } from '../ports/git-host';
import type { Repositories } from '../ports/repositories';
import type { ProcessEvent, ProcessService, ProcessSignal } from './contracts';

export type ProcessServiceDeps = Pick<Repositories, 'runs' | 'gate'> & { host: GitHost };

/** The longest range that one call may read. */
export const MAX_RANGE_DAYS = 31;
/** Each of error, summary and skip reason is cut at this many characters in `text`. */
export const TEXT_PART_LIMIT = 2000;
/** The text of a gate item or a comment item is cut at this many characters. */
const SIGNAL_TEXT_LIMIT = 2000;

/** Gives the process review its inputs: run events, refused gate jobs and loop comments. It holds no loop name, prompt, path, PR number or commit. */
export class DefaultProcessService implements ProcessService {
  readonly #d: ProcessServiceDeps;

  constructor(deps: ProcessServiceDeps) {
    this.#d = deps;
  }

  async events(from: Date, to: Date): Promise<ProcessEvent[]> {
    checkRange(from, to);
    const runs = await this.#d.runs.listBetween(from, to);
    return runs.map((r) => ({
      id: r.id,
      at: r.startedAt,
      loop: r.loopId,
      status: r.status,
      text: [r.error, r.summary, r.skipReason]
        .filter((v): v is string => v !== null && v !== '')
        .map((v) => v.slice(0, TEXT_PART_LIMIT))
        .join('\n'),
    }));
  }

  async signals(from: Date, to: Date, repo: string): Promise<{ gate: ProcessSignal[]; comments: ProcessSignal[] }> {
    checkRange(from, to);
    const jobs = await this.#d.gate.listRefusedBetween(from, to);
    const gate: ProcessSignal[] = [];
    for (const job of jobs) {
      const steps = await this.#d.gate.listSteps(job.id);
      const failed = steps.filter((st) => st.step === job.failedStep).pop();
      const text = `${job.failedStep ?? 'unknown'}: ${firstFailingLine(failed?.outputTail ?? '').trim()}`;
      gate.push({ id: `gate:${job.id}`, at: job.finishedAt!, kind: 'gate', text: text.slice(0, SIGNAL_TEXT_LIMIT) });
    }
    let found;
    try {
      found = await this.#d.host.loopComments(repo, from);
    } catch (err) {
      // The message and the stderr of the host call can name the repository, so only a fixed message goes out.
      if (err instanceof GitHostError) throw new DomainError('GIT_HOST_FAILED', 'The Git host did not answer the call');
      throw err;
    }
    const comments = found
      .filter((c) => c.at >= from && c.at < to)
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.issue - b.issue || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((c): ProcessSignal => ({ id: `comment:${c.issue}:${c.id}`, at: c.at, kind: 'comment', text: commentText(c.body) }));
    return { gate, comments };
  }
}

/** The lines before the first blank line, plus the `loop-found:` line if the body has one. */
function commentText(body: string): string {
  const lines = body.split(/\r?\n/);
  const blank = lines.findIndex((l) => l.trim() === '');
  const head = blank === -1 ? lines : lines.slice(0, blank);
  const found = lines.find((l) => l.startsWith('loop-found:'));
  return (found !== undefined && !head.includes(found) ? [...head, found] : head).join('\n').slice(0, SIGNAL_TEXT_LIMIT);
}

function checkRange(from: Date, to: Date): void {
  if (from.getTime() >= to.getTime()) throw invalid('from', 'from must be before to');
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw invalid('to', `the range is at most ${MAX_RANGE_DAYS} days`);
}

function invalid(field: string, message: string): DomainError {
  return new DomainError('VALIDATION_FAILED', message, { issues: [{ field, code: 'invalid', message }] });
}
