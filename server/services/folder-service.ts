import { DomainError } from '../../shared/domain/errors';
import type { FolderBrowser } from '../ports/folders';
import type { Repositories } from '../ports/repositories';
import type { FolderPlacesView, FolderService, FolderView, ValidationIssue } from './contracts';

export type FolderServiceDeps = Pick<Repositories, 'repos'> & { folders: FolderBrowser };

/** Maximum number of folders in the "Next to registered repos" group. */
const NEAR_MAX = 6;

/**
 * The "Browse…" box of the Repo page (UC-29). Read-only: lists folders so the user can click one instead of typing a
 * path; registration still goes through `RepoService.register` (same rules). The path rules (root, case, hidden folders)
 * live in the adapter — the service only adds the names of registered repos.
 */
export class DefaultFolderService implements FolderService {
  readonly #d: FolderServiceDeps;

  constructor(deps: FolderServiceDeps) {
    this.#d = deps;
  }

  async browse(path?: string): Promise<FolderView> {
    const d = this.#d;
    const [found, repos] = await Promise.all([d.folders.list(path?.trim() || null), d.repos.list()]);
    const issue = (code: ValidationIssue['code'], message: string): never => {
      throw new DomainError('VALIDATION_FAILED', 'Invalid folder path', { issues: [{ field: 'path', code, message }] });
    };
    if (found.kind === 'notAbsolute') return issue('invalid', 'The path must be absolute');
    if (found.kind === 'notDirectory') return issue('notDirectory', `No such folder "${path ?? ''}"`);
    const repoAt = (p: string) => repos.find((r) => d.folders.same(r.path, p))?.name ?? null;
    const { kind: _kind, ...listing } = found;
    return { ...listing, repo: repoAt(found.path), entries: found.entries.map((e) => ({ ...e, repo: repoAt(e.path) })) };
  }

  async places(): Promise<FolderPlacesView> {
    const d = this.#d;
    const [places, repos] = await Promise.all([d.folders.places(), d.repos.list()]);
    const near: FolderPlacesView['nearRepos'] = [];
    for (const r of repos) {
      const parent = d.folders.parentOf(r.path);
      if (parent === null || places.places.some((p) => d.folders.same(p.path, parent))) continue;
      const group = near.find((n) => d.folders.same(n.path, parent));
      if (group) group.repos.push(r.name);
      else near.push({ path: parent, name: d.folders.nameOf(parent), repos: [r.name] });
    }
    // Most repos first (the folder registered most often), then by path — a fixed order on every open.
    near.sort((a, b) => b.repos.length - a.repos.length || a.path.localeCompare(b.path, 'en', { sensitivity: 'base' }));
    return { ...places, nearRepos: near.slice(0, NEAR_MAX) };
  }
}
