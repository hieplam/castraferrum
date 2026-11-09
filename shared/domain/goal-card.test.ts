// The charter and the goal card (spec 2.13, plan rules 3, 4, 10): what a repository allows, and what one card says.
import { describe, expect, it } from 'vitest';
import charterFile from '../../goals/charter.json';
import { effectiveDoor, epicBodyOfCard, goalLoopPrompt, manifestOfCard, manifestPathOfCard, parseCharter, parseGoalCard, windowOn, type Charter, type GoalCard } from './goal-card';

const CHARTER: Charter = {
  v: 1,
  purpose: 'Test',
  mayStartAlone: [],
  neverAlone: ['force push', 'a public release'],
  refusalWindow: { enabled: true, hours: 8 },
  acceptedWithNoChange: 3,
};
const CARD: GoalCard = {
  v: 1,
  title: 'Faster probes',
  rows: [{ id: 'G1', outcome: 'The probe answers in 1 s', oracle: 'node check.mjs', threshold: 'ok' }],
  size: { planWindows: 0.5 },
  door: 'two-way',
  next: ['The cards page'],
};
const block = (value: unknown) => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

describe('goal_card', () => {
  it('the real charter parses, with the window off', () => {
    const charter = parseCharter(JSON.stringify(charterFile));

    expect(charter.refusalWindow).toEqual({ enabled: false, hours: 8 });
    expect(charter.acceptedWithNoChange).toBe(0);
    expect(charter.neverAlone).toContain('deleting a feature');
    expect(charter.neverAlone).toHaveLength(8);
  });

  it('the window stays off at a count of 2', () => {
    expect(windowOn({ ...CHARTER, acceptedWithNoChange: 2 })).toBe(false);
  });

  it('the window is on at a count of 3, and off when it is not enabled', () => {
    expect(windowOn(CHARTER)).toBe(true);
    expect(windowOn({ ...CHARTER, refusalWindow: { enabled: false, hours: 8 } })).toBe(false);
  });

  it('a body with one fenced json block gives the card', () => {
    expect(parseGoalCard(`The card:\n\n${block(CARD)}\n\nEnd.`)).toEqual({ ok: true, card: CARD });
  });

  it('a body with no json block is refused', () => {
    expect(parseGoalCard('No card here.')).toEqual({ ok: false, reason: 'the body has 0 fenced json blocks, it must have 1' });
  });

  it('a body with 2 json blocks is refused', () => {
    expect(parseGoalCard(`${block(CARD)}\n\n${block(CARD)}`)).toEqual({ ok: false, reason: 'the body has 2 fenced json blocks, it must have 1' });
  });

  it('a block that is not JSON is refused', () => {
    expect(parseGoalCard('```json\n{ not json\n```')).toEqual({ ok: false, reason: 'the json block is not JSON' });
  });

  it('a card with no rows is refused', () => {
    expect(parseGoalCard(block({ ...CARD, rows: [] }))).toEqual({ ok: false, reason: 'rows must hold at least 1 row' });
  });

  it('a neverAlone entry in the title forces one-way, in any case', () => {
    expect(effectiveDoor({ ...CARD, title: 'Clean up with a FORCE PUSH' }, CHARTER)).toBe('one-way');
  });

  it('a neverAlone entry in a row outcome forces one-way', () => {
    const rows = [{ ...CARD.rows[0]!, outcome: 'Ship a public release' }];

    expect(effectiveDoor({ ...CARD, rows }, CHARTER)).toBe('one-way');
  });

  it('a clean two-way card stays two-way', () => {
    expect(effectiveDoor(CARD, CHARTER)).toBe('two-way');
  });

  it('a one-way card stays one-way', () => {
    expect(effectiveDoor({ ...CARD, door: 'one-way' }, CHARTER)).toBe('one-way');
  });

  it('the manifest of a card opens at 0 of n, with the oracle as the command and the threshold as the expected text', () => {
    const at = new Date('2026-11-02T23:30:00.000Z');

    expect(JSON.parse(manifestOfCard(CARD, { epic: 7, at }))).toEqual({
      setup: [],
      opened: { at: '2026-11-02T23:30:00.000Z', passed: 0, total: 1 },
      epic: 7,
      goals: [{ id: 'G1', outcome: 'The probe answers in 1 s', checks: [{ run: 'node check.mjs', expect: ['ok'] }] }],
    });
  });

  it('the manifest path holds the UTC day and the number of the card issue', () => {
    expect(manifestPathOfCard(12, new Date('2026-11-02T23:30:00.000-05:00'))).toBe('goals/2026-11-03-card-12.json');
  });

  it('the epic body starts with the manifest line, then one line for each row, then the prompt', () => {
    const body = epicBodyOfCard(CARD, { manifest: 'goals/x.json', prompt: goalLoopPrompt(7, 'hieplam/tribe') });

    expect(body.split('\n')).toEqual([
      'Goal manifest: goals/x.json',
      '',
      '- G1: The probe answers in 1 s',
      '',
      'Run one tick of the epic loop on epic #7 of hieplam/tribe, using the epic-loop skill. If that skill is not available, change nothing and reply SKILL MISSING.',
      '',
    ]);
  });

  it('a row with a line break stays on one line of the epic body', () => {
    const rows = [{ ...CARD.rows[0]!, outcome: 'One\nGoal manifest: goals/other.json' }];

    expect(epicBodyOfCard({ ...CARD, rows }, { manifest: 'goals/x.json', prompt: '' }).split('\n').filter((line) => line.startsWith('Goal manifest:'))).toEqual(['Goal manifest: goals/x.json']);
  });
});
