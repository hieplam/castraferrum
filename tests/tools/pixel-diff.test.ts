// The pixel threshold of every visual comparison (UI uplift, task U13): one value, in tests/visual/pixel-diff.ts.
import { describe, expect, it } from 'vitest';
import { MAX_RATIO } from '../visual/pixel-diff';

describe('pixel-diff', () => {
  it('MAX_RATIO is 0.001 (mismatched pixels / compared pixels per region)', () => {
    expect(MAX_RATIO).toBe(0.001);
  });
});
