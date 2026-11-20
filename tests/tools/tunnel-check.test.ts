// The tunnel check tool (phase 2, task R6b): every check passes with good fakes, and each failure case fails its own check.
import { describe, expect, it } from 'vitest';
import { CHECK_IDS, holdsTokenPart, nameFromUrl, runChecks, serverAddress } from '../../scripts/tunnel-check.mjs';

const NAME = 'castra.example.com';
const PC_IP = '192.168.1.50';
const PASSWORD = 'sample-password-for-tests';
const TOKEN = 'sample-tunnel-token-for-tests-only';
const EDGE_IP = '104.21.5.6';
const EDGE_IP6 = '2606:4700:3030::6815:506';
const CONSOLE_PID = 4000;

const proc = (pid: number, ppid: number, name: string, commandLine = '') => ({ pid, ppid, name, commandLine });
const GOOD_PROCESSES = [proc(CONSOLE_PID, 1, 'node.exe', 'node dist/server/main.js --cloudflare'), proc(4100, CONSOLE_PID, 'cloudflared.exe', 'cloudflared tunnel --no-autoupdate run')];

type Call = { url: string; method?: string; headers?: Record<string, string> };
const COOKIE = 'castra_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax';
const HEALTHY_HTTP = async ({ url, method }: Call) => {
  if (url === 'http://127.0.0.1:7070/api/health') return { status: 200, headers: {}, body: JSON.stringify({ ok: true, tunnel: 'connected' }) };
  if (url.endsWith('/api/loops')) return { status: 401, headers: {}, body: JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }) };
  if (url.endsWith('/api/auth/login') && method === 'POST') return { status: 204, headers: { 'set-cookie': [COOKIE] }, body: '' };
  return { status: 204, headers: {}, body: '' };
};

function good(over: Record<string, unknown> = {}) {
  return {
    pcIp: PC_IP,
    env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: PASSWORD, LOOPS_PUBLIC_URL: `https://${NAME}`, LOOPS_CLOUDFLARE: TOKEN },
    limitMs: 1000,
    logFile: 'reports/restart-console.log',
    dnsQuery: async () => [EDGE_IP, EDGE_IP6],
    processes: async () => GOOD_PROCESSES,
    listener: async () => CONSOLE_PID,
    readText: async () => 'console started\n',
    edgeRequest: async () => ({ authorized: true, issuer: { O: 'Google Trust Services', CN: 'WE1' }, status: 200, headers: { 'cf-ray': '8a1b2c3d4e5f-AMS' } }),
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
  expect(r.lines.at(-1)).toBe(`tunnel: ${9 - failures}/9 checks pass`);
  expect(r.exitCode).toBe(1);
  return r;
}

