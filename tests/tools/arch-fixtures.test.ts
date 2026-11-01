import { describe, expect, it } from 'vitest';
import { checkFixtures, checkSources, ruleNames } from '../../scripts/arch-lib.mjs';

// A full dependency check takes 7 s to 16 s under load, so the default 5 s limit is too short.
const SLOW = 60_000;

describe('layer rules (.dependency-cruiser.cjs + network-call rule)', () => {
  it('catches each deliberate violation in tests/arch-fixtures/, every rule has at least one violating file', async () => {
    const fx = await checkFixtures();
    expect(fx.missing).toEqual([]);
    expect(fx.unexpected).toEqual([]);
    expect(fx.rulesWithoutFixture).toEqual([]);
    expect(fx.caught).toBe(fx.expected);
    expect(fx.expected).toBeGreaterThanOrEqual(ruleNames().length);
  }, SLOW);

  it('real code: 0 violations', async () => {
    const src = await checkSources();
    expect(src.depcruise).toEqual([]);
    expect(src.network).toEqual([]);
  }, SLOW);
});
