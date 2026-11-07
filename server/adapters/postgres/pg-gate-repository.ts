import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { GateFinalState, GateJob, GateJobState, GateStep, GateStepName, GateStepStatus, RepoGate } from '../../../shared/domain/gate';
import type { EnqueueGateJobInput, GateRatifyOutcome, GateRepository, RepoGateInput } from '../../ports/gate-repository';
import { violated } from './pg-util';

type Row = Record<string, unknown>;

function toRepoGate(r: Row): RepoGate {
  return {
    repoId: r.repo_id as string,
    enabled: r.enabled as boolean,
    githubRepo: r.github_repo as string,
    checkCommand: r.check_command as string[],
    updatedAt: r.updated_at as Date,
  };
}

function toJob(r: Row): GateJob {
  return {
    id: r.id as string,
    repoId: r.repo_id as string,
    prNumber: r.pr_number as number,
    headSha: r.head_sha as string,
    taskKey: r.task_key as string,
    title: (r.title as string | null) ?? null,
    state: r.state as GateJobState,
    failedStep: (r.failed_step as GateStepName | null) ?? null,
    queuedAt: r.queued_at as Date,
    startedAt: (r.started_at as Date | null) ?? null,
    finishedAt: (r.finished_at as Date | null) ?? null,
    ratifiedAt: (r.ratified_at as Date | null) ?? null,
  };
}

function toStep(r: Row): GateStep {
  return {
    jobId: r.job_id as string,
    seq: r.seq as number,
    step: r.step as GateStepName,
    status: r.status as GateStepStatus,
    exitCode: (r.exit_code as number | null) ?? null,
    ms: r.ms as number,
    outputTail: r.output_tail as string,
  };
}

export class PgGateRepository implements GateRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async getRepoGate(repoId: string): Promise<RepoGate | null> {
    const { rows } = await this.#pool.query('SELECT * FROM repo_gate WHERE repo_id = $1', [repoId]);
    return rows[0] ? toRepoGate(rows[0]) : null;
  }

  async setRepoGate(repoId: string, input: RepoGateInput, at: Date): Promise<RepoGate> {
    try {
      const { rows } = await this.#pool.query(
        `INSERT INTO repo_gate (repo_id, enabled, github_repo, check_command, updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (repo_id) DO UPDATE SET enabled = $2, github_repo = $3, check_command = $4, updated_at = $5
         RETURNING *`,
        [repoId, input.enabled, input.githubRepo, JSON.stringify(input.checkCommand), at],
      );
      return toRepoGate(rows[0]);
    } catch (err) {
      if (violated(err, '23503') === 'repo_gate_repo_id_repos_id_fk') throw new DomainError('REPO_NOT_FOUND', `No repo ${repoId}`);
      throw err;
    }
  }

  async enqueue(input: EnqueueGateJobInput): Promise<'queued' | 'duplicate'> {
    // The partial unique index gate_jobs_one_live_per_head decides: a second live row for the PR head writes nothing.
    const res = await this.#pool.query(
      `INSERT INTO gate_jobs (id, repo_id, pr_number, head_sha, task_key, title, state, queued_at) VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)
       ON CONFLICT (repo_id, pr_number, head_sha) WHERE state IN ('queued', 'running') DO NOTHING`,
      [input.id, input.repoId, input.prNumber, input.headSha, input.taskKey, input.title ?? null, input.at],
    );
    return res.rowCount === 1 ? 'queued' : 'duplicate';
  }

  async takeNext(at: Date): Promise<GateJob | null> {
    try {
      const { rows } = await this.#pool.query(
        `UPDATE gate_jobs SET state = 'running', started_at = $1
          WHERE id = (SELECT id FROM gate_jobs WHERE state = 'queued' ORDER BY queued_at, id LIMIT 1)
            AND NOT EXISTS (SELECT 1 FROM gate_jobs WHERE state = 'running')
          RETURNING *`,
        [at],
      );
      return rows[0] ? toJob(rows[0]) : null;
    } catch (err) {
      // Two takeNext calls at the same moment: the index gate_jobs_one_running refuses the second.
      if (violated(err, '23505') === 'gate_jobs_one_running') return null;
      throw err;
    }
  }

  async finish(id: string, input: { state: GateFinalState; failedStep: GateStepName | null; at: Date }): Promise<GateJob | null> {
    const { rows } = await this.#pool.query(
      `UPDATE gate_jobs SET state = $2, failed_step = $3, finished_at = $4 WHERE id = $1 AND state = 'running' RETURNING *`,
      [id, input.state, input.failedStep, input.at],
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  async ratify(id: string, at: Date): Promise<GateRatifyOutcome> {
    try {
      const res = await this.#pool.query(
        `UPDATE gate_jobs SET state = 'queued', failed_step = NULL, started_at = NULL, finished_at = NULL, ratified_at = $2
          WHERE id = $1 AND state = 'needs_ratification'`,
        [id, at],
      );
      return res.rowCount === 1 ? 'ratified' : 'not_ratifiable';
    } catch (err) {
      if (violated(err, '23505') === 'gate_jobs_one_live_per_head') return 'duplicate';
      throw err;
    }
  }

  async requeueRunning(_at: Date): Promise<number> {
    const res = await this.#pool.query(`UPDATE gate_jobs SET state = 'queued', started_at = NULL WHERE state = 'running'`);
    return res.rowCount ?? 0;
  }

  async appendStep(step: GateStep): Promise<void> {
    await this.#pool.query(
      'INSERT INTO gate_steps (job_id, seq, step, status, exit_code, ms, output_tail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [step.jobId, step.seq, step.step, step.status, step.exitCode, step.ms, step.outputTail],
    );
  }

  async listSteps(jobId: string): Promise<GateStep[]> {
    const { rows } = await this.#pool.query('SELECT * FROM gate_steps WHERE job_id = $1 ORDER BY seq', [jobId]);
    return rows.map(toStep);
  }

  async get(id: string): Promise<GateJob | null> {
    const { rows } = await this.#pool.query('SELECT * FROM gate_jobs WHERE id = $1', [id]);
    return rows[0] ? toJob(rows[0]) : null;
  }

  async listRefusedBetween(from: Date, to: Date): Promise<GateJob[]> {
    const { rows } = await this.#pool.query(
      `SELECT * FROM gate_jobs WHERE state IN ('failed', 'needs_ratification') AND finished_at >= $1 AND finished_at < $2
        ORDER BY finished_at, id`,
      [from, to],
    );
    return rows.map(toJob);
  }

  async listByRepo(repoId: string, states: readonly GateJobState[], limit: number): Promise<GateJob[]> {
    const { rows } = await this.#pool.query(
      `SELECT * FROM gate_jobs WHERE repo_id = $1 AND state = ANY($2::text[])
        ORDER BY finished_at DESC NULLS LAST, queued_at DESC, id DESC LIMIT $3`,
      [repoId, [...states], limit],
    );
    return rows.map(toJob);
  }

  async list(limit: number): Promise<GateJob[]> {
    const { rows } = await this.#pool.query('SELECT * FROM gate_jobs ORDER BY queued_at DESC, id DESC LIMIT $1', [limit]);
    return rows.map(toJob);
  }
}