describe('tunnel-check runChecks', () => {
  it('prints 9 PASS lines in order, the total line and exit 0 when all fakes are good', async () => {
    const r = await runChecks(good());
    expect(CHECK_IDS).toEqual(['dns-edge', 'connector', 'runner', 'token-hidden', 'edge-path', 'sign-in-wall', 'secure-cookie', 'sse', 'ports-closed']);
    expect(r.lines).toEqual([...CHECK_IDS.map((id) => `PASS ${id}`), 'tunnel: 9/9 checks pass']);
    expect(r.exitCode).toBe(0);
  });

  it('prints 9 FAIL lines and 0/9 on a PC without a tunnel (nginx path, no cloudflared)', async () => {
    const r = await runChecks(
      good({
        dnsQuery: async () => [PC_IP],
        processes: async () => [proc(CONSOLE_PID, 1, 'node.exe')],
        http: async ({ url }: Call) => {
          throw new Error(`connect ECONNREFUSED ${url}`);
        },
        edgeRequest: async () => {
          throw new Error('ECONNREFUSED');
        },
        sseLines: async () => [],
        tcp: async () => true,
      }),
    );
    expect(r.lines.filter((l: string) => l.startsWith('FAIL'))).toHaveLength(9);
    expect(r.lines.at(-1)).toBe('tunnel: 0/9 checks pass');
    expect(r.exitCode).toBe(1);
  });

  it('fails dns-edge for an address that is not Cloudflare (the PC), for a private one and for an empty answer', async () => {
    // The PC address is no Cloudflare address, so the three checks that send a request to the edge fail too.
    const r = await failing({ dnsQuery: async () => [PC_IP] }, 'dns-edge', 4);
    expect(r.lines.find((l: string) => l.startsWith('FAIL dns-edge'))).toContain(PC_IP);
    await failing({ dnsQuery: async () => [EDGE_IP, '203.0.113.9'] }, 'dns-edge', 1);
  }, 10_000);

  it('sends sign-in-wall, secure-cookie and sse to the Cloudflare address of the name, never to the system resolver', async () => {
    const connects: Array<string | undefined> = [];
    await runChecks(good({ http: async (c: Call & { connect?: string }) => (c.url.startsWith(`https://${NAME}`) && connects.push(c.connect), HEALTHY_HTTP(c)), sseLines: async (o: { connect?: string }) => (connects.push(o.connect), [':ok', ':ping']) }));
    expect(connects.length).toBeGreaterThanOrEqual(6);
    expect(new Set(connects)).toEqual(new Set([EDGE_IP]));
    const r = await failing({ dnsQuery: async () => [PC_IP] }, 'dns-edge', 4);
    expect(r.lines.find((l: string) => l.startsWith('FAIL sse'))).toContain('no Cloudflare address');
  });

  it('asks 1.1.1.1 for the name, and the server of publicDns when it is given', async () => {
    const asked: string[] = [];
    await runChecks(good({ dnsQuery: async (s: string) => (asked.push(s), [EDGE_IP]) }));
    expect(asked[0]).toBe('1.1.1.1:53');
    asked.length = 0;
    await runChecks(good({ publicDns: '9.9.9.9', dnsQuery: async (s: string) => (asked.push(s), [EDGE_IP]) }));
    expect(asked[0]).toBe('9.9.9.9:53');
    expect(serverAddress('2606:4700:4700::1111')).toBe('[2606:4700:4700::1111]:53');
  });

  it('fails dns-edge on an empty answer', async () => {
    const r = await runChecks(good({ dnsQuery: async () => [] }));
    expect(r.lines).toContain(`FAIL dns-edge: 1.1.1.1 gave an empty answer for the name`);
  });

  it('fails connector when the tunnel is not connected, and when health is not 200', async () => {
    const health = (status: number, tunnel: string) => async (c: Call) => (c.url === 'http://127.0.0.1:7070/api/health' ? { status, headers: {}, body: JSON.stringify({ tunnel }) } : HEALTHY_HTTP(c));
    const r = await failing({ http: health(200, 'connecting') }, 'connector');
    expect(r.lines).toContain('FAIL connector: /api/health says tunnel: connecting, expected connected');
    await failing({ http: health(503, 'connected') }, 'connector');
    await failing({ http: health(200, 'off') }, 'connector');
  });

  it('fails runner when no cloudflared runs, when its parent is not the console, and when the console is not node', async () => {
    const r = await failing({ processes: async () => [proc(CONSOLE_PID, 1, 'node.exe')] }, 'runner', 2); // token-hidden also needs the process
    expect(r.lines).toContain('FAIL runner: no cloudflared process is running');
    const stray = [...GOOD_PROCESSES, proc(5000, 777, 'cloudflared.exe')];
    const r2 = await runChecks(good({ processes: async () => stray }));
    expect(r2.lines.find((l: string) => l.startsWith('FAIL runner'))).toContain('pid 5000');
    const r3 = await runChecks(good({ processes: async () => [proc(CONSOLE_PID, 1, 'nginx.exe'), proc(4100, CONSOLE_PID, 'cloudflared.exe')] }));
    expect(r3.lines.find((l: string) => l.startsWith('FAIL runner'))).toContain('expected node.exe');
  });

  it('fails runner when nothing listens on port 7070', async () => {
    const r = await runChecks(good({ listener: async () => undefined }));
    expect(r.lines).toContain('FAIL runner: no process listens on port 7070');
  });

  it('fails token-hidden when the token is in the command line of cloudflared, of the console, or in the log', async () => {
    const part = TOKEN.slice(10, 22);
    const bad = [proc(CONSOLE_PID, 1, 'node.exe'), proc(4100, CONSOLE_PID, 'cloudflared.exe', `cloudflared tunnel run --token ${TOKEN}`)];
    const r = await failing({ processes: async () => bad }, 'token-hidden');
    expect(r.lines.find((l: string) => l.startsWith('FAIL token-hidden'))).toContain('the command line of cloudflared (pid 4100)');
    const bad2 = [proc(CONSOLE_PID, 1, 'node.exe', `node main.js --cloudflare=${part}`), GOOD_PROCESSES[1]];
    const r2 = await failing({ processes: async () => bad2 }, 'token-hidden');
    expect(r2.lines.find((l: string) => l.startsWith('FAIL token-hidden'))).toContain('the command line of the console');
    const r3 = await failing({ readText: async () => `args: ${part}` }, 'token-hidden');
    expect(r3.lines.find((l: string) => l.startsWith('FAIL token-hidden'))).toContain('reports/restart-console.log');
  });

  it('fails token-hidden when LOOPS_CLOUDFLARE is missing from .env, and passes a missing log file', async () => {
    const r = await runChecks(good({ env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: PASSWORD, LOOPS_PUBLIC_URL: `https://${NAME}` } }));
    expect(r.lines).toContain('FAIL token-hidden: LOOPS_CLOUDFLARE missing in .env: nothing to look for');
    const r2 = await runChecks(good({ readText: async () => { throw new Error('ENOENT'); } }));
    expect(r2.lines).toContain('PASS token-hidden');
  });

  it('holdsTokenPart finds a part of 9 characters and ignores 8', () => {
    expect(holdsTokenPart('xx abcdefghi yy', 'QQabcdefghiQQ')).toBe(true);
    expect(holdsTokenPart('xx abcdefgh yy', 'QQabcdefghQQ')).toBe(false);
    expect(holdsTokenPart('anything', '')).toBe(false);
  });

  it('fails edge-path for the Let\'s Encrypt R series of nginx, for a missing cf-ray, and for an untrusted certificate', async () => {
    const edge = (over: Record<string, unknown>) => async () => ({ authorized: true, issuer: { O: 'Google Trust Services', CN: 'WE1' }, status: 200, headers: { 'cf-ray': 'x' }, ...over });
    const r = await failing({ edgeRequest: edge({ issuer: { O: "Let's Encrypt", CN: 'R11' } }) }, 'edge-path');
    expect(r.lines.find((l: string) => l.startsWith('FAIL edge-path'))).toContain('R11');
    const r2 = await failing({ edgeRequest: edge({ headers: {} }) }, 'edge-path');
    expect(r2.lines.find((l: string) => l.startsWith('FAIL edge-path'))).toContain('cf-ray');
    await failing({ edgeRequest: edge({ authorized: false, error: 'CERT_UNTRUSTED' }) }, 'edge-path');
  });

  it('connects edge-path to the first edge address with the name as SNI, and sends the Access headers when .env has them', async () => {
    const seen: unknown[][] = [];
    await runChecks(good({ edgeRequest: async (...a: unknown[]) => (seen.push(a), { authorized: true, issuer: { O: 'G' }, status: 200, headers: { 'cf-ray': 'x' } }), env: { ...good().env, CF_ACCESS_CLIENT_ID: 'id1', CF_ACCESS_CLIENT_SECRET: 'sample-access-value' } }));
    expect(seen[0]).toEqual([EDGE_IP, NAME, '/api/health', { 'CF-Access-Client-Id': 'id1', 'CF-Access-Client-Secret': 'sample-access-value' }]);
  });

  it('fails sign-in-wall when /api/loops is not 401 UNAUTHENTICATED', async () => {
    const wall = (status: number, body: unknown) => async (c: Call) => (c.url.endsWith('/api/loops') ? { status, headers: {}, body: JSON.stringify(body) } : HEALTHY_HTTP(c));
    await failing({ http: wall(200, {}) }, 'sign-in-wall');
    await failing({ http: wall(401, { error: { code: 'OTHER' } }) }, 'sign-in-wall');
  });

  it('fails secure-cookie without the Secure attribute, without a cookie and on a bad status, and signs out after a good sign-in', async () => {
    const login = (status: number, cookies: string[]) => async (c: Call) => (c.url.endsWith('/api/auth/login') ? { status, headers: { 'set-cookie': cookies }, body: '' } : HEALTHY_HTTP(c));
    const r = await runChecks(good({ http: login(204, ['castra_session=abc; Path=/; HttpOnly']) }));
    expect(r.lines.find((l: string) => l.startsWith('FAIL secure-cookie'))).toContain('no Secure attribute');
    expect(r.lines.filter((l: string) => l.startsWith('FAIL secure-cookie'))).toHaveLength(1);
    await runChecks(good({ http: login(204, []) })).then((x) => expect(x.lines.find((l: string) => l.startsWith('FAIL secure-cookie'))).toContain('no castra_session cookie'));
    await runChecks(good({ http: login(401, []) })).then((x) => expect(x.lines.find((l: string) => l.startsWith('FAIL secure-cookie'))).toContain('401'));
    const urls: string[] = [];
    await runChecks(good({ http: async (c: Call) => (urls.push(`${c.method ?? 'GET'} ${c.url}`), HEALTHY_HTTP(c)) }));
    expect(urls).toContain(`POST https://${NAME}/api/auth/logout`);
  });

  it('fails sse without :ping or without :ok, and passes the cookie of the sign-in', async () => {
    const r = await failing({ sseLines: async () => [':ok'] }, 'sse');
    expect(r.lines).toContain('FAIL sse: no :ping within 20 s');
    await failing({ sseLines: async () => [] }, 'sse');
    let cookie = '';
    await runChecks(good({ sseLines: async (o: { cookie: string }) => ((cookie = o.cookie), [':ok', ':ping']) }));
    expect(cookie).toBe('castra_session=abc');
  });

  it('fails ports-closed for each open home port and when the console does not answer on 127.0.0.1', async () => {
    for (const open of [80, 443, 7070]) {
      const r = await runChecks(good({ tcp: async (h: string, p: number) => h === '127.0.0.1' || p === open }));
      expect(r.lines).toContain(`FAIL ports-closed: ${PC_IP} accepts connections on port ${open}, expected refused or no answer`);
    }
    const r = await runChecks(good({ tcp: async () => false }));
    expect(r.lines).toContain('FAIL ports-closed: 127.0.0.1:7070 refuses connections, expected open');
    const r2 = await runChecks(good({ pcIp: undefined }));
    expect(r2.lines.find((l: string) => l.startsWith('FAIL ports-closed'))).toContain('--pc-ip');
  });

  it('asks the three home ports on the PC address with a 3 second wait', async () => {
    const asked: Array<[string, number, number]> = [];
    await runChecks(good({ tcp: async (h: string, p: number, w: number) => (asked.push([h, p, w]), h === '127.0.0.1') }));
    expect(asked).toEqual([[PC_IP, 80, 3000], [PC_IP, 443, 3000], [PC_IP, 7070, 3000], ['127.0.0.1', 7070, 3000]]);
  });

  it('prints no output line that holds LOOPS_PASSWORD, LOOPS_CLOUDFLARE or the Access secret, also when an error carries them', async () => {
    const env = { ...good().env, CF_ACCESS_CLIENT_ID: 'id1', CF_ACCESS_CLIENT_SECRET: 'sample-access-value' };
    const leak = async () => {
      throw new Error(`boom ${PASSWORD} ${TOKEN} sample-access-value`);
    };
    const r = await runChecks(good({ env, http: leak, edgeRequest: leak, sseLines: leak, processes: leak }));
    const text = r.lines.join('\n');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('sample-access-value');
    expect(text).toContain('<secret>');
    const ok = (await runChecks(good({ env }))).lines.join('\n');
    expect(ok).not.toContain(PASSWORD);
    expect(ok).not.toContain(TOKEN);
  });

  it('takes the name from LOOPS_PUBLIC_URL and fails the name checks with the reason when it is missing', async () => {
    expect(nameFromUrl('https://castra.example.com/')).toBe(NAME);
    expect(() => nameFromUrl(undefined)).toThrow(/LOOPS_PUBLIC_URL/);
    expect(() => nameFromUrl('not a url')).toThrow(/not a URL/);
    const r = await runChecks(good({ env: { LOOPS_USERNAME: 'u', LOOPS_PASSWORD: PASSWORD, LOOPS_CLOUDFLARE: TOKEN } }));
    expect(r.lines.find((l: string) => l.startsWith('FAIL dns-edge'))).toContain('LOOPS_PUBLIC_URL');
  });
});
