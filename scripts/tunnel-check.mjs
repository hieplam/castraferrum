#!/usr/bin/env node
// Tests the Cloudflare tunnel on the real machine (phase 2 spec G6 and G8 to G10, task R6b): the DNS answer of the
// console name, the tunnel connection, the parent of cloudflared, the token in command lines and logs, the path of a
// request through the Cloudflare edge, the sign-in wall, the Secure cookie, live updates and the closed home ports.
//
//   node scripts/tunnel-check.mjs [--pc-ip=<address>] [--name=<name>] [--public-dns=<address>]
//
// The settings are read from the .env of the main checkout (also when the script runs in a worktree): LOOPS_PUBLIC_URL,
// LOOPS_USERNAME, LOOPS_PASSWORD, LOOPS_CLOUDFLARE and the optional CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET.
// LOOPS_PUBLIC_URL in the environment replaces the one in the file. The name is the host of LOOPS_PUBLIC_URL; --name replaces it.
// The public DNS server is 1.1.1.1; --public-dns replaces it. Every TLS and HTTPS connection uses the trusted roots of Node.
// One line per check (`PASS <id>` or `FAIL <id>: <reason>`), then `tunnel: <passed>/9 checks pass`.
// Exit 0 only when all 9 pass. The tool prints no secret, runs as the normal user and changes no system setting.
// `runChecks(deps)` takes every outside effect as a function, so the unit test runs it with fakes.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PUBLIC_DNS = '1.1.1.1';
const CONSOLE = 'http://127.0.0.1:7070';
const CHECK_LIMIT_MS = 25_000;
const SSE_WAIT_MS = 20_000;
const PORT_WAIT_MS = 3_000;
const HOME_PORTS = [80, 443, 7070];
const TOKEN_PART = 9; // a part of the token longer than 8 characters must not appear anywhere
const COOKIE_NAME = 'castra_session'; // SESSION_COOKIE of shared/contracts/auth.ts (a .mjs script cannot import the .ts file)
const LETS_ENCRYPT_SERIES = /^(R|E)\d+$/; // the issuers that nginx served in phase 3
const here = dirname(fileURLToPath(import.meta.url));

export const CHECK_IDS = ['dns-edge', 'connector', 'runner', 'token-hidden', 'edge-path', 'sign-in-wall', 'secure-cookie', 'sse', 'ports-closed'];

export const loadRanges = () => JSON.parse(readFileSync(resolve(here, 'cloudflare-ips.json'), 'utf8'));

// The same rule as `networkAddresses` in server/config.ts (lan-access D3); that function is TypeScript, so a .mjs script cannot reuse it.
export function pcIpFrom(interfaces) {
  const found = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const nic of list ?? []) {
      if (nic.family !== 'IPv4' || nic.internal || /^169\.254\./.test(nic.address)) continue;
      found.push({ address: nic.address, virtual: /vEthernet|WSL|Hyper-V/i.test(name) });
    }
  }
  return [...found.filter((a) => !a.virtual), ...found.filter((a) => a.virtual)][0]?.address;
}

const msg = (e) => (e instanceof Error ? e.message : String(e));

function withLimit(promise, ms) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** The name of the console: the host of LOOPS_PUBLIC_URL, or a thrown Error with the reason. */
export function nameFromUrl(url) {
  if (!url) throw new Error('no name: set LOOPS_PUBLIC_URL (https://<name>) in .env, or pass --name=<name>');
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error(`LOOPS_PUBLIC_URL is not a URL: ${url}`);
  }
}

export function serverAddress(address) {
  return address.includes(':') ? `[${address}]:53` : `${address}:53`;
}

