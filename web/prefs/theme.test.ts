import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, writeThemeChoice, type ThemeStorage } from './theme';

function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: ThemeStorage = {
    setItem: (k, v) => void items.set(k, v),
    removeItem: (k) => void items.delete(k),
  };
  return { storage, items };
}

describe('writeThemeChoice() - the Appearance setting of Settings', () => {
  it('stores light or dark under the key the preferences read', () => {
    const { storage, items } = memory();
    writeThemeChoice(storage, 'dark');
    expect(items.get(THEME_STORAGE_KEY)).toBe('dark');
    writeThemeChoice(storage, 'light');
    expect(items.get(THEME_STORAGE_KEY)).toBe('light');
    expect(THEME_STORAGE_KEY).toBe('loop-console.theme');
  });

  it('removes the stored choice for Automatic (null), so the system decides again', () => {
    const { storage, items } = memory({ [THEME_STORAGE_KEY]: 'dark' });
    writeThemeChoice(storage, null);
    expect(items.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('a storage that throws does not throw (the choice lives until the page reloads)', () => {
    const blocked: ThemeStorage = {
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeThemeChoice(blocked, 'dark')).not.toThrow();
    expect(() => writeThemeChoice(blocked, null)).not.toThrow();
  });
});
