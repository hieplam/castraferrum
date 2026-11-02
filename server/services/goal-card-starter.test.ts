// The retries of the starter that the API tests cannot force: a throw at each step after the loop exists (plan rule 7, goal row G18). Plain fakes record the calls.
import { describe, expect, it, vi } from 'vitest';
import type { GoalCard } from '../../shared/domain/goal-card';
import type { GoalCardRecord } from '../ports/goal-card-repository';
import { DefaultGoalCardStarter, type GoalCardStarterDeps } from './goal-card-starter';

const CARD: GoalCard = { v: 1, title: 'Faster probes', rows: [{ id: 'G1', outcome: 'It works', oracle: 'node c.mjs', threshold: 'ok' }], size: { planWindows: 0.5 }, door: 'two-way', next: [] };

function world(gateEnabled = false) {
  let row: GoalCardRecord = {
    id: 'card',
    repoId: 'repo',
    githubRepo: 'o/r',
    issueNumber: 5,
    title: CARD.title,
    door: 'two-way',
    card: CARD,
    state: 'accepted',
    startAfter: null,
    changed: false,
    epicNumber: null,
    prNumber: null,
    loopId: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    decidedAt: new Date('2026-11-02T00:00:00.000Z'),
  };
  let status: 'stopped' | 'active' = 'stopped';
  const d = {
    cards: {
      saveResults: vi.fn(async (_id: string, results: Partial<GoalCardRecord>) => {
        row = { ...row, ...results };
        return row;
      }),
    },
    repos: { findById: vi.fn(async () => ({ path: '/repo' })) },
    gate: { getRepoGate: vi.fn(async () => ({ enabled: gateEnabled })) },
    gateQueue: { queue: vi.fn(async () => ({})) },
    host: {
      openIssue: vi.fn(async () => ({ number: 10, url: 'u' })),
      editIssueBody: vi.fn(async () => {}),
      createPullRequest: vi.fn(async () => ({ number: 11, url: 'u' })),
    },
    workspace: { publishFile: vi.fn(async () => {}) },
    loops: {
      create: vi.fn(async () => ({ id: 'loop' })),
      get: vi.fn(async () => ({ status })),
      start: vi.fn(async () => {
        status = 'active';
      }),
    },
    probes: { save: vi.fn(async () => ({})) },
    epicScript: 'epic.mjs',
  };
  const starter = new DefaultGoalCardStarter(d as unknown as GoalCardStarterDeps);
  return { d, start: () => starter.start(row), row: () => row };
}

describe('goal_card_starter', () => {
  it('a failed probe save, then a retry, gives 1 loop that starts one time', async () => {
    const w = world();
    w.d.probes.save.mockRejectedValueOnce(new Error('no database'));

    await expect(w.start()).rejects.toThrow('no database');
    expect(w.row().loopId).toBe('loop');
    await w.start();

    expect(w.d.loops.create).toHaveBeenCalledTimes(1);
    expect(w.d.probes.save).toHaveBeenCalledTimes(2);
    expect(w.d.loops.start).toHaveBeenCalledTimes(1);
  });

  it('a failed loop start, then a retry, starts the same loop', async () => {
    const w = world();
    w.d.loops.start.mockRejectedValueOnce(new Error('no database'));

    await expect(w.start()).rejects.toThrow('no database');
    await w.start();

    expect(w.d.loops.create).toHaveBeenCalledTimes(1);
    expect(w.d.loops.start).toHaveBeenCalledTimes(2);
  });

  it('a failed queue, then a retry, queues again and repeats nothing else', async () => {
    const w = world(true);
    w.d.gateQueue.queue.mockRejectedValueOnce(new Error('no gh'));

    await expect(w.start()).rejects.toThrow('no gh');
    await w.start();

    expect(w.d.gateQueue.queue).toHaveBeenCalledTimes(2);
    expect(w.d.gateQueue.queue).toHaveBeenLastCalledWith({ repoId: 'repo', prNumber: 11, taskKey: '5' });
    expect(w.d.host.openIssue).toHaveBeenCalledTimes(1);
    expect(w.d.host.editIssueBody).toHaveBeenCalledTimes(1);
    expect(w.d.host.createPullRequest).toHaveBeenCalledTimes(1);
    expect(w.d.workspace.publishFile).toHaveBeenCalledTimes(1);
    expect(w.d.probes.save).toHaveBeenCalledTimes(1);
    expect(w.d.loops.start).toHaveBeenCalledTimes(1);
  });

  it('a failed edit of the epic, then a retry, writes the prompt in the same epic before the PR', async () => {
    const w = world();
    w.d.host.editIssueBody.mockRejectedValueOnce(new Error('no gh'));

    await expect(w.start()).rejects.toThrow('no gh');
    expect(w.d.host.createPullRequest).not.toHaveBeenCalled();
    await w.start();

    expect(w.d.host.openIssue).toHaveBeenCalledTimes(1);
    expect(w.d.host.editIssueBody).toHaveBeenLastCalledWith('o/r', 10, expect.stringContaining('epic #10 of o/r'));
    expect(w.d.workspace.publishFile).toHaveBeenCalledWith('/repo', expect.objectContaining({ branch: 'goal/card-5', path: 'goals/2026-11-02-card-5.json' }));
  });

  it('with the gate off nothing is queued', async () => {
    const w = world(false);

    await w.start();

    expect(w.d.gateQueue.queue).not.toHaveBeenCalled();
  });

  it('the loop name is cut at 80 characters', async () => {
    const long = world();
    const row = { ...long.row(), title: 'x'.repeat(200) };
    await new DefaultGoalCardStarter(long.d as unknown as GoalCardStarterDeps).start(row);

    expect((long.d.loops.create.mock.calls[0] as unknown as [{ name: string }])[0].name).toHaveLength(80);
  });
});