function blockList(cidrs4, cidrs6) {
  const list = new net.BlockList();
  for (const c of cidrs4) list.addSubnet(c.split('/')[0], Number(c.split('/')[1]), 'ipv4');
  for (const c of cidrs6) list.addSubnet(c.split('/')[0], Number(c.split('/')[1]), 'ipv6');
  return list;
}
const PRIVATE = blockList(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', '0.0.0.0/8'], ['::1/128', 'fc00::/7', 'fe80::/10']);

const familyOf = (address) => (address.includes(':') ? 'ipv6' : 'ipv4');

/** True when some 9-character part of the token occurs in the text. The token itself is never printed. */
export function holdsTokenPart(text, token) {
  if (!token) return false;
  if (token.length < TOKEN_PART) return text.includes(token);
  for (let i = 0; i + TOKEN_PART <= token.length; i += 1) if (text.includes(token.slice(i, i + TOKEN_PART))) return true;
  return false;
}

const isCloudflared = (p) => /^cloudflared(\.exe)?$/i.test(p.name ?? '');
const isNode = (p) => /^node(\.exe)?$/i.test(p?.name ?? '');
const accessHeaders = (env) => (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET ? { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET } : {});

/** Every check: resolves when it passes, throws an Error with the reason when it fails. */
function checks(d) {
  const needName = () => {
    if (!d.name) throw new Error('no name: set LOOPS_PUBLIC_URL (https://<name>) in .env, or pass --name=<name>');
    return d.name;
  };
  const base = () => `https://${needName()}`;
  const edge = blockList(d.ranges.ipv4, d.ranges.ipv6);
  const edgeAddresses = async () => {
    try {
      return await d.dnsQuery(serverAddress(d.publicDns), needName());
    } catch (e) {
      throw new Error(`${d.publicDns} gave no answer: ${msg(e)}`);
    }
  };
  /** The first Cloudflare address of the name. The requests of the sign-in checks go there, as the request of a phone does. */
  const edgeAddress = async () => {
    const got = await edgeAddresses();
    const address = got.find((a) => edge.check(a, familyOf(a)));
    if (!address) throw new Error(`${d.publicDns} gave ${got.join(', ') || 'an empty answer'} for the name, no Cloudflare address: a request would not take the path of a phone`);
    return address;
  };
  const processes = async () => {
    try {
      return await d.processes();
    } catch (e) {
      throw new Error(`cannot read the process list: ${msg(e)}`);
    }
  };
  const login = async (connect) => {
    const { LOOPS_USERNAME: username, LOOPS_PASSWORD: password } = d.env;
    if (!username || !password) throw new Error('LOOPS_USERNAME or LOOPS_PASSWORD missing in .env');
    return d.http({ url: `${base()}/api/auth/login`, method: 'POST', body: { username, password }, headers: accessHeaders(d.env), connect });
  };
  const cookieOf = (r) => [].concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  const logout = (cookie, connect) => d.http({ url: `${base()}/api/auth/logout`, method: 'POST', headers: { cookie: cookie.split(';')[0], ...accessHeaders(d.env) }, connect }).catch(() => undefined);

  return {
    async 'dns-edge'() {
      const name = needName();
      const got = await edgeAddresses();
      if (got.length === 0) throw new Error(`${d.publicDns} gave an empty answer for the name`);
      const outside = got.filter((a) => !edge.check(a, familyOf(a)));
      if (outside.length) throw new Error(`${outside.join(', ')} is not a Cloudflare address (copy of ${d.ranges.copiedOn}): the name does not point to the edge`);
      const priv = got.filter((a) => PRIVATE.check(a, familyOf(a)));
      if (priv.length) throw new Error(`${priv.join(', ')} is a private address`);
    },
    async connector() {
      const r = await d.http({ url: `${CONSOLE}/api/health` });
      if (r.status !== 200) throw new Error(`GET ${CONSOLE}/api/health gave ${r.status}, expected 200`);
      let tunnel;
      try {
        tunnel = JSON.parse(r.body ?? '').tunnel;
      } catch {
        throw new Error('/api/health did not answer JSON');
      }
      if (tunnel !== 'connected') throw new Error(`/api/health says tunnel: ${tunnel ?? 'missing'}, expected connected`);
    },
    async runner() {
      const list = await processes();
      const tunnels = list.filter(isCloudflared);
      if (tunnels.length === 0) throw new Error('no cloudflared process is running');
      const listener = await d.listener(7070);
      if (listener === undefined) throw new Error('no process listens on port 7070');
      const parent = list.find((p) => p.pid === listener);
      if (!isNode(parent)) throw new Error(`the process on port 7070 is ${parent?.name ?? `pid ${listener}`}, expected node.exe`);
      const stray = tunnels.filter((p) => p.ppid !== listener);
      if (stray.length) throw new Error(`cloudflared (pid ${stray.map((p) => p.pid).join(', ')}) is not a child of the console (pid ${listener})`);
    },
    async 'token-hidden'() {
      const token = d.env.LOOPS_CLOUDFLARE;
      if (!token) throw new Error('LOOPS_CLOUDFLARE missing in .env: nothing to look for');
      const list = await processes();
      const tunnels = list.filter(isCloudflared);
      if (tunnels.length === 0) throw new Error('no cloudflared process is running: its command line cannot be read');
      const listener = await d.listener(7070);
      const consoleProcess = list.find((p) => p.pid === listener);
      const places = [
        ...tunnels.map((p) => [`the command line of cloudflared (pid ${p.pid})`, p.commandLine ?? '']),
        ...(consoleProcess ? [[`the command line of the console (pid ${consoleProcess.pid})`, consoleProcess.commandLine ?? '']] : []),
        ['reports/restart-console.log', await d.readText(d.logFile).catch(() => '')],
      ];
      const hits = places.filter(([, text]) => holdsTokenPart(text, token)).map(([where]) => where);
      if (hits.length) throw new Error(`part of LOOPS_CLOUDFLARE is in ${hits.join(' and ')}`);
    },
    async 'edge-path'() {
      const name = needName();
      const [address] = await edgeAddresses();
      if (!address) throw new Error(`${d.publicDns} gave an empty answer for the name`);
      let r;
      try {
        r = await d.edgeRequest(address, name, '/api/health', accessHeaders(d.env));
      } catch (e) {
        throw new Error(`TLS to ${address} with the name ${name} failed: ${msg(e)}`);
      }
      if (!r.authorized) throw new Error(`certificate not trusted: ${r.error ?? 'unknown'}`);
      const issuer = [].concat(r.issuer?.O ?? []).join(', ');
      const series = [].concat(r.issuer?.CN ?? []).join(', ');
      if (issuer === "Let's Encrypt" && LETS_ENCRYPT_SERIES.test(series)) throw new Error(`the certificate comes from Let's Encrypt ${series}, the series that nginx served`);
      if (!r.headers['cf-ray']) throw new Error('the response has no cf-ray header: it did not pass the Cloudflare edge');
    },
    async 'sign-in-wall'() {
      const connect = await edgeAddress();
      const r = await d.http({ url: `${base()}/api/loops`, headers: accessHeaders(d.env), connect });
      if (r.status !== 401) throw new Error(`GET /api/loops gave ${r.status}, expected 401`);
      let code;
      try {
        const json = JSON.parse(r.body ?? '');
        code = json.error?.code ?? json.code;
      } catch {
        code = undefined;
      }
      if (code !== 'UNAUTHENTICATED') throw new Error(`the 401 body has code ${code ?? 'none'}, expected UNAUTHENTICATED`);
    },
    async 'secure-cookie'() {
      const connect = await edgeAddress();
      const r = await login(connect);
      if (r.status !== 204) throw new Error(`sign-in gave ${r.status}, expected 204`);
      const cookie = cookieOf(r);
      if (!cookie) throw new Error(`sign-in set no ${COOKIE_NAME} cookie`);
      await logout(cookie, connect);
      if (!/;\s*Secure\b/i.test(cookie)) throw new Error(`the ${COOKIE_NAME} cookie has no Secure attribute: the console does not see HTTPS`);
    },
    async sse() {
      const connect = await edgeAddress();
      const r = await login(connect);
      if (r.status !== 204 && r.status !== 200) throw new Error(`sign-in gave ${r.status}, expected 204`);
      const cookie = cookieOf(r);
      if (!cookie) throw new Error(`sign-in set no ${COOKIE_NAME} cookie`);
      try {
        const lines = await d.sseLines({ url: `${base()}/api/events`, cookie: cookie.split(';')[0], headers: accessHeaders(d.env), connect, waitMs: SSE_WAIT_MS });
        if (!lines.includes(':ok')) throw new Error('stream sent no :ok');
        if (!lines.includes(':ping')) throw new Error(`no :ping within ${SSE_WAIT_MS / 1000} s`);
      } finally {
        await logout(cookie, connect);
      }
    },
    async 'ports-closed'() {
      if (!d.pcIp) throw new Error('no PC IP address found; pass --pc-ip=<address>');
      const open = [];
      for (const port of HOME_PORTS) if (await d.tcp(d.pcIp, port, PORT_WAIT_MS)) open.push(port);
      if (open.length) throw new Error(`${d.pcIp} accepts connections on port ${open.join(', ')}, expected refused or no answer`);
      if (!(await d.tcp('127.0.0.1', 7070, PORT_WAIT_MS))) throw new Error('127.0.0.1:7070 refuses connections, expected open');
    },
  };
}

/** Runs the 9 checks in order and returns { lines, passed, total, exitCode }. Never stops at the first failure. */
export async function runChecks(deps) {
  const d = { env: {}, limitMs: CHECK_LIMIT_MS, publicDns: PUBLIC_DNS, ranges: loadRanges(), logFile: 'reports/restart-console.log', ...deps };
  d.name ??= (() => {
    try {
      return nameFromUrl(d.env.LOOPS_PUBLIC_URL);
    } catch {
      return undefined;
    }
  })();
  const table = checks(d);
  const secrets = [d.env.LOOPS_PASSWORD, d.env.LOOPS_CLOUDFLARE, d.env.CF_ACCESS_CLIENT_SECRET].filter((s) => s && s.length >= 4);
  // A reason never holds a secret: a value that slipped into an error text is cut out.
  const clean = (text) => secrets.reduce((t, s) => t.split(s).join('<secret>'), text);
  const lines = [];
  let passed = 0;
  for (const id of CHECK_IDS) {
    try {
      await withLimit(table[id](), d.limitMs);
      lines.push(`PASS ${id}`);
      passed += 1;
    } catch (e) {
      lines.push(clean(`FAIL ${id}: ${msg(e)}`));
    }
  }
  lines.push(`tunnel: ${passed}/${CHECK_IDS.length} checks pass`);
  return { lines, passed, total: CHECK_IDS.length, exitCode: passed === CHECK_IDS.length ? 0 : 1 };
}

// ---- real implementations ----

function exec(cmd, args) {
  return new Promise((res) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', (e) => res({ notFound: e.code === 'ENOENT', code: -1, stdout, stderr: msg(e) }));
    child.on('close', (code) => res({ code: code ?? -1, stdout, stderr }));
  });
}

