#!/usr/bin/env node
// Tests the whole local-name chain on the real machine (phase 3 spec D11, task N0): DNS, nginx, TLS, redirect, SSE, port 7070.
//
//   node scripts/local-name-check.mjs [--pc-ip=<address>] [--nginx-conf=<path>] [--name=<name>] [--limit=<name>] [--ca=<path>]
//
// The name is the host of LOOPS_PUBLIC_URL (.env or the environment); --name replaces it. The name limit of the issuer is
// LOCAL_NAME_LIMIT; --limit replaces it. The issuer certificate is %LOCALAPPDATA%/castraferrum/tls/local-ca.pem; --ca replaces it.
// One line per check (`PASS <id>` or `FAIL <id>: <reason>`), then `local name: <passed>/10 checks pass`.
// Exit 0 only when all 10 checks pass. The tool only reads: it changes no system setting.
// `runChecks(deps)` takes every outside effect as a function, so the unit test runs it with fakes.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

const WIN_OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';
const CA_FILE = 'local-ca.pem';
const CA_KEY_FILE = 'local-ca-key.pem';
const CHECK_LIMIT_MS = 25_000;
const SSE_WAIT_MS = 20_000;
const SYSTEM_QUERIES = 20;
const COOKIE_NAME = 'castra_session'; // SESSION_COOKIE of shared/contracts/auth.ts (a .mjs script cannot import the .ts file)

export const CHECK_IDS = ['dns-direct', 'dns-system', 'dns-only-pc', 'nginx-test', 'tls', 'ca-name-limit', 'ca-key-absent', 'redirect', 'sse', 'port-closed'];

// The same rule as `networkAddresses` in server/config.ts (lan-access D3): the first IPv4 address that is not internal,
// not link-local and not on a virtual adapter. That function is TypeScript and not exported, so a .mjs script cannot reuse it.
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

function same(list, ip) {
  return list.length > 0 && list.every((a) => a === ip);
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

/** The Name Constraints extension in `openssl x509 -text` output: is it there, is it critical, which DNS names are permitted. */
export function parseNameLimit(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /X509v3 Name Constraints:/.test(l));
  if (at < 0) return { present: false, critical: false, permitted: [] };
  const indent = (l) => l.length - l.trimStart().length;
  const permitted = [];
  let inPermitted = false;
  for (const l of lines.slice(at + 1)) {
    if (l.trim() === '' || indent(l) <= indent(lines[at])) break;
    if (/^\s*Permitted:/.test(l)) inPermitted = true;
    else if (/^\s*Excluded:/.test(l)) inPermitted = false;
    else if (inPermitted) permitted.push(...[...l.matchAll(/DNS:([^\s,]+)/g)].map((m) => m[1]));
  }
  return { present: true, critical: /Name Constraints:\s*critical/.test(lines[at]), permitted };
}

