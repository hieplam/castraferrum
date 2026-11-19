// The local-name check tool (phase 3, task N0): every check passes with good fakes, and each failure case fails its own check.
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, nameFromUrl, parseNameLimit, pcIpFrom, runChecks } from '../../scripts/local-name-check.mjs';

const IP = '192.168.1.50';
const NAME = 'castra.home.arpa';
const CA_TEXT = `Certificate:
        X509v3 extensions:
            X509v3 Basic Constraints: critical
                CA:TRUE, pathlen:0
            X509v3 Name Constraints: critical
                Permitted:
                  DNS:castra.home.arpa
            X509v3 Subject Key Identifier:
                AB:CD
`;
const NGINX_OK = { code: 0, stdout: '', stderr: 'nginx: the configuration file x syntax is ok\nnginx: configuration file x test is successful\n' };

/** Fakes that make all 10 checks pass. A test overrides one function. */
function good(over: Record<string, unknown> = {}) {
  return {
    pcIp: IP,
    env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p', LOOPS_PUBLIC_URL: `https://${NAME}`, LOCAL_NAME_LIMIT: NAME },
    caPath: 'C:/tls/local-ca.pem',
    caText: async () => CA_TEXT,
    listTls: async () => [
      { name: 'local-ca.pem', privateKey: false },
      { name: `${NAME}.pem`, privateKey: false },
      { name: `${NAME}-key.pem`, privateKey: true },
    ],
    limitMs: 1000,
    nginxConf: 'C:/nginx/conf/nginx.conf',
    dnsQuery: async () => [IP],
    dnsServers: async () => [IP],
    exec: async () => NGINX_OK,
    readFile: () => Buffer.from('PEM'),
    tlsVerify: async () => ({ authorized: true }),
    http: async ({ url, method }: { url: string; method?: string }) => {
      if (url.startsWith('http://')) return { status: 301, headers: { location: 'https://castra.home.arpa/x' } };
      if (method === 'POST') return { status: 200, headers: { 'set-cookie': ['castra_session=abc; Path=/; HttpOnly'] } };
      return { status: 200, headers: {} };
    },
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
    expect(r.lines).toEqual([...CHECK_IDS.map((id) => `PASS ${id}`), 'local name: 10/10 checks pass']);
    expect(CHECK_IDS).toEqual(['dns-direct', 'dns-system', 'dns-only-pc', 'nginx-test', 'tls', 'ca-name-limit', 'ca-key-absent', 'redirect', 'sse', 'port-closed']);
    expect(r.exitCode).toBe(0);
  });

  it('asks the PC directly and the system resolver 20 times', async () => {
    const asked: Array<string | null> = [];
    await runChecks(good({ dnsQuery: async (s: string | null) => (asked.push(s), [IP]) }));
    expect(asked.filter((s) => s === IP)).toHaveLength(1);
    expect(asked.filter((s) => s === null)).toHaveLength(20);
  });

  it('fails dns-direct when the PC answers another address', async () => {
    await failing({ dnsQuery: async (s: string | null) => (s === IP ? ['1.1.1.1'] : [IP]) }, 'dns-direct');
  });

  it('fails dns-system when the resolver answers 1.1.1.1 once in 20', async () => {
    let n = 0;
    await failing({ dnsQuery: async (s: string | null) => (s === null && ++n === 7 ? ['1.1.1.1'] : [IP]) }, 'dns-system');
  });

  it('fails dns-system when the resolver throws ENOTFOUND', async () => {
    await failing({ dnsQuery: async (s: string | null) => { if (s === null) throw new Error('ENOTFOUND'); return [IP]; } }, 'dns-system');
  });

  it('fails dns-only-pc with two DNS servers, and with a server other than the PC', async () => {
    await failing({ dnsServers: async () => [IP, '1.1.1.1'] }, 'dns-only-pc');
    await failing({ dnsServers: async () => ['192.168.1.1'] }, 'dns-only-pc');
  });

  it('fails nginx-test with "nginx not found" when nginx is missing, and when the test is not successful', async () => {
    const r = await failing({ exec: async () => ({ notFound: true, code: -1, stdout: '', stderr: 'ENOENT' }) }, 'nginx-test');
    expect(r.lines).toContain('FAIL nginx-test: nginx not found');
    await failing({ exec: async () => ({ code: 1, stdout: '', stderr: 'nginx: [emerg] unknown directive' }) }, 'nginx-test');
  });

  it('passes the deployed config path to nginx -t', async () => {
    const calls: string[][] = [];
    await runChecks(good({ nginxConf: 'D:/x/nginx.conf', exec: async (c: string, a: string[]) => (calls.push([c, ...a]), NGINX_OK) }));
    expect(calls).toContainEqual(['nginx', '-t', '-c', 'D:/x/nginx.conf']);
  });

  it('runs a given nginx program with its own folder as the prefix, so nginx finds logs/ there and not in the current folder', async () => {
    const calls: string[][] = [];
    await runChecks(good({ nginx: 'D:/web/nginx/nginx.exe', nginxConf: 'D:/web/nginx/conf/site.conf', exec: async (c: string, a: string[]) => (calls.push([c, ...a]), NGINX_OK) }));
    expect(calls).toContainEqual(['D:/web/nginx/nginx.exe', '-t', '-p', 'D:/web/nginx/', '-c', 'D:/web/nginx/conf/site.conf']);
  });

  it('fails tls when local-ca.pem cannot be read', async () => {
    const r = await failing({ readFile: () => { throw new Error('ENOENT'); } }, 'tls', 2); // sse needs the CA too
    expect(r.lines).toContain('FAIL tls: cannot read C:/tls/local-ca.pem: ENOENT');
  });

  it('verifies against the local-ca.pem path, not a mkcert folder', async () => {
    const read: string[] = [];
    await runChecks(good({ readFile: (p: string) => (read.push(p), Buffer.from('PEM')) }));
    expect(new Set(read)).toEqual(new Set(['C:/tls/local-ca.pem']));
  });

  it('fails tls when the CA did not sign the certificate, and when /api/health is not 200', async () => {
    await failing({ tlsVerify: async () => ({ authorized: false, error: 'SELF_SIGNED_CERT_IN_CHAIN' }) }, 'tls');
    await failing({ http: async ({ url, method }: { url: string; method?: string }) => (url.endsWith('/api/health') ? { status: 502, headers: {} } : good().http({ url, method })) }, 'tls');
  });

  it('fails redirect on a wrong status and on a wrong Location', async () => {
    await failing({ http: async ({ url, method }: { url: string; method?: string }) => (url.startsWith('http://') ? { status: 302, headers: { location: 'https://castra.home.arpa/x' } } : good().http({ url, method })) }, 'redirect');
    await failing({ http: async ({ url, method }: { url: string; method?: string }) => (url.startsWith('http://') ? { status: 301, headers: { location: 'https://castra.home.arpa/' } } : good().http({ url, method })) }, 'redirect');
  });

  it('fails sse without :ping, after the 20 seconds that it asked for', async () => {
    let waited = 0;
    await failing({ sseLines: async ({ waitMs }: { waitMs: number }) => ((waited = waitMs), [':ok']) }, 'sse');
    expect(waited).toBe(20000);
  });

  it('fails sse when the credentials are missing, the sign-in is refused, or no cookie comes back', async () => {
    await failing({ env: { LOOPS_PUBLIC_URL: `https://${NAME}`, LOCAL_NAME_LIMIT: NAME } }, 'sse');
    await failing({ http: async ({ url, method }: { url: string; method?: string }) => (method === 'POST' ? { status: 401, headers: {} } : good().http({ url, method })) }, 'sse');
    await failing({ http: async ({ url, method }: { url: string; method?: string }) => (method === 'POST' ? { status: 200, headers: {} } : good().http({ url, method })) }, 'sse');
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
    expect(r.lines).toContain('FAIL dns-only-pc: no answer within 0.02 s');
    expect(r.lines.at(-1)).toBe('local name: 9/10 checks pass');
  });

  it('fails every address check when no PC IP is known, and still prints 10 lines plus the total', async () => {
    const r = await runChecks(good({ pcIp: undefined }));
    expect(r.lines).toHaveLength(11);
    expect(r.lines.filter((l: string) => l.startsWith('FAIL')).length).toBeGreaterThanOrEqual(4);
    expect(r.exitCode).toBe(1);
  });
});

