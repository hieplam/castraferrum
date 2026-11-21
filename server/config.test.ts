import { describe, expect, it } from 'vitest';
import { databaseUrl, defaultEpicScript, isLoopbackHost, loadConfig, networkLines, networkUrls, NETWORK_WARNING, parseArgs, readPort, redactUrl, SIGN_IN_HINT, signInLines, UsageError, USAGE } from './config';

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
      expect(() => loadConfig({ npm_config_host: 'true' }, ['0.0.0.0'])).toThrow(/unexpected argument \(7 characters\)/);
    });

    it('a bare word never appears in the message: it can be a token (npm start --cloudflare <token>, goal G9)', () => {
      const token = 'eyJfaketoken-not-a-secret-0123456789';
      let message = '';
      try {
        loadConfig({ npm_config_cloudflare: 'true' }, [token]);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain(`unexpected argument (${token.length} characters)`);
      expect(message).toContain('--cloudflare=<token>');
      expect(message).not.toContain('eyJfaketoken');
      expect(message).not.toContain(token);
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

    describe('credentials (remote-access spec D1, D2)', () => {
      it('--username and --password turn sign-in on, in the = form and the space form', () => {
        expect(loadConfig({}, ['--username=u', '--password=password1']).auth).toEqual({ username: 'u', password: 'password1' });
        expect(loadConfig({}, ['--username', 'u', '--password', 'password1']).auth).toEqual({ username: 'u', password: 'password1' });
      });

      it('npm_config_username plus npm_config_password (npm start --username=u --password=p)', () => {
        expect(loadConfig({ npm_config_username: 'u', npm_config_password: 'password1' }, []).auth).toEqual({ username: 'u', password: 'password1' });
      });

      it('LOOPS_USERNAME plus LOOPS_PASSWORD (environment or .env)', () => {
        expect(loadConfig({ LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'password1' }, []).auth).toEqual({ username: 'u', password: 'password1' });
      });

      it('precedence: argument beats npm_config_<name>, which beats LOOPS_<NAME>', () => {
        const env = { npm_config_username: 'npm', npm_config_password: 'npm-password', LOOPS_USERNAME: 'env', LOOPS_PASSWORD: 'env-password' };
        expect(loadConfig(env, []).auth).toEqual({ username: 'npm', password: 'npm-password' });
        expect(loadConfig(env, ['--username=arg', '--password=arg-password']).auth).toEqual({ username: 'arg', password: 'arg-password' });
        expect(loadConfig({ LOOPS_USERNAME: 'env', LOOPS_PASSWORD: 'env-password' }, ['--password=arg-password']).auth).toEqual({
          username: 'env',
          password: 'arg-password',
        });
      });

      it('a username alone or a password alone is a usage error that names the missing flag', () => {
        expect(() => loadConfig({}, ['--username=u'])).toThrow(UsageError);
        expect(() => loadConfig({}, ['--username=u'])).toThrow('--password is missing');
        expect(() => loadConfig({}, ['--password=password1'])).toThrow('--username is missing');
        expect(() => loadConfig({ LOOPS_PASSWORD: 'password1' }, [])).toThrow('--username is missing');
      });

      it('a password shorter than 8 characters throws, and the message does not echo it', () => {
        let caught: unknown;
        try {
          loadConfig({}, ['--username=u', '--password=seven77']);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(UsageError);
        expect((caught as Error).message).toBe('the password needs at least 8 characters');
        expect(loadConfig({}, ['--username=u', '--password=eight888']).auth?.password).toBe('eight888');
      });

      it('neither gives auth undefined; empty values count as unset', () => {
        expect(loadConfig({}, []).auth).toBeUndefined();
        expect(loadConfig({ LOOPS_USERNAME: '', LOOPS_PASSWORD: '' }, []).auth).toBeUndefined();
      });

      it('a bare --username through npm (npm_config_username=true) is not a username', () => {
        expect(() => loadConfig({ npm_config_username: 'true', npm_config_password: 'password1' }, [])).toThrow(/--username needs a value/);
      });

      it('USAGE lists both flags and says a command line is visible to other processes and to shell history', () => {
        for (const word of ['--username', '--password', 'LOOPS_USERNAME', 'LOOPS_PASSWORD', 'shell history', '.env']) expect(USAGE).toContain(word);
      });
    });

    it('USAGE lists every flag with its environment variable', () => {
      for (const word of ['--host', '--remote', '--port', '--help', 'LOOPS_HOST', 'LOOPS_REMOTE', 'LOOPS_PORT', '127.0.0.1', '7070']) {
        expect(USAGE).toContain(word);
      }
    });
  });
});