const PS = (script) => exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);

/** All processes: [{ pid, ppid, name, commandLine }]. */
async function processes() {
  const r = await PS('Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress');
  if (r.notFound) throw new Error('powershell.exe not found');
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n')[0]);
  return [].concat(JSON.parse(r.stdout || '[]')).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name, commandLine: p.CommandLine ?? '' }));
}

/** The pid of the process that listens on the port, or undefined. */
async function listener(port) {
  const r = await PS(`(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`);
  const pid = Number(r.stdout.trim());
  return r.code === 0 && Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

/** `server` is `<address>:53` or `[<address>]:53`. The answer is the A and the AAAA records; an empty answer gives []. */
export async function dnsQuery(server, name) {
  const r = new dns.promises.Resolver({ timeout: 5000, tries: 1 });
  r.setServers([server]);
  const ask = async (f) => {
    try {
      return await f.call(r, name);
    } catch (e) {
      if (e?.code === 'ENODATA' || e?.code === 'ENOTFOUND') return [];
      throw e;
    }
  };
  const [v4, v6] = await Promise.all([ask(r.resolve4), ask(r.resolve6)]);
  return [...v4, ...v6];
}

/** TLS to `address` with `name` as SNI and as Host. The outcome says whether Node's default roots trust the certificate. */
export function edgeRequest(address, name, path, headers = {}) {
  return new Promise((res, reject) => {
    const req = https.request({ host: address, servername: name, path, method: 'GET', headers: { host: name, ...headers }, rejectUnauthorized: false }, (r) => {
      const socket = r.socket;
      const cert = socket.getPeerCertificate();
      const out = { authorized: socket.authorized, error: socket.authorizationError ? String(socket.authorizationError) : undefined, issuer: cert?.issuer, status: r.statusCode ?? 0, headers: r.headers };
      r.resume();
      r.on('end', () => res(out));
    });
    req.setTimeout(10_000, () => req.destroy(new Error('timeout after 10 s')));
    req.on('error', reject);
    req.end();
  });
}

// `connect` is an address to open the connection to; the name of the URL stays the TLS name and the Host header.
const target = (u, connect) => (connect ? { host: connect, servername: u.hostname, path: `${u.pathname}${u.search}` } : {});

function request({ url, method = 'GET', headers = {}, body, connect }) {
  return new Promise((res, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const h = payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers } : headers;
    const req = lib.request(connect ? { ...target(u, connect), method, headers: { host: u.host, ...h } } : { hostname: u.hostname, port: u.port, path: `${u.pathname}${u.search}`, method, headers: h }, (r) => {
      let text = '';
      r.setEncoding('utf8');
      r.on('data', (c) => (text += c));
      r.on('end', () => res({ status: r.statusCode ?? 0, headers: r.headers, body: text }));
    });
    req.setTimeout(15_000, () => req.destroy(new Error('timeout after 15 s')));
    req.on('error', reject);
    req.end(payload);
  });
}

