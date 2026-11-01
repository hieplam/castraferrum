// Attacks on the scope guard that the plan of K1 does not list. Each form below gets around a naive prefix match on
// Windows, macOS or a git client, so each one must give `guarded`.
import { describe, expect, it } from 'vitest';
import { checkScope, globToRegExp, normalizePath, verifyEntryFiles, type ChangedFile, type ScopeInput } from './scope-guard';

const GUARDED = ['goals/**', 'scripts/*-check.mjs', 'scripts/metrics/**', 'tsconfig.json'];
const VERIFY = 'goals/verify/e.json';
const task = { green: [{ run: 'r', expect: ['e'] }], stub: { run: 'r' } };
const file = (tasks: Record<string, unknown>, extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, tasks, ...extra });

function scope(changed: ChangedFile[], rest: Partial<ScopeInput> = {}) {
  return checkScope({ changed, guarded: GUARDED, verifyChanges: [], ...rest });
}
const planOf = (base: string | null, head: string | null, status = 'M', rows?: ScopeInput['verifyChanges']) =>
  scope([{ status, path: VERIFY }], { verifyChanges: rows ?? [{ path: VERIFY, base, head }] });

describe('path forms that must reach a guarded path', () => {
  it.each([
    ['trailing dot (Windows drops it)', 'goals./x.json'],
    ['trailing space (Windows drops it)', 'goals /x.json'],
    ['trailing dots on the file', 'scripts/arch-check.mjs...'],
    ['NTFS data stream', 'goals/x.json::$DATA'],
    ['colon in the name', 'goals/x.json:evil'],
    ['8.3 short name', 'GOALS~1/X.JSO'],
    ['quoted by git quotePath', '"goals/x.json"'],
    ['leading slash', '/goals/x.json'],
    ['double slashes', 'goals//x.json'],
    ['dot segment in the middle', 'goals/./x.json'],
    ['dot-dot that leaves and returns', 'docs/plans/../../goals/x.json'],
    ['dot-dot with backslashes', 'docs\\plans\\..\\..\\goals\\x.json'],
    ['full-width letters (NFKC)', 'ｇoals/x.json'],
    ['newline in the name', 'goals/x.json\nserver/y.ts'],
    ['NUL in the name', 'goals/x.json\u0000'],
    ['upper case of a script', 'SCRIPTS/ARCH-CHECK.MJS'],
    ['.git directory', '.git/hooks/pre-commit'],
    ['only dots', '...'],
    ['empty path', ''],
  ])('%s', (_name, path) => {
    expect(scope([{ status: 'M', path }]).verdict).toBe('guarded');
  });

  it.each([
    ['copy from a guarded path', { status: 'C100', path: 'docs/copy.json', oldPath: 'goals/x.json' }],
    ['type change of a guarded path', { status: 'T', path: 'tsconfig.json' }],
    ['rename into a guarded path', { status: 'R100', path: 'tsconfig.json', oldPath: 'docs/t.json' }],
    ['a rename whose old path uses backslashes', { status: 'R100', path: 'docs/a.md', oldPath: 'goals\\x.json' }],
    ['an unknown status', { status: 'X', path: 'docs/a.md' }],
    ['an empty status', { status: '', path: 'docs/a.md' }],
    ['a lower case status of a delete', { status: 'd', path: 'tsconfig.json' }],
  ])('%s', (_name, change) => {
    expect(scope([change]).verdict).toBe('guarded');
  });

  it('a harmless path with a dot-dot is guarded, because the form cannot be compared', () => {
    expect(scope([{ status: 'M', path: 'docs/../server/x.ts' }]).verdict).toBe('guarded');
  });

  it('one guarded change among many harmless ones is guarded', () => {
    const changed = [
      ...Array.from({ length: 20 }, (_v, i) => ({ status: 'M', path: `server/f${i}.ts` })),
      { status: 'D', path: 'tsconfig.json' },
    ];
    expect(scope(changed)).toMatchObject({ verdict: 'guarded', paths: ['tsconfig.json'] });
  });

  it('normalizePath gives one form for the forms of one file', () => {
    const forms = ['goals/x.json', 'Goals\\X.JSON', './goals//x.json', 'goals./x.json', 'GOALS/x.json '];
    expect(new Set(forms.map((form) => normalizePath(form).norm)).size).toBe(1);
  });
});

