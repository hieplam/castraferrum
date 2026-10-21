import { DomainError } from '../../shared/domain/errors';
import type { Clock } from '../ports/clock';
import type { DirectoryProbe } from '../ports/directory';
import type { IdGenerator } from '../ports/ids';
import type { Repositories } from '../ports/repositories';
import type { RepoInput, RepoListView, RepoService, RepoView, ValidationIssue } from './contracts';

export type RepoServiceDeps = Pick<Repositories, 'repos'> & { directories: DirectoryProbe; clock: Clock; ids: IdGenerator };

const NAME_MAX = 80;
const len = (s: string) => [...s].length;

/**
 * Repos registered for loops (UC-19, UC-20). The console does not understand repos (SPEC-phase-2 § Principle zero): it only
 * needs an existing folder at registration time, git is not required. A folder that disappears AFTER registration is the executor's problem (a `failed` run).
 */
export class DefaultRepoService implements RepoService {
  readonly #d: RepoServiceDeps;

  constructor(deps: RepoServiceDeps) {
    this.#d = deps;
  }

  async list(): Promise<RepoListView[]> {
    const d = this.#d;
    const [repos, counts] = await Promise.all([d.repos.list(), d.repos.loopCounts()]);
    // A folder that vanished / moved after registration is only a warning (D-UI11) — nothing is blocked or changed.
    const checks = await Promise.all(repos.map((r) => d.directories.check(r.path)));
    return repos.map((r, i) => ({ ...r, exists: checks[i]?.kind === 'ok', loopCount: counts.get(r.id) ?? 0 }));
  }

  async register(input: RepoInput): Promise<RepoView> {
    const d = this.#d;
    const issues: ValidationIssue[] = [];
    const raw = (input.path ?? '').trim();
    let path = '';
    let dirName = '';
    if (raw === '') issues.push({ field: 'path', code: 'required', message: 'Enter the repo folder path' });
    else {
      const check = await d.directories.check(raw);
      if (check.kind === 'notAbsolute') issues.push({ field: 'path', code: 'invalid', message: 'The path must be absolute' });
      else if (check.kind === 'notDirectory') issues.push({ field: 'path', code: 'notDirectory', message: `No such folder "${raw}"` });
      else ({ path, name: dirName } = check);
    }
    const name = (input.name ?? '').trim() || dirName;
    if (len(name) > NAME_MAX) issues.push({ field: 'name', code: 'tooLong', message: `The name can be at most ${NAME_MAX} characters` });
    if (issues.length > 0) throw new DomainError('VALIDATION_FAILED', 'Invalid repo data', { issues });
    return d.repos.insert({ id: d.ids.newId(), name, path, createdAt: d.clock.now() });
  }

  remove(id: string): Promise<void> {
    return this.#d.repos.delete(id);
  }
}
