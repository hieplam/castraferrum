// The goal card starter (plan rules 7, 8, goal row G18): an accepted card becomes one epic, one manifest PR and one loop. It has no model. `GoalCardService` calls
// `start` again after a throw, so each step stores its result on the row, and a retry skips a step with a stored result. A retry never makes a second epic, PR or loop.
// Nothing here merges: `goals/**` is guarded, so the job of the gate ends at `needs_ratification`, and with the gate off the PR waits for a person.
import { DomainError } from '../../shared/domain/errors';
import { epicBodyOfCard, goalLoopPrompt, manifestOfCard, manifestPathOfCard } from '../../shared/domain/goal-card';
import type { GateRepository } from '../ports/gate-repository';
import type { GateWorkspace } from '../ports/gate-workspace';
import type { GitHost } from '../ports/git-host';
import type { GoalCardRecord, GoalCardRepository } from '../ports/goal-card-repository';
import type { RepoRepository } from '../ports/repo-repository';
import type { GateService, GoalCardStarter, LoopService, ProbeService } from './contracts';

/** Yearly: a loop with a probe starts its runs from the probe, not from the schedule. */
const LOOP_CRON = '0 0 1 1 *';
const LOOP_TIMEOUT_SEC = 14_400;
const MAX_LOOP_NAME = 80;

export type GoalCardStarterDeps = {
  cards: Pick<GoalCardRepository, 'saveResults'>;
  repos: Pick<RepoRepository, 'findById'>;
  gate: Pick<GateRepository, 'getRepoGate'>;
  gateQueue: Pick<GateService, 'queue'>;
  host: Pick<GitHost, 'openIssue' | 'editIssueBody' | 'createPullRequest'>;
  workspace: Pick<GateWorkspace, 'publishFile'>;
  loops: Pick<LoopService, 'create' | 'get' | 'start'>;
  probes: Pick<ProbeService, 'save'>;
  epicScript: string;
};

/** Holds the number of the card issue, so two cards with one title get two branches. */
export const goalCardBranch = (issue: number) => `goal/card-${issue}`;

export class DefaultGoalCardStarter implements GoalCardStarter {
  constructor(private readonly d: GoalCardStarterDeps) {}

  async start(row: GoalCardRecord): Promise<void> {
    // The time of the yes does not change, so a retry on another day names the same file as the epic.
    const at = row.decidedAt ?? row.createdAt;
    const manifest = manifestPathOfCard(row.issueNumber, at);
    const epic = await this.#epic(row, manifest);
    const pr = await this.#manifestPr(row, { manifest, epic, at });
    await this.#loop(row, epic);
    // Last: only a throw of this call brings a retry to this line, so a retry cannot queue a second job.
    await this.#queue(row, pr);
  }

  async #epic(row: GoalCardRecord, manifest: string): Promise<number> {
    let epic = row.epicNumber;
    if (epic === null) {
      const opened = await this.d.host.openIssue(row.githubRepo, { title: `Epic: ${row.card.title}`, body: epicBodyOfCard(row.card, { manifest, prompt: '' }), labels: [] });
      epic = opened.number;
      await this.d.cards.saveResults(row.id, { epicNumber: epic });
    }
    // The prompt names the epic, so the body is complete only after the epic has a number. This edit stores no result, so it repeats until the PR exists.
    if (row.prNumber === null) {
      await this.d.host.editIssueBody(row.githubRepo, epic, epicBodyOfCard(row.card, { manifest, prompt: goalLoopPrompt(epic, row.githubRepo) }));
    }
    return epic;
  }

  async #manifestPr(row: GoalCardRecord, goal: { manifest: string; epic: number; at: Date }): Promise<number> {
    if (row.prNumber !== null) return row.prNumber;
    const repo = await this.d.repos.findById(row.repoId);
    if (!repo) throw new DomainError('REPO_NOT_FOUND', `No repo ${row.repoId}`);
    const branch = goalCardBranch(row.issueNumber);
    const title = `feat(goals): manifest of goal card ${row.issueNumber}`;
    await this.d.workspace.publishFile(repo.path, { branch, path: goal.manifest, text: manifestOfCard(row.card, { epic: goal.epic, at: goal.at }), message: title });
    const { number } = await this.d.host.createPullRequest(row.githubRepo, { head: branch, base: 'main', title, body: `The goal manifest of epic #${goal.epic}, from goal card #${row.issueNumber}.` });
    await this.d.cards.saveResults(row.id, { prNumber: number });
    return number;
  }

  /** The id goes on the row before the probe, because a second `create` throws LOOP_NAME_TAKEN. This step is complete when the loop is active. */
  async #loop(row: GoalCardRecord, epic: number): Promise<void> {
    let loopId = row.loopId;
    if (loopId === null) {
      const name = `Goal ${row.issueNumber}: ${row.title}`.slice(0, MAX_LOOP_NAME).trim();
      const loop = await this.d.loops.create({ name, prompt: goalLoopPrompt(epic, row.githubRepo), repoId: row.repoId, cron: LOOP_CRON, timeoutSec: LOOP_TIMEOUT_SEC, executor: { kind: 'claude' } });
      loopId = loop.id;
      await this.d.cards.saveResults(row.id, { loopId });
    }
    if ((await this.d.loops.get(loopId)).status === 'active') return;
    await this.d.probes.save(loopId, this.#probe(row.githubRepo, epic));
    await this.d.loops.start(loopId);
  }

  #probe(githubRepo: string, epic: number) {
    const script = this.d.epicScript;
    return {
      command: ['node', script, 'next', String(epic), '--probe', '-R', githubRepo],
      claim: ['node', script, 'claim', '{key}', '--epic', String(epic), '--parallel', '-R', githubRepo],
      release: ['node', script, 'release', '{key}', '--reason', '{reason}', '--if-claimed', '-R', githubRepo],
    };
  }

  async #queue(row: GoalCardRecord, prNumber: number): Promise<void> {
    const setting = await this.d.gate.getRepoGate(row.repoId);
    if (setting?.enabled) await this.d.gateQueue.queue({ repoId: row.repoId, prNumber, taskKey: String(row.issueNumber) });
  }
}
