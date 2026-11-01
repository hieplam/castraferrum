import { DomainError } from '../../../shared/domain/errors';
import type { DueLoop, LoopCounts, LoopFilter, LoopPatch, LoopRecord, LoopRepository, NewLoopRecord } from '../../ports/loop-repository';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryLoopRepository implements LoopRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async insert(loop: NewLoopRecord): Promise<LoopRecord> {
    const row: LoopRecord = {
      id: loop.id,
      name: loop.name,
      description: loop.description,
      prompt: loop.prompt,
      repoId: loop.repoId,
      cron: loop.cron,
      timezone: loop.timezone,
      timeoutSec: loop.timeoutSec,
      overlapPolicy: 'skip',
      maxConcurrent: loop.maxConcurrent ?? 1,
      executorKind: loop.executorKind,
      executorConfig: clone(loop.executorConfig),
      status: 'stopped',
      nextRunAt: null,
      runCounter: 0,
      executionCounter: 0,
      version: 1,
      createdAt: loop.createdAt,
      updatedAt: loop.createdAt,
      archivedAt: null,
    };
    try {
      this.#db.insertLoop(row);
    } catch (err) {
      throw mapError(err, loop.name);
    }
    return clone(row);
  }

  async findById(id: string): Promise<LoopRecord | null> {
    const row = this.#db.loops.get(id);
    return row ? clone(row) : null;
  }

  async list(filter: LoopFilter): Promise<LoopRecord[]> {
    const q = filter.q?.toLowerCase();
    return [...this.#db.loops.values()]
      .filter((l) => (filter.archived ? l.archivedAt !== null : l.archivedAt === null))
      .filter((l) => !filter.status || l.status === filter.status)
      .filter((l) => !filter.repoId || l.repoId === filter.repoId)
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || cmp(b.id, a.id))
      .map(clone);
  }

  async counts(repoId?: string): Promise<LoopCounts> {
    const out: LoopCounts = { active: 0, stopped: 0, archived: 0 };
    for (const l of this.#db.loops.values()) if (repoId === undefined || l.repoId === repoId) out[l.archivedAt ? 'archived' : l.status] += 1;
    return out;
  }

  async update(id: string, patch: LoopPatch, expectedVersion: number): Promise<LoopRecord> {
    const current = this.#db.loops.get(id);
    if (!current) throw new DomainError('LOOP_NOT_FOUND', `No loop ${id}`);
    if (current.version !== expectedVersion) {
      throw new DomainError('VERSION_CONFLICT', `Loop was changed elsewhere (version ${current.version}, sent ${expectedVersion})`, {
        currentVersion: current.version,
      });
    }
    const next: LoopRecord = { ...current, version: current.version + 1, updatedAt: patch.updatedAt };
    for (const key of PATCH_KEYS) {
      if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = clone(patch[key]);
    }
    try {
      this.#db.writeLoop(next);
    } catch (err) {
      throw mapError(err, patch.name);
    }
    return clone(next);
  }

  async findDue(now: Date, limit: number): Promise<DueLoop[]> {
    const open = new Map<string, string>();
    for (const e of this.#db.executions.values()) if (e.endedAt === null) open.set(e.loopId, e.id);
    const due: DueLoop[] = [];
    for (const l of this.#db.loops.values()) {
      const openExecutionId = open.get(l.id);
      if (l.status !== 'active' || l.archivedAt !== null || l.nextRunAt === null || !openExecutionId) continue;
      if (l.nextRunAt.getTime() > now.getTime()) continue;
      due.push({ ...clone(l), nextRunAt: new Date(l.nextRunAt), openExecutionId });
    }
    return due.sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime() || cmp(a.id, b.id)).slice(0, limit);
  }

  async advanceNextRun(id: string, expected: Date, next: Date | null): Promise<boolean> {
    const l = this.#db.loops.get(id);
    if (!l || l.status !== 'active' || l.nextRunAt?.getTime() !== expected.getTime()) return false;
    this.#db.writeLoop({ ...l, nextRunAt: next });
    return true;
  }

  async stopAll(now: Date, keepLoopIds: string[] = []): Promise<number> {
    return this.#db.transaction(() => {
      let n = 0;
      for (const l of this.#db.loops.values()) {
        if (l.status !== 'active' || keepLoopIds.includes(l.id)) continue;
        this.#db.writeLoop({ ...l, status: 'stopped', nextRunAt: null, updatedAt: now });
        n++;
      }
      return n;
    });
  }
}

const PATCH_KEYS = [
  'name',
  'description',
  'prompt',
  'repoId',
  'cron',
  'timezone',
  'timeoutSec',
  'maxConcurrent',
  'executorKind',
  'executorConfig',
  'archivedAt',
] as const satisfies readonly (keyof Omit<LoopPatch, 'updatedAt'>)[];


function mapError(err: unknown, name: string | undefined): unknown {
  if (err instanceof ConstraintViolation && err.constraint === 'loops_name_live') {
    return new DomainError('LOOP_NAME_TAKEN', `A loop named "${name ?? ''}" already exists`, { field: 'name' });
  }
  if (err instanceof ConstraintViolation && err.constraint === 'loops_repo_id_repos_id_fk') {
    return new DomainError('VALIDATION_FAILED', 'Repo does not exist', {
      issues: [{ field: 'repoId', code: 'unknownRepo', message: 'Repo does not exist' }],
    });
  }
  if (err instanceof ConstraintViolation && err.constraint === 'loops_archived_is_stopped') {
    return new DomainError('LOOP_IS_ACTIVE', 'Loop is running — Stop it before archiving');
  }
  return err;
}
