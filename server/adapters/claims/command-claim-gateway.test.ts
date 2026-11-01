import { describe, expect, it } from 'vitest';
import { commandOk, FakeCommandRunner } from '../../../tests/support/fake-command-runner';
import { CommandClaimGateway } from './command-claim-gateway';

const cfg = {
  claim: ['epic', 'claim', '{key}'],
  release: ['epic', 'release', '{key}', '--if-claimed', '--reason', '{reason}'],
  cwd: '/repo',
};
const task = { key: '141', resources: [] };
const failed = (stderr: string) => ({ exitCode: 1, stdout: '', stderr, timedOut: false, error: null });
const timedOut = { exitCode: null, stdout: '', stderr: '', timedOut: true, error: null };

function make() {
  const commands = new FakeCommandRunner();
  commands.reply = () => commandOk('');
  return { commands, gateway: new CommandClaimGateway(commands) };
}

describe('CommandClaimGateway', () => {
  it('fills {key} and {reason}, and runs in the folder with a limit of 30 s', async () => {
    const { commands, gateway } = make();
    expect(await gateway.claim(cfg, task)).toEqual({ ok: true });
    await gateway.release(cfg, task, { reason: 'run {key} failed', excused: false });
    expect(commands.calls).toEqual([
      { argv: ['epic', 'claim', '141'], cwd: '/repo', timeoutMs: 30_000 },
      { argv: ['epic', 'release', '141', '--if-claimed', '--reason', 'run {key} failed'], cwd: '/repo', timeoutMs: 30_000 },
    ]);
  });

  it('an empty argv does nothing', async () => {
    const { commands, gateway } = make();
    const none = { claim: [], release: [], cwd: '/repo' };
    expect(await gateway.claim(none, task)).toEqual({ ok: true });
    await gateway.release(none, task, { reason: 'x', excused: true });
    expect(commands.calls).toEqual([]);
  });

  it('a non-zero exit is a refusal with the text of the command', async () => {
    const { commands, gateway } = make();
    commands.reply = () => failed('\ntask 141 is already claimed\n');
    expect(await gateway.claim(cfg, task)).toEqual({ ok: false, reason: 'task 141 is already claimed' });
    commands.reply = () => ({ exitCode: null, stdout: '', stderr: '', timedOut: false, error: 'spawn epic ENOENT' });
    expect(await gateway.claim(cfg, task)).toEqual({ ok: false, reason: 'spawn epic ENOENT' });
  });

  it('a failed release throws, and so does a release that timed out', async () => {
    const { commands, gateway } = make();
    commands.reply = () => failed('gh: 502');
    await expect(gateway.release(cfg, task, { reason: 'x', excused: false })).rejects.toThrow('Release of task 141 failed: gh: 502');
    commands.reply = () => timedOut;
    await expect(gateway.release(cfg, task, { reason: 'x', excused: false })).rejects.toThrow('timed out after 30 s');
  });

  it('every release carries --if-claimed, also from an argv that left it out, and an excused one carries --excused', async () => {
    const { commands, gateway } = make();
    await gateway.release({ ...cfg, release: ['epic', 'release', '{key}', '--reason', '{reason}'] }, task, { reason: 'run interrupted', excused: true });
    await gateway.release(cfg, task, { reason: 'run failed', excused: false });
    expect(commands.calls.map((c) => c.argv)).toEqual([
      ['epic', 'release', '141', '--reason', 'run interrupted', '--if-claimed', '--excused'],
      ['epic', 'release', '141', '--if-claimed', '--reason', 'run failed'],
    ]);
  });

  it('a claim that timed out throws: the command can have set the label, so it is not a refusal', async () => {
    const { commands, gateway } = make();
    commands.reply = () => timedOut;
    await expect(gateway.claim(cfg, task)).rejects.toThrow('Claim of task 141 timed out after 30 s');
  });
});
