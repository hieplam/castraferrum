import { DomainError } from '../../../shared/domain/errors';
import type { NewRepoRecord, RepoRecord, RepoRepository } from '../../ports/repo-repository';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryRepoRepository implements RepoRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async insert(repo: NewRepoRecord): Promise<RepoRecord> {
    try {
      this.#db.insertRepo(clone(repo));
    } catch (err) {
      if (err instanceof ConstraintViolation && err.constraint === 'repos_name_unique') {
        throw new DomainError('REPO_NAME_TAKEN', `A repo named "${repo.name}" already exists`, { field: 'name' });
      }
      if (err instanceof ConstraintViolation && err.constraint === 'repos_path_unique') {
        const name = [...this.#db.repos.values()].find((x) => x.path === repo.path)?.name ?? '';
        throw new DomainError('REPO_PATH_TAKEN', `A repo is already registered at "${repo.path}"`, { field: 'path', name });
      }
      throw err;
    }
    return clone(repo);
  }

  async findById(id: string): Promise<RepoRecord | null> {
    const row = this.#db.repos.get(id);
    return row ? clone(row) : null;
  }

  async list(): Promise<RepoRecord[]> {
    // Postgres: ORDER BY lower(name), id — compares the lowercase bytes, like cmp.
    return [...this.#db.repos.values()]
      .sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()) || cmp(a.id, b.id))
      .map(clone);
  }

  async loopCounts(): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const l of this.#db.loops.values()) out.set(l.repoId, (out.get(l.repoId) ?? 0) + 1);
    return out;
  }

  async delete(id: string): Promise<void> {
    if (!this.#db.repos.has(id)) throw new DomainError('REPO_NOT_FOUND', `No repo ${id}`);
    try {
      this.#db.deleteRepo(id);
    } catch (err) {
      if (!(err instanceof ConstraintViolation && err.constraint === 'loops_repo_id_repos_id_fk')) throw err;
      const using = [...this.#db.loops.values()]
        .filter((l) => l.repoId === id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || cmp(a.id, b.id));
      const loops = using.map((l) => l.name);
      const archivedLoops = using.filter((l) => l.archivedAt !== null).map((l) => l.name);
      throw new DomainError('REPO_IN_USE', `Repo still has ${loops.length} loop(s) using it: ${loops.join(', ')}`, { loops, archivedLoops });
    }
  }
}