/** Every check: resolves when it passes, throws an Error with the reason when it fails. */
function checks(d) {
  const ip = d.pcIp;
  const needName = () => {
    if (!d.name) throw new Error('no name: set LOOPS_PUBLIC_URL (https://<name>) in .env, or pass --name=<name>');
    return d.name;
  };
  const needLimit = () => {
    if (!d.limit) throw new Error('no name limit: set LOCAL_NAME_LIMIT in .env or the environment, or pass --limit=<name>');
    return d.limit;
  };
  const caPem = () => {
    try {
      return d.readFile(d.caPath);
    } catch (e) {
      throw new Error(`cannot read ${d.caPath}: ${msg(e)}`);
    }
  };
  const needIp = () => {
    if (!ip) throw new Error('no PC IP address found; pass --pc-ip=<address>');
  };
  return {
    async 'dns-direct'() {
      needIp();
      const name = needName();
      const got = await d.dnsQuery(ip, name);
      if (!same(got, ip)) throw new Error(`${ip}:53 answered ${got.join(', ') || 'nothing'}, expected ${ip}`);
    },
    async 'dns-system'() {
      needIp();
      const name = needName();
      const bad = [];
      for (let i = 0; i < SYSTEM_QUERIES; i += 1) {
        let got;
        try {
          got = await d.dnsQuery(null, name);
        } catch (e) {
          got = [`error ${msg(e)}`];
        }
        if (!same(got, ip)) bad.push(got.join(', ') || 'nothing');
      }
      if (bad.length) throw new Error(`${bad.length} of ${SYSTEM_QUERIES} answers were not ${ip} (first: ${bad[0]})`);
    },
    async 'dns-only-pc'() {
      needIp();
      const servers = await d.dnsServers(ip);
      if (servers.length !== 1 || servers[0] !== ip) throw new Error(`DNS servers are [${servers.join(', ')}], expected only ${ip}`);
    },
    async 'nginx-test'() {
      const r = await d.exec('nginx', ['-t', '-c', d.nginxConf]);
      if (r.notFound) throw new Error('nginx not found');
      const out = `${r.stdout}\n${r.stderr}`;
      if (!/syntax is ok/.test(out) || !/test is successful/.test(out)) {
        throw new Error(`nginx -t said: ${out.trim().split('\n').slice(-2).join(' | ')}`);
      }
    },
    async tls() {
      const name = needName();
      const ca = caPem();
      const v = await d.tlsVerify(name, 443, ca);
      if (!v.authorized) throw new Error(`certificate not trusted: ${v.error ?? 'unknown'}`);
      const r = await d.http({ url: `https://${name}/api/health`, ca });
      if (r.status !== 200) throw new Error(`GET /api/health gave ${r.status}, expected 200`);
    },
    async 'ca-name-limit'() {
      const limit = needLimit();
      const lim = parseNameLimit(await d.caText(d.caPath));
      if (!lim.present) throw new Error(`${d.caPath} has no name limit: an issuer without it can sign any name`);
      if (!lim.critical) throw new Error('the name limit of the issuer is not marked critical');
      if (lim.permitted.length !== 1 || lim.permitted[0] !== limit) {
        throw new Error(`the issuer permits [${lim.permitted.join(', ')}], expected only ${limit}`);
      }
    },
    async 'ca-key-absent'() {
      const name = needName();
      const dir = dirname(d.caPath);
      const files = await d.listTls(dir);
      if (files.some((f) => f.name === CA_KEY_FILE)) throw new Error(`${CA_KEY_FILE} is in ${dir}: move it off this PC or delete it`);
      const keys = files.filter((f) => f.privateKey && f.name !== `${name}-key.pem`).map((f) => f.name);
      if (keys.length) throw new Error(`private key in ${dir} besides ${name}-key.pem: ${keys.join(', ')}`);
    },
    async redirect() {
      const name = needName();
      const r = await d.http({ url: `http://${name}/x` });
      const want = `https://${name}/x`;
      if (r.status !== 301) throw new Error(`GET /x gave ${r.status}, expected 301`);
      if (r.headers.location !== want) throw new Error(`Location was ${r.headers.location ?? 'missing'}, expected ${want}`);
    },
    async sse() {
      const { LOOPS_USERNAME: username, LOOPS_PASSWORD: password } = d.env;
      if (!username || !password) throw new Error('LOOPS_USERNAME or LOOPS_PASSWORD missing in .env');
      const name = needName();
      const ca = caPem();
      const login = await d.http({ url: `https://${name}/api/auth/login`, method: 'POST', body: { username, password }, ca });
      if (login.status !== 200) throw new Error(`sign-in gave ${login.status}, expected 200`);
      const setCookie = [].concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE_NAME}=`));
      if (!setCookie) throw new Error(`sign-in set no ${COOKIE_NAME} cookie`);
      const lines = await d.sseLines({ url: `https://${name}/api/events`, cookie: setCookie.split(';')[0], ca, waitMs: SSE_WAIT_MS });
      if (!lines.includes(':ok')) throw new Error('stream sent no :ok');
      if (!lines.includes(':ping')) throw new Error(`no :ping within ${SSE_WAIT_MS / 1000} s`);
    },
    async 'port-closed'() {
      needIp();
      if (await d.tcp(ip, 7070)) throw new Error(`${ip}:7070 accepts connections, expected refused`);
      if (!(await d.tcp('127.0.0.1', 7070))) throw new Error('127.0.0.1:7070 refuses connections, expected open');
    },
  };
}

