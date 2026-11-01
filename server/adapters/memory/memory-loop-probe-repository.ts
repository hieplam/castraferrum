import { DomainError } from '../../../shared/domain/errors';
import type { ProbeRecord, ProbeSettings, ProbeState } from '../../../shared/domain/goal-loop';
import type { LoopProbeRepository } from '../../ports/loop-probe-repository';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryLoopProbeRepository implements LoopProbeRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async get(loopId: string): Promise<ProbeRecord | null> {
    const row = this.#db.probes.get(loopId);
    return row ? clone(row) : null;
  }

  async list(): Promise<ProbeRecord[]> {
    return [...this.#db.probes.values()].sort((a, b) => cmp(a.loopId, b.loopId)).map(clone);
  }

  async upsert(loopId: string, s: ProbeSettings): Promise<ProbeRecord> {
    const old = this.#db.probes.get(loopId);
    const row: ProbeRecord = old
      ? { ...old, ...clone(s) }
      : { loopId, ...clone(s), state: 'active', lastLine: null, lastProbeAt: null };
    try {
      this.#db.writeProbe(row);
    } catch (err) {
      if (err instanceof ConstraintViolation && err.constraint === 'loop_probes_loop_id_loops_id_fk') {
        throw new DomainError('LOOP_NOT_FOUND', `No loop ${loopId}`);
      }
      throw err;
    }
    return clone(row);
  }

  async remove(loopId: string): Promise<void> {
    this.#db.probes.delete(loopId);
  }

  async record(loopId: string, r: { state: ProbeState; lastLine: string | null; at: Date }): Promise<void> {
    const old = this.#db.probes.get(loopId);
    if (!old) return;
    this.#db.writeProbe({ ...old, state: r.state, lastLine: r.lastLine, lastProbeAt: new Date(r.at) });
  }
}
