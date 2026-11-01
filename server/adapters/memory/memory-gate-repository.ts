import { DomainError } from '../../../shared/domain/errors';
import type { GateFinalState, GateJob, GateStep, GateStepName, RepoGate } from '../../../shared/domain/gate';
import type { EnqueueGateJobInput, GateRepository, RepoGateInput } from '../../ports/gate-repository';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

const oldestFirst = (a: GateJob, b: GateJob) => a.queuedAt.getTime() - b.queuedAt.getTime() || cmp(a.id, b.id);

export class MemoryGateRepository implements GateRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async getRepoGate(repoId: string): Promise<RepoGate | null> {
    const row = this.#db.repoGates.get(repoId);
    return row ? clone(row) : null;
  }

  async setRepoGate(repoId: string, input: RepoGateInput, at: Date): Promise<RepoGate> {
    if (!this.#db.repos.has(repoId)) throw new DomainError('REPO_NOT_FOUND', `No repo ${repoId}`);
    const row: RepoGate = { repoId, enabled: input.enabled, githubRepo: input.githubRepo, checkCommand: [...input.checkCommand], updatedAt: at };
    this.#db.writeRepoGate(row);
    return clone(row);
  }

  async enqueue(input: EnqueueGateJobInput): Promise<'queued' | 'duplicate'> {
    const { at, ...rest } = input;
    try {
      this.#db.writeGateJob({ ...rest, state: 'queued', failedStep: null, queuedAt: at, startedAt: null, finishedAt: null, ratifiedAt: null });
      return 'queued';
    } catch (err) {
      if (err instanceof ConstraintViolation && err.constraint === 'gate_jobs_one_live_per_head') return 'duplicate';
      throw err;
    }
  }

  async takeNext(at: Date): Promise<GateJob | null> {
    const next = [...this.#db.gateJobs.values()].filter((j) => j.state === 'queued').sort(oldestFirst)[0];
    if (!next) return null;
    try {
      const row: GateJob = { ...next, state: 'running', startedAt: at };
      this.#db.writeGateJob(row);
      return clone(row);
    } catch (err) {
      // The index gate_jobs_one_running: another job runs.
      if (err instanceof ConstraintViolation && err.constraint === 'gate_jobs_one_running') return null;
      throw err;
    }
  }

  async finish(id: string, input: { state: GateFinalState; failedStep: GateStepName | null; at: Date }): Promise<GateJob | null> {
    const row = this.#db.gateJobs.get(id);
    if (!row || row.state !== 'running') return null;
    const next: GateJob = { ...row, state: input.state, failedStep: input.failedStep, finishedAt: input.at };
    this.#db.writeGateJob(next);
    return clone(next);
  }

  async ratify(id: string, at: Date): Promise<boolean> {
    const row = this.#db.gateJobs.get(id);
    if (!row || row.state !== 'needs_ratification') return false;
    this.#db.writeGateJob({ ...row, state: 'queued', failedStep: null, startedAt: null, finishedAt: null, ratifiedAt: at });
    return true;
  }

  async requeueRunning(_at: Date): Promise<number> {
    const running = [...this.#db.gateJobs.values()].filter((j) => j.state === 'running');
    for (const row of running) this.#db.writeGateJob({ ...row, state: 'queued', startedAt: null });
    return running.length;
  }

  async appendStep(step: GateStep): Promise<void> {
    this.#db.insertGateStep(step);
  }

  async listSteps(jobId: string): Promise<GateStep[]> {
    return [...this.#db.gateSteps.values()]
      .filter((s) => s.jobId === jobId)
      .sort((a, b) => a.seq - b.seq)
      .map(clone);
  }

  async get(id: string): Promise<GateJob | null> {
    const row = this.#db.gateJobs.get(id);
    return row ? clone(row) : null;
  }

  async listRefusedBetween(from: Date, to: Date): Promise<GateJob[]> {
    return [...this.#db.gateJobs.values()]
      .filter((j) => (j.state === 'failed' || j.state === 'needs_ratification') && j.finishedAt !== null && j.finishedAt >= from && j.finishedAt < to)
      .sort((a, b) => a.finishedAt!.getTime() - b.finishedAt!.getTime() || cmp(a.id, b.id))
      .map(clone);
  }

  async list(limit: number): Promise<GateJob[]> {
    return [...this.#db.gateJobs.values()]
      .sort((a, b) => oldestFirst(b, a))
      .slice(0, limit)
      .map(clone);
  }
}
