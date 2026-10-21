import { describe, expect, it } from 'vitest';
import { compareRatchets } from '../../scripts/ratchets.mjs';

type Ratchets = {
  tokens: Record<string, unknown>[];
  lint?: Record<string, number>;
  e2eExpectsMin: number;
  e2eExpectsLoweredBy?: { task: string; from: number; classicBranchExpects: number };
};
const base: Ratchets = {
  tokens: [{ file: 'design/tokens.css', pairs: 'design/contrast-pairs-classic.json', maxEmpty: 4, maxMissingDark: 8, maxContrast: 1 }],
  lint: { maxTitle: 8, maxUnknown: 3, maxLiteral: 2 },
  e2eExpectsMin: 100,
};
const clone = (): Ratchets => structuredClone(base);

describe('ratchets against a base', () => {
  it('an unchanged file passes', () => {
    expect(compareRatchets(base, clone())).toEqual([]);
  });

  it('a raised maximum fails', () => {
    const cur = clone();
    cur.lint!.maxTitle = 9;
    expect(compareRatchets(base, cur).join()).toContain('lint.maxTitle');
    const cur2 = clone();
    cur2.tokens[0]!.maxEmpty = 5;
    expect(compareRatchets(base, cur2).join()).toContain('maxEmpty');
  });

  it('a lowered minimum fails', () => {
    const cur = clone();
    cur.e2eExpectsMin = 99;
    expect(compareRatchets(base, cur).join()).toContain('e2eExpectsMin');
  });

  it('an added entry passes, and a lowered maximum passes', () => {
    const cur = clone();
    cur.tokens.push({ file: 'design/ds/tokens.css', maxEmpty: 0 });
    cur.lint!.maxTitle = 0;
    expect(compareRatchets(base, cur)).toEqual([]);
  });

  it('a tombstone passes; a silent removal fails', () => {
    const cur = clone();
    cur.tokens = [{ file: 'design/tokens.css', removedBy: 'U25' }];
    expect(compareRatchets(base, cur)).toEqual([]);
    const gone = clone();
    gone.tokens = [];
    expect(compareRatchets(base, gone).join()).toContain('design/tokens.css');
    const noLint = clone();
    delete noLint.lint;
    expect(compareRatchets(base, noLint).join()).toContain('lint');
  });

  it('a lowered minimum with a matching note passes; a wrong k fails', () => {
    const cur = clone();
    cur.e2eExpectsMin = 90;
    cur.e2eExpectsLoweredBy = { task: 'U25', from: 100, classicBranchExpects: 10 };
    expect(compareRatchets(base, cur)).toEqual([]);
    cur.e2eExpectsLoweredBy = { task: 'U25', from: 100, classicBranchExpects: 7 };
    expect(compareRatchets(base, cur).join()).toContain('e2eExpectsMin');
  });
});
