// What the wiring of tests/api/goal-cards.test.ts cannot reach: a starter that throws, a failed `gh` call, and an issue that changes during the
// window. Memory repositories, a stopped clock, and small fakes of the host and the workspace.
import { beforeEach, describe, expect, it } from 'vitest';
import { GitHostError, type LabeledIssue } from '../ports/git-host';
import type { GoalCardRecord } from '../ports/goal-card-repository';
import { createMemoryRepositories } from '../adapters/memory';
import { OffsetClock } from '../adapters/clock/offset-clock';
import { RandomIdGenerator } from '../adapters/ids/random-id-generator';
import type { Notice } from '../../shared/domain/notice';
import { DefaultGoalCardService, type GoalCardServiceDeps } from './goal-card-service';

const T0 = new Date('2026-11-02T00:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const CHARTER = JSON.stringify({ v: 1, purpose: 'Test', mayStartAlone: [], neverAlone: ['force push'], refusalWindow: { enabled: true, hours: 8 }, acceptedWithNoChange: 3 });
const card = (title: string) => ({ v: 1, title, rows: [{ id: 'G1', outcome: 'It works', oracle: 'node check.mjs', threshold: 'ok' }], size: { planWindows: 0.5 }, door: 'two-way', next: [] });
const bodyOf = (title: string) => `\`\`\`json\n${JSON.stringify(card(title))}\n\`\`\``;

class FakeHost {
  issues: LabeledIssue[] = [];
  calls: string[] = [];
  failClose = false;

  async issuesWithLabel(): Promise<LabeledIssue[]> {
    this.calls.push('list');
    return this.issues;
  }
  async issueBody(_repo: string, number: number): Promise<string> {
    return this.issues.find((i) => i.number === number)!.body;
  }
  async comment(_repo: string, number: number, body: string): Promise<void> {
    this.calls.push(`comment ${number}: ${body}`);
  }
  async closeIssue(_repo: string, number: number): Promise<void> {
    if (this.failClose) throw new GitHostError('gh issue failed', 1, 'down');
    this.calls.push(`close ${number}`);
    this.issues = this.issues.filter((i) => i.number !== number);
  }
}

let clock: OffsetClock;
let host: FakeHost;
let starts: GoalCardRecord[];
let failStart: boolean;
let service: DefaultGoalCardService;
let repos: ReturnType<typeof createMemoryRepositories>;
let repoId: string;

const row = async () => (await repos.goalCards.list(repoId))[0]!;
const wind = (ms: number) => clock.advance(ms);

beforeEach(async () => {
  repos = createMemoryRepositories();
  clock = new OffsetClock();
  clock.set(T0);
  host = new FakeHost();
  starts = [];
  failStart = false;
  repoId = (await repos.repos.insert({ id: new RandomIdGenerator().newId(), name: 'r', path: '/r', createdAt: T0 })).id;
  await repos.gate.setRepoGate(repoId, { enabled: false, githubRepo: 'o/r', checkCommand: [] }, T0);
  const deps: GoalCardServiceDeps = {
    cards: repos.goalCards,
    repos: repos.repos,
    gate: repos.gate,
    host,
    workspace: { fetchMain: async () => 'sha', readAt: async () => CHARTER },
    notifier: { send: async (_notice: Notice) => {} },
    starter: {
      start: async (c) => {
        if (failStart) throw new Error('no epic');
        starts.push(c);
      },
    },
    clock,
    ids: new RandomIdGenerator(),
  };
  service = new DefaultGoalCardService(deps);
});

describe('goal_card_service', () => {
  it('serves a repository at most once in 60 s', async () => {
    await service.tick();
    wind(59_000);
    await service.tick();
    expect(host.calls.filter((c) => c === 'list')).toHaveLength(1);

    wind(1_000);
    await service.tick();

    expect(host.calls.filter((c) => c === 'list')).toHaveLength(2);
  });

  it('a starter that throws keeps the row accepted, and the next serve tries again', async () => {
    host.issues = [{ number: 1, title: 'Card', body: bodyOf('Goal') }];
    await service.tick();
    await service.accept((await row()).id);
    failStart = true;
    wind(MIN);

    const report = await service.tick();

    expect(report.errors).toEqual([{ loopId: repoId, message: 'no epic' }]);
    expect((await row()).state).toBe('accepted');
    expect(host.calls).not.toContain('close 1');

    failStart = false;
    wind(MIN);
    await service.tick();

    expect((await row()).state).toBe('started');
    expect(starts).toHaveLength(1);
    expect(host.calls.slice(-2)).toEqual(['comment 1: Started.', 'close 1']);
  });

  it('a card edited to name a neverAlone entry during the window becomes one-way, and the window does not start it', async () => {
    host.issues = [{ number: 1, title: 'Card', body: bodyOf('Goal') }];
    await service.tick();
    host.issues = [{ number: 1, title: 'Card', body: bodyOf('Goal by force push') }];
    wind(9 * HOUR);

    await service.tick();

    expect(await row()).toMatchObject({ state: 'proposed', door: 'one-way', startAfter: null, changed: true, title: 'Goal by force push' });
    wind(30 * 24 * HOUR);
    await service.tick();
    expect((await row()).state).toBe('proposed');
    expect(starts).toEqual([]);
  });

  it('a card whose issue a person closed is not started by the window', async () => {
    host.issues = [{ number: 1, title: 'Card', body: bodyOf('Goal') }];
    await service.tick();
    host.issues = [];
    wind(9 * HOUR);

    await service.tick();

    expect((await row()).state).toBe('proposed');
    expect(starts).toEqual([]);
  });

  it('a card edited into a bad body is refused at the yes, so it never starts', async () => {
    host.issues = [{ number: 1, title: 'Card', body: bodyOf('Goal') }];
    await service.tick();
    host.issues = [{ number: 1, title: 'Card', body: 'The block is gone.' }];

    const decided = await service.accept((await row()).id);

    expect(decided.state).toBe('refused');
    expect(host.calls.slice(-2)).toEqual(['comment 1: Goal card refused: the body has 0 fenced json blocks, it must have 1', 'close 1']);
  });

  it('a refusal whose close failed gives GIT_HOST_FAILED, keeps the no, and the next serve closes the issue', async () => {
    host.issues = [{ number: 1, title: 'Card', body: bodyOf('Goal') }];
    await service.tick();
    const { id } = await row();
    host.failClose = true;

    await expect(service.refuse(id)).rejects.toMatchObject({ code: 'GIT_HOST_FAILED' });

    expect((await row()).state).toBe('refused');
    host.failClose = false;
    wind(9 * HOUR);
    await service.tick();
    expect(host.calls).toContain('close 1');
    expect((await row()).state).toBe('refused');
  });
});
