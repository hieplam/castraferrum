// Goal G8 (a): an issuer made with deploy/local-name/ca.cnf can sign only names under its name limit.
// The test makes a throwaway issuer, signs `castra.home.arpa` and `bank.example`, serves each certificate on a local
// TLS server and connects with a client that trusts only that issuer. An issuer without `nameConstraints` is the control.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CA_CNF = resolve(__dirname, '../../deploy/local-name/ca.cnf');
const NAME = 'castra.home.arpa';
const OUTSIDE = 'bank.example';
const WIN_OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';

function findOpenssl(): string {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return 'openssl';
  } catch {
    if (existsSync(WIN_OPENSSL)) return WIN_OPENSSL;
    throw new Error('openssl not found on PATH or at the Git for Windows location');
  }
}
const OPENSSL = findOpenssl();

let dir: string;
const env = { ...process.env, LOCAL_NAME: NAME, LOCAL_NAME_LIMIT: NAME };

function openssl(args: string[], over: Record<string, string> = {}): string {
  return execFileSync(OPENSSL, args, { cwd: dir, env: { ...env, ...over }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Makes an issuer from `cnf` and returns its file prefix. */
function makeIssuer(prefix: string, cnf: string): void {
  openssl(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', `${prefix}-key.pem`, '-out', `${prefix}.pem`, '-days', '30', '-subj', '/CN=test issuer', '-config', cnf, '-extensions', 'ca_ext']);
}

/** Signs a server certificate for `name` with the issuer `prefix`. Returns { cert, key } file names. */
function signServer(prefix: string, cnf: string, name: string): { cert: string; key: string } {
  const key = `${prefix}-${name}-key.pem`;
  const csr = `${prefix}-${name}.csr`;
  const cert = `${prefix}-${name}.pem`;
  openssl(['req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', key, '-out', csr, '-subj', `/CN=${name}`]);
  openssl(['x509', '-req', '-in', csr, '-CA', `${prefix}.pem`, '-CAkey', `${prefix}-key.pem`, '-CAcreateserial', '-days', '30', '-extfile', cnf, '-extensions', 'server_ext', '-out', cert], { LOCAL_NAME: name });
  return { cert, key };
}

/** Serves `files` on 127.0.0.1, connects as a client that trusts only `caFile`, and returns the outcome. */
async function connect(files: { cert: string; key: string }, caFile: string, servername: string): Promise<{ ok: boolean; code?: string; message?: string }> {
  const server = tls.createServer({ cert: readFileSync(join(dir, files.cert)), key: readFileSync(join(dir, files.key)) }, (s) => s.end());
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    return await new Promise((res) => {
      const c = tls.connect({ host: '127.0.0.1', port, servername, ca: [readFileSync(join(dir, caFile))] }, () => {
        c.end();
        res({ ok: true });
      });
      c.on('error', (e: NodeJS.ErrnoException) => res({ ok: false, code: e.code, message: e.message }));
    });
  } finally {
    server.close();
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ca-name-limit-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('deploy/local-name/ca.cnf', () => {
  it('writes the name limit and the server name from the two environment variables', () => {
    makeIssuer('limited', CA_CNF);
    const ca = openssl(['x509', '-in', 'limited.pem', '-noout', '-text']);
    expect(ca).toMatch(/X509v3 Name Constraints: critical/);
    expect(ca).toMatch(/Permitted:\s*\n?\s*DNS:castra\.home\.arpa/);
    expect(ca).toMatch(/CA:TRUE, pathlen:0/);
    const server = signServer('limited', CA_CNF, NAME);
    const text = openssl(['x509', '-in', server.cert, '-noout', '-text']);
    expect(text).toMatch(/DNS:castra\.home\.arpa/);
    expect(text).toMatch(/CA:FALSE/);
    expect(text).toMatch(/TLS Web Server Authentication/);
  });

  it('lets a client that trusts only the issuer connect to the limited name', async () => {
    const r = await connect(signServer('limited', CA_CNF, NAME), 'limited.pem', NAME);
    expect(r).toEqual({ ok: true });
  });

  it('rejects a certificate for a name outside the limit, even though the issuer signed it', async () => {
    const r = await connect(signServer('limited', CA_CNF, OUTSIDE), 'limited.pem', OUTSIDE);
    console.log(`ca-name-limit: ${OUTSIDE} gave err.code=${r.code} message=${r.message}`);
    expect(r.ok).toBe(false);
    expect(r.code).toBeTruthy();
    expect(r.message).toMatch(/permitted subtree violation/);
  });

  it('control: an issuer without nameConstraints accepts the name outside the limit', async () => {
    const lines = readFileSync(CA_CNF, 'utf8').split(/\r?\n/).filter((l) => !/^\s*nameConstraints\b/.test(l));
    const open = join(dir, 'ca-nolimit.cnf');
    writeFileSync(open, lines.join('\n'));
    makeIssuer('open', open);
    const r = await connect(signServer('open', open, OUTSIDE), 'open.pem', OUTSIDE);
    expect(r).toEqual({ ok: true });
  });
});
