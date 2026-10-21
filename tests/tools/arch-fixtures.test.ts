import { describe, expect, it } from 'vitest';
import { checkFixtures, checkSources, ruleNames } from '../../scripts/arch-lib.mjs';

describe('layer rules (.dependency-cruiser.cjs + network-call rule)', () => {
  it('catches each deliberate violation in tests/arch-fixtures/, every rule has at least one violating file', async () => {
    const fx = await checkFixtures();
    expect(fx.missing).toEqual([]);
    expect(fx.unexpected).toEqual([]);
    expect(fx.rulesWithoutFixture).toEqual([]);
    expect(fx.caught).toBe(fx.expected);
    expect(fx.expected).toBeGreaterThanOrEqual(ruleNames().length);
  });

  it('real code: 0 violations', async () => {
    const src = await checkSources();
    expect(src.depcruise).toEqual([]);
    expect(src.network).toEqual([]);
  });
});