describe('networkUrls', () => {
  const iface = (address: string, internal = false, family: 'IPv4' | 'IPv6' = 'IPv4') => ({
    address,
    family,
    internal,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    cidr: null,
    scopeid: 0,
  });
  const nics = {
    lo: [iface('127.0.0.1', true)],
    wifi: [iface('192.168.1.20'), iface('fe80::1', false, 'IPv6')],
    eth: [iface('10.0.0.7')],
  };

  it('0.0.0.0 lists one URL per non-internal IPv4 address (two interfaces, two URLs)', () => {
    expect(networkUrls('0.0.0.0', 7070, nics)).toEqual(['http://192.168.1.20:7070', 'http://10.0.0.7:7070']);
  });

  it('a specific address lists that URL only', () => {
    expect(networkUrls('192.168.1.20', 7171, nics)).toEqual(['http://192.168.1.20:7171']);
  });

  it('127.0.0.1 lists no network URL and needs no warning', () => {
    expect(networkUrls('127.0.0.1', 7070, nics)).toEqual([]);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.20')).toBe(false);
    expect(NETWORK_WARNING).toBe('Warning: anyone on this network can open the console and run agents on this machine.');
  });

  it('0.0.0.0 drops link-local 169.254.x.x and lists a virtual adapter after the real ones (issue 451)', () => {
    const windows = {
      'vEthernet (WSL)': [iface('172.20.80.1')],
      Ethernet: [iface('169.254.56.112')],
      'Wi-Fi': [iface('192.168.1.23')],
    };
    expect(networkUrls('0.0.0.0', 7070, windows)).toEqual(['http://192.168.1.23:7070', 'http://172.20.80.1:7070']);
    expect(networkLines('0.0.0.0', 7070, windows)).toEqual([
      'On your network: http://192.168.1.23:7070',
      'On your network: http://172.20.80.1:7070 (virtual, this PC only)',
    ]);
  });

  it('marks an interface named WSL or Hyper-V as virtual, and keeps 10.x and 172.16-31.x addresses', () => {
    const nics2 = {
      'Hyper-V Virtual Ethernet': [iface('172.31.0.1')],
      eth0: [iface('10.0.0.7')],
      'WSL bridge': [iface('172.16.5.5')],
      wlan: [iface('172.18.0.9')],
    };
    expect(networkLines('0.0.0.0', 7070, nics2)).toEqual([
      'On your network: http://10.0.0.7:7070',
      'On your network: http://172.18.0.9:7070',
      'On your network: http://172.31.0.1:7070 (virtual, this PC only)',
      'On your network: http://172.16.5.5:7070 (virtual, this PC only)',
    ]);
  });

  it('a specific address prints one line without a virtual mark', () => {
    expect(networkLines('192.168.1.20', 7171, nics)).toEqual(['On your network: http://192.168.1.20:7171']);
  });

  describe('startup sign-in lines (remote-access spec D12)', () => {
    it('with credentials: Sign-in: on (user <name>), on loopback and beyond, never the password and never the warning', () => {
      const auth = { username: 'u', password: 'password1' };
      expect(signInLines('127.0.0.1', auth)).toEqual(['Sign-in: on (user u)']);
      expect(signInLines('0.0.0.0', auth)).toEqual(['Sign-in: on (user u)']);
      expect(signInLines('0.0.0.0', auth).join('\n')).not.toContain('password1');
    });

    it('without credentials beyond loopback: the phase 1 warning plus the hint; on loopback: nothing', () => {
      expect(SIGN_IN_HINT).toBe('Set --username and --password to require sign-in.');
      expect(signInLines('0.0.0.0', undefined)).toEqual([NETWORK_WARNING, SIGN_IN_HINT]);
      expect(signInLines('192.168.1.20', undefined)).toEqual([NETWORK_WARNING, SIGN_IN_HINT]);
      expect(signInLines('127.0.0.1', undefined)).toEqual([]);
    });
  });

  it('0.0.0.0 on a machine with no non-internal IPv4 address lists nothing', () => {
    expect(networkUrls('0.0.0.0', 7070, { lo: [iface('127.0.0.1', true)] })).toEqual([]);
  });
});

