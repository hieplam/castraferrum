// The goal number of an epic (spec 2.10, decision 42). After a merge, and when the gate has no job, it runs the rows of
// each goal manifest on `main`, keeps the last result of each row, and comments `loop-goals:` on the epic. The number can
// only rise: a row that falls opens one issue under the epic. It runs in the gate slot, so it never changes a gate job.
import { fingerprint } from '../../shared/domain/fingerprint';
import { parseGateConfig, type GateConfig } from '../../shared/domain/scope-guard';
import type { GoalCadence, GoalRunRecord } from '../../shared/domain/standing-goal';
import type { Clock } from '../ports/clock';
import type { GateRepository } from '../ports/gate-repository';
import type { GateTree, GateWorkspace } from '../ports/gate-workspace';
import type { GitHost } from '../ports/git-host';
import type { GoalRepository } from '../ports/goal-repository';
import type { IdGenerator } from '../ports/ids';
import type { RepoRepository } from '../ports/repo-repository';
import type { GoalMergeInput, GoalPassReport, GoalService } from './contracts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const SETUP_MS = 20 * MINUTE;
const GOAL_CHECK_MS = 30 * MINUTE;
const NIGHTLY_AGE_MS = 24 * HOUR;
/** An idle gate ticks every few seconds, and a look at the nightly rows costs a fetch and a `gh` call. */
const NIGHTLY_READ_MS = HOUR;
const GOALS_DIR = 'goals';
const GATE_FILE = 'goals/gate.json';

export type GoalServiceDeps = {
  goals: GoalRepository;
  repos: Pick<RepoRepository, 'list'>;
  gate: Pick<GateRepository, 'getRepoGate'>;
  host: GitHost;
  workspace: GateWorkspace;
  clock: Clock;
  ids: IdGenerator;
};

type ManifestGoal = { id: string; outcome: string; cadence: GoalCadence };
type Manifest = { path: string; epic: number; goals: ManifestGoal[] };
type CheckedRow = { id: string; pass: boolean; value: number | null; of: number | null; line: string };
type Checked = { goals: CheckedRow[]; sha: string };
type Target = { repo: string; repoPath: string; signal: AbortSignal | undefined };
type Pass = Target & { worktree: string; mainSha: string; cadence: GoalCadence; now: Date };

const textOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `null` for any file that is not a manifest with an epic, such as `goals/gate.json`. */
function parseManifest(path: string, text: string): Manifest | null {
  let raw: { goals?: unknown; epic?: unknown };
  try {
    raw = JSON.parse(text) as typeof raw;
  } catch {
    return null;
  }
  if (!Array.isArray(raw.goals) || !Number.isInteger(raw.epic) || (raw.epic as number) <= 0) return null;
  const goals = (raw.goals as { id: string; outcome: string; cadence?: GoalCadence }[]).map((g) => ({ id: g.id, outcome: g.outcome, cadence: g.cadence ?? 'merge' }));
  return { path, epic: raw.epic as number, goals };
}

const isRow = (row: Partial<CheckedRow> | null): boolean =>
  typeof row?.id === 'string' && typeof row.pass === 'boolean' && typeof row.line === 'string' && (row.value === null || typeof row.value === 'number') && (row.of === null || typeof row.of === 'number');

/** The last stdout line of `goal-check --json`, or `null` when it is not that line. */
function parseChecked(stdout: string): Checked | null {
  try {
    const raw = JSON.parse(stdout.trimEnd().split(/\r?\n/).at(-1) ?? '') as Partial<Checked> | null;
    return raw && Array.isArray(raw.goals) && raw.goals.every(isRow) && typeof raw.sha === 'string' ? (raw as Checked) : null;
  } catch {
    return null;
  }
}

/** Decision 42. A row with no stored result has not fallen: it can be red from the start. */
function fell(before: GoalRunRecord | undefined, row: CheckedRow): boolean {
  if (!before) return false;
  if (before.pass && !row.pass) return true;
  return before.value !== null && row.value !== null && row.value < before.value;
}

export class DefaultGoalService implements GoalService {
  readonly #d: GoalServiceDeps;
  #nightlyReadAt: number | null = null;

  constructor(deps: GoalServiceDeps) {
    this.#d = deps;
  }

