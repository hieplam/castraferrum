// The Probe group of the editor (goal G28): the text of each field <-> the probe body, and the server's issues -> fields.
import { describe, expect, it } from 'vitest';
import type { ValidationIssueDto } from '../../../shared/contracts/common';
import type { ProbeDto } from '../../../shared/contracts/goal-loop';
import { argvToText, envToText, probeErrorsFromIssues, probeValuesFrom, textToArgv, textToEnv, toProbeBody } from './probe-form';

const probe: ProbeDto = {
  loopId: 'loop-1',
  command: ['node', 'epic.mjs', 'next', '--probe'],
  claim: ['node', 'epic.mjs', 'claim', '{key}'],
  release: ['node', 'epic.mjs', 'release', '{key}', '{reason}'],
  resources: [{ name: 'docker', check: ['docker', 'info'], everySec: 60 }],
  laneEnv: { DB_NAME: 'loops_{slot}_test', PORT: '{port}' },
  laneBasePort: 7250,
  restartPolicy: 'resume',
  state: 'waiting',
  lastLine: null,
  lastProbeAt: null,
};

describe('argv text', () => {
  it('writes one argument per line and reads it back, with a space kept inside its argument and blank lines dropped', () => {
    const argv = ['node', 'run.mjs', '--title', 'two words'];
    expect(argvToText(argv)).toBe('node\nrun.mjs\n--title\ntwo words');
    expect(textToArgv(argvToText(argv))).toEqual(argv);
    // blank lines and the CR of a Windows line end are dropped
    expect(textToArgv('node\r\n\r\n  \r\nrun.mjs\r\n')).toEqual(['node', 'run.mjs']);
    expect(textToArgv('')).toEqual([]);
  });
});

describe('env text', () => {
  it('writes KEY=value per line and reads it back, splitting at the first = and dropping lines with no key', () => {
    expect(envToText(probe.laneEnv)).toBe('DB_NAME=loops_{slot}_test\nPORT={port}');
    expect(textToEnv(envToText(probe.laneEnv))).toEqual(probe.laneEnv);
    // the first = splits the line; a blank line, a line with no key and a line with no = are dropped
    expect(textToEnv('URL=postgres://u:p@h/db?a=b\n\n=oops\nno equals\n KEY = v ')).toEqual({ URL: 'postgres://u:p@h/db?a=b', KEY: ' v ' });
  });
});

describe('probe body', () => {
  it('maps every field, and sends back the resources of the probe (they have no field)', () => {
    const values = probeValuesFrom(probe);
    expect(values).toMatchObject({ enabled: true, restart: 'resume', basePort: '7250', claim: 'node\nepic.mjs\nclaim\n{key}' });
    expect(toProbeBody(values, probe.resources)).toEqual({
      command: probe.command,
      claim: probe.claim,
      release: probe.release,
      resources: probe.resources,
      laneEnv: probe.laneEnv,
      laneBasePort: 7250,
      restartPolicy: 'resume',
    });
  });

  it('an empty base port is null, and text that is not a number is 0 (the server reports it at the field)', () => {
    const values = probeValuesFrom(probe);
    expect(toProbeBody({ ...values, basePort: '' }).laneBasePort).toBeNull();
    expect(toProbeBody({ ...values, basePort: ' 7251 ' }).laneBasePort).toBe(7251);
    expect(toProbeBody({ ...values, basePort: 'abc' }).laneBasePort).toBe(0);
  });

  it('a loop with no probe starts with the switch off and every field empty', () => {
    expect(probeValuesFrom(null)).toEqual({ enabled: false, command: '', claim: '', release: '', restart: 'stop', basePort: '', laneEnv: '' });
  });
});

describe('server issues', () => {
  it('puts each issue of a probe field under its field, with the server message, and keeps the others apart', () => {
    const issues: ValidationIssueDto[] = [
      { field: 'claim', code: 'missingKey', message: 'The claim command needs the placeholder {key}' },
      { field: 'release', code: 'missingKey', message: 'The release command needs the placeholder {key}' },
      { field: 'release', code: 'missingReason', message: 'The release command needs the placeholder {reason}' },
      { field: 'laneBasePort', code: 'outOfRange', message: 'The base port must be 1024-65000' },
      { field: 'resources', code: 'reserved', message: 'reserved' },
    ];
    const { errors, rest } = probeErrorsFromIssues(issues);
    expect(errors).toEqual({
      claim: 'The claim command needs the placeholder {key}',
      release: 'The release command needs the placeholder {key}',
      laneBasePort: 'The base port must be 1024-65000',
    });
    expect(rest).toEqual([issues[4]]);
  });
});
