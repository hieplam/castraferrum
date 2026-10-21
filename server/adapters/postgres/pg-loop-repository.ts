import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { DueLoop, LoopCounts, LoopFilter, LoopPatch, LoopRecord, LoopRepository, NewLoopRecord } from '../../ports/loop-repository';
import { json, toLoop, violated } from './pg-util';

const PATCH_COLUMNS = {
  name: 'name',
  description: 'description',
  prompt: 'prompt',
  repoId: 'repo_id',
  cron: 'cron',
  timezone: 'timezone',
  timeoutSec: 'timeout_sec',
  maxConcurrent: 'max_concurrent',
  executorKind: 'executor_kind',
  executorConfig: 'executor_config',
  archivedAt: 'archived_at',
} as const satisfies Record<keyof Omit<LoopPatch, 'updatedAt'>, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PgLoopRepository implements LoopRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async insert(loop: NewLoopRecord): Promise<LoopRecord> {
    try {
      const { rows } = await this.#pool.query(
        `INSERT INTO loops (id, name, description, prompt, repo_id, cron, timezone, timeout_sec, executor_kind,
                            executor_config, status, created_at, updated_at, max_concurrent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'stopped', $11, $11, $12)
         RETURNING *`,
        [
          loop.id,
          loop.name,
          loop.description,
          loop.prompt,
          loop.repoId,
          loop.cron,
          loop.timezone,
          loop.timeoutSec,
          loop.executorKind,
          json(loop.executorConfig),
          loop.createdAt,
          loop.maxConcurrent ?? 1,
        ],
      );
      return toLoop(rows[0]);
    } catch (err) {
      throw mapError(err, loop.name);
    }
  }

  async findById(id: string): Promise<LoopRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM loops WHERE id = $1', [id]);
    return rows[0] ? toLoop(rows[0]) : null;
  }

  async list(filter: LoopFilter): Promise<LoopRecord[]> {
    const where = [filter.archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    if (filter.repoId) {
      params.push(filter.repoId);
      where.push(`repo_id = $${params.length}`);
    }
    if (filter.q) {
      // strpos(lower…) instead of ILIKE: no need to escape % and _ in what the user typed.
      params.push(filter.q);
      where.push(`strpos(lower(name), lower($${params.length})) > 0`);
    }
    const { rows } = await this.#pool.query(
      `SELECT * FROM loops WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC`,
      params,
    );
    return rows.map(toLoop);
  }

  async counts(repoId?: string): Promise<LoopCounts> {
    // repo_id is a uuid: an unknown id (not a uuid) → no loops, and no Postgres syntax error.
    if (repoId !== undefined && !UUID.test(repoId)) return { active: 0, stopped: 0, archived: 0 };
    const { rows } = await this.#pool.query<LoopCounts>(
      `SELECT count(*) FILTER (WHERE archived_at IS NULL AND status = 'active')::int  AS active,
              count(*) FILTER (WHERE archived_at IS NULL AND status = 'stopped')::int AS stopped,
              count(*) FILTER (WHERE archived_at IS NOT NULL)::int                    AS archived
         FROM loops WHERE ($1::uuid IS NULL OR repo_id = $1::uuid)`,
      [repoId ?? null],
    );
    return rows[0]!;
  }

  async update(id: string, patch: LoopPatch, expectedVersion: number): Promise<LoopRecord> {
    const sets = ['version = version + 1', 'updated_at = $3'];
    const params: unknown[] = [id, expectedVersion, patch.updatedAt];
    for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof typeof PATCH_COLUMNS, string][]) {
      if (patch[key] === undefined) continue;
      params.push(key === 'executorConfig' ? json(patch[key]) : patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
    try {
      const { rows } = await this.#pool.query(
        `UPDATE loops SET ${sets.join(', ')} WHERE id = $1 AND version = $2 RETURNING *`,
        params,
      );
      if (rows[0]) return toLoop(rows[0]);
    } catch (err) {
      throw mapError(err, patch.name);
    }
    const current = await this.findById(id);
    if (!current) throw new DomainError('LOOP_NOT_FOUND', `No loop ${id}`);
    throw new DomainError('VERSION_CONFLICT', `Loop was changed elsewhere (version ${current.version}, sent ${expectedVersion})`, {
      currentVersion: current.version,
    });
  }

  async findDue(now: Date, limit: number): Promise<DueLoop[]> {
    const { rows } = await this.#pool.query(
      `SELECT l.*, e.id AS open_execution_id
         FROM loops l JOIN loop_executions e ON e.loop_id = l.id AND e.ended_at IS NULL
        WHERE l.status = 'active' AND l.archived_at IS NULL AND l.next_run_at <= $1
        ORDER BY l.next_run_at, l.id
        LIMIT $2`,
      [now, limit],
    );
    return rows.map((r) => ({ ...toLoop(r), nextRunAt: r.next_run_at as Date, openExecutionId: r.open_execution_id as string }));
  }

  async advanceNextRun(id: string, expected: Date, next: Date | null): Promise<boolean> {
    const res = await this.#pool.query(
      `UPDATE loops SET next_run_at = $3 WHERE id = $1 AND status = 'active' AND next_run_at = $2`,
      [id, expected, next],
    );
    return res.rowCount === 1;
  }

  async stopAll(now: Date): Promise<number> {
    const res = await this.#pool.query(
      `UPDATE loops SET status = 'stopped', next_run_at = NULL, updated_at = $1 WHERE status = 'active'`,
      [now],
    );
    return res.rowCount ?? 0;
  }
}

function mapError(err: unknown, name: string | undefined): unknown {
  if (violated(err, '23505') === 'loops_name_live') {
    return new DomainError('LOOP_NAME_TAKEN', `A loop named "${name ?? ''}" already exists`, { field: 'name' });
  }
  if (violated(err, '23503') === 'loops_repo_id_repos_id_fk') {
    return new DomainError('VALIDATION_FAILED', 'Repo does not exist', {
      issues: [{ field: 'repoId', code: 'unknownRepo', message: 'Repo does not exist' }],
    });
  }
  if (violated(err, '23514') === 'loops_archived_is_stopped') {
    return new DomainError('LOOP_IS_ACTIVE', 'Loop is running — Stop it before archiving');
  }
  return err;
}
