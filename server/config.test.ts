import { describe, expect, it } from 'vitest';
import { databaseUrl, defaultEpicScript, loadConfig, parseArgs, readPort, redactUrl, UsageError, USAGE } from './config';

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

  describe('command-line flags (spec D2, D9)', () => {
    it('defaults: host 127.0.0.1 and no help', () => {
      const cfg = loadConfig({}, []);
      expect(cfg.host).toBe('127.0.0.1');
      expect(cfg.help).toBe(false);
    });

    it('--host=<address> and the space form --host <address>', () => {
      expect(loadConfig({}, ['--host=0.0.0.0']).host).toBe('0.0.0.0');
      expect(loadConfig({}, ['--host', '0.0.0.0']).host).toBe('0.0.0.0');
    });

    it('precedence: argument beats npm_config_host, which beats LOOPS_HOST, which beats the default', () => {
      expect(loadConfig({ LOOPS_HOST: '10.0.0.1' }, []).host).toBe('10.0.0.1');
      expect(loadConfig({ npm_config_host: '10.0.0.2', LOOPS_HOST: '10.0.0.1' }, []).host).toBe('10.0.0.2');
      expect(loadConfig({ npm_config_host: '10.0.0.2', LOOPS_HOST: '10.0.0.1' }, ['--host=10.0.0.3']).host).toBe('10.0.0.3');
    });

    it('--port=7170, the space form, npm_config_port, and the precedence over LOOPS_PORT', () => {
      expect(loadConfig({}, ['--port=7170']).port).toBe(7170);
      expect(loadConfig({}, ['--port', '7171']).port).toBe(7171);
      expect(loadConfig({ npm_config_port: '7172', LOOPS_PORT: '7173' }, []).port).toBe(7172);
      expect(loadConfig({ npm_config_port: '7172' }, ['--port=7174']).port).toBe(7174);
      expect(loadConfig({ LOOPS_PORT: '7173' }, []).port).toBe(7173);
    });

    it('--port out of range throws the readPort message', () => {
      expect(() => loadConfig({}, ['--port=70000'])).toThrow(/--port=70000 is not a valid port \(1–65535\)/);
      expect(() => loadConfig({ npm_config_port: 'abc' }, [])).toThrow(/npm_config_port=abc is not a valid port/);
    });

    it('an unknown flag throws UsageError with the flag name and the usage text', () => {
      let caught: unknown;
      try {
        parseArgs(['--hots=x']);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(UsageError);
      expect((caught as UsageError).message).toBe('unknown flag --hots');
      expect((caught as UsageError).usage).toBe(USAGE);
      expect(USAGE).toContain('Usage:');
    });

    it('a value flag without a value throws, also when the next token is another flag', () => {
      expect(() => parseArgs(['--host'])).toThrow(/--host needs a value/);
      expect(() => parseArgs(['--host', '--port=1'])).toThrow(/--host needs a value/);
      expect(() => parseArgs(['--port='])).toThrow(/--port needs a value/);
    });

    it('a bare word throws (npm start --host 0.0.0.0 hands the word over as an argument)', () => {
      expect(() => loadConfig({ npm_config_host: 'true' }, ['0.0.0.0'])).toThrow(/unexpected argument 0\.0\.0\.0/);
    });

    it('npm_config_host=true (a bare --host through npm) is not a host', () => {
      expect(() => loadConfig({ npm_config_host: 'true' }, [])).toThrow(/--host needs a value/);
    });

    it('--help sets help: true', () => {
      expect(loadConfig({}, ['--help']).help).toBe(true);
      expect(() => parseArgs(['--help=1'])).toThrow(/--help takes no value/);
    });

    it('--remote is --host=0.0.0.0, from the argument, npm_config_remote=true or LOOPS_REMOTE=1', () => {
      expect(loadConfig({}, ['--remote']).host).toBe('0.0.0.0');
      expect(loadConfig({ npm_config_remote: 'true' }, []).host).toBe('0.0.0.0');
      expect(loadConfig({ LOOPS_REMOTE: '1' }, []).host).toBe('0.0.0.0');
    });

    it('--remote is off for npm_config_remote="" (--no-remote, --remote=false) and LOOPS_REMOTE other than 1', () => {
      expect(loadConfig({ npm_config_remote: '' }, []).host).toBe('127.0.0.1');
      expect(loadConfig({ LOOPS_REMOTE: '0' }, []).host).toBe('127.0.0.1');
    });

    it('--remote beats LOOPS_HOST and npm_config_host', () => {
      expect(loadConfig({ LOOPS_HOST: '192.168.1.5' }, ['--remote']).host).toBe('0.0.0.0');
      expect(loadConfig({ npm_config_host: '192.168.1.5', npm_config_remote: 'true' }, []).host).toBe('0.0.0.0');
    });

    it('--remote together with --host as arguments throws; --remote=yes throws', () => {
      expect(() => loadConfig({}, ['--remote', '--host=0.0.0.0'])).toThrow(/--remote and --host cannot be used together/);
      expect(() => loadConfig({}, ['--host=1.2.3.4', '--remote'])).toThrow(UsageError);
      expect(() => loadConfig({}, ['--remote=yes'])).toThrow(/--remote takes no value/);
    });

    it('USAGE lists every flag with its environment variable', () => {
      for (const word of ['--host', '--remote', '--port', '--help', 'LOOPS_HOST', 'LOOPS_REMOTE', 'LOOPS_PORT', '127.0.0.1', '7070']) {
        expect(USAGE).toContain(word);
      }
    });
  });
});
