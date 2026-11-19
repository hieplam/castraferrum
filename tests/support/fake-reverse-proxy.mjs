// A stand-in for nginx in tests (local-name spec D4): an HTTP proxy on a free port that forwards to the server and adds the headers
// nginx adds. It sets `X-Forwarded-Proto: https`, and sets `X-Real-IP` from the request header `x-test-client` (the test picks the
// device address), replacing any `X-Real-IP` that the client sent. It does not buffer: SSE lines pass through as they arrive.
import { request, createServer } from 'node:http';

/** Starts the proxy. Resolves with its port and a stop function. */
export function startFakeReverseProxy({ targetPort, targetHost = '127.0.0.1' }) {
  const server = createServer((req, res) => {
    const headers = { ...req.headers, host: req.headers.host ?? `${targetHost}:${targetPort}`, 'x-forwarded-proto': 'https' };
    delete headers['x-real-ip'];
    delete headers['x-forwarded-for'];
    const client = headers['x-test-client'];
    delete headers['x-test-client'];
    if (typeof client === 'string' && client !== '') headers['x-real-ip'] = client;
    const upstream = request({ host: targetHost, port: targetPort, method: req.method, path: req.url, headers }, (up) => {
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
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        stop: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
