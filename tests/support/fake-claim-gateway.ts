// A ClaimGateway for service tests: labels in a Set, no process. The test decides what refuses and what fails.
import type { ClaimConfig, ClaimGateway, ClaimResult, ReleaseWhy, TaskRef } from '../../server/ports/claims';

export type GatewayCall = { op: 'claim'; key: string } | { op: 'release'; key: string; why: ReleaseWhy };

export class FakeClaimGateway implements ClaimGateway {
  readonly labels = new Set<string>();
  readonly calls: GatewayCall[] = [];
  /** A key in this map refuses, with the value as the reason. */
  readonly refuse = new Map<string, string>();
  /** Runs inside `claim`, after the call is recorded: a test can look at the database, or hang here. */
  onClaim: (task: TaskRef, cfg: ClaimConfig) => void | Promise<void> = () => {};
  /** While it is set, each `release` throws this text. */
  releaseError: string | null = null;

  async claim(cfg: ClaimConfig, task: TaskRef): Promise<ClaimResult> {
    this.calls.push({ op: 'claim', key: task.key });
    await this.onClaim(task, cfg);
    const reason = this.refuse.get(task.key);
    if (reason !== undefined) return { ok: false, reason };
    this.labels.add(task.key);
    return { ok: true };
  }

  async release(_cfg: ClaimConfig, task: Pick<TaskRef, 'key'>, why: ReleaseWhy): Promise<void> {
    this.calls.push({ op: 'release', key: task.key, why });
    if (this.releaseError !== null) throw new Error(this.releaseError);
    this.labels.delete(task.key);
  }

  claimed(): string[] {
    return this.calls.filter((c) => c.op === 'claim').map((c) => c.key);
  }

  released(): Extract<GatewayCall, { op: 'release' }>[] {
    return this.calls.filter((c) => c.op === 'release');
  }
}
