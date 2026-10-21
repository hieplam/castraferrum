import { describe, expect, it } from 'vitest';
import type { DirectoryProbe } from '../../ports/directory';
import { OverridableDirectoryProbe } from './overridable-directory-probe';

describe('OverridableDirectoryProbe (test mode)', () => {
  const inner: DirectoryProbe = { check: async (path) => ({ kind: 'ok', path: `${path}-real`, name: 'real' }) };

  it('a forced path → present / missing according to the override (name = last folder, Windows or POSIX); not forced → ask the real probe; clear() drops the overrides', async () => {
    const p = new OverridableDirectoryProbe(inner);
    p.set({ 'C:\\Users\\alice\\Downloads\\Atlas': false, 'D:\\backup\\Atlas': true, '/srv/repo/': true });
    expect(await p.check('C:\\Users\\alice\\Downloads\\Atlas')).toEqual({ kind: 'notDirectory' });
    expect(await p.check('D:\\backup\\Atlas')).toEqual({ kind: 'ok', path: 'D:\\backup\\Atlas', name: 'Atlas' });
    expect(await p.check('/srv/repo/')).toEqual({ kind: 'ok', path: '/srv/repo/', name: 'repo' });
    expect(await p.check('E:\\other')).toEqual({ kind: 'ok', path: 'E:\\other-real', name: 'real' });
    p.clear();
    expect(await p.check('C:\\Users\\alice\\Downloads\\Atlas')).toEqual({ kind: 'ok', path: 'C:\\Users\\alice\\Downloads\\Atlas-real', name: 'real' });
  });
});
