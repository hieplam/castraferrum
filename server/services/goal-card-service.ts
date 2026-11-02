// The goal card service (spec 2.13, plan rules 1 to 4). It reads a charter and the `goal-card` issues of a repository, and it moves each card
// through `proposed`, `accepted`, `refused` and `started`. It has no model. A card starts only by the yes of a person, or by a refusal window
// that a ratified charter turned on. A one-way card never starts without a yes. Every move names the state it comes from, so a no is final.
import { DomainError } from '../../shared/domain/errors';
import { CHARTER_FILE, effectiveDoor, GOAL_CARD_LABEL, parseCharter, parseGoalCard, sameCard, windowOn, type Charter } from '../../shared/domain/goal-card';
import type { Clock } from '../ports/clock';
import type { GateRepository } from '../ports/gate-repository';
import type { GateWorkspace } from '../ports/gate-workspace';
import type { GoalCardRecord, GoalCardRepository, GoalCardUpdate } from '../ports/goal-card-repository';
import { GitHostError, type GitHost, type LabeledIssue } from '../ports/git-host';
import type { IdGenerator } from '../ports/ids';
import type { Notifier } from '../ports/notifier';
import type { RepoRecord, RepoRepository } from '../ports/repo-repository';
import type { GoalCardList, GoalCardService, GoalCardStarter, GoalCardTickReport } from './contracts';

const SERVE_EVERY_MS = 60_000;
const HOUR = 3_600_000;

export type GoalCardServiceDeps = {
  cards: GoalCardRepository;
  repos: Pick<RepoRepository, 'list'>;
  gate: Pick<GateRepository, 'getRepoGate'>;
  host: Pick<GitHost, 'issuesWithLabel' | 'issueBody' | 'comment' | 'closeIssue'>;
  workspace: Pick<GateWorkspace, 'fetchMain' | 'readAt'>;
  notifier: Notifier;
  starter: GoalCardStarter;
  clock: Clock;
  ids: IdGenerator;
};

const textOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const decisionOf = (row: GoalCardRecord): GoalCardUpdate => ({ state: row.state, title: row.title, door: row.door, card: row.card, startAfter: row.startAfter, changed: row.changed, decidedAt: row.decidedAt });

export class DefaultGoalCardService implements GoalCardService {
  /** The time of the last serve of each repository, on the clock of the console. */
  readonly #served = new Map<string, number>();

  constructor(private readonly d: GoalCardServiceDeps) {}

  async tick(): Promise<GoalCardTickReport> {
    const now = this.d.clock.now();
    const errors: GoalCardTickReport['errors'] = [];
    for (const repo of await this.d.repos.list()) {
      try {
        const gate = await this.d.gate.getRepoGate(repo.id);
        if (!gate || !this.#due(repo.id, now)) continue;
        await this.#serve(repo, gate.githubRepo, now);
      } catch (e) {
        errors.push({ loopId: repo.id, message: textOf(e) });
      }
    }
    return { errors };
  }

  async list(repoId: string | null): Promise<GoalCardList> {
    const items = await this.d.cards.list(repoId);
    const acceptedWithNoChange = items.filter((c) => (c.state === 'accepted' || c.state === 'started') && !c.changed).length;
    return { items, acceptedWithNoChange };
  }

  async accept(id: string): Promise<GoalCardRecord> {
    const row = await this.#open(id);
    const body = await this.#call(() => this.d.host.issueBody(row.githubRepo, row.issueNumber));
    const accepted = await this.#call(() => this.#accept(row, body, this.d.clock.now()));
    if (!accepted) throw new DomainError('GOAL_CARD_NOT_OPEN', `Goal card ${id} is not proposed`);
    return accepted;
  }

  async refuse(id: string): Promise<GoalCardRecord> {
    const row = await this.#open(id);
    // The row moves first, so a failed `gh` call cannot leave a card that the window can start. The next tick closes the issue.
    const refused = await this.d.cards.update(id, 'proposed', { ...decisionOf(row), state: 'refused', decidedAt: this.d.clock.now() });
    if (!refused) throw new DomainError('GOAL_CARD_NOT_OPEN', `Goal card ${id} is not proposed`);
    await this.#call(() => this.d.host.closeIssue(row.githubRepo, row.issueNumber));
    return refused;
  }

  #due(repoId: string, now: Date): boolean {
    const last = this.#served.get(repoId);
    if (last !== undefined && now.getTime() - last < SERVE_EVERY_MS) return false;
    this.#served.set(repoId, now.getTime());
    return true;
  }

