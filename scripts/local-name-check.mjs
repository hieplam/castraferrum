#!/usr/bin/env node
// Tests the whole local-name chain on the real machine (phase 3 spec D11, task N0): DNS, nginx, TLS, redirect, SSE, port 7070.
//
//   node scripts/local-name-check.mjs [--pc-ip=<address>] [--nginx-conf=<path>] [--name=castra.home.arpa]
//
// One line per check (`PASS <id>` or `FAIL <id>: <reason>`), then `local name: <passed>/8 checks pass`.
// Exit 0 only when all 8 checks pass. The tool only reads: it changes no system setting.
// `runChecks(deps)` takes every outside effect as a function, so the unit test runs it with fakes.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

const NAME = 'castra.home.arpa';
const CHECK_LIMIT_MS = 25_000;
const SSE_WAIT_MS = 20_000;
const SYSTEM_QUERIES = 20;
const COOKIE_NAME = 'castra_session'; // SESSION_COOKIE of shared/contracts/auth.ts (a .mjs script cannot import the .ts file)

export const CHECK_IDS = ['dns-direct', 'dns-system', 'dns-only-pc', 'nginx-test', 'tls', 'redirect', 'sse', 'port-closed'];

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

/** The root CA file of mkcert, or a thrown Error with the reason. */
async function rootCa(d) {
  const root = await d.exec('mkcert', ['-CAROOT']);
  if (root.notFound) throw new Error('mkcert not found');
  const caDir = root.stdout.trim();
  if (root.code !== 0 || !caDir) throw new Error(`mkcert -CAROOT failed: ${root.stderr.trim()}`);
  try {
    return d.readFile(join(caDir, 'rootCA.pem'));
  } catch (e) {
    throw new Error(`cannot read rootCA.pem: ${msg(e)}`);
  }
}

/** Every check: resolves when it passes, throws an Error with the reason when it fails. */
function checks(d) {
  const ip = d.pcIp;
  const needIp = () => {
    if (!ip) throw new Error('no PC IP address found; pass --pc-ip=<address>');
  };
  return {
    async 'dns-direct'() {
      needIp();
      const got = await d.dnsQuery(ip, d.name);
      if (!same(got, ip)) throw new Error(`${ip}:53 answered ${got.join(', ') || 'nothing'}, expected ${ip}`);
    },
    async 'dns-system'() {
      needIp();
      const bad = [];
      for (let i = 0; i < SYSTEM_QUERIES; i += 1) {
        let got;
        try {
          got = await d.dnsQuery(null, d.name);
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
      const ca = await rootCa(d);
      const v = await d.tlsVerify(d.name, 443, ca);
      if (!v.authorized) throw new Error(`certificate not trusted: ${v.error ?? 'unknown'}`);
      const r = await d.http({ url: `https://${d.name}/api/health`, ca });
      if (r.status !== 200) throw new Error(`GET /api/health gave ${r.status}, expected 200`);
    },
    async redirect() {
      const r = await d.http({ url: `http://${d.name}/x` });
      const want = `https://${d.name}/x`;
      if (r.status !== 301) throw new Error(`GET /x gave ${r.status}, expected 301`);
      if (r.headers.location !== want) throw new Error(`Location was ${r.headers.location ?? 'missing'}, expected ${want}`);
    },
    async sse() {
      const { LOOPS_USERNAME: username, LOOPS_PASSWORD: password } = d.env;
      if (!username || !password) throw new Error('LOOPS_USERNAME or LOOPS_PASSWORD missing in .env');
      const ca = await rootCa(d);
      const login = await d.http({ url: `https://${d.name}/api/auth/login`, method: 'POST', body: { username, password }, ca });
      if (login.status !== 200) throw new Error(`sign-in gave ${login.status}, expected 200`);
      const setCookie = [].concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE_NAME}=`));
      if (!setCookie) throw new Error(`sign-in set no ${COOKIE_NAME} cookie`);
      const lines = await d.sseLines({ url: `https://${d.name}/api/events`, cookie: setCookie.split(';')[0], ca, waitMs: SSE_WAIT_MS });
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

/** Runs the 8 checks in order and returns { lines, passed, total, exitCode }. Never stops at the first failure. */
export async function runChecks(deps) {
  const d = { name: NAME, env: {}, limitMs: CHECK_LIMIT_MS, ...deps };
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
  const result = await runChecks({
    pcIp,
    name: arg('name') ?? NAME,
    nginxConf: arg('nginx-conf') ?? 'C:/nginx/conf/nginx.conf',
    env: readDotEnv(resolve('.env')),
    dnsQuery,
    dnsServers,
    exec,
    tlsVerify,
    http: request,
    sseLines,
    tcp,
    readFile: (p) => readFileSync(p),
  });
  for (const l of result.lines) console.log(l);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
