import { describe, expect, it } from 'vitest';
import { databaseUrl, defaultEpicScript, loadConfig, readPort, redactUrl } from './config';

describe('config', () => {
  it('defaults: port 7070, the loops DB on the compose Postgres (55432)', () => {
    const cfg = loadConfig({});
    expect(cfg.port).toBe(7070);
    expect(cfg.databaseUrl).toBe('postgres://loops:loops@127.0.0.1:55432/loops');
    expect(cfg.testMode).toBe(false);
    expect(cfg.mockExecutor).toBe(false); // phase 2: the real console has no Mock
  });

  it('Mock is for tests only: on with test mode or LOOPS_MOCK_EXECUTOR=1, and only with a *_test DB', () => {
    expect(loadConfig({ LOOPS_TEST_MODE: '1' }).mockExecutor).toBe(true);
    expect(loadConfig({ LOOPS_MOCK_EXECUTOR: '1', DATABASE_URL: 'postgres://u:p@127.0.0.1:55432/loops_x_test' }).mockExecutor).toBe(true);
    expect(() => loadConfig({ LOOPS_MOCK_EXECUTOR: '1' })).toThrow(/LOOPS_MOCK_EXECUTOR=1 may only run against a DB named \*_test/);
  });

  it('LOOPS_GH_BIN replaces the gh program, and gh is the default', () => {
    expect(loadConfig({}).ghBin).toBe('gh');
    expect(loadConfig({ LOOPS_GH_BIN: 'fake-gh.mjs', DATABASE_URL: 'postgres://u:p@127.0.0.1:55432/loops_x_test' }).ghBin).toBe('fake-gh.mjs');
  });

  it('LOOPS_EPIC_SCRIPT replaces the script of the epic-loop skill', () => {
    expect(loadConfig({}).epicScript).toBe(defaultEpicScript());
    expect(defaultEpicScript()).toMatch(/\.claude[\\/]skills[\\/]epic-loop[\\/]scripts[\\/]epic\.mjs$/);
    expect(loadConfig({ LOOPS_EPIC_SCRIPT: '/x/epic.mjs' }).epicScript).toBe('/x/epic.mjs');
  });

  it('LOOPS_GH_BIN is refused unless the DB is named *_test', () => {
    expect(() => loadConfig({ LOOPS_GH_BIN: 'fake-gh.mjs' })).toThrow(
      /LOOPS_GH_BIN may only run against a DB named \*_test/,
    );
  });

  it('LOOPS_TRANSCRIPT_PAGE only takes effect in test mode and must be an integer ≥ 1', () => {
    expect(loadConfig({ LOOPS_TEST_MODE: '1', LOOPS_TRANSCRIPT_PAGE: '3' }).transcriptPage).toEqual({ minEntries: 3, maxBytes: 4 * 1024 * 1024 });
    expect(loadConfig({ LOOPS_TEST_MODE: '1' }).transcriptPage).toBeUndefined();
    expect(loadConfig({ LOOPS_TRANSCRIPT_PAGE: '3' }).transcriptPage).toBeUndefined();
    expect(() => loadConfig({ LOOPS_TEST_MODE: '1', LOOPS_TRANSCRIPT_PAGE: '0' })).toThrow(/LOOPS_TRANSCRIPT_PAGE=0/);
  });

  it('LOOPS_PG_PORT changes the port of both the real DB and the test DB', () => {
    expect(databaseUrl({ LOOPS_PG_PORT: '6543' }, 'main')).toBe('postgres://loops:loops@127.0.0.1:6543/loops');
    expect(databaseUrl({ LOOPS_PG_PORT: '6543' }, 'test')).toBe('postgres://loops:loops@127.0.0.1:6543/loops_test');
  });

  it('test mode uses loops_test by default', () => {
    expect(loadConfig({ LOOPS_TEST_MODE: '1' }).databaseUrl).toMatch(/\/loops_test$/);
  });

  it('test mode pointing at a DB that is not *_test → refuses to start', () => {
    expect(() => loadConfig({ LOOPS_TEST_MODE: '1', DATABASE_URL: 'postgres://u:p@127.0.0.1:55432/loops' })).toThrow(
      /may only run against a DB named \*_test/,
    );
  });

  it('invalid port → clear error', () => {
    expect(() => readPort({ LOOPS_PORT: 'abc' }, 'LOOPS_PORT', 7070)).toThrow(/LOOPS_PORT=abc/);
  });

  it('hides the password when printing a URL', () => {
    expect(redactUrl('postgres://loops:secret@127.0.0.1:55432/loops')).toBe('postgres://loops:***@127.0.0.1:55432/loops');
  });

  it('LOOPS_NOTIFY_WEBHOOK is unset by default, and an http or https URL is kept', () => {
    expect(loadConfig({}).notifyWebhook).toBeUndefined();
    expect(loadConfig({ LOOPS_NOTIFY_WEBHOOK: 'http://127.0.0.1:9/hook' }).notifyWebhook).toBe('http://127.0.0.1:9/hook');
  });

  it('LOOPS_NOTIFY_WEBHOOK that is not an http or https URL → refuses to start without echoing the value', () => {
    expect(() => loadConfig({ LOOPS_NOTIFY_WEBHOOK: 'not a url' })).toThrow(/not a valid URL/);
    expect(() => loadConfig({ LOOPS_NOTIFY_WEBHOOK: 'ftp://example.invalid/x' })).toThrow(/http:\/\/ or https:\/\//);
  });
});
