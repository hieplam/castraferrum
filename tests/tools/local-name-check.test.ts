// The local-name check tool (phase 3, tasks N0 and N6): every check passes with good fakes, and each failure case fails its own check.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHECK_IDS, nameFromUrl, pcIpFrom, peerCert, runChecks, serverAddress, tlsVerify } from '../../scripts/local-name-check.mjs';

const IP = '192.168.1.50';
const NAME = 'castra.example.com';
const NGINX_OK = { code: 0, stdout: '', stderr: 'nginx: the configuration file x syntax is ok\nnginx: configuration file x test is successful\n' };
const DAY = 86_400_000;
const FROM = Date.parse('2026-11-20T00:00:00Z');
const LIFETIME = 90 * DAY;
const SERIAL = '04A1B2C3D4';

/** A certificate object like `getPeerCertificate()`, `age` is the part of the lifetime that has passed. */
function cert(over: Record<string, unknown> = {}) {
  return {
    issuer: { O: "Let's Encrypt", CN: 'R11' },
    subjectaltname: `DNS:${NAME}`,
    valid_from: new Date(FROM).toUTCString(),
    valid_to: new Date(FROM + LIFETIME).toUTCString(),
    serialNumber: SERIAL,
    ...over,
  };
}
const at = (age: number) => () => FROM + age * LIFETIME;
const INFO = `serial ${SERIAL}, valid ${cert().valid_from} to ${cert().valid_to}`;

type Call = { url: string; method?: string };
const HEALTHY_HTTP = async ({ url, method }: Call) => {
  if (url.startsWith('http://')) return { status: 301, headers: { location: `https://${NAME}/x` } };
  if (method === 'POST') return { status: 200, headers: { 'set-cookie': ['castra_session=abc; Path=/; HttpOnly'] } };
  return { status: 200, headers: {} };
};
const PS_EMPTY = { code: 0, stdout: '', stderr: '' };

/** Fakes that make all 10 checks pass. A test overrides one function. */
function good(over: Record<string, unknown> = {}) {
  return {
    pcIp: IP,
    env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p', LOOPS_PUBLIC_URL: `https://${NAME}` },
    oldTlsDir: 'C:/old/tls',
    listFolder: async () => [] as string[],
    limitMs: 1000,
    nginxConf: 'C:/nginx/conf/nginx.conf',
    now: at(0.5),
    dnsQuery: async () => [IP],
    dnsServers: async () => [IP],
    exec: async (cmd: string) => (cmd === 'powershell.exe' ? PS_EMPTY : NGINX_OK),
    tlsVerify: async () => ({ authorized: true }),
    peerCert: async () => cert(),
    http: HEALTHY_HTTP,
    sseLines: async () => [':ok', ':ping'],
    tcp: async (host: string) => host === '127.0.0.1',
    ...over,
  };
}

async function failing(over: Record<string, unknown>, id: string, failures = 1) {
  const r = await runChecks(good(over));
  expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toMatch(new RegExp(`^FAIL ${id}: .+`));
  expect(r.lines.filter((l: string) => l.startsWith('FAIL'))).toHaveLength(failures);
  expect(r.lines.at(-1)).toBe(`local name: ${10 - failures}/10 checks pass`);
  expect(r.exitCode).toBe(1);
  return r;
}

