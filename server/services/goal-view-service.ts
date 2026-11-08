// The goals page of a loop (spec 2.10, goal G11). It only reads: the rows that the goal pass stored (`goal_runs`), the manifest and
// `goals/health.json` as they are on `origin/main` (no fetch inside a GET), the standing goals and the probes of the repository.
import { DomainError } from '../../shared/domain/errors';
import type { GateRepository } from '../ports/gate-repository';
import type { GateWorkspace } from '../ports/gate-workspace';
import type { GoalRepository } from '../ports/goal-repository';
import type { LoopProbeRepository } from '../ports/loop-probe-repository';
import type { LoopRepository } from '../ports/loop-repository';
import type { RepoRepository } from '../ports/repo-repository';
import type { GoalView, GoalViewLoop, GoalViewRow, GoalViewService, GoalViewStanding } from './contracts';

const MAIN = 'origin/main';
const HEALTH_FILE = 'goals/health.json';
const SHA_LENGTH = 7;

export type GoalViewServiceDeps = {
  goals: GoalRepository;
  loops: Pick<LoopRepository, 'findById' | 'list'>;
  repos: Pick<RepoRepository, 'findById'>;
  gate: Pick<GateRepository, 'getRepoGate'>;
  probes: Pick<LoopProbeRepository, 'list'>;
  workspace: Pick<GateWorkspace, 'readAt'>;
};

const EMPTY: GoalView = { manifest: null, checkedAt: null, sha: null, passed: 0, total: 0, opened: null, rows: [], standing: [], loops: [] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  try {
    const raw: unknown = JSON.parse(text);
    return isObject(raw) ? raw : null;
  } catch {
    return null;
  }
}

function opened(raw: unknown): GoalView['opened'] {
  if (!isObject(raw)) return null;
  const { at, passed, total } = raw;
  return typeof at === 'string' && Number.isInteger(passed) && Number.isInteger(total) ? { at, passed: passed as number, total: total as number } : null;
}

export class DefaultGoalViewService implements GoalViewService {
  readonly #d: GoalViewServiceDeps;

  constructor(deps: GoalViewServiceDeps) {
    this.#d = deps;
  }

  async view(loopId: string, manifest?: string): Promise<GoalView> {
    const { goals, loops, repos, gate } = this.#d;
    const loop = await loops.findById(loopId);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `${loopId} does not exist`);
    const setting = await gate.getRepoGate(loop.repoId);
    const repo = await repos.findById(loop.repoId);
    if (!setting || !repo) return { ...EMPTY };
    const github = setting.githubRepo;

    const stored = await goals.listManifests(github);
    const chosen = manifest === undefined ? stored[0] : stored.find((m) => m.manifest === manifest);
    if (!chosen) return { ...EMPTY };
    const file = parseJson(await this.#read(repo.path, chosen.manifest));
    if (!file || !Array.isArray(file.goals)) return { ...EMPTY };

    const rows = await this.#rows(github, chosen.manifest, file.goals as { id: string; outcome: string }[]);
    return {
      manifest: chosen.manifest,
      checkedAt: chosen.at,
      sha: chosen.sha.slice(0, SHA_LENGTH),
      passed: rows.filter((r) => r.pass).length,
      total: rows.length,
      opened: opened(file.opened),
      rows,
      standing: await this.#standing(github, repo.path),
      loops: await this.#loops(loop.repoId),
    };
  }

  /** The text of a file on `origin/main`, or `null` when the file or the ref is not there. */
  async #read(repoPath: string, path: string): Promise<string | null> {
    try {
      return await this.#d.workspace.readAt(repoPath, MAIN, path);
    } catch {
      return null;
    }
  }

  async #rows(github: string, manifest: string, goalList: { id: string; outcome: string }[]): Promise<GoalViewRow[]> {
    const stored = new Map((await this.#d.goals.listRows(github, manifest)).map((row) => [row.rowId, row]));
    return goalList.map(({ id, outcome }) => {
      const row = stored.get(id);
      const prefix = `${id} `;
      return { id, outcome, pass: row?.pass ?? false, line: row ? (row.line.startsWith(prefix) ? row.line.slice(prefix.length) : row.line) : '' };
    });
  }

  async #standing(github: string, repoPath: string): Promise<GoalViewStanding[]> {
    const file = parseJson(await this.#read(repoPath, HEALTH_FILE));
    if (!file || !Array.isArray(file.rows)) return [];
    const stored = new Map((await this.#d.goals.listGoals(github)).map((g) => [g.rowId, g]));
    return (file.rows as { id: string; run: string }[]).map(({ id, run }) => {
      const goal = stored.get(id);
      const issues = goal?.issues ?? [];
      const open = issues.find((i) => i.closedAt === null) ?? null;
      const lastFailed = issues.reduce<Date | null>((newest, i) => (newest === null || i.lastFailedAt.getTime() > newest.getTime() ? i.lastFailedAt : newest), null);
      return { id, command: run, pass: goal?.state === 'passing', openSince: open?.openedAt ?? null, lastFailedAt: lastFailed, issue: open?.issueNumber ?? null };
    });
  }

  /** The loops of this repository whose probe failed. The state `budget_limited` stays in the domain, but nothing sets it. */
  async #loops(repoId: string): Promise<GoalViewLoop[]> {
    const { loops, probes } = this.#d;
    const mine = new Map((await loops.list({ repoId })).map((l) => [l.id, l]));
    return (await probes.list())
      .filter((p) => p.state === 'probe_failed' && mine.has(p.loopId))
      .map((p) => ({ id: p.loopId, name: mine.get(p.loopId)!.name, state: p.state, text: p.lastLine }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
}
