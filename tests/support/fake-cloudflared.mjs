// A stand-in for `cloudflared tunnel --no-autoupdate --metrics <host:port> run` in tests (remote-access spec G5, D9).
//
// - It reads the token from `TUNNEL_TOKEN`. With no token it exits 1. With the token `bad` it prints
//   `ERR Unauthorized: Invalid tunnel secret` and exits 1, as the real connector does with a wrong token.
// - Otherwise it runs a streaming reverse proxy from `FAKE_TUNNEL_PORT` (on 127.0.0.1) to `FAKE_TUNNEL_ORIGIN` (default
//   `http://127.0.0.1:<LOOPS_PORT>`), which adds `X-Forwarded-Proto: https` and `CF-Connecting-IP: 203.0.113.7` and replaces the
//   values that a client sent, as the Cloudflare edge does. With no `FAKE_TUNNEL_PORT` it runs no proxy.
// - It serves `GET /ready` on the `--metrics` address (200 once the proxy listens), then prints `INF Registered tunnel connection`.
// - `FAKE_CLOUDFLARED_REPORT=<file>`: it writes `{ pid, argv, token }` to that file, so a test can check the arguments and the
//   environment of the child without reading its log.
// - `FAKE_CLOUDFLARED_ECHO_TOKEN=1`: it prints the token and a part of it in a log line (the redaction test).
// - It exits when its parent process is gone, so a test that kills the console leaves no process behind. The real connector
//   does not do this.
import { writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';

const argv = process.argv.slice(2);
const token = process.env.TUNNEL_TOKEN ?? '';
if (process.env.FAKE_CLOUDFLARED_REPORT) {
  writeFileSync(process.env.FAKE_CLOUDFLARED_REPORT, JSON.stringify({ pid: process.pid, argv, token }));
}

const say = (line) => process.stderr.write(`${new Date().toISOString()} ${line}\n`);

const metricsAt = argv.indexOf('--metrics');
const metrics = metricsAt === -1 ? undefined : argv[metricsAt + 1];
if (argv[0] !== 'tunnel' || argv.at(-1) !== 'run' || !metrics) {
  say(`ERR fake cloudflared: unexpected arguments ${JSON.stringify(argv)}`);
  process.exit(2);
}
if (token === '') {
  say('ERR "cloudflared tunnel run" requires the ID or name of the tunnel to run, or a token');
  process.exit(1);
}
if (token === 'bad') {
  say('ERR Unauthorized: Invalid tunnel secret');
  process.exit(1);
}
if (process.env.FAKE_CLOUDFLARED_ECHO_TOKEN === '1') {
  say(`INF token=${token} part=${token.slice(2, 14)}`);
}

const parent = process.ppid;
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    process.exit(0);
  }
}, 500).unref();

let ready = false;

async function startProxy() {
  const port = process.env.FAKE_TUNNEL_PORT;
  if (!port) return;
  const origin = new URL(process.env.FAKE_TUNNEL_ORIGIN || `http://127.0.0.1:${process.env.LOOPS_PORT ?? '7070'}`);
  const server = createServer((req, res) => {
    const headers = { ...req.headers, 'x-forwarded-proto': 'https', 'cf-connecting-ip': '203.0.113.7' };
    const upstream = request({ host: origin.hostname, port: origin.port, method: req.method, path: req.url, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.on('data', (chunk) => res.write(chunk));
      up.on('end', () => res.end());
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), '127.0.0.1', resolve);
  });
}

const [metricsHost, metricsPort] = [metrics.slice(0, metrics.lastIndexOf(':')), metrics.slice(metrics.lastIndexOf(':') + 1)];
createServer((req, res) => {
  if (req.url === '/ready') {
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: ready ? 200 : 503, readyConnections: ready ? 1 : 0 }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(Number(metricsPort), metricsHost, async () => {
  say(`INF Starting metrics server on ${metrics}/metrics`);
  try {
    await startProxy();
  } catch (err) {
    say(`ERR fake cloudflared: the proxy cannot listen: ${err.message}`);
    process.exit(1);
  }
  ready = true;
  say('INF Registered tunnel connection connIndex=0 location=test protocol=quic');
});