describe('local-name-check runChecks', () => {
  it('prints 10 PASS lines in order, the total line and exit 0 when all fakes are good', async () => {
    const r = await runChecks(good());
    expect(CHECK_IDS).toEqual(['dns-public', 'dns-pc-servers', 'dns-system', 'nginx-test', 'tls', 'cert-issuer', 'own-issuer-absent', 'redirect', 'sse', 'port-closed']);
    expect(r.lines).toEqual([...CHECK_IDS.map((id) => (id === 'cert-issuer' ? `PASS cert-issuer ${INFO}` : `PASS ${id}`)), 'local name: 10/10 checks pass']);
    expect(r.exitCode).toBe(0);
  });

  it('asks the public server 1.1.1.1, each DNS server of the PC and the system resolver 20 times', async () => {
    const asked: Array<string | null> = [];
    await runChecks(good({ dnsQuery: async (s: string | null) => (asked.push(s), [IP]) }));
    expect(asked.filter((s) => s === '1.1.1.1:53')).toHaveLength(1);
    expect(asked.filter((s) => s === `${IP}:53`)).toHaveLength(1);
    expect(asked.filter((s) => s === null)).toHaveLength(20);
  });

  it('asks the server of --public-dns instead of 1.1.1.1', async () => {
    const asked: Array<string | null> = [];
    await runChecks(good({ publicDns: '9.9.9.9', dnsQuery: async (s: string | null) => (asked.push(s), [IP]) }));
    expect(asked).toContain('9.9.9.9:53');
    expect(asked).not.toContain('1.1.1.1:53');
  });

  it('fails dns-public with both addresses when the public server answers another address', async () => {
    const r = await failing({ dnsQuery: async (s: string | null) => (s === '1.1.1.1:53' ? ['203.0.113.9'] : [IP]) }, 'dns-public');
    expect(r.lines).toContain(`FAIL dns-public: 1.1.1.1 answered 203.0.113.9, expected ${IP}`);
  });

  it('fails dns-public on an empty answer and on a resolver error', async () => {
    await failing({ dnsQuery: async (s: string | null) => (s === '1.1.1.1:53' ? [] : [IP]) }, 'dns-public');
    await failing({ dnsQuery: async (s: string | null) => { if (s === '1.1.1.1:53') throw new Error('ETIMEOUT'); return [IP]; } }, 'dns-public');
  });

  it('fails dns-pc-servers and names the IPv6 server with an empty answer, written as [address]:53', async () => {
    const asked: Array<string | null> = [];
    const r = await failing(
      {
        dnsServers: async () => ['192.0.2.53', 'fd00::53'],
        dnsQuery: async (s: string | null) => {
          asked.push(s);
          if (s === '[fd00::53]:53') return [];
          return [IP];
        },
      },
      'dns-pc-servers',
    );
    expect(asked).toContain('[fd00::53]:53');
    expect(asked).toContain('192.0.2.53:53');
    const line = r.lines.find((l: string) => l.startsWith('FAIL'))!;
    expect(line).toContain('fd00::53 gave an empty answer');
    expect(line).not.toContain('192.0.2.53 gave');
  });

  it('fails dns-pc-servers for each server that gives another answer, and when the adapter lists none', async () => {
    const r = await failing({ dnsServers: async () => ['192.0.2.53', '192.0.2.54'], dnsQuery: async (s: string | null) => (s?.startsWith('192.0.2') ? ['203.0.113.9'] : [IP]) }, 'dns-pc-servers');
    const line = r.lines.find((l: string) => l.startsWith('FAIL'))!;
    expect(line).toContain('192.0.2.53 gave 203.0.113.9');
    expect(line).toContain('192.0.2.54 gave 203.0.113.9');
    await failing({ dnsServers: async () => [] }, 'dns-pc-servers');
  });

  it('writes an IPv6 server as [address]:53 and an IPv4 server as address:53', () => {
    expect(serverAddress('2606:4700:4700::1111')).toBe('[2606:4700:4700::1111]:53');
    expect(serverAddress('1.0.0.1')).toBe('1.0.0.1:53');
  });

  it('fails dns-system when the resolver answers another address once in 20, and when it throws ENOTFOUND', async () => {
    let n = 0;
    await failing({ dnsQuery: async (s: string | null) => (s === null && ++n === 7 ? ['1.1.1.1'] : [IP]) }, 'dns-system');
    await failing({ dnsQuery: async (s: string | null) => { if (s === null) throw new Error('ENOTFOUND'); return [IP]; } }, 'dns-system');
  });

  it('fails nginx-test with "nginx not found" when nginx is missing, and when the test is not successful', async () => {
    const missing = { notFound: true, code: -1, stdout: '', stderr: 'ENOENT' };
    const r = await failing({ exec: async (c: string) => (c === 'powershell.exe' ? PS_EMPTY : missing) }, 'nginx-test');
    expect(r.lines).toContain('FAIL nginx-test: nginx not found');
    await failing({ exec: async (c: string) => (c === 'powershell.exe' ? PS_EMPTY : { code: 1, stdout: '', stderr: 'nginx: [emerg] unknown directive' }) }, 'nginx-test');
  });

  it('passes the deployed config path to nginx -t', async () => {
    const calls: string[][] = [];
    await runChecks(good({ nginxConf: 'D:/x/nginx.conf', exec: async (c: string, a: string[]) => (calls.push([c, ...a]), c === 'powershell.exe' ? PS_EMPTY : NGINX_OK) }));
    expect(calls).toContainEqual(['nginx', '-t', '-c', 'D:/x/nginx.conf']);
  });

  it('runs a given nginx program with its own folder as the prefix, so nginx finds logs/ there and not in the current folder', async () => {
    const calls: string[][] = [];
    await runChecks(good({ nginx: 'D:/web/nginx/nginx.exe', nginxConf: 'D:/web/nginx/conf/site.conf', exec: async (c: string, a: string[]) => (calls.push([c, ...a]), c === 'powershell.exe' ? PS_EMPTY : NGINX_OK) }));
    expect(calls).toContainEqual(['D:/web/nginx/nginx.exe', '-t', '-p', 'D:/web/nginx/', '-c', 'D:/web/nginx/conf/site.conf']);
  });

  it('gives no ca option to any TLS or HTTPS connection', async () => {
    const seen: unknown[][] = [];
    const rec = <T>(f: (...a: never[]) => Promise<T>) => async (...a: unknown[]) => (seen.push(a), (f as (...x: unknown[]) => Promise<T>)(...a));
    await runChecks(
      good({
        tlsVerify: rec(async () => ({ authorized: true })),
        peerCert: rec(async () => cert()),
        http: rec(HEALTHY_HTTP as never),
        sseLines: rec(async () => [':ok', ':ping']),
      }),
    );
    expect(seen.length).toBe(6);
    for (const args of seen) {
      for (const a of args) if (a && typeof a === 'object') expect(Object.keys(a)).not.toContain('ca');
      expect(args.length).toBeLessThanOrEqual(2);
    }
    expect(JSON.stringify(seen)).not.toMatch(/local-ca|\.pem/);
  });

  it('fails tls when the certificate is not trusted, and when /api/health is not 200', async () => {
    await failing({ tlsVerify: async () => ({ authorized: false, error: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' }) }, 'tls');
    await failing({ http: async ({ url, method }: Call) => (url.endsWith('/api/health') ? { status: 502, headers: {} } : HEALTHY_HTTP({ url, method })) }, 'tls');
  });

  it('fails redirect on a wrong status and on a wrong Location', async () => {
    await failing({ http: async ({ url, method }: Call) => (url.startsWith('http://') ? { status: 302, headers: { location: `https://${NAME}/x` } } : HEALTHY_HTTP({ url, method })) }, 'redirect');
    await failing({ http: async ({ url, method }: Call) => (url.startsWith('http://') ? { status: 301, headers: { location: `https://${NAME}/` } } : HEALTHY_HTTP({ url, method })) }, 'redirect');
  });

  it('fails sse without :ping, after the 20 seconds that it asked for', async () => {
    let waited = 0;
    await failing({ sseLines: async ({ waitMs }: { waitMs: number }) => ((waited = waitMs), [':ok']) }, 'sse');
    expect(waited).toBe(20000);
  });

  it('fails sse when the credentials are missing, the sign-in is refused, or no cookie comes back', async () => {
    await failing({ env: { LOOPS_PUBLIC_URL: `https://${NAME}` } }, 'sse');
    await failing({ http: async ({ url, method }: Call) => (method === 'POST' ? { status: 401, headers: {} } : HEALTHY_HTTP({ url, method })) }, 'sse');
    await failing({ http: async ({ url, method }: Call) => (method === 'POST' ? { status: 200, headers: {} } : HEALTHY_HTTP({ url, method })) }, 'sse');
  });

  it('sends the sign-in cookie to the event stream', async () => {
    let cookie = '';
    await runChecks(good({ sseLines: async (o: { cookie: string }) => ((cookie = o.cookie), [':ok', ':ping']) }));
    expect(cookie).toBe('castra_session=abc');
  });

  it('fails port-closed when <pc-ip>:7070 is open, and when 127.0.0.1:7070 is closed', async () => {
    await failing({ tcp: async () => true }, 'port-closed');
    await failing({ tcp: async () => false }, 'port-closed');
  });

  it('fails a check that does not answer within its limit', async () => {
    const r = await runChecks(good({ limitMs: 20, dnsServers: () => new Promise(() => {}) }));
    expect(r.lines).toContain('FAIL dns-pc-servers: no answer within 0.02 s');
    expect(r.lines.at(-1)).toBe('local name: 9/10 checks pass');
  });

  it('fails every address check when no PC IP is known, and still prints 10 lines plus the total', async () => {
    const r = await runChecks(good({ pcIp: undefined }));
    expect(r.lines).toHaveLength(11);
    expect(r.lines.filter((l: string) => l.startsWith('FAIL')).length).toBeGreaterThanOrEqual(4);
    expect(r.exitCode).toBe(1);
  });
});

describe('local-name-check cert-issuer', () => {
  it('fails when the issuer organization is not Let\'s Encrypt', async () => {
    const r = await failing({ peerCert: async () => cert({ issuer: { O: 'Some Other CA' } }) }, 'cert-issuer');
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toContain('Some Other CA');
  });

  it('fails when the name is not in the subject alternative names', async () => {
    await failing({ peerCert: async () => cert({ subjectaltname: 'DNS:other.example.com' }) }, 'cert-issuer');
    await failing({ peerCert: async () => cert({ subjectaltname: undefined }) }, 'cert-issuer');
  });

  it('fails at 80 % of the lifetime and passes at 50 %, with the serial number in both lines', async () => {
    const old = await failing({ now: at(0.8) }, 'cert-issuer');
    expect(old.lines.find((l: string) => l.startsWith('FAIL'))).toContain(`serial ${SERIAL}`);
    const ok = await runChecks(good({ now: at(0.5) }));
    expect(ok.lines).toContain(`PASS cert-issuer ${INFO}`);
  });

  it('fails a certificate that is expired or not valid yet', async () => {
    await failing({ now: at(1.2) }, 'cert-issuer');
    await failing({ now: at(-0.1) }, 'cert-issuer');
  });

  it('fails with the reason when the certificate cannot be read', async () => {
    const r = await failing({ peerCert: async () => { throw new Error('ECONNREFUSED'); } }, 'cert-issuer');
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toContain('ECONNREFUSED');
  });
});

describe('local-name-check own-issuer-absent', () => {
  it('fails when a Root store holds the certificate CN=local home issuer', async () => {
    const calls: string[][] = [];
    const r = await failing(
      { exec: async (c: string, a: string[]) => (c === 'powershell.exe' ? (calls.push(a), { code: 0, stdout: 'CurrentUser\\Root AB12CD\r\n', stderr: '' }) : NGINX_OK) },
      'own-issuer-absent',
    );
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toContain('AB12CD');
    const script = calls[0]!.join(' ');
    expect(script).toContain('CN=local home issuer');
    expect(script).toContain('Cert:\\CurrentUser\\Root');
    expect(script).toContain('Cert:\\LocalMachine\\Root');
  });

  it('fails when the old tls folder holds a file, and passes when it is empty or missing', async () => {
    const r = await failing({ listFolder: async () => ['local-ca.pem'] }, 'own-issuer-absent');
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toContain('local-ca.pem');
    const ok = await runChecks(good({ listFolder: async () => [] }));
    expect(ok.lines).toContain('PASS own-issuer-absent');
  });

  it('fails with the reason when PowerShell is missing or fails', async () => {
    await failing({ exec: async (c: string) => (c === 'powershell.exe' ? { notFound: true, code: -1, stdout: '', stderr: 'ENOENT' } : NGINX_OK) }, 'own-issuer-absent');
    await failing({ exec: async (c: string) => (c === 'powershell.exe' ? { code: 1, stdout: '', stderr: 'access denied' } : NGINX_OK) }, 'own-issuer-absent');
  });
});

describe('local-name-check name checks', () => {
  it('takes the name from the host of LOOPS_PUBLIC_URL and asks DNS for it', async () => {
    const asked: string[] = [];
    await runChecks(good({ env: { LOOPS_PUBLIC_URL: 'https://box.example.com/', LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p' }, dnsQuery: async (_s: string | null, n: string) => (asked.push(n), [IP]) }));
    expect(new Set(asked)).toEqual(new Set(['box.example.com']));
  });

  it('lets --name replace the name of LOOPS_PUBLIC_URL', async () => {
    const asked: string[] = [];
    await runChecks(good({ name: 'other.example.com', dnsQuery: async (_s: string | null, n: string) => (asked.push(n), [IP]) }));
    expect(new Set(asked)).toEqual(new Set(['other.example.com']));
  });

  it('fails the checks that need the name, with the reason, when LOOPS_PUBLIC_URL is missing', async () => {
    const r = await runChecks(good({ env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p' } }));
    const fails = r.lines.filter((l: string) => l.startsWith('FAIL'));
    expect(fails.map((l: string) => l.split(':')[0])).toEqual(['FAIL dns-public', 'FAIL dns-pc-servers', 'FAIL dns-system', 'FAIL tls', 'FAIL cert-issuer', 'FAIL redirect', 'FAIL sse']);
    for (const l of fails) expect(l).toContain('LOOPS_PUBLIC_URL');
    expect(r.exitCode).toBe(1);
  });
});

describe('nameFromUrl', () => {
  it('reads the host of the public address', () => {
    expect(nameFromUrl(`https://${NAME}`)).toBe(NAME);
    expect(() => nameFromUrl(undefined)).toThrow(/LOOPS_PUBLIC_URL/);
    expect(() => nameFromUrl('not a url')).toThrow(/not a URL/);
  });
});

describe('pcIpFrom', () => {
  const nic = (address: string, extra = {}) => ({ address, family: 'IPv4', internal: false, ...extra });
  it('takes the first real IPv4 address, not loopback, link-local or virtual', () => {
    expect(
      pcIpFrom({
        'vEthernet (WSL)': [nic('172.20.0.1')],
        Loopback: [nic('127.0.0.1', { internal: true })],
        Wi: [nic('169.254.3.3'), { address: 'fe80::1', family: 'IPv6', internal: false }, nic(IP)],
      } as never),
    ).toBe(IP);
  });
  it('falls back to a virtual address, and gives undefined when there is none', () => {
    expect(pcIpFrom({ 'vEthernet (WSL)': [nic('172.20.0.1')] } as never)).toBe('172.20.0.1');
    expect(pcIpFrom({} as never)).toBeUndefined();
  });
});

// The real TLS functions against a local TLS server with a throwaway self-signed certificate.
const WIN_OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';
function findOpenssl(): string | undefined {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return 'openssl';
  } catch {
    return existsSync(WIN_OPENSSL) ? WIN_OPENSSL : undefined;
  }
}
const OPENSSL = findOpenssl();

describe.skipIf(!OPENSSL)('the real TLS functions against a self-signed certificate', () => {
  let dir: string;
  let server: tls.Server;
  let port: number;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'local-name-tls-'));
    const subj = '/O=Test Org/CN=localhost';
    execFileSync(OPENSSL!, ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'k.pem', '-out', 'c.pem', '-days', '30', '-subj', subj], { cwd: dir, stdio: 'ignore' });
    server = tls.createServer({ cert: readFileSync(join(dir, 'c.pem')), key: readFileSync(join(dir, 'k.pem')) }, (s) => s.end());
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('tlsVerify gives authorized false with the error code of an untrusted certificate', async () => {
    const v = await tlsVerify('127.0.0.1', port);
    expect(v.authorized).toBe(false);
    expect(v.error).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
  });

  it('a run with the real tlsVerify gives FAIL tls', async () => {
    const r = await runChecks(good({ name: '127.0.0.1', tlsVerify: (h: string) => tlsVerify(h, port) }));
    expect(r.lines).toContain('FAIL tls: certificate not trusted: DEPTH_ZERO_SELF_SIGNED_CERT');
  });

  it('peerCert reads the certificate although it is untrusted, so cert-issuer can name the issuer', async () => {
    const c = await peerCert('127.0.0.1', port);
    expect(c.issuer.O).toBe('Test Org');
    expect(typeof c.serialNumber).toBe('string');
    expect(c.valid_from).toBeTruthy();
    const r = await runChecks(good({ name: 'localhost', peerCert: () => peerCert('127.0.0.1', port), now: () => Date.now() }));
    expect(r.lines.find((l: string) => l.startsWith('FAIL cert-issuer'))).toContain('the issuer organization is Test Org');
  });
});
