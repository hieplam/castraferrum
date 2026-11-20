#!/usr/bin/env node
// Tests the whole local-name chain on the real machine (phase 3 spec D11, tasks N0 and N6): public DNS, the DNS servers of the PC,
// nginx, TLS, the Let's Encrypt certificate, the absence of the old own issuer, redirect, SSE, port 7070.
//
//   node scripts/local-name-check.mjs [--pc-ip=<address>] [--nginx=<path>] [--nginx-conf=<path>] [--name=<name>] [--public-dns=<address>]
//
// nginx is C:/nginx/nginx.exe when that file exists, else `nginx` on PATH; --nginx replaces it. A given program runs with
// its own folder as the prefix (-p), so `nginx -t` finds logs/ there. The config is C:/nginx/conf/castra.conf (the README
// example); --nginx-conf replaces it. nginx-test runs on a temporary copy of that file with a throwaway certificate pair
// (the real key folder is not readable by this user); the temporary folder is deleted afterwards.
// The name is the host of LOOPS_PUBLIC_URL (.env or the environment); --name replaces it. The public DNS server is 1.1.1.1;
// --public-dns replaces it. Every TLS and HTTPS connection uses the trusted roots of Node, never a file of this machine.
// One line per check (`PASS <id>` or `FAIL <id>: <reason>`), then `local name: <passed>/10 checks pass`.
// Exit 0 only when all 10 checks pass. The tool changes no system setting (its only writes are a temporary folder that it deletes).
// `runChecks(deps)` takes every outside effect as a function, so the unit test runs it with fakes.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { homedir, networkInterfaces, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

const PUBLIC_DNS = '1.1.1.1';
const OLD_ISSUER_SUBJECT = 'CN=local home issuer'; // the own issuer of the first design (spec D16)
const ISSUER_ORGANIZATION = "Let's Encrypt";
const MAX_AGE = 0.75; // a certificate older than this part of its lifetime was not renewed in time (spec G9)
const CHECK_LIMIT_MS = 25_000;
const SSE_WAIT_MS = 20_000;
const SYSTEM_QUERIES = 20;
const WIN_OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe'; // Git for Windows ships openssl
const COOKIE_NAME = 'castra_session'; // SESSION_COOKIE of shared/contracts/auth.ts (a .mjs script cannot import the .ts file)

export const CHECK_IDS = ['dns-public', 'dns-pc-servers', 'dns-system', 'nginx-test', 'tls', 'cert-issuer', 'own-issuer-absent', 'redirect', 'sse', 'port-closed'];

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

/** The address form that `Resolver.setServers` takes: an IPv6 address is written `[<address>]:53`. */
export function serverAddress(address) {
  return address.includes(':') ? `[${address}]:53` : `${address}:53`;
}

/** The DNS names in the `subjectaltname` text of a certificate (`DNS:a, DNS:b`), in lower case. */
function altNames(text) {
  return String(text ?? '')
    .split(/,\s*/)
    .filter((e) => e.startsWith('DNS:'))
    .map((e) => e.slice(4).toLowerCase());
}

// Lists the certificates of the old own issuer in the Root store of the current user and of the machine. It prints one line for each.
const PS_OLD_ISSUER = `Get-ChildItem Cert:\\CurrentUser\\Root, Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -eq '${OLD_ISSUER_SUBJECT}' } | ForEach-Object { "$($_.PSParentPath -replace '^.*::','') $($_.Thumbprint)" }`;

