import type { DbProbe } from '../ports/db-probe';
import type { TunnelStatus } from '../ports/tunnel';
import type { HealthReport, HealthService } from './contracts';

export class DefaultHealthService implements HealthService {
  readonly #db: DbProbe;
  readonly #tunnel: TunnelStatus | undefined;

  /** `tunnel`: the tunnel runner (remote-access spec D10); none = the console runs without `--cloudflare`, so the state is `off`. */
  constructor(deps: { db: DbProbe; tunnel?: TunnelStatus }) {
    this.#db = deps.db;
    this.#tunnel = deps.tunnel;
  }

  async check(): Promise<HealthReport> {
    const up = await this.#db.ping().catch(() => false);
    return { ok: up, db: up ? 'up' : 'down', tunnel: this.#tunnel?.state() ?? 'off' };
  }
}
