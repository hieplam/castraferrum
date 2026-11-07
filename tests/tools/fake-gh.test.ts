// Oracle of the fake GitHub kit (F2): every test runs the fake as a child process, as the callers do.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBareRepo, type BareRepo } from '../support/bare-repo.ts';
import { createFakeGh, type FakeGh } from '../support/fake-gh-kit.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function setup(withBare = false): { gh: FakeGh; bare: BareRepo | undefined; run: (...args: string[]) => ReturnType<typeof spawnSync> & { out: string } } {
  const bare = withBare ? createBareRepo() : undefined;
  const gh = createFakeGh(bare);
  cleanups.push(() => {
    gh.dispose();
    bare?.dispose();
  });
  const run = (...args: string[]) => {
    // Node cannot spawn a .cmd with no shell: the wrapper needs one on win32. The script itself needs none.
    const r = spawnSync(process.execPath, [gh.script, ...args], { env: { ...process.env, ...gh.env }, encoding: 'utf8' });
    return Object.assign(r, { out: String(r.stdout) });
  };
  return { gh, bare, run };
}

// Real git on a Windows disk is slow: each merge runs about ten git processes.
describe('fake gh', { timeout: 60_000 }, () => {
  it('issue create then list', () => {
    const { gh, run } = setup();
    gh.seedLabels('a', 'b');
    const c = run('issue', 'create', '--title', 'First', '--body', 'Body one', '--label', 'a', '--label', 'b');
    expect(c.status).toBe(0);
    expect(c.out.trim()).toBe('https://github.com/fake/repo/issues/1');
    const l = run('issue', 'list', '--json', 'number,title,labels,state');
    expect(JSON.parse(l.out)).toEqual([{ number: 1, title: 'First', labels: [{ name: 'a' }, { name: 'b' }], state: 'OPEN' }]);
  });

  it('failNext makes the next such call fail, one time', () => {
    const { gh, run } = setup();
    writeFileSync(gh.world, JSON.stringify({ ...gh.read(), failNext: ['issue create'] }));

    expect(run('issue', 'create', '--title', 'T', '--body', 'B').status).toBe(1);
    expect(gh.read().issues).toEqual([]);
    expect(run('issue', 'create', '--title', 'T', '--body', 'B').status).toBe(0);
    expect(gh.read().issues).toHaveLength(1);
  });

  it('issue create refuses a label that does not exist, and label create adds it', () => {
    const { gh, run } = setup();
    const refused = run('issue', 'create', '--title', 'T', '--body', 'B', '--label', 'missing');
    expect(refused.status).toBe(1);
    expect(String(refused.stderr)).toContain("'missing' not found");
    expect(gh.read().issues).toEqual([]);
    expect(run('label', 'create', 'missing').status).toBe(0);
    expect(run('label', 'create', 'missing').status).toBe(1);
    expect(run('label', 'create', 'missing', '--force').status).toBe(0);
    expect(gh.read().labels).toEqual(['missing']);
    expect(run('issue', 'create', '--title', 'T', '--body', 'B', '--label', 'missing').status).toBe(0);
  });

  it('search by body hash finds one issue', () => {
    const { run } = setup();
    run('issue', 'create', '--title', 'One', '--body', 'fingerprint: abc123');
    run('issue', 'create', '--title', 'Two', '--body', 'fingerprint: def456');
    const l = run('issue', 'list', '--search', '"abc123" in:body', '--json', 'number');
    expect(JSON.parse(l.out)).toEqual([{ number: 1 }]);
  });

  it('comment and label edits kept', () => {
    const { gh, run } = setup();
    gh.seedLabels('old');
    run('issue', 'create', '--title', 'T', '--body', 'B', '--label', 'old');
    expect(run('issue', 'comment', '1', '--body', 'hello').status).toBe(0);
    expect(run('issue', 'edit', '1', '--add-label', 'new', '--remove-label', 'old').status).toBe(0);
    expect(run('issue', 'close', '1').status).toBe(0);
    const v = JSON.parse(run('issue', 'view', '1', '--json', 'labels,comments,state').out);
    expect(v.labels).toEqual([{ name: 'new' }]);
    expect(v.comments.map((c: { body: string }) => c.body)).toEqual(['hello']);
    expect(v.state).toBe('CLOSED');
    expect(JSON.parse(run('issue', 'list', '--json', 'number').out)).toEqual([]);
    expect(JSON.parse(run('issue', 'list', '--state', 'closed', '--json', 'number').out)).toEqual([{ number: 1 }]);
  });

  it('unsupported exits 64', () => {
    const { run } = setup();
    const r = run('repo', 'view');
    expect(r.status).toBe(64);
    expect(String(r.stderr)).toContain('fake-gh: unsupported: repo view');
  });

  it('pr create then list', () => {
    const { run } = setup(true);
    const c = run('pr', 'create', '--head', 'feat/x', '--base', 'main', '--title', 'T', '--body', 'Closes #1');
    expect(c.out.trim()).toBe('https://github.com/fake/repo/pull/1');
    const l = JSON.parse(run('pr', 'list', '--json', 'number,headRefName,baseRefName,state,title').out);
    expect(l).toEqual([{ number: 1, headRefName: 'feat/x', baseRefName: 'main', state: 'OPEN', title: 'T' }]);
  });

  it('merge squashes into bare main (new sha, file present)', () => {
    const { run, bare } = setup(true);
    const dir = bare!.clone();
    bare!.branch(dir, 'feat/x');
    bare!.commit(dir, { 'a.txt': '1' }, 'one');
    bare!.commit(dir, { 'b.txt': '2' }, 'two');
    bare!.push(dir, 'feat/x');
    const before = bare!.sha('main');
    run('pr', 'create', '--head', 'feat/x', '--base', 'main', '--title', 'Add files', '--body', '');
    const m = run('pr', 'merge', '1', '--squash', '--match-head-commit', bare!.sha('feat/x'));
    expect(m.status).toBe(0);
    expect(bare!.sha('main')).not.toBe(before);
    expect(bare!.show('main', 'a.txt')).toBe('1');
    expect(bare!.show('main', 'b.txt')).toBe('2');
    expect(JSON.parse(run('pr', 'view', '1', '--json', 'state').out)).toEqual({ state: 'MERGED' });
  });

  it('wrong head commit exits 1, main stays', () => {
    const { run, bare } = setup(true);
    const dir = bare!.clone();
    bare!.branch(dir, 'feat/y');
    bare!.commit(dir, { 'c.txt': '3' }, 'three');
    bare!.push(dir, 'feat/y');
    const before = bare!.sha('main');
    run('pr', 'create', '--head', 'feat/y', '--base', 'main', '--title', 'T', '--body', '');
    const m = run('pr', 'merge', '1', '--squash', '--match-head-commit', '0'.repeat(40));
    expect(m.status).toBe(1);
    expect(String(m.stderr)).toContain('fake-gh: head commit does not match');
    expect(bare!.sha('main')).toBe(before);
    expect(JSON.parse(run('pr', 'view', '1', '--json', 'state').out)).toEqual({ state: 'OPEN' });
  });

  it('posted status read back', () => {
    const { run, gh } = setup();
    const sha = 'a'.repeat(40);
    const p = run('api', '-X', 'POST', `repos/fake/repo/statuses/${sha}`, '-f', 'state=success', '-f', 'context=loop/goal', '-f', 'description=ok');
    expect(p.status).toBe(0);
    const s = JSON.parse(run('api', `repos/fake/repo/commits/${sha}/status`).out);
    expect(s.state).toBe('success');
    expect(s.statuses).toEqual([expect.objectContaining({ context: 'loop/goal', state: 'success', description: 'ok' })]);
    expect(JSON.parse(run('api', `repos/fake/repo/commits/${sha}/check-runs`).out)).toEqual({ total_count: 0, check_runs: [] });
    expect(gh.read().statuses[sha]).toHaveLength(1);
  });

  it('call log keeps a failed call', () => {
    const { run, gh } = setup();
    run('issue', 'create', '--title', 'T', '--body', 'B');
    run('nonsense');
    const calls = gh.read().calls;
    expect(calls.map((c) => [c.args.join(' '), c.exit])).toEqual([
      ['issue create --title T --body B', 0],
      ['nonsense', 64],
    ]);
  });

  it('wrapper runs from a child process, and the same call with no wrapper fails ENOENT', () => {
    const { gh } = setup();
    const viaWrapper = spawnSync(`"${gh.bin}" issue list --json number`, {
      env: { ...process.env, ...gh.env },
      shell: true, // a .cmd needs a shell; the sh wrapper works with one too
      encoding: 'utf8',
    });
    expect(viaWrapper.status).toBe(0);
    expect(JSON.parse(viaWrapper.stdout)).toEqual([]);
    expect(gh.env.LOOPS_GH_BIN).toBe(gh.bin);
    expect(gh.env.FAKE_GH_WORLD).toBe(gh.world);
    const missing = spawnSync(join(gh.world, '..', 'no-such-gh'), ['issue', 'list'], { env: { ...process.env, ...gh.env }, encoding: 'utf8' });
    expect((missing.error as NodeJS.ErrnoException).code).toBe('ENOENT');
    expect(gh.read().calls).toHaveLength(1);
  });

  it('reopen, -R and --body-file are supported (R3)', () => {
    const { run } = setup();
    const dir = mkdtempSync(join(tmpdir(), 'lc-fake-gh-body-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const bodyFile = join(dir, 'body.md');
    writeFileSync(bodyFile, 'from a file');
    expect(run('issue', 'create', '-R', 'o/r', '--title', 'T', '--body-file', bodyFile).status).toBe(0);
    expect(run('issue', 'close', '1').status).toBe(0);
    expect(run('issue', 'reopen', '1', '-R', 'o/r').status).toBe(0);
    expect(run('issue', 'comment', '1', '-R', 'o/r', '--body', 'again').status).toBe(0);
    const v = JSON.parse(run('issue', 'view', '1', '--json', 'body,state,comments,closedAt').out);
    expect(v).toEqual({ body: 'from a file', state: 'OPEN', comments: [expect.objectContaining({ body: 'again' })], closedAt: null });
  });
  it('issue list takes the updated:>= search and --limit, and a comment has an id and a createdAt (R8)', () => {
    const { gh, run } = setup();
    for (const t of ['one', 'two', 'three']) run('issue', 'create', '--title', t, '--body', 'b');
    run('issue', 'comment', '2', '--body', 'loop-release: x');
    const world = gh.read();
    world.issues[0]!.updatedAt = '2026-10-10T00:00:00.000Z';
    world.issues[1]!.updatedAt = '2026-10-20T00:00:00.000Z';
    world.issues[2]!.updatedAt = '2026-10-21T00:00:00.000Z';
    writeFileSync(gh.world, JSON.stringify(world));
    const since = run('issue', 'list', '-R', 'o/r', '--state', 'all', '--search', 'updated:>=2026-10-20', '--json', 'number');
    expect(JSON.parse(since.out)).toEqual([{ number: 2 }, { number: 3 }]);
    const limited = run('issue', 'list', '--state', 'all', '--search', 'updated:>=2026-10-20', '--limit', '1', '--json', 'number');
    expect(JSON.parse(limited.out)).toEqual([{ number: 2 }]);
    const [comment] = JSON.parse(run('issue', 'view', '2', '--json', 'comments').out).comments;
    expect(comment).toMatchObject({ body: 'loop-release: x' });
    expect(comment.id).toMatch(/^IC_/);
    expect(Date.parse(comment.createdAt)).not.toBeNaN();
  });

  it('a search with updated:>= and a word keeps only the issues that match both (R8)', () => {
    const { gh, run } = setup();
    run('issue', 'create', '--title', 'alpha', '--body', 'b');
    run('issue', 'create', '--title', 'beta', '--body', 'b');
    const world = gh.read();
    for (const i of world.issues) i.updatedAt = '2026-10-20T00:00:00.000Z';
    writeFileSync(gh.world, JSON.stringify(world));
    expect(JSON.parse(run('issue', 'list', '--search', 'beta updated:>=2026-10-19', '--json', 'number').out)).toEqual([{ number: 2 }]);
    expect(JSON.parse(run('issue', 'list', '--search', 'beta updated:>=2026-10-21', '--json', 'number').out)).toEqual([]);
  });
});