describe('plan PR attacks', () => {
  const base = file({ '1': task });

  it.each([
    ['a verify file in a sub folder', 'goals/verify/sub/e.json'],
    ['a file with no slug', 'goals/verify/.json'],
    ['a verify folder file that is not JSON', 'goals/verify/e.txt'],
    ['gate.json', 'goals/gate.json'],
  ])('%s is not a plan PR', (_name, path) => {
    const verdict = scope([{ status: 'M', path }], { verifyChanges: [{ path, base, head: base }] });
    expect(verdict.verdict).toBe('guarded');
  });

  it('a verify file written in another case is the same file, and a plan', () => {
    const verdict = scope([{ status: 'M', path: 'Goals\\Verify\\E.json' }], {
      verifyChanges: [{ path: VERIFY, base, head: file({ '1': task, '2': task }) }],
    });
    expect(verdict).toEqual({ verdict: 'plan', addedKeys: ['2'] });
  });

  it('a rename from docs/plans into goals/verify is guarded', () => {
    const verdict = scope([{ status: 'R100', path: VERIFY, oldPath: 'docs/plans/e.json' }], {
      verifyChanges: [{ path: VERIFY, base: null, head: base }],
    });
    expect(verdict.verdict).toBe('guarded');
  });

  it('a rename from goals to docs/plans is guarded', () => {
    const verdict = scope([{ status: 'R100', path: 'docs/plans/e.json', oldPath: 'goals/gate.json' }]);
    expect(verdict.verdict).toBe('guarded');
  });

  it('two rows for one path are guarded', () => {
    const rows = [
      { path: VERIFY, base, head: base },
      { path: 'GOALS/verify/e.json', base, head: file({ '1': task, '2': task }) },
    ];
    expect(planOf(base, base, 'M', rows).verdict).toBe('guarded');
  });

  it('the same path listed twice is guarded', () => {
    const changed = [
      { status: 'M', path: VERIFY },
      { status: 'M', path: './goals/verify/E.json' },
    ];
    const rows = [{ path: VERIFY, base, head: file({ '1': task, '2': task }) }];
    expect(scope(changed, { verifyChanges: rows }).verdict).toBe('guarded');
  });

  it('a modified file with no base text is guarded', () => {
    expect(planOf(null, base, 'M').verdict).toBe('guarded');
  });

  it('a rewrite of an existing task is guarded', () => {
    expect(planOf(base, file({ '1': { ...task, green: [{ run: 'true', expect: [] }] } })).verdict).toBe('guarded');
  });

  it('an unknown top-level key is guarded', () => {
    expect(planOf(base, file({ '1': task }, { skip: true })).verdict).toBe('guarded');
  });

  it('an added key with no stub is guarded', () => {
    expect(planOf(base, file({ '1': task, '2': { green: task.green } })).verdict).toBe('guarded');
  });

  it('an added key named __proto__ with an empty green is guarded', () => {
    const head = `{"v":1,"tasks":{"1":${JSON.stringify(task)},"__proto__":${JSON.stringify({ ...task, green: [] })}}}`;
    expect(planOf(base, head).verdict).toBe('guarded');
  });

  it('a plan file next to plan docs and a guarded file is guarded', () => {
    const changed = [
      { status: 'M', path: VERIFY },
      { status: 'M', path: 'docs/plans/x.md' },
      { status: 'M', path: 'tsconfig.json' },
    ];
    expect(scope(changed, { verifyChanges: [{ path: VERIFY, base, head: base }] }).verdict).toBe('guarded');
  });
});

describe('package.json attacks', () => {
  const scripts = { verify: 'npm run a && npm run uc-coverage -- --min 33 && other --min 5', a: 'node scripts/a.mjs' };
  const text = (s: unknown) => JSON.stringify({ scripts: s });
  const base = text(scripts);
  const check = (head: string, change: ChangedFile = { status: 'M', path: 'package.json' }) =>
    scope([change], { packageChange: { base, head } }).verdict;

  it('--min=40 (equals form) with a higher number passes when the base uses the same form', () => {
    const eq = text({ ...scripts, verify: scripts.verify.replace('--min 33', '--min=33') });
    const higher = text({ ...scripts, verify: scripts.verify.replace('--min 33', '--min=40') });
    expect(scope([{ status: 'M', path: 'package.json' }], { packageChange: { base: eq, head: higher } }).verdict).toBe('pass');
  });

  it('every --min must be equal or higher', () => {
    const head = text({ ...scripts, verify: scripts.verify.replace('--min 33', '--min 40').replace('--min 5', '--min 4') });
    expect(check(head)).toBe('guarded');
  });

  it('a number that is not a safe integer is guarded', () => {
    expect(check(text({ ...scripts, verify: scripts.verify.replace('--min 33', '--min 99999999999999999999') }))).toBe('guarded');
  });

  it('a new --min flag is guarded', () => {
    expect(check(text({ ...scripts, verify: `${scripts.verify} --min 1` }))).toBe('guarded');
  });

  it('a letter after the number is guarded', () => {
    expect(check(text({ ...scripts, verify: scripts.verify.replace('--min 33', '--min 40x') }))).toBe('guarded');
  });

  it('a pre hook of verify is guarded', () => {
    expect(check(text({ ...scripts, preverify: 'node scripts/evil.mjs' }))).toBe('guarded');
  });

  it('a higher --min with a change in another script is guarded', () => {
    expect(check(text({ verify: scripts.verify.replace('33', '40'), a: 'node scripts/evil.mjs' }))).toBe('guarded');
  });

  it('scripts removed is guarded', () => {
    expect(check(JSON.stringify({ name: 'x' }))).toBe('guarded');
  });

  it('scripts as a string is guarded', () => {
    expect(check(JSON.stringify({ scripts: 'node evil.mjs' }))).toBe('guarded');
  });

  it('a BOM before the JSON is guarded', () => {
    expect(check(`﻿${base}`)).toBe('guarded');
  });

  it('PACKAGE.JSON in upper case with a changed script is guarded', () => {
    expect(check(text({ ...scripts, a: 'echo' }), { status: 'M', path: 'PACKAGE.JSON' })).toBe('guarded');
  });

  it('package.json with backslashes and a changed script is guarded', () => {
    expect(check(text({ ...scripts, a: 'echo' }), { status: 'M', path: '.\\package.json' })).toBe('guarded');
  });

  it('a package.json in a sub folder is not the root file', () => {
    expect(scope([{ status: 'M', path: 'web/package.json' }])).toEqual({ verdict: 'pass' });
  });

  it('a copy of package.json is guarded', () => {
    expect(check(base, { status: 'C100', path: 'package.json' })).toBe('guarded');
  });

  it('a safe package.json change next to a guarded file is guarded', () => {
    const changed = [
      { status: 'M', path: 'package.json' },
      { status: 'M', path: 'tsconfig.json' },
    ];
    expect(scope(changed, { packageChange: { base, head: base } }).verdict).toBe('guarded');
  });

  it('a safe package.json change next to a verify file is not a plan PR', () => {
    const changed = [
      { status: 'M', path: 'package.json' },
      { status: 'M', path: VERIFY },
    ];
    const rows = [{ path: VERIFY, base: file({}), head: file({ '1': task }) }];
    expect(scope(changed, { packageChange: { base, head: base }, verifyChanges: rows }).verdict).toBe('guarded');
  });
});