/** Runs the 10 checks in order and returns { lines, passed, total, exitCode }. Never stops at the first failure. */
export async function runChecks(deps) {
  const d = { env: {}, limitMs: CHECK_LIMIT_MS, ...deps };
  d.name ??= (() => {
    try {
      return nameFromUrl(d.env.LOOPS_PUBLIC_URL);
    } catch {
      return undefined;
    }
  })();
  d.limit ??= d.env.LOCAL_NAME_LIMIT;
  const table = checks(d);
  const lines = [];
  let passed = 0;
  for (const id of CHECK_IDS) {
    try {
      await withLimit(table[id](), d.limitMs);
      lines.push(`PASS ${id}`);
      passed += 1;
    } catch (e) {
      lines.push(`FAIL ${id}: ${msg(e)}`);
    }
  }
  lines.push(`local name: ${passed}/${CHECK_IDS.length} checks pass`);
  return { lines, passed, total: CHECK_IDS.length, exitCode: passed === CHECK_IDS.length ? 0 : 1 };
}

// ---- real implementations ----

async function caText(file) {
  for (const bin of ['openssl', WIN_OPENSSL]) {
    const r = await exec(bin, ['x509', '-in', file, '-noout', '-text']);
    if (r.notFound) continue;
    if (r.code !== 0) throw new Error(`openssl x509 failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
    return r.stdout;
  }
  throw new Error('openssl not found');
}

async function listTls(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    throw new Error(`cannot read ${dir}: ${msg(e)}`);
  }
  const out = [];
  for (const name of names) {
    const p = join(dir, name);
    let privateKey = false;
    try {
      const st = statSync(p);
      if (!st.isFile()) continue;
      privateKey = st.size < 1_000_000 && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(readFileSync(p, 'latin1'));
    } catch {
      continue;
    }
    out.push({ name, privateKey });
  }
  return out;
}

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

async function dnsQuery(server, name) {
  if (server === null) return (await dns.promises.lookup(name, { family: 4, all: true })).map((a) => a.address);
  const r = new dns.promises.Resolver({ timeout: 5000, tries: 1 });
  r.setServers([`${server}:53`]);
  return r.resolve4(name);
}

async function dnsServers(ip) {
  const script = `$i=(Get-NetIPAddress -IPAddress '${ip}' -ErrorAction Stop).InterfaceIndex; (Get-DnsClientServerAddress -InterfaceIndex $i).ServerAddresses`;
  const r = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  if (r.notFound) throw new Error('powershell.exe not found');
  if (r.code !== 0) throw new Error(`Get-DnsClientServerAddress failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function tlsVerify(host, port, ca) {
  return new Promise((res) => {
    const s = tls.connect({ host, port, servername: host, ca, rejectUnauthorized: false }, () => {
      s.end();
      res({ authorized: s.authorized, error: s.authorizationError ? String(s.authorizationError) : undefined });
    });
    s.on('error', (e) => res({ authorized: false, error: msg(e) }));
  });
}

function request({ url, method = 'GET', headers = {}, body, ca }) {
  return new Promise((res, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const h = payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers } : headers;
    const req = lib.request(u, { method, ca, headers: h }, (r) => {
      r.resume();
      r.on('end', () => res({ status: r.statusCode ?? 0, headers: r.headers }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function sseLines({ url, cookie, ca, waitMs }) {
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
    req = https.request(new URL(url), { ca, headers: { cookie, accept: 'text/event-stream' } }, (r) => {
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

function tcp(host, port) {
  return new Promise((res) => {
    const s = net.connect({ host, port });
    const finish = (ok) => {
      s.destroy();
      res(ok);
    };
    s.setTimeout(5000, () => finish(false));
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

export async function main(argv) {
  const arg = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const pcIp = arg('pc-ip') ?? pcIpFrom(networkInterfaces());
  const env = readDotEnv(resolve('.env'));
  for (const k of ['LOOPS_PUBLIC_URL', 'LOCAL_NAME_LIMIT']) if (process.env[k]) env[k] = process.env[k];
  const appData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  const result = await runChecks({
    pcIp,
    name: arg('name'),
    limit: arg('limit'),
    caPath: arg('ca') ?? join(appData, 'castraferrum', 'tls', CA_FILE),
    nginxConf: arg('nginx-conf') ?? 'C:/nginx/conf/nginx.conf',
    env,
    dnsQuery,
    dnsServers,
    exec,
    tlsVerify,
    http: request,
    sseLines,
    tcp,
    readFile: (p) => readFileSync(p),
    caText,
    listTls,
  });
  for (const l of result.lines) console.log(l);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
