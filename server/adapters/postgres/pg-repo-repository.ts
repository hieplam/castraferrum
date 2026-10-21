import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { NewRepoRecord, RepoRecord, RepoRepository } from '../../ports/repo-repository';
import { toRepo, violated } from './pg-util';

export class PgRepoRepository implements RepoRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async insert(repo: NewRepoRecord): Promise<RepoRecord> {
    try {
      const { rows } = await this.#pool.query(
        'INSERT INTO repos (id, name, path, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
        [repo.id, repo.name, repo.path, repo.createdAt],
      );
      return toRepo(rows[0]);
    } catch (err) {
      const unique = violated(err, '23505');
      if (unique === 'repos_name_unique') {
        throw new DomainError('REPO_NAME_TAKEN', `A repo named "${repo.name}" already exists`, { field: 'name' });
      }
      if (unique === 'repos_path_unique') {
        const { rows } = await this.#pool.query<{ name: string }>('SELECT name FROM repos WHERE path = $1', [repo.path]);
        throw new DomainError('REPO_PATH_TAKEN', `A repo is already registered at "${repo.path}"`, { field: 'path', name: rows[0]?.name ?? '' });
      }
      throw err;
    }
  }

  async findById(id: string): Promise<RepoRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM repos WHERE id = $1', [id]);
    return rows[0] ? toRepo(rows[0]) : null;
  }

  async list(): Promise<RepoRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM repos ORDER BY lower(name), id');
    return rows.map(toRepo);
  }

  async loopCounts(): Promise<Map<string, number>> {
    const { rows } = await this.#pool.query<{ repo_id: string; n: number }>('SELECT repo_id, count(*)::int AS n FROM loops GROUP BY repo_id');
    return new Map(rows.map((r) => [r.repo_id, r.n]));
  }

  async delete(id: string): Promise<void> {
    try {
      const res = await this.#pool.query('DELETE FROM repos WHERE id = $1', [id]);
      if (res.rowCount === 0) throw new DomainError('REPO_NOT_FOUND', `No repo ${id}`);
    } catch (err) {
      if (violated(err, '23503') !== 'loops_repo_id_repos_id_fk') throw err;
      const { rows } = await this.#pool.query<{ name: string; archived: boolean }>(
        'SELECT name, archived_at IS NOT NULL AS archived FROM loops WHERE repo_id = $1 ORDER BY created_at, id',
        [id],
      );
      const loops = rows.map((r) => r.name);
      const archivedLoops = rows.filter((r) => r.archived).map((r) => r.name);
      throw new DomainError('REPO_IN_USE', `Repo still has ${loops.length} loop(s) using it: ${loops.join(', ')}`, { loops, archivedLoops });
    }
  }
}
