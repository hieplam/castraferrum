import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBareRepo, type BareRepo } from '../../../tests/support/bare-repo';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../../../tests/support/fake-gh-kit';
import { GitHostError } from '../../ports/git-host';
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
    const issue = await host.openIssue(REPO, { title: 'Red main', body: 'details', labels: ['loop:gate', 'bug'] });
    expect(issue).toEqual({ number: 1, url: 'https://github.com/fake/repo/issues/1' });
    const stored = gh.read().issues[0];
    expect(stored?.title).toBe('Red main');
    expect(stored?.labels.map((l) => l.name)).toEqual(['loop:gate', 'bug']);
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
    await host.openIssue(REPO, { title: 'T', body: 'old', labels: ['bug'] });
    await host.editIssueBody(REPO, 1, 'new');
    const stored = gh.read().issues[0];
    expect(stored?.body).toBe('new');
    expect(stored?.labels.map((l) => l.name)).toEqual(['bug']);
  });

  it('a gh call that exits 1 throws a GitHostError with the exit code and the stderr', async () => {
    const err = await host.pullRequest(REPO, 99).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHostError);
    expect((err as GitHostError).exitCode).toBe(1);
    expect((err as GitHostError).stderr).toContain('pull request 99 not found');
  });
});