function sseLines({ url, cookie, headers = {}, connect, waitMs }) {
  return new Promise((res, reject) => {
    const lines = [];
    let buf = '';
    let timer;
    let req;
    const done = () => {
      clearTimeout(timer);
      req.destroy();
      res(lines);
    };
    const u = new URL(url);
    const opts = { headers: { cookie, accept: 'text/event-stream', ...(connect ? { host: u.host } : {}), ...headers } };
    req = https.request({ ...(connect ? target(u, connect) : { hostname: u.hostname, port: u.port, path: `${u.pathname}${u.search}` }), ...opts }, (r) => {
      if (r.statusCode !== 200) {
        clearTimeout(timer);
        req.destroy();
        reject(new Error(`/api/events gave ${r.statusCode}`));
        return;
      }
      r.setEncoding('utf8');
      r.on('data', (c) => {
        buf += c;
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        for (const l of parts) if (l) lines.push(l);
        if (lines.includes(':ping')) done();
      });
    });
    timer = setTimeout(done, waitMs);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

function tcp(host, port, waitMs) {
  return new Promise((res) => {
    const s = net.connect({ host, port });
    const finish = (ok) => {
      s.destroy();
      res(ok);
    };
    s.setTimeout(waitMs, () => finish(false));
    s.on('connect', () => finish(true));
    s.on('error', () => finish(false));
  });
}

function readDotEnv(file) {
  const env = {};
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return env;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

/** The main checkout: the parent of the common git folder (a worktree has no .env of the real console). */
function mainCheckout() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: here, encoding: 'utf8' });
  return r.status === 0 ? dirname(r.stdout.trim()) : resolve(here, '..');
}

export async function main(argv) {
  const arg = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const root = mainCheckout();
  const env = readDotEnv(resolve(root, '.env'));
  if (process.env.LOOPS_PUBLIC_URL) env.LOOPS_PUBLIC_URL = process.env.LOOPS_PUBLIC_URL;
  const result = await runChecks({
    pcIp: arg('pc-ip') ?? pcIpFrom(networkInterfaces()),
    name: arg('name'),
    publicDns: arg('public-dns') ?? PUBLIC_DNS,
    env,
    logFile: resolve(root, 'reports/restart-console.log'),
    dnsQuery,
    processes,
    listener,
    readText: async (file) => readFileSync(file, 'utf8'),
    edgeRequest,
    http: request,
    sseLines,
    tcp,
  });
  for (const l of result.lines) console.log(l);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