  async afterMerge({ repo, repoPath, jobId, signal }: GoalMergeInput): Promise<GoalPassReport> {
    const mainSha = await this.#mainSha(repoPath);
    const manifests = await this.#manifests(repoPath, mainSha);
    return { errors: await this.#run({ repo, repoPath, signal, worktree: `${jobId}-goals`, mainSha, cadence: 'merge', now: this.#d.clock.now() }, manifests) };
  }

  async nightly(now: Date, signal?: AbortSignal): Promise<GoalPassReport> {
    if (this.#nightlyReadAt !== null && now.getTime() - this.#nightlyReadAt < NIGHTLY_READ_MS) return { errors: [] };
    this.#nightlyReadAt = now.getTime();
    const errors: string[] = [];
    for (const record of await this.#d.repos.list()) {
      const setting = await this.#d.gate.getRepoGate(record.id);
      if (!setting?.enabled) continue;
      const target = { repo: setting.githubRepo, repoPath: record.path, signal };
      try {
        errors.push(...(await this.#nightlyOf(target, now)));
      } catch (e) {
        errors.push(`${setting.githubRepo}: ${textOf(e)}`);
      }
    }
    return { errors };
  }

  async #nightlyOf(target: Target, now: Date): Promise<string[]> {
    const mainSha = await this.#mainSha(target.repoPath);
    const due: Manifest[] = [];
    for (const manifest of await this.#manifests(target.repoPath, mainSha)) {
      if (await this.#nightlyDue(target.repo, manifest, now)) due.push(manifest);
    }
    if (due.length === 0) return [];
    return this.#run({ ...target, worktree: `nightly-${this.#d.ids.newId()}-goals`, mainSha, cadence: 'nightly', now }, due);
  }

  async #nightlyDue(repo: string, manifest: Manifest, now: Date): Promise<boolean> {
    const stored = new Map((await this.#d.goals.listRows(repo, manifest.path)).map((row) => [row.rowId, row]));
    return manifest.goals.some((goal) => {
      if (goal.cadence !== 'nightly') return false;
      const at = stored.get(goal.id)?.at;
      return !at || now.getTime() - at.getTime() > NIGHTLY_AGE_MS;
    });
  }

  /** A pass has no PR head, so it asks for `main` twice. The result of the head is not read. */
  async #mainSha(repoPath: string): Promise<string> {
    return (await this.#d.workspace.fetch(repoPath, { headRef: 'main', headSha: '' })).mainSha;
  }

  async #manifests(repoPath: string, mainSha: string): Promise<Manifest[]> {
    const { workspace } = this.#d;
    const manifests: Manifest[] = [];
    for (const name of await workspace.listAt(repoPath, mainSha, GOALS_DIR)) {
      const path = `${GOALS_DIR}/${name}`;
      const manifest = parseManifest(path, (await workspace.readAt(repoPath, mainSha, path)) ?? '');
      if (manifest) manifests.push(manifest);
    }
    return manifests;
  }

  async #openEpics(pass: Pass, manifests: Manifest[], errors: string[]): Promise<Manifest[]> {
    const open: Manifest[] = [];
    for (const manifest of manifests) {
      if (!manifest.goals.some((goal) => goal.cadence === pass.cadence)) continue;
      try {
        if ((await this.#d.host.issueState(pass.repo, manifest.epic)) === 'OPEN') open.push(manifest);
      } catch (e) {
        errors.push(`${manifest.path}: ${textOf(e)}`);
      }
    }
    return open;
  }

  /** One worktree of main for the whole pass, which goes away on every path. A failed manifest does not stop the next one. */
  async #run(pass: Pass, manifests: Manifest[]): Promise<string[]> {
    const { workspace } = this.#d;
    const errors: string[] = [];
    const open = await this.#openEpics(pass, manifests, errors);
    if (open.length === 0) return errors;
    let tree: GateTree | null = null;
    try {
      // `prepare` rebases a head on main, so main as its own head gives a clean worktree of main.
      const prepared = await workspace.prepare(pass.repoPath, pass.worktree, pass.mainSha, pass.mainSha);
      if (!prepared.ok) throw new Error(`the worktree of main failed: ${prepared.output}`);
      tree = prepared.tree;
      const config = await this.#setup(pass, tree);
      for (const manifest of open) {
        if (pass.signal?.aborted) break;
        try {
          await this.#checkManifest(pass, tree, config, manifest);
        } catch (e) {
          errors.push(`${manifest.path}: ${textOf(e)}`);
        }
      }
    } catch (e) {
      errors.push(textOf(e));
    } finally {
      if (tree) await workspace.remove(pass.repoPath, pass.worktree).catch((e: unknown) => errors.push(textOf(e)));
    }
    return errors;
  }

  async #setup(pass: Pass, tree: GateTree): Promise<GateConfig> {
    const { workspace } = this.#d;
    const text = await workspace.readAt(pass.repoPath, pass.mainSha, GATE_FILE);
    if (text === null) throw new Error(`${GATE_FILE} is not on main`);
    const config = parseGateConfig(text);
    for (const line of config.setup) {
      const result = await workspace.run(tree, { line, env: config.env, timeoutMs: SETUP_MS, ...(pass.signal ? { signal: pass.signal } : {}) });
      if (result.exitCode !== 0) throw new Error(`setup failed: ${line}`);
    }
    return config;
  }

  async #checkManifest(pass: Pass, tree: GateTree, config: GateConfig, manifest: Manifest): Promise<void> {
    const { goals, host, workspace } = this.#d;
    const { repo, cadence, now } = pass;
    const line = `node scripts/goal-check.mjs ${manifest.path} --json --cadence ${cadence}`;
    const result = await workspace.run(tree, { line, env: config.env, timeoutMs: GOAL_CHECK_MS, ...(pass.signal ? { signal: pass.signal } : {}) });
    // Exit 1 is a failing row. Any other end has no result: exit 2, a timeout, a command that did not start.
    const checked = result.exitCode === 0 || result.exitCode === 1 ? parseChecked(result.stdout) : null;
    if (!checked) throw new Error(`goal-check gave no result line (exit ${result.exitCode})`);

    const stored = new Map((await goals.listRows(repo, manifest.path)).map((row) => [row.rowId, row]));
    // Falls come first: a stored row cannot fall again, so a fall whose issue failed must stay unsaved for the next pass.
    for (const row of checked.goals) {
      if (fell(stored.get(row.id), row)) await this.#fall(pass, manifest, row);
    }
    const rows = checked.goals.map(({ id, pass: passed, value, of, line: text }): GoalRunRecord => ({ repo, manifest: manifest.path, rowId: id, pass: passed, value, of, line: text, cadence, sha: checked.sha, at: now }));
    await goals.saveRows(rows);
    for (const row of rows) stored.set(row.rowId, row);

    // A row that never ran is failing, so `total` is always the size of the manifest (decision 42).
    const failing = manifest.goals.filter((goal) => !stored.get(goal.id)?.pass).map((goal) => goal.id);
    const summary = { passed: manifest.goals.length - failing.length, total: manifest.goals.length, failing, sha: checked.sha };
    await host.comment(repo, manifest.epic, `loop-goals: ${JSON.stringify(summary)}`);
  }

  /** Decision 42: one open issue for one fingerprint. The row key holds the manifest, because two epics can both have a row G1. */
  async #fall({ repo, now }: Pass, manifest: Manifest, row: CheckedRow): Promise<void> {
    const { goals, host, ids } = this.#d;
    const rowId = `${manifest.path}:${row.id}`;
    const fp = fingerprint(repo, rowId, row.line);
    const known = await goals.findOpen(repo, fp);
    if (known) {
      if ((await host.issueState(repo, known.issueNumber)) === 'OPEN') {
        await goals.touch(known.id, now);
        return;
      }
      // A person or a PR closed the issue, and the same failure is back: that is a new fall.
      await goals.close(known.id, now);
    }
    const stored = { id: ids.newId(), repo, rowId, fingerprint: fp, openedAt: now };
    // A hit is an issue of a pass that stopped before it stored the issue.
    const hit = (await host.searchIssues(repo, `"${fp}" in:body`)).find((h) => h.state === 'OPEN');
    const outcome = manifest.goals.find((goal) => goal.id === row.id)?.outcome ?? '';
    const number = hit?.number ?? (await host.openIssue(repo, { title: `goal ${row.id} fell: ${outcome}`, body: `<!-- fingerprint:${fp} -->\nEpic: ${manifest.epic}\n${row.line}`, labels: [] })).number;
    await goals.open({ ...stored, issueNumber: number });
    await host.addSubIssue(repo, manifest.epic, number);
  }
}
