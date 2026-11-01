import { DomainError } from '../../shared/domain/errors';
import type { Repositories } from '../ports/repositories';
import type { ProcessEvent, ProcessService } from './contracts';

export type ProcessServiceDeps = Pick<Repositories, 'runs'>;

/** The longest range that one call may read. */
export const MAX_RANGE_DAYS = 31;
/** Each of error, summary and skip reason is cut at this many characters in `text`. */
export const TEXT_PART_LIMIT = 2000;

/** Gives the process review its inputs: the run events of a period. It reads `runs` only, and it holds no loop name, prompt or path. */
export class DefaultProcessService implements ProcessService {
  readonly #d: ProcessServiceDeps;

  constructor(deps: ProcessServiceDeps) {
    this.#d = deps;
  }

  async events(from: Date, to: Date): Promise<ProcessEvent[]> {
    if (from.getTime() >= to.getTime()) throw invalid('from', 'from must be before to');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw invalid('to', `the range is at most ${MAX_RANGE_DAYS} days`);
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
}

function invalid(field: string, message: string): DomainError {
  return new DomainError('VALIDATION_FAILED', message, { issues: [{ field, code: 'invalid', message }] });
}
