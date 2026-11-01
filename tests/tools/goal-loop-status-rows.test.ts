// The status words of the goal-driven loop (spec 2.2, 2.8, 2.13; plan task D1). Each word must have one row in the
// Statuses table of design/ds/SYSTEM.md with its pill class, a key in shared/i18n/en.ts and vi.ts that the preview
// draws, and a pill class that design/ds/components.css defines.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/en';
import { vi } from '../../shared/i18n/vi';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const WORDS = [
  ['Loop', 'Waiting for you', 's-warn', 'goalLoop.loop.waiting'],
  ['Loop', 'Blocked', 's-fail', 'goalLoop.loop.blocked'],
  ['Loop', 'Held', 's-int', 'goalLoop.loop.held'],
  ['Loop', 'Budget used', 's-warn', 'goalLoop.loop.budgetLimited'],
  ['Loop', 'Goal met', 's-ok', 'goalLoop.loop.complete'],
  ['Loop', 'Probe failed', 's-fail', 'goalLoop.loop.probeFailed'],
  ['Run', 'Held', 's-int', 'goalLoop.run.held'],
  ['Period end', 'Goal met', 's-ok', 'goalLoop.period.goalMet'],
  ['Gate job', 'Queued', 's-wait', 'goalLoop.gate.queued'],
  ['Gate job', 'Running', 's-run', 'goalLoop.gate.running'],
  ['Gate job', 'Merged', 's-ok', 'goalLoop.gate.merged'],
  ['Gate job', 'Failed', 's-fail', 'goalLoop.gate.failed'],
  ['Gate job', 'Needs ratification', 's-warn', 'goalLoop.gate.needsRatification'],
  ['Card', 'Proposed', 's-wait', 'goalLoop.card.proposed'],
  ['Card', 'Accepted', 's-ok', 'goalLoop.card.accepted'],
  ['Card', 'Refused', 's-stop', 'goalLoop.card.refused'],
  ['Card', 'Started', 's-run', 'goalLoop.card.started'],
  ['Door', 'Two-way', 's-skip', 'goalLoop.door.twoWay'],
  ['Door', 'One-way', 's-warn', 'goalLoop.door.oneWay'],
] as const;

/** Rows of the Statuses table as [thing, state, pill, word], with code ticks and the dots of the classes removed. */
function statusRows(): string[][] {
  const md = read('design/ds/SYSTEM.md');
  const start = md.indexOf('| Thing | State | Pill | Word |');
  expect(start, 'the Statuses table').toBeGreaterThan(0);
  const table = md.slice(start).split(/\r?\n\r?\n/)[0]!;
  return table.split(/\r?\n/).slice(2).map((l) => l.split('|').slice(1, -1).map((c) => c.trim().replace(/[`.]/g, '')));
}
const rowOf = (thing: string, word: string) => statusRows().find((r) => r[0] === thing && r[3] === word);

describe('goal-loop status words', () => {
  it('each word has its own row in the Statuses table, with its pill class', () => {
    const missing = WORDS.filter(([thing, word, cls]) => rowOf(thing, word)?.[2] !== cls);
    expect(missing.map(([thing, word]) => `${thing}: ${word}`)).toEqual([]);
    expect(WORDS).toHaveLength(19);
  });

  it('each word has a key in en.ts with that word, a text in vi.ts, and the preview draws the key', () => {
    const messages = { en: en as Record<string, string>, vi: vi as Record<string, string> };
    const preview = read('design/ds/preview/preview.js');
    const bad = WORDS.filter(([, word, , key]) => messages.en[key] !== word || !messages.vi[key]?.trim() || !preview.includes(`'${key}'`));
    expect(bad.map(([, , , key]) => key)).toEqual([]);
  });

  it('the pill class of each row exists in components.css', () => {
    const css = read('design/ds/components.css');
    const bad = WORDS.filter(([thing, word]) => {
      const cls = rowOf(thing, word)?.[2];
      return !cls || !css.includes(`.pill.${cls} {`);
    });
    expect(bad.map(([thing, word]) => `${thing}: ${word}`)).toEqual([]);
  });
});
