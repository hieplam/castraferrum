// Server-side phase 2 service tests: registered repos (UC-19, UC-20), loops tied to a repo (UC-21, UC-25), runs
// inside the right repo folder, a repo vanishing during a run (UC-23), loops without a timeout (UC-24). Memory repository + real temp folders.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { flush, makeKit, MIN, T0, until, type Kit } from '../../tests/support/service-kit';

const at = (ms: number) => new Date(T0.getTime() + ms);
const DAY = 24 * 60 * MIN;

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

const tmpDir = () => mkdtempSync(join(tmpdir(), 'lc23-'));

async function issuesOf(p: Promise<unknown>): Promise<string[]> {
  const err = (await p.then(
    () => null,
    (e: unknown) => e,
  )) as { code: string; details: { issues: { field: string; code: string }[] } } | null;
  expect(err?.code).toBe('VALIDATION_FAILED');
  return err!.details.issues.map((i) => `${i.field}:${i.code}`);
}

describe('RepoService', () => {
  it('UC-19 register: default name = folder name, normalised path, read back from the "DB"', async () => {
    const dir = tmpDir();
    mkdirSync(join(dir, 'x'));
    const repo = await k.repoService.register({ path: `${dir}${sep}x${sep}..${sep}` }); // `x/../` → normalised to the right folder
    expect(repo).toMatchObject({ name: basename(dir), path: dir, createdAt: T0 });
    expect(k.db.repos.get(repo.id)).toEqual(repo);
    const named = await k.repoService.register({ path: tmpDir(), name: '  Atlas  ' });
    expect(named.name).toBe('Atlas');
    expect((await k.repoService.list()).map((r) => r.name)).toEqual(['Atlas', basename(dir), k.repo.name].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  });

  it('UC-19 git is not required: an empty folder can still be registered', async () => {
    const dir = tmpDir();
    await expect(k.repoService.register({ path: dir })).resolves.toMatchObject({ path: dir });
  });

  it('UC-19 folder missing / is a file / relative path / empty → error on the path field, nothing written', async () => {
    const before = k.db.repos.size;
    const file = join(tmpDir(), 'a.txt');
    writeFileSync(file, 'x');
    expect(await issuesOf(k.repoService.register({ path: join(tmpdir(), 'missing-lc23-xyz') }))).toEqual(['path:notDirectory']);
    expect(await issuesOf(k.repoService.register({ path: file }))).toEqual(['path:notDirectory']);
    expect(await issuesOf(k.repoService.register({ path: 'relative/path' }))).toEqual(['path:invalid']);
    expect(await issuesOf(k.repoService.register({ path: '  ' }))).toEqual(['path:required']);
    expect(await issuesOf(k.repoService.register({ path: tmpDir(), name: 'a'.repeat(81) }))).toEqual(['name:tooLong']);
    expect(k.db.repos.size).toBe(before);
  });

  it('UC-19 duplicate path → REPO_PATH_TAKEN; duplicate name (case-insensitive) → REPO_NAME_TAKEN', async () => {
    const dir = tmpDir();
    await k.repoService.register({ path: dir, name: 'Atlas' });
    await expect(k.repoService.register({ path: dir, name: 'other' })).rejects.toMatchObject({ code: 'REPO_PATH_TAKEN' });
    await expect(k.repoService.register({ path: tmpDir(), name: 'ATLAS' })).rejects.toMatchObject({ code: 'REPO_NAME_TAKEN' });
  });

  it('UC-20 delete: no loop uses it → it disappears; a loop still uses it (archived included) → REPO_IN_USE naming the loop', async () => {
    const free = await k.repoService.register({ path: tmpDir() });
    await k.repoService.remove(free.id);
    expect(k.db.repos.has(free.id)).toBe(false);
    await expect(k.repoService.remove(free.id)).rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });

    const used = await k.repoService.register({ path: tmpDir() });
    const archived = await k.loopService.create(k.input({ name: 'Archived', repoId: used.id }));
    await k.loopService.archive(archived.id);
    await expect(k.repoService.remove(used.id)).rejects.toMatchObject({ code: 'REPO_IN_USE', details: { loops: ['Archived'] } });
    expect(k.db.repos.has(used.id)).toBe(true);
  });
});

