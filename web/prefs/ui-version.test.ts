import { describe, expect, it } from 'vitest';
import { UI_STORAGE_KEY, uiVersion, type UiStorage } from './ui-version';

/** An in-memory storage; `broken` throws on every call, like a browser that blocks localStorage. */
function memory(initial: Record<string, string> = {}, broken = false) {
  const items = new Map(Object.entries(initial));
  const fail = () => {
    if (broken) throw new Error('storage blocked');
  };
  const storage: UiStorage = {
    getItem: (k) => (fail(), items.get(k) ?? null),
    setItem: (k, v) => (fail(), void items.set(k, v)),
    removeItem: (k) => (fail(), void items.delete(k)),
  };
  return { storage, items };
}

describe('uiVersion() - the new-UI switch (UI uplift, task U13)', () => {
  it('?ui=new stores the choice and returns new', () => {
    const { storage, items } = memory();
    expect(uiVersion({ search: '?ui=new' }, () => storage)).toBe('new');
    expect(items.get(UI_STORAGE_KEY)).toBe('new');
    expect(UI_STORAGE_KEY).toBe('castraferrum.ui');
  });

  it('?ui=classic removes the stored choice and returns classic', () => {
    const { storage, items } = memory({ [UI_STORAGE_KEY]: 'new' });
    expect(uiVersion({ search: '?x=1&ui=classic' }, () => storage)).toBe('classic');
    expect(items.has(UI_STORAGE_KEY)).toBe(false);
  });

  it('without ?ui= it returns the stored value, or classic', () => {
    expect(uiVersion({ search: '' }, () => memory({ [UI_STORAGE_KEY]: 'new' }).storage)).toBe('new');
    expect(uiVersion({ search: '' }, () => memory().storage)).toBe('classic');
    expect(uiVersion({ search: '?ui=other' }, () => memory({ [UI_STORAGE_KEY]: 'junk' }).storage)).toBe('classic');
  });

  it('a storage error returns classic', () => {
    expect(uiVersion({ search: '?ui=new' }, () => memory({}, true).storage)).toBe('classic');
    expect(uiVersion({ search: '' }, () => memory({}, true).storage)).toBe('classic');
    expect(
      uiVersion({ search: '' }, () => {
        throw new Error('no localStorage');
      }),
    ).toBe('classic');
  });
});