describe('--public-url (local-name spec D9)', () => {
  it('reads the flag, npm_config_public_url and LOOPS_PUBLIC_URL, in that order', () => {
    expect(loadConfig({}, ['--public-url=https://castra.example.com']).publicUrl).toBe('https://castra.example.com');
    expect(loadConfig({ npm_config_public_url: 'https://npm.example.com' }).publicUrl).toBe('https://npm.example.com');
    expect(loadConfig({ LOOPS_PUBLIC_URL: 'https://env.example.com' }).publicUrl).toBe('https://env.example.com');
    expect(loadConfig({ LOOPS_PUBLIC_URL: 'https://env.example.com', npm_config_public_url: 'https://npm.example.com' }, ['--public-url=https://arg.example.com']).publicUrl).toBe('https://arg.example.com');
    expect(loadConfig({}).publicUrl).toBeUndefined();
  });

  it('a value that is not an absolute https URL is a usage error', () => {
    for (const bad of ['http://x', 'castra.example.com', 'https://']) {
      expect(() => loadConfig({}, [`--public-url=${bad}`])).toThrow(UsageError);
    }
    expect(() => loadConfig({}, ['--public-url=http://x'])).toThrow('--public-url must start with https://');
    expect(() => loadConfig({ LOOPS_PUBLIC_URL: 'http://x' })).toThrow('--public-url must start with https://');
  });

  it('is listed in the usage text', () => {
    expect(USAGE).toContain('--public-url');
  });
});

describe('--cloudflare and --cloudflared (remote-access spec D7, D8)', () => {
  const creds = { LOOPS_USERNAME: 'owner', LOOPS_PASSWORD: 'password1' };

  it('--cloudflare, npm_config_cloudflare and LOOPS_CLOUDFLARE each set the token, in that order', () => {
    expect(loadConfig(creds, ['--cloudflare=t']).tunnel?.token).toBe('t');
    expect(loadConfig({ ...creds, npm_config_cloudflare: 'npm-t' }).tunnel?.token).toBe('npm-t');
    expect(loadConfig({ ...creds, LOOPS_CLOUDFLARE: 'env-t' }).tunnel?.token).toBe('env-t');
    expect(loadConfig({ ...creds, LOOPS_CLOUDFLARE: 'env-t', npm_config_cloudflare: 'npm-t' }, ['--cloudflare=arg-t']).tunnel?.token).toBe('arg-t');
    expect(loadConfig({ ...creds, LOOPS_CLOUDFLARE: 'env-t' }, ['--cloudflare', 'space-t']).tunnel?.token).toBe('space-t');
    expect(loadConfig(creds).tunnel).toBeUndefined();
    expect(loadConfig({ ...creds, LOOPS_CLOUDFLARE: '' }).tunnel).toBeUndefined();
  });

  it('--cloudflare without credentials is a usage error: a tunnel needs --username and --password', () => {
    expect(() => loadConfig({}, ['--cloudflare=t'])).toThrow(UsageError);
    expect(() => loadConfig({}, ['--cloudflare=t'])).toThrow('a tunnel needs --username and --password');
    expect(() => loadConfig({ LOOPS_CLOUDFLARE: 't' })).toThrow('a tunnel needs --username and --password');
    expect(() => loadConfig({ npm_config_cloudflare: 't' })).toThrow('a tunnel needs --username and --password');
  });

  it('the message of a usage error never holds the token', () => {
    try {
      loadConfig({}, ['--cloudflare=secret-token-value']);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('secret-token-value');
    }
  });

  it('--cloudflared: default cloudflared on PATH; a path that ends in .mjs runs with the current Node binary', () => {
    expect(loadConfig(creds, ['--cloudflare=t']).tunnel?.command).toEqual(['cloudflared']);
    expect(loadConfig(creds, ['--cloudflare=t', '--cloudflared=C:/tools/cloudflared.exe']).tunnel?.command).toEqual(['C:/tools/cloudflared.exe']);
    expect(loadConfig({ ...creds, LOOPS_CLOUDFLARED: 'fake.mjs' }, ['--cloudflare=t']).tunnel?.command).toEqual([process.execPath, 'fake.mjs']);
    expect(loadConfig({ ...creds, npm_config_cloudflared: 'npm.mjs', LOOPS_CLOUDFLARED: 'env.mjs' }, ['--cloudflare=t']).tunnel?.command).toEqual([process.execPath, 'npm.mjs']);
    expect(loadConfig(creds, ['--cloudflare=t', '--cloudflared=FAKE.MJS']).tunnel?.command).toEqual([process.execPath, 'FAKE.MJS']);
  });

  it('a bare npm --cloudflare (npm_config_cloudflare=true) is a usage error, not the token "true"', () => {
    expect(() => loadConfig({ ...creds, npm_config_cloudflare: 'true' })).toThrow('--cloudflare needs a value');
  });

  it('both flags are listed in the usage text with their variables', () => {
    for (const word of ['--cloudflare=<token>', 'LOOPS_CLOUDFLARE', '--cloudflared=<path>', 'LOOPS_CLOUDFLARED']) expect(USAGE).toContain(word);
  });
});
