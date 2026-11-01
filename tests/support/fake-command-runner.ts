// A CommandRunner for service tests: records each request, and the test decides each result. No process opens.
import type { CommandRequest, CommandResult, CommandRunner } from '../../server/ports/command-runner';

export const commandOk = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '', timedOut: false, error: null });

export class FakeCommandRunner implements CommandRunner {
  readonly calls: CommandRequest[] = [];
  /** Replace it in a test. A pending promise is a hung command. A throw breaks the port's rule on purpose. */
  reply: (req: CommandRequest) => CommandResult | Promise<CommandResult> = () => commandOk('{"v":1,"action":"skip"}');

  async run(req: CommandRequest): Promise<CommandResult> {
    this.calls.push(req);
    return this.reply(req);
  }
}
