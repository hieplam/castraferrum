import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBareRepo, type BareRepo } from '../../../tests/support/bare-repo';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../../../tests/support/fake-gh-kit';
import { GitHostError, PullRequestNotFoundError } from '../../ports/git-host';
import { NodeCommandRunner } from '../process/node-command-runner';
import { GhGitHost } from './gh-git-host';

const REPO = 'fake/repo';
let bare: BareRepo;
let gh: FakeGh;
let host: GhGitHost;
let headSha: string;
let saved: string | undefined;

/** A pull request with one commit on `feat/x`, made through the fake `gh pr create` (it reads "Closes #7" from the body). */
function seedPr(): void {
  const dir = bare.clone();
  bare.branch(dir, 'feat/x');
  headSha = bare.commit(dir, { 'a.txt': 'from the branch\n' }, 'add a.txt');
  bare.push(dir, 'feat/x');
  execFileSync(
    process.execPath,
    [FAKE_GH_SCRIPT, 'pr', 'create', '-R', REPO, '--head', 'feat/x', '--base', 'main', '--title', 'Add a', '--body', 'Closes #7'],
    { env: { ...process.env, FAKE_GH_WORLD: gh.world } },
  );
}

beforeEach(() => {
  bare = createBareRepo();
  gh = createFakeGh(bare);
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  host = new GhGitHost({ runner: new NodeCommandRunner(), ghBin: FAKE_GH_SCRIPT });
});

afterEach(() => {
  if (saved === undefined) delete process.env.FAKE_GH_WORLD;
  else process.env.FAKE_GH_WORLD = saved;
  gh.dispose();
  bare.dispose();
});

