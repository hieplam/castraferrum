/** A command to run with no shell: `argv[0]` is the program, the rest are its literal arguments. */
export type CommandRequest = {
  argv: string[];
  cwd: string;
  timeoutMs: number;
  /** Variables added to the console's own environment. */
  env?: Record<string, string>;
  /** Each of stdout and stderr keeps its last `maxBytes` bytes. Default 1 MiB. */
  maxBytes?: number;
  /** On Windows, give the arguments to the program exactly as written, with no escaping. Other platforms ignore it. */
  windowsVerbatimArguments?: boolean;
};

export type CommandResult = {
  /** `null` when the command did not start, was killed, or timed out. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Why the command did not start or could not be run to the end; `null` otherwise. */
  error: string | null;
};

export interface CommandRunner {
  /** Never rejects. A hung command is killed with its whole process tree after `timeoutMs`. */
  run(req: CommandRequest): Promise<CommandResult>;
}
