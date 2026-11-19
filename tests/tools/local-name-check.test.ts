// The local-name check tool (phase 3, task N0): every check passes with good fakes, and each failure case fails its own check.
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, pcIpFrom, runChecks } from '../../scripts/local-name-check.mjs';

const IP = '192.168.1.50';
const NGINX_OK = { code: 0, stdout: '', stderr: 'nginx: the configuration file x syntax is ok\nnginx: configuration file x test is successful\n' };

/** Fakes that make all 8 checks pass. A test overrides one function. */
function good(over: Record<string, unknown> = {}) {
  return {
    pcIp: IP,
    env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: 'p' },
    limitMs: 1000,
    nginxConf: 'C:/nginx/conf/nginx.conf',
    dnsQuery: async () => [IP],
    dnsServers: async () => [IP],
    exec: async (cmd: string) => (cmd === 'mkcert' ? { code: 0, stdout: 'C:/ca\n', stderr: '' } : NGINX_OK),
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
  expect(r.lines.at(-1)).toBe(`local name: ${8 - failures}/8 checks pass`);
  expect(r.exitCode).toBe(1);
  return r;
}

describe('local-name-check runChecks', () => {
  it('prints 8 PASS lines in order, the total line and exit 0 when all fakes are good', async () => {
    const r = await runChecks(good());
    expect(r.lines).toEqual([...CHECK_IDS.map((id) => `PASS ${id}`), 'local name: 8/8 checks pass']);
    expect(CHECK_IDS).toEqual(['dns-direct', 'dns-system', 'dns-only-pc', 'nginx-test', 'tls', 'redirect', 'sse', 'port-closed']);
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
    const r = await failing({ exec: async (cmd: string) => (cmd === 'mkcert' ? { code: 0, stdout: 'C:/ca\n', stderr: '' } : { notFound: true, code: -1, stdout: '', stderr: 'ENOENT' }) }, 'nginx-test');
    expect(r.lines).toContain('FAIL nginx-test: nginx not found');
    await failing({ exec: async (cmd: string) => (cmd === 'mkcert' ? { code: 0, stdout: 'C:/ca\n', stderr: '' } : { code: 1, stdout: '', stderr: 'nginx: [emerg] unknown directive' }) }, 'nginx-test');
  });

  it('passes the deployed config path to nginx -t', async () => {
    const calls: string[][] = [];
    await runChecks(good({ nginxConf: 'D:/x/nginx.conf', exec: async (c: string, a: string[]) => (calls.push([c, ...a]), c === 'mkcert' ? { code: 0, stdout: 'C:/ca', stderr: '' } : NGINX_OK) }));
    expect(calls).toContainEqual(['nginx', '-t', '-c', 'D:/x/nginx.conf']);
  });

  it('fails tls with "mkcert not found" when mkcert is missing', async () => {
    const r = await failing({ exec: async (cmd: string) => (cmd === 'mkcert' ? { notFound: true, code: -1, stdout: '', stderr: '' } : NGINX_OK) }, 'tls', 2); // sse needs the CA too
    expect(r.lines).toContain('FAIL tls: mkcert not found');
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
    await failing({ env: {} }, 'sse');
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
    expect(r.lines.at(-1)).toBe('local name: 7/8 checks pass');
  });

  it('fails every address check when no PC IP is known, and still prints 8 lines plus the total', async () => {
    const r = await runChecks(good({ pcIp: undefined }));
    expect(r.lines).toHaveLength(9);
    expect(r.lines.filter((l: string) => l.startsWith('FAIL')).length).toBeGreaterThanOrEqual(4);
    expect(r.exitCode).toBe(1);
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