describe('globs', () => {
  it.each(['a?b', 'a[b]', 'a{b,c}', '!a', '+(a)'])('%s is refused, so an entry cannot silently match nothing', (glob) => {
    expect(() => globToRegExp(glob)).toThrow(/not supported/);
  });

  it('a directory entry also matches the bare name', () => {
    expect(globToRegExp('goals/**').test('goals')).toBe(true);
    expect(globToRegExp('goals/**').test('goalsx')).toBe(false);
  });
});

describe('verifyEntryFiles attacks', () => {
  it.each([
    ['a semicolon', 'node scripts/a.mjs ; node scripts/evil.mjs'],
    ['an or', 'node scripts/a.mjs || node scripts/evil.mjs'],
    ['a pipe', 'node scripts/a.mjs | node scripts/evil.mjs'],
    ['a background and', 'node scripts/a.mjs & node scripts/evil.mjs'],
    ['a command substitution', 'node $(echo scripts/evil.mjs)'],
    ['a backtick', 'node `echo scripts/evil.mjs`'],
    ['a redirect', 'node scripts/a.mjs > out.txt'],
    ['a quoted file', "node 'scripts/evil.mjs'"],
    ['an eval flag', 'node -e require("./x")'],
    ['a node flag we do not know', 'node --require ./evil.cjs scripts/a.mjs'],
    ['an import other than tsx', 'node --import ./evil.mjs scripts/a.mjs'],
    ['no file', 'node'],
    ['npx', 'npx evil'],
    ['npm exec', 'npm exec evil'],
    ['a shell script', 'sh scripts/evil.sh'],
    ['an empty step', 'node scripts/a.mjs &&  && node scripts/b.mjs'],
    ['npm run with a flag', 'npm run --silent a'],
    ['npm run of a missing script', 'npm run missing'],
    ['npm run with extra words', 'npm run a evil'],
  ])('%s throws', (_name, line) => {
    expect(() => verifyEntryFiles({ verify: line, a: 'node scripts/a.mjs' })).toThrow();
  });

  it('a script that calls itself throws', () => {
    expect(() => verifyEntryFiles({ verify: 'npm run a', a: 'npm run verify' })).toThrow(/calls itself/);
  });

  it('npm runs the pre and post hooks of a script, so they count', () => {
    const scripts = { verify: 'npm run build', build: 'vite build', prebuild: 'node scripts/pre.mjs', postbuild: 'node scripts/post.mjs' };
    expect(verifyEntryFiles(scripts)).toEqual(['scripts/pre.mjs', 'scripts/post.mjs']);
  });

  it('the hooks of verify itself count', () => {
    expect(verifyEntryFiles({ verify: 'tsc', preverify: 'node scripts/pre.mjs' })).toEqual(['scripts/pre.mjs']);
  });

  it('node with tsx, and npm run with arguments, give the file', () => {
    const scripts = { verify: 'npm run p -- --max 0 && vitest run --project unit', p: 'node --import tsx scripts/p.mts' };
    expect(verifyEntryFiles(scripts)).toEqual(['scripts/p.mts']);
  });

  it('tsc, vitest, playwright and vite give no file', () => {
    expect(verifyEntryFiles({ verify: 'tsc -p a && vitest run && playwright test && vite build' })).toEqual([]);
  });
});