describe('Loop tied to a repo', () => {
  it('UC-21 create / edit: missing repo → required, unknown repo → unknownRepo; the repo can be changed; the view carries the repo', async () => {
    expect(await issuesOf(k.loopService.create(k.input({ repoId: undefined })))).toEqual(['repoId:required']);
    expect(await issuesOf(k.loopService.create(k.input({ repoId: '00000000-0000-4000-8000-000000000000' })))).toEqual([
      'repoId:unknownRepo',
    ]);
    expect(k.db.loops.size).toBe(0);
    const other = k.addRepo('other');
    const loop = await k.loopService.create(k.input({ name: 'L' }));
    expect(loop.repo).toEqual(k.repo);
    const v2 = await k.loopService.update(loop.id, k.input({ name: 'L', repoId: other.id }), loop.version);
    expect(v2.repo.id).toBe(other.id);
    expect(k.db.loops.get(loop.id)?.repoId).toBe(other.id);
    const copy = await k.loopService.duplicate(loop.id);
    expect(copy.repo.id).toBe(other.id);
  });

  it('UC-21 empty / null timeout = unlimited; a value must still be 60–86 400', async () => {
    const a = await k.loopService.create(k.input({ timeoutSec: undefined }));
    const b = await k.loopService.create(k.input({ timeoutSec: null }));
    expect([a.timeoutSec, b.timeoutSec, k.db.loops.get(a.id)?.timeoutSec]).toEqual([null, null, null]);
    expect(await issuesOf(k.loopService.create(k.input({ timeoutSec: 59 })))).toEqual(['timeoutSec:outOfRange']);
  });

  it('UC-25 filter the list by repo', async () => {
    const other = k.addRepo('other');
    const a = await k.loopService.create(k.input());
    const b = await k.loopService.create(k.input({ repoId: other.id }));
    expect((await k.loopService.list({ repoId: other.id })).map((l) => l.id)).toEqual([b.id]);
    expect((await k.loopService.list({ repoId: k.repo.id })).map((l) => l.id)).toEqual([a.id]);
    expect((await k.loopService.list({})).map((l) => l.repo.name).sort()).toEqual([k.repo.name, 'other'].sort());
  });
});

describe('Runs inside the repo folder', () => {
  it('the executor receives input.cwd = the repo path; changing the loop repo → applies from the next run', async () => {
    const other = k.addRepo('other');
    const loop = await k.loopService.create(k.input());
    await k.loopService.start(loop.id);
    await flush();
    expect(k.scripted.call(1).input.cwd).toBe(k.repo.path);
    await k.loopService.update(loop.id, k.input({ name: loop.name, repoId: other.id }), loop.version);
    k.scripted.call(1).succeed();
    await k.tickAt(at(5 * MIN));
    expect(k.scripted.call(2).input.cwd).toBe(other.path);
  });

  it('UC-23 repo folder deleted while the loop is running → run failed "Repo does not exist", the loop keeps going, the next tick is normal', async () => {
    const dir = tmpDir();
    const repo = await k.repoService.register({ path: dir });
    const loop = await k.loopService.create(k.input({ repoId: repo.id, executor: { kind: 'claude' } }));
    await k.loopService.start(loop.id);
    const done = (n: number) => () => [...k.db.runs.values()].some((r) => r.iteration === n && r.status !== 'running');
    await until(done(1), 'run #1 done'); // the executor stat()s the real folder — wait for IO, not just flush
    const first = [...k.db.runs.values()][0]!;
    expect(first).toMatchObject({ status: 'succeeded', iteration: 1 });
    expect(k.claudeQuery.calls[0]?.options.cwd).toBe(dir);

    rmSync(dir, { recursive: true });
    await k.tickAt(at(5 * MIN));
    await until(done(2), 'run #2 done');
    const second = [...k.db.runs.values()].find((r) => r.iteration === 2)!;
    expect(second).toMatchObject({ status: 'failed', error: `Repo does not exist: ${dir}`, sessionId: null });
    expect(k.claudeQuery.calls).toHaveLength(1); // no session is opened for the broken run
    expect(k.db.loops.get(loop.id)?.status).toBe('active');

    mkdirSync(dir); // the folder is back → the next tick runs normally
    await k.tickAt(at(10 * MIN));
    await until(done(3), 'run #3 done');
    expect([...k.db.runs.values()].find((r) => r.iteration === 3)).toMatchObject({ status: 'succeeded' });
  });

  it('UC-24 empty timeout: the run has no deadline, advancing the clock 2 days still leaves it running, never timed_out', async () => {
    const loop = await k.loopService.create(k.input({ timeoutSec: null, cron: '0 0 1 1 *' }));
    await k.loopService.start(loop.id);
    await flush();
    const run = [...k.db.runs.values()][0]!;
    expect(run).toMatchObject({ status: 'running', deadlineAt: null });
    for (const t of [MIN, DAY, 2 * DAY + MIN]) expect((await k.tickAt(at(t))).timedOut).toBe(0);
    expect(k.db.runs.get(run.id)).toMatchObject({ status: 'running', finishedAt: null });
    expect(k.scripted.call(1).signal.aborted).toBe(false);
    k.scripted.call(1).succeed();
    await flush();
    expect(k.db.runs.get(run.id)?.status).toBe('succeeded');
  });
});