  async #serve(repo: RepoRecord, githubRepo: string, now: Date): Promise<void> {
    const mainSha = await this.d.workspace.fetchMain(repo.path);
    const text = await this.d.workspace.readAt(repo.path, mainSha, CHARTER_FILE);
    if (text === null) return;
    const charter = parseCharter(text);
    const issues = await this.d.host.issuesWithLabel(githubRepo, GOAL_CARD_LABEL);
    await this.#ingest(repo, githubRepo, charter, issues, now);
    await this.#endWindows(repo, charter, issues, now);
    await this.#startAccepted(repo);
  }

  async #ingest(repo: RepoRecord, githubRepo: string, charter: Charter, issues: LabeledIssue[], now: Date): Promise<void> {
    const rows = await this.d.cards.list(repo.id);
    // Rule 2: the issues come from a read that finished (a failed or cut-off read throws before this point). A person who closed a proposed card, or
    // took its label, said no: the row moves to `refused` now, with no comment and no close, so the next card can take the place in this tick.
    const freed = new Set<string>();
    for (const row of rows) {
      if (row.state !== 'proposed' || issues.some((issue) => issue.number === row.issueNumber)) continue;
      const refused = await this.d.cards.update(row.id, 'proposed', { ...decisionOf(row), state: 'refused', decidedAt: now });
      if (refused) freed.add(row.id);
    }
    const proposed = rows.find((row) => row.state === 'proposed' && !freed.has(row.id));
    let waiting = proposed?.issueNumber ?? null;
    for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
      const row = rows.find((candidate) => candidate.issueNumber === issue.number);
      if (row) {
        // A failed `gh` call left this issue open, and an open card stops the writer.
        if (row.state === 'refused' || row.state === 'started') await this.d.host.closeIssue(githubRepo, issue.number);
        continue;
      }
      const parsed = parseGoalCard(issue.body);
      if (!parsed.ok) await this.#refuseIssue(githubRepo, issue.number, parsed.reason);
      else if (waiting !== null) await this.#refuseIssue(githubRepo, issue.number, `goal card ${waiting} is still proposed`);
      else {
        const door = effectiveDoor(parsed.card, charter);
        const startAfter = windowOn(charter) && door === 'two-way' ? new Date(now.getTime() + charter.refusalWindow.hours * HOUR) : null;
        const outcome = await this.d.cards.insert({ id: this.d.ids.newId(), repoId: repo.id, githubRepo, issueNumber: issue.number, title: parsed.card.title, door, card: parsed.card, startAfter, createdAt: now });
        if (outcome === 'inserted') {
          waiting = issue.number;
          await this.d.notifier.send({
            dedupeKey: `goal-card:${repo.id}:${issue.number}`,
            kind: 'goal_card',
            loopId: null,
            messageKey: 'notice.goalCard',
            params: { reason: parsed.card.title },
            at: now,
          });
        }
      }
    }
  }

  /** Rule 4: only a two-way row whose window ended moves, and only while the charter of this tick has the window on. */
  async #endWindows(repo: RepoRecord, charter: Charter, issues: LabeledIssue[], now: Date): Promise<void> {
    if (!windowOn(charter)) return;
    for (const row of await this.d.cards.list(repo.id)) {
      if (row.state !== 'proposed' || row.door !== 'two-way' || row.startAfter === null || row.startAfter.getTime() > now.getTime()) continue;
      // An issue that a person closed, or took the label from, is not a yes.
      const issue = issues.find((candidate) => candidate.number === row.issueNumber);
      if (!issue) continue;
      const parsed = parseGoalCard(issue.body);
      if (parsed.ok && effectiveDoor(parsed.card, charter) === 'one-way') {
        // An edit or a new charter entry raised the door after the insert. Only a yes moves it now.
        await this.d.cards.update(row.id, 'proposed', { ...decisionOf(row), door: 'one-way', startAfter: null, card: parsed.card, title: parsed.card.title, changed: row.changed || !sameCard(row.card, parsed.card) });
        continue;
      }
      await this.#accept(row, issue.body, now);
    }
  }

  async #startAccepted(repo: RepoRecord): Promise<void> {
    for (const row of await this.d.cards.list(repo.id)) {
      if (row.state !== 'accepted') continue;
      // A throw keeps the row `accepted`, and the next serve tries again.
      await this.d.starter.start(row);
      const started = await this.d.cards.update(row.id, 'accepted', { ...decisionOf(row), state: 'started' });
      if (!started) continue;
      await this.d.host.comment(row.githubRepo, row.issueNumber, 'Started.');
      await this.d.host.closeIssue(row.githubRepo, row.issueNumber);
    }
  }

  /** Rule 4: stores what the issue says now. A body that is no longer a card is refused, because a bad card must never start. */
  async #accept(row: GoalCardRecord, body: string, now: Date): Promise<GoalCardRecord | null> {
    const parsed = parseGoalCard(body);
    if (!parsed.ok) {
      const refused = await this.d.cards.update(row.id, 'proposed', { ...decisionOf(row), state: 'refused', decidedAt: now });
      if (refused) await this.#refuseIssue(row.githubRepo, row.issueNumber, parsed.reason);
      return refused;
    }
    const changed = row.changed || !sameCard(row.card, parsed.card);
    return this.d.cards.update(row.id, 'proposed', { ...decisionOf(row), state: 'accepted', card: parsed.card, title: parsed.card.title, changed, decidedAt: now });
  }

  async #refuseIssue(githubRepo: string, number: number, reason: string): Promise<void> {
    await this.d.host.comment(githubRepo, number, `Goal card refused: ${reason}`);
    await this.d.host.closeIssue(githubRepo, number);
  }

  async #open(id: string): Promise<GoalCardRecord> {
    const row = await this.d.cards.get(id);
    if (!row) throw new DomainError('GOAL_CARD_NOT_FOUND', `Goal card ${id} does not exist`);
    if (row.state !== 'proposed') throw new DomainError('GOAL_CARD_NOT_OPEN', `Goal card ${id} is not proposed`);
    return row;
  }

  /** The message and the stderr of the host call can name the repository, so only a fixed message goes out. */
  async #call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GitHostError) throw new DomainError('GIT_HOST_FAILED', 'The Git host did not answer the call');
      throw err;
    }
  }
}
