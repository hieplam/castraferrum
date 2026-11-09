import { describe, expect, it } from 'vitest';
import type { GoalCardDto } from '../../shared/contracts/goal-cards';
import { fmtHm, HISTORY_MAX, splitGoalCards } from './goal-cards';

const card = (id: string, state: GoalCardDto['state'], decidedAt: string | null): GoalCardDto => ({
  id,
  repoId: 'r',
  githubRepo: 'hieplam/tribe',
  issueNumber: 1,
  title: id,
  door: 'two-way',
  card: { v: 1, title: id, rows: [], size: { planWindows: 0.5 }, door: 'two-way', next: [] },
  state,
  startAfter: null,
  changed: false,
  epicNumber: null,
  prNumber: null,
  loopId: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  decidedAt: decidedAt === null ? null : new Date(decidedAt),
});

describe('splitGoalCards', () => {
  it('takes the proposed card out and orders the rest by the newest decision', () => {
    const { proposed, history } = splitGoalCards([card('a', 'refused', '2026-10-12T00:00:00Z'), card('p', 'proposed', null), card('b', 'started', '2026-10-16T00:00:00Z'), card('c', 'accepted', '2026-10-15T00:00:00Z')]);
    expect(proposed?.id).toBe('p');
    expect(history.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('gives no proposed card when none waits', () => {
    expect(splitGoalCards([card('a', 'refused', '2026-10-12T00:00:00Z')]).proposed).toBeNull();
  });

  it('keeps at most five cards in the history', () => {
    const many = Array.from({ length: 8 }, (_, i) => card(`c${i}`, 'refused', `2026-10-0${i + 1}T00:00:00Z`));
    expect(splitGoalCards(many).history).toHaveLength(HISTORY_MAX);
  });
});

describe('fmtHm', () => {
  it('writes the hour with no leading zero in the given time zone', () => {
    expect(fmtHm(new Date('2026-10-18T15:14:00Z'), 'Asia/Ho_Chi_Minh')).toBe('22:14');
    expect(fmtHm(new Date('2026-10-18T02:05:00Z'), 'Asia/Ho_Chi_Minh')).toBe('9:05');
  });
});
