#!/usr/bin/env node
// Prints Windows Task Scheduler XML that starts the console at log-on. It never installs the task:
// this file imports nothing that can run a program, and the owner runs the printed schtasks line.
//
//   node scripts/logon-task.mjs [--console-dir <abs>] [--port 7070] [--task-name Castraferrum] [--out <file>]
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const xmlEscape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// PowerShell single-quoted string: a quote is doubled.
const psQuote = (s) => `'${s.replace(/'/g, "''")}'`;

export function buildTaskXml({ consoleDir, port }) {
  const command =
    `$env:LOOPS_PORT=${psQuote(String(port))}; ` + `Set-Location -LiteralPath ${psQuote(consoleDir)}; npm start`;
  const args = `-NoProfile -WindowStyle Hidden -Command ${command}`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Starts the Castraferrum console at log-on.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT1M</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>10</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>${xmlEscape(args)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

class UsageError extends Error {}

export function parseArgs(argv) {
  const opts = {
    consoleDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    port: 7070,
    taskName: 'Castraferrum',
    out: null,
  };
  const flags = { '--console-dir': 'consoleDir', '--port': 'port', '--task-name': 'taskName', '--out': 'out' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = flags[argv[i]];
    if (!key) throw new UsageError(`unknown argument ${argv[i]}`);
    if (argv[i + 1] === undefined) throw new UsageError(`${argv[i]} needs a value`);
    opts[key] = argv[i + 1];
  }
  if (!path.win32.isAbsolute(opts.consoleDir)) throw new UsageError('--console-dir must be an absolute Windows path');
  if (!/^\d+$/.test(String(opts.port)) || Number(opts.port) < 1 || Number(opts.port) > 65535) {
    throw new UsageError('--port must be an integer from 1 to 65535');
  }
  opts.port = Number(opts.port);
  if (!opts.taskName || /["\r\n]/.test(opts.taskName)) throw new UsageError('--task-name must not be empty or hold a double quote');
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`logon-task: ${e.message}\n`);
    process.exit(2);
  }
  const xml = buildTaskXml(opts);
  if (!opts.out) {
    process.stdout.write(xml);
    return;
  }
  const file = path.resolve(opts.out);
  writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
  process.stdout.write(`schtasks /Create /TN "${opts.taskName}" /XML "${file}"\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
