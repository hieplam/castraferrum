import { describe, expect, test } from 'vitest';
import summaries from '../../tests/fixtures/run-summaries.json';
import { parseRunEnd } from './run-end';

const pr = 'https://github.com/o/r/pull/7';

describe('parseRunEnd', () => {
  test('returns null for all real run summaries (masked fixture)', () => {
    expect(summaries.length).toBe(167);
    for (const s of summaries) expect(parseRunEnd(s)).toBeNull();
  });

  test('returns null for empty text', () => {
    expect(parseRunEnd('')).toBeNull();
    expect(parseRunEnd('  \n\n ')).toBeNull();
  });

  test('returns null when text is followed by a cut line', () => {
    expect(parseRunEnd('Did the work.\n{"epic":63,')).toBeNull();
  });

  test('returns null when prose follows the JSON line', () => {
    expect(parseRunEnd('{"result":"DONE"}\nThat is all.')).toBeNull();
  });

  test('returns null for an object without result', () => {
    expect(parseRunEnd('{"a":1}')).toBeNull();
  });

  test('returns null for a JSON array', () => {
    expect(parseRunEnd('[1]')).toBeNull();
  });

  test('reads PR_OPEN with its pull request', () => {
    const line = `{"epic":217,"issue":141,"result":"PR_OPEN","pr":"${pr}","resource":null,"note":"x"}`;
    expect(parseRunEnd(`text\n${line}`)).toEqual({
      result: 'PR_OPEN',
      pr,
      resource: null,
    });
  });

  test('reads RESOURCE_DOWN with its resource', () => {
    expect(parseRunEnd('{"result":"RESOURCE_DOWN","pr":null,"resource":"docker"}')).toEqual({
      result: 'RESOURCE_DOWN',
      pr: null,
      resource: 'docker',
    });
  });

  test('sets resource to null when the line has no resource', () => {
    expect(parseRunEnd('{"result":"DONE"}')).toEqual({
      result: 'DONE',
      pr: null,
      resource: null,
    });
  });

  test('ignores CRLF line ends and trailing blank lines', () => {
    expect(parseRunEnd('a\r\n{"result":"DONE"}\r\n\r\n   \r\n')).toEqual({
      result: 'DONE',
      pr: null,
      resource: null,
    });
  });

  test('strips outer backticks', () => {
    const want = { result: 'DONE', pr: null, resource: null };
    expect(parseRunEnd('`{"result":"DONE"}`')).toEqual(want);
    expect(parseRunEnd('```{"result":"DONE"}```')).toEqual(want);
  });

  test('turns a non-string pr or resource into null', () => {
    expect(parseRunEnd('{"result":"PR_OPEN","pr":7,"resource":{"a":1}}')).toEqual({
      result: 'PR_OPEN',
      pr: null,
      resource: null,
    });
  });

  test('reads the JSON line inside a fenced block at the end of the text', () => {
    const want = { result: 'PR_OPEN', pr, resource: null };
    const json = `{"result":"PR_OPEN","pr":"${pr}"}`;
    expect(parseRunEnd(`Done.\n\n\`\`\`json\n${json}\n\`\`\`\n`)).toEqual(want);
    expect(parseRunEnd(`${json}\n\n\`\`\`\`\n`)).toEqual(want);
  });

  test('returns null for a final fence with prose before it', () => {
    expect(parseRunEnd('Some prose.\n```')).toBeNull();
    expect(parseRunEnd('{"result":"DONE"}\nprose\n```ts')).toBeNull();
  });

  test('keeps an unknown result word', () => {
    expect(parseRunEnd('{"result":"FOO"}')?.result).toBe('FOO');
  });
});
