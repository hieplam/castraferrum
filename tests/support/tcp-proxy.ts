import { connect, createServer, type AddressInfo, type Server, type Socket } from 'node:net';

/**
 * A TCP proxy in front of Postgres to fake "Postgres dies midway" without stopping the shared container:
 * `stop()` cuts every open connection abruptly (RST - the client gets ECONNRESET as when Postgres is stopped) + stops listening;
 * `start(port)` listens again on the same port. `start(port, '0.0.0.0')` listens on every interface: the acceptance journey
 * (tests/e2e/acceptance.journey.spec.ts) reaches the test server through the machine's LAN address that way.
 */
export class TcpProxy {
  readonly #target: { host: string; port: number };
  readonly #sockets = new Set<Socket>();
  #server: Server | undefined;

  constructor(target: { host: string; port: number }) {
    this.#target = target;
  }

  async start(port = 0, host = '127.0.0.1'): Promise<number> {
    const server = createServer((client) => {
      const upstream = connect(this.#target.port, this.#target.host);
      const kill = () => {
        client.destroy();
        upstream.destroy();
      };
      for (const s of [client, upstream]) {
        this.#sockets.add(s);
        s.on('error', kill);
        s.on('close', () => {
          this.#sockets.delete(s);
          kill();
        });
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
    this.#server = server;
    return (server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    for (const s of this.#sockets) s.resetAndDestroy();
    this.#sockets.clear();
    const server = this.#server;
    this.#server = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