describe('GhGitHost on the fake gh and a bare repository', () => {
  it('pullRequest reads the head sha, the branches, the state and the issues that the PR closes', async () => {
    seedPr();
    const pr = await host.pullRequest(REPO, 1);
    expect(pr).toEqual({
      number: 1,
      headSha,
      headRef: 'feat/x',
      baseRef: 'main',
      state: 'OPEN',
      title: 'Add a',
      body: 'Closes #7',
      url: 'https://github.com/fake/repo/pull/1',
      mergedAt: null,
      closingIssues: [7],
    });
    expect(gh.read().calls[0]?.args).toContain('-R');
  });

  it('setStatus posts the state under the context castraferrum/gate and cuts the description at 140 characters', async () => {
    seedPr();
    await host.setStatus(REPO, headSha, { state: 'pending', description: 'x'.repeat(300) });
    const [status] = gh.read().statuses[headSha] ?? [];
    expect(status?.state).toBe('pending');
    expect(status?.context).toBe('castraferrum/gate');
    expect(status?.description).toBe('x'.repeat(140));
  });

  it('gateStatus gives the latest state under castraferrum/gate, and null when the commit has none', async () => {
    seedPr();
    expect(await host.gateStatus(REPO, headSha)).toBeNull();
    await host.setStatus(REPO, headSha, { state: 'pending', description: 'gate: running' });
    await host.setStatus(REPO, headSha, { state: 'success', description: 'gate: every step passed' });
    expect(await host.gateStatus(REPO, headSha)).toBe('success');
  });

  it('checks lists the check runs of a commit', async () => {
    seedPr();
    const w = gh.read();
    w.checkRuns[headSha] = [
      { name: 'ci', status: 'completed', conclusion: 'success' },
      { name: 'lint', status: 'in_progress', conclusion: null },
    ];
    writeFileSync(gh.world, JSON.stringify(w));
    expect(await host.checks(REPO, headSha)).toEqual([
      { name: 'ci', status: 'completed', conclusion: 'success' },
      { name: 'lint', status: 'in_progress', conclusion: null },
    ]);
  });

  it('merge squashes the pull request into main when the sha is the head that was checked', async () => {
    seedPr();
    await host.merge(REPO, 1, headSha);
    expect(bare.show('main', 'a.txt')).toBe('from the branch\n');
    const merge = gh.read().calls.find((c) => c.args[1] === 'merge');
    expect(merge?.args).toEqual(expect.arrayContaining(['--squash', '--match-head-commit', headSha]));
    expect((await host.pullRequest(REPO, 1)).state).toBe('MERGED');
  });

  it('merge with a sha that is not the head throws and merges nothing', async () => {
    seedPr();
    const mainBefore = bare.sha('main');
    const wrong = 'f'.repeat(40);
    await expect(host.merge(REPO, 1, wrong)).rejects.toMatchObject({ name: 'GitHostError', exitCode: 1 });
    expect(bare.sha('main')).toBe(mainBefore);
    expect(gh.read().prs[0]?.state).toBe('OPEN');
  });

  it('comment adds the body to the issue and cuts it at 20000 characters', async () => {
    await host.openIssue(REPO, { title: 'T', body: 'B', labels: [] });
    await host.comment(REPO, 1, 'y'.repeat(25_000));
    expect(gh.read().issues[0]?.comments[0]?.body).toBe('y'.repeat(20_000));
  });

  it('openIssue creates an issue with its labels and returns its number and url', async () => {
    gh.seedLabels('loop:gate', 'bug');
    const issue = await host.openIssue(REPO, { title: 'Red main', body: 'details', labels: ['loop:gate', 'bug'] });
    expect(issue).toEqual({ number: 1, url: 'https://github.com/fake/repo/issues/1' });
    const stored = gh.read().issues[0];
    expect(stored?.title).toBe('Red main');
    expect(stored?.labels.map((l) => l.name)).toEqual(['loop:gate', 'bug']);
  });

  it('ensureLabel creates a missing label, and calling it again keeps one label', async () => {
    await host.ensureLabel(REPO, 'standing-goal');
    await host.ensureLabel(REPO, 'standing-goal');
    expect(gh.read().labels).toEqual(['standing-goal']);
  });

  it('openIssue with a label that the repository lacks throws a GitHostError and opens nothing', async () => {
    await expect(host.openIssue(REPO, { title: 'T', body: 'B', labels: ['missing'] })).rejects.toMatchObject({ name: 'GitHostError', exitCode: 1 });
    expect(gh.read().issues).toEqual([]);
  });

  it('searchIssues finds issues by text, open or closed', async () => {
    await host.openIssue(REPO, { title: 'fingerprint abc', body: 'one', labels: [] });
    await host.openIssue(REPO, { title: 'other', body: 'two', labels: [] });
    const hits = await host.searchIssues(REPO, 'fingerprint abc');
    expect(hits).toEqual([{ number: 1, title: 'fingerprint abc', state: 'OPEN', url: 'https://github.com/fake/repo/issues/1' }]);
  });

  it('closeIssue closes the issue', async () => {
    await host.openIssue(REPO, { title: 'T', body: 'B', labels: [] });
    await host.closeIssue(REPO, 1);
    expect(gh.read().issues[0]?.state).toBe('CLOSED');
  });

  it('editIssueBody replaces the body and keeps the labels', async () => {
    gh.seedLabels('bug');
    await host.openIssue(REPO, { title: 'T', body: 'old', labels: ['bug'] });
    await host.editIssueBody(REPO, 1, 'new');
    const stored = gh.read().issues[0];
    expect(stored?.body).toBe('new');
    expect(stored?.labels.map((l) => l.name)).toEqual(['bug']);
  });

  it('loopComments gives the loop-release comments updated since the date, and no other comment', async () => {
    const world = gh.read();
    const issue = (number: number, updatedAt: string, comments: { id: string; createdAt: string; body: string }[]) =>
      ({ number, title: 't', body: 'b', state: 'OPEN', labels: [], comments, url: '', createdAt: updatedAt, updatedAt, closedAt: null }) as never;
    world.issues.push(
      issue(5, '2026-10-20T10:00:00.000Z', [
        { id: 'IC_a', createdAt: '2026-10-20T09:00:00.000Z', body: 'loop-attempt: 1' },
        { id: 'IC_b', createdAt: '2026-10-20T10:00:00.000Z', body: 'loop-release: reason\n\nBack in the queue' },
      ]),
      issue(6, '2026-10-01T10:00:00.000Z', [{ id: 'IC_c', createdAt: '2026-10-01T10:00:00.000Z', body: 'loop-release: too old' }]),
    );
    writeFileSync(gh.world, JSON.stringify(world));
    expect(await host.loopComments(REPO, new Date('2026-10-19T15:00:00Z'))).toEqual([
      { issue: 5, id: 'IC_b', at: new Date('2026-10-20T10:00:00.000Z'), body: 'loop-release: reason\n\nBack in the queue' },
    ]);
  });

  it('loopComments throws a GitHostError when the list holds 1000 issues, because it can be cut off', async () => {
    const world = gh.read();
    world.issues = Array.from({ length: 1000 }, (_, i) => ({
      number: i + 1,
      title: 't',
      body: 'b',
      state: 'OPEN' as const,
      labels: [],
      comments: [],
      url: '',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      closedAt: null,
    }));
    writeFileSync(gh.world, JSON.stringify(world));
    const err = await host.loopComments(REPO, new Date('2026-10-19T00:00:00Z')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHostError);
    expect((err as GitHostError).message).toContain('cut off');
  });

  it('issueState gives OPEN, then CLOSED', async () => {
    await host.openIssue(REPO, { title: 'T', body: 'B', labels: [] });
    expect(await host.issueState(REPO, 1)).toBe('OPEN');
    await host.closeIssue(REPO, 1);
    expect(await host.issueState(REPO, 1)).toBe('CLOSED');
  });

  it('addSubIssue reads the id of the child and posts it to the parent', async () => {
    await host.openIssue(REPO, { title: 'parent', body: '', labels: [] });
    await host.openIssue(REPO, { title: 'child', body: '', labels: [] });
    await host.addSubIssue(REPO, 1, 2);
    expect(gh.read().subIssues).toEqual({ 1: [2] });
    const calls = gh.read().calls.map((c) => c.args).filter((args) => args[0] === 'api');
    expect(calls[0]).toEqual(['api', 'repos/fake/repo/issues/2']);
    expect(calls[1]?.slice(1, 5)).toEqual(['-X', 'POST', 'repos/fake/repo/issues/1/sub_issues', '-F']);
  });

  it('a gh call that exits 1 throws a GitHostError with the exit code and the stderr, and it is not a missing pull request', async () => {
    const err = await host.merge(REPO, 99, 'a'.repeat(40)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHostError);
    expect(err).not.toBeInstanceOf(PullRequestNotFoundError);
    expect((err as GitHostError).exitCode).toBe(1);
    expect((err as GitHostError).stderr).toContain('pull request 99 not found');
  });

  it('pullRequest tells a pull request that does not exist from a gh failure', async () => {
    const missing = await host.pullRequest(REPO, 9).catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(PullRequestNotFoundError);
    expect(missing).toMatchObject({ number: 9, exitCode: 1 });
    expect((missing as GitHostError).stderr).toContain('Could not resolve to a PullRequest with the number of 9');

    const broken = new GhGitHost({ runner: new NodeCommandRunner(), ghBin: FAKE_GH_SCRIPT, cwd: '/no/such/folder/for/gh' });
    const failure = await broken.pullRequest(REPO, 9).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GitHostError);
    expect(failure).not.toBeInstanceOf(PullRequestNotFoundError);
  });
});