describe('local-name-check name and issuer checks', () => {
  it('takes the name from the host of LOOPS_PUBLIC_URL and asks DNS for it', async () => {
    const asked: string[] = [];
    await runChecks(good({ env: { LOOPS_PUBLIC_URL: 'https://box.home.arpa/', LOCAL_NAME_LIMIT: 'home.arpa', LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p' }, dnsQuery: async (_s: string | null, n: string) => (asked.push(n), [IP]) }));
    expect(new Set(asked)).toEqual(new Set(['box.home.arpa']));
  });

  it('lets --name replace the name of LOOPS_PUBLIC_URL', async () => {
    const asked: string[] = [];
    await runChecks(good({ name: 'other.home.arpa', dnsQuery: async (_s: string | null, n: string) => (asked.push(n), [IP]) }));
    expect(new Set(asked)).toEqual(new Set(['other.home.arpa']));
  });

  it('fails the checks that need the name, with the reason, when LOOPS_PUBLIC_URL is missing', async () => {
    const r = await runChecks(good({ env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p', LOCAL_NAME_LIMIT: NAME } }));
    const fails = r.lines.filter((l: string) => l.startsWith('FAIL'));
    expect(fails.map((l: string) => l.split(':')[0])).toEqual(['FAIL dns-direct', 'FAIL dns-system', 'FAIL tls', 'FAIL ca-key-absent', 'FAIL redirect', 'FAIL sse']);
    for (const l of fails) expect(l).toContain('LOOPS_PUBLIC_URL');
    expect(r.exitCode).toBe(1);
  });

  it('fails ca-name-limit with the reason when LOCAL_NAME_LIMIT is missing', async () => {
    const r = await failing({ env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p', LOOPS_PUBLIC_URL: `https://${NAME}` } }, 'ca-name-limit');
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toContain('LOCAL_NAME_LIMIT');
  });

  it('fails ca-name-limit when local-ca.pem has no name limit', async () => {
    const r = await failing({ caText: async () => CA_TEXT.replace(/ {12}X509v3 Name Constraints[\s\S]*?DNS:castra.home.arpa\n/, '') }, 'ca-name-limit');
    expect(r.lines).toContain('FAIL ca-name-limit: C:/tls/local-ca.pem has no name limit: an issuer without it can sign any name');
  });

  it('fails ca-name-limit when the limit is not critical, or is another name', async () => {
    await failing({ caText: async () => CA_TEXT.replace('Name Constraints: critical', 'Name Constraints:') }, 'ca-name-limit');
    await failing({ caText: async () => CA_TEXT.replace('DNS:castra.home.arpa', 'DNS:example.org') }, 'ca-name-limit');
  });

  it('fails ca-name-limit when openssl cannot read the issuer', async () => {
    await failing({ caText: async () => { throw new Error('openssl not found'); } }, 'ca-name-limit');
  });

  it('fails ca-key-absent when local-ca-key.pem is in the tls folder', async () => {
    const r = await failing({ listTls: async () => [{ name: 'local-ca-key.pem', privateKey: true }, { name: `${NAME}-key.pem`, privateKey: true }] }, 'ca-key-absent');
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toContain('local-ca-key.pem is in C:/tls');
  });

  it('fails ca-key-absent when another file holds a private key, but not for the server key', async () => {
    const r = await failing({ listTls: async () => [{ name: 'backup.pem', privateKey: true }, { name: `${NAME}-key.pem`, privateKey: true }] }, 'ca-key-absent');
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).toContain('backup.pem');
    expect(r.lines.find((l: string) => l.startsWith('FAIL'))).not.toContain(`${NAME}-key.pem,`);
  });

  it('fails ca-key-absent when the tls folder cannot be listed', async () => {
    await failing({ listTls: async () => { throw new Error('cannot read C:/tls: ENOENT'); } }, 'ca-key-absent');
  });
});

describe('nameFromUrl and parseNameLimit', () => {
  it('reads the host of the public address', () => {
    expect(nameFromUrl('https://castra.home.arpa')).toBe('castra.home.arpa');
    expect(() => nameFromUrl(undefined)).toThrow(/LOOPS_PUBLIC_URL/);
    expect(() => nameFromUrl('not a url')).toThrow(/not a URL/);
  });

  it('reads the permitted names of openssl output', () => {
    expect(parseNameLimit(CA_TEXT)).toEqual({ present: true, critical: true, permitted: ['castra.home.arpa'] });
    expect(parseNameLimit('X509v3 Basic Constraints: critical\n  CA:TRUE')).toEqual({ present: false, critical: false, permitted: [] });
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