/** Every check: resolves when it passes (it may return a text that follows `PASS <id>`), throws an Error with the reason when it fails. */
function checks(d) {
  const ip = d.pcIp;
  const needName = () => {
    if (!d.name) throw new Error('no name: set LOOPS_PUBLIC_URL (https://<name>) in .env, or pass --name=<name>');
    return d.name;
  };
  const needIp = () => {
    if (!ip) throw new Error('no PC IP address found; pass --pc-ip=<address>');
  };
  /** The answer of one DNS server as a list. An empty answer is []. Another error becomes a text in the list. */
  const answer = async (server, name) => {
    try {
      return await d.dnsQuery(server, name);
    } catch (e) {
      return [`error ${msg(e)}`];
    }
  };
  return {
    async 'dns-public'() {
      needIp();
      const name = needName();
      const got = await answer(serverAddress(d.publicDns), name);
      if (!same(got, ip)) throw new Error(`${d.publicDns} answered ${got.join(', ') || 'an empty answer'}, expected ${ip}`);
    },
    async 'dns-pc-servers'() {
      needIp();
      const name = needName();
      const servers = await d.dnsServers(ip);
      if (servers.length === 0) throw new Error('the adapter of this PC lists no DNS server');
      const bad = [];
      for (const server of servers) {
        const got = await answer(serverAddress(server), name);
        if (!same(got, ip)) bad.push(`${server} gave ${got.join(', ') || 'an empty answer'}`);
      }
      if (bad.length) throw new Error(`expected ${ip} from each DNS server of the PC, but ${bad.join('; ')}`);
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
    async 'nginx-test'() {
      // The key folder is readable only by SYSTEM and Administrators (spec D6 A), so nginx -t runs on a temporary copy of the
      // deployed file whose two ssl lines point to a throwaway self-signed pair. The real files are proven by `tls` and `cert-issuer`.
      const program = d.nginx ?? 'nginx';
      const prefix = program === 'nginx' ? [] : ['-p', `${dirname(program).replace(/\\/g, '/')}/`];
      let text;
      try {
        text = await d.readText(d.nginxConf);
      } catch (e) {
        throw new Error(`cannot read ${d.nginxConf}: ${msg(e)}`);
      }
      const dir = mkdtempSync(join(tmpdir(), 'castra-nginx-test-'));
      try {
        const slash = dir.replace(/\\/g, '/');
        const crt = `${slash}/test-chain.pem`;
        const key = `${slash}/test-key.pem`;
        let openssl = 'openssl';
        let probe = await d.exec(openssl, ['version']);
        if (probe.notFound) {
          openssl = WIN_OPENSSL;
          probe = await d.exec(openssl, ['version']);
        }
        if (probe.notFound) throw new Error(`openssl not found (on PATH or at ${WIN_OPENSSL}): it makes the throwaway pair for nginx -t`);
        const made = await d.exec(openssl, ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=nginx-test']);
        if (made.code !== 0) throw new Error(`openssl could not make the throwaway pair: ${(made.stderr || made.stdout).trim().split('\n').slice(-1)[0]}`);
        const copy = `${slash}/castra.conf`;
        const rewritten = text.replace(/^(\s*ssl_certificate_key\s+)[^;]+;/gm, `$1${key};`).replace(/^(\s*ssl_certificate\s+)[^;]+;/gm, `$1${crt};`);
        writeFileSync(copy, rewritten);
        const r = await d.exec(program, [...prefix, '-t', '-c', copy]);
        if (r.notFound) throw new Error('nginx not found');
        const out = `${r.stdout}\n${r.stderr}`;
        if (!/syntax is ok/.test(out) || !/test is successful/.test(out)) {
          throw new Error(`nginx -t said: ${out.trim().split('\n').slice(-2).join(' | ')}`);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    async tls() {
      const name = needName();
      const v = await d.tlsVerify(name, 443);
      if (!v.authorized) throw new Error(`certificate not trusted: ${v.error ?? 'unknown'}`);
      const r = await d.http({ url: `https://${name}/api/health` });
      if (r.status !== 200) throw new Error(`GET /api/health gave ${r.status}, expected 200`);
    },
    async 'cert-issuer'() {
      const name = needName();
      let cert;
      try {
        cert = await d.peerCert(name, 443);
      } catch (e) {
        throw new Error(`cannot read the certificate of ${name}:443: ${msg(e)}`);
      }
      const info = `serial ${cert.serialNumber}, valid ${cert.valid_from} to ${cert.valid_to}`;
      const issuer = [].concat(cert.issuer?.O ?? []).join(', ');
      const from = Date.parse(cert.valid_from);
      const to = Date.parse(cert.valid_to);
      const now = d.now();
      const problems = [];
      if (issuer !== ISSUER_ORGANIZATION) problems.push(`the issuer organization is ${issuer || 'missing'}, expected ${ISSUER_ORGANIZATION}`);
      if (!altNames(cert.subjectaltname).includes(name.toLowerCase())) problems.push(`${name} is not in the subject alternative names (${cert.subjectaltname ?? 'none'})`);
      if (!(from <= to)) problems.push('the validity dates cannot be read');
      else if (now < from) problems.push('the certificate is not valid yet');
      else if (now - from >= MAX_AGE * (to - from)) {
        problems.push(`the certificate used ${Math.round(((now - from) / (to - from)) * 100)} % of its lifetime, expected less than ${MAX_AGE * 100} %: the renewal did not run`);
      }
      if (problems.length) throw new Error(`${problems.join('; ')}. ${info}`);
      return info;
    },
    async 'own-issuer-absent'() {
      const r = await d.exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_OLD_ISSUER]);
      if (r.notFound) throw new Error('powershell.exe not found');
      if (r.code !== 0) throw new Error(`reading the Root stores failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
      const problems = [];
      const found = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (found.length) problems.push(`${OLD_ISSUER_SUBJECT} is trusted (${found.join(', ')}): run certutil -user -delstore Root "local home issuer"`);
      const files = await d.listFolder(d.oldTlsDir);
      if (files.length) problems.push(`${d.oldTlsDir} holds ${files.join(', ')}: delete the folder`);
      if (problems.length) throw new Error(problems.join('; '));
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
      const login = await d.http({ url: `https://${name}/api/auth/login`, method: 'POST', body: { username, password } });
      if (login.status !== 204 && login.status !== 200) throw new Error(`sign-in gave ${login.status}, expected 204`);
      const setCookie = [].concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE_NAME}=`));
      if (!setCookie) throw new Error(`sign-in set no ${COOKIE_NAME} cookie`);
      const lines = await d.sseLines({ url: `https://${name}/api/events`, cookie: setCookie.split(';')[0], waitMs: SSE_WAIT_MS });
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
  const d = { env: {}, limitMs: CHECK_LIMIT_MS, publicDns: PUBLIC_DNS, now: () => Date.now(), ...deps };
  d.name ??= (() => {
    try {
      return nameFromUrl(d.env.LOOPS_PUBLIC_URL);
    } catch {
      return undefined;
    }
  })();
  const table = checks(d);
  const lines = [];
  let passed = 0;
  for (const id of CHECK_IDS) {
    try {
      const detail = await withLimit(table[id](), d.limitMs);
      lines.push(detail ? `PASS ${id} ${detail}` : `PASS ${id}`);
      passed += 1;
    } catch (e) {
      lines.push(`FAIL ${id}: ${msg(e)}`);
    }
  }
  lines.push(`local name: ${passed}/${CHECK_IDS.length} checks pass`);
  return { lines, passed, total: CHECK_IDS.length, exitCode: passed === CHECK_IDS.length ? 0 : 1 };
}

// ---- real implementations ----

/** The names in the folder, or [] when the folder does not exist. */
async function listFolder(dir) {
  try {
    return readdirSync(dir);
  } catch (e) {
    if (e?.code === 'ENOENT') return [];
    throw new Error(`cannot read ${dir}: ${msg(e)}`);
  }
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

/** `server` is null (the system resolver) or `<address>:53` / `[<address>]:53`. An empty answer gives []. */
export async function dnsQuery(server, name) {
  if (server === null) return (await dns.promises.lookup(name, { family: 4, all: true })).map((a) => a.address);
  const r = new dns.promises.Resolver({ timeout: 5000, tries: 1 });
  r.setServers([server]);
  try {
    return await r.resolve4(name);
  } catch (e) {
    if (e?.code === 'ENODATA' || e?.code === 'ENOTFOUND') return [];
    throw e;
  }
}

/** The DNS servers of the adapter that holds `ip`, IPv4 and IPv6, each one once, without an IPv6 zone (`%12`). */
async function dnsServers(ip) {
  const script = `$i=(Get-NetIPAddress -IPAddress '${ip}' -ErrorAction Stop).InterfaceIndex; (Get-DnsClientServerAddress -InterfaceIndex $i).ServerAddresses`;
  const r = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  if (r.notFound) throw new Error('powershell.exe not found');
  if (r.code !== 0) throw new Error(`Get-DnsClientServerAddress failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
  return [...new Set(r.stdout.split(/\r?\n/).map((s) => s.trim().replace(/%.*$/, '')).filter(Boolean))];
}

/** Opens TLS with the default trusted roots of Node (no `ca` option). The outcome is `authorized` or the error code. */
export function tlsVerify(host, port) {
  return new Promise((res) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      s.end();
      res({ authorized: s.authorized, error: s.authorizationError ? String(s.authorizationError) : undefined });
    });
    s.on('error', (e) => res({ authorized: false, error: msg(e) }));
  });
}

/** Opens its own TLS connection and reads the certificate. It accepts an untrusted certificate, so it can name its issuer. */
export function peerCert(host, port) {
  return new Promise((res, reject) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const cert = s.getPeerCertificate();
      s.end();
      if (!cert || !cert.valid_from) reject(new Error('the server sent no certificate'));
      else res(cert);
    });
    s.on('error', reject);
  });
}

function request({ url, method = 'GET', headers = {}, body }) {
  return new Promise((res, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const h = payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers } : headers;
    const req = lib.request(u, { method, headers: h }, (r) => {
      r.resume();
      r.on('end', () => res({ status: r.statusCode ?? 0, headers: r.headers }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function sseLines({ url, cookie, waitMs }) {
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
    req = https.request(new URL(url), { headers: { cookie, accept: 'text/event-stream' } }, (r) => {
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
  if (process.env.LOOPS_PUBLIC_URL) env.LOOPS_PUBLIC_URL = process.env.LOOPS_PUBLIC_URL;
  const appData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  const result = await runChecks({
    pcIp,
    name: arg('name'),
    publicDns: arg('public-dns') ?? PUBLIC_DNS,
    oldTlsDir: join(appData, 'castraferrum', 'tls'),
    nginx: arg('nginx') ?? (existsSync('C:/nginx/nginx.exe') ? 'C:/nginx/nginx.exe' : 'nginx'),
    nginxConf: arg('nginx-conf') ?? 'C:/nginx/conf/castra.conf',
    env,
    dnsQuery,
    dnsServers,
    exec,
    readText: async (file) => readFileSync(file, 'utf8'),
    tlsVerify,
    peerCert,
    http: request,
    sseLines,
    tcp,
    listFolder,
  });
  for (const l of result.lines) console.log(l);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
