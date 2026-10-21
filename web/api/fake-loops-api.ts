// In-memory fake LoopsApi for web tests (plugged in through the same provider as the real one - no fetch mock).
// Enough rules for the screens to work: create / edit (`version` lock) / Start / Stop / duplicate / archive / restore + the error codes
// of the spec. It runs no run: runs, executions and logs are seeded by the test (`seedLoop`, `seedExecution`, `seedRun`, `seedLogs`).
// the phase 1 screens extend it when their screens need more - the real business rules stay on the server (e2e checks them).
import type { HealthResponse } from '../../shared/contracts/health';
import type {
  ExecutionDetailDto,
  ExecutionDto,
  ExecutorDto,
  LogLineDto,
  LoopDetailDto,
  LoopDto,
  LoopInputBody,
  LoopUpdateBody,
  OverviewDto,
  RunDto,
  SchedulePreviewDto,
} from '../../shared/contracts/loops';
import type { FolderDto, FolderPlacesDto } from '../../shared/contracts/folders';
import type { RepoDto, RepoInputBody, RepoListItemDto } from '../../shared/contracts/repos';
import type { TranscriptPageDto } from '../../shared/contracts/transcript';
import { ApiError, type LoopListFilter, type LoopsApi, type Page, type PageRequest } from './loops-api';

/** Default repo of the fake - a loop that is seeded / created without a repo gets this one. */
export const FAKE_REPO: RepoDto = { id: 'repo-1', name: 'Atlas', path: 'C:\repo\Atlas', createdAt: new Date('2026-10-01T00:00:00Z') };

export class FakeLoopsApi implements LoopsApi {
  readonly repos = new Map<string, RepoDto>([[FAKE_REPO.id, FAKE_REPO]]);
  readonly loops = new Map<string, LoopDetailDto>();
  readonly executions = new Map<string, ExecutionDetailDto>();
  readonly runs = new Map<string, RunDto>();
  readonly logs = new Map<string, LogLineDto[]>();
  /** Transcript pages by `<runId>:<before | end>` (seeded by the test); missing -> `TRANSCRIPT_NOT_FOUND`. */
  readonly transcriptPages = new Map<string, TranscriptPageDto>();
  healthState: HealthResponse | 'unreachable' = { ok: true, db: 'up' };
  /** Every call in order (tests read it to assert the web called the right function). */
  readonly calls: string[] = [];
  now: () => Date = () => new Date();
  #seq = 0;

  seedLoop(partial: Partial<LoopDetailDto> = {}): LoopDetailDto {
    const at = this.now();
    const loop: LoopDetailDto = {
      id: partial.id ?? this.#id('loop'),
      name: 'Loop',
      description: '',
      prompt: 'prompt',
      repo: FAKE_REPO,
      cron: '*/30 * * * *',
      timezone: 'Asia/Ho_Chi_Minh',
      timeoutSec: 1800,
      maxConcurrent: 1,
      executor: { kind: 'mock', config: { durationSec: 10, failureRate: 0 } },
      status: 'stopped',
      nextRunAt: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
      iterations: 0,
      executionCount: 0,
      currentExecution: null,
      activeRun: null,
      activeRuns: [],
      lastRun: null,
      longestExecution: null,
      runCount: 0,
      ...partial,
    };
    this.loops.set(loop.id, loop);
    return loop;
  }
  seedExecution(e: ExecutionDetailDto): void {
    this.executions.set(e.id, e);
  }
  seedRun(r: RunDto): void {
    this.runs.set(r.id, r);
  }
  seedLogs(runId: string, lines: LogLineDto[]): void {
    this.logs.set(runId, lines);
  }

  async listLoops(filter: LoopListFilter = {}): Promise<LoopDto[]> {
    this.calls.push('listLoops');
    const q = filter.q?.toLowerCase();
    return [...this.loops.values()]
      .filter((l) => (filter.archived ? l.archivedAt !== null : l.archivedAt === null))
      .filter((l) => !filter.status || l.status === filter.status)
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .map(toLoop);
  }
  async createLoop(body: LoopInputBody): Promise<LoopDto> {
    this.calls.push('createLoop');
    this.#checkName(body.name);
    return toLoop(this.seedLoop(fromBody(body)));
  }
  async getLoop(id: string): Promise<LoopDetailDto> {
    this.calls.push('getLoop');
    return { ...this.#loop(id) };
  }
  async updateLoop(id: string, body: LoopUpdateBody): Promise<LoopDto> {
    this.calls.push('updateLoop');
    const loop = this.#loop(id);
    if (body.version !== loop.version) throw new ApiError('VERSION_CONFLICT', 409, 'version mismatch');
    this.#checkName(body.name, id);
    return toLoop(this.#save({ ...loop, ...fromBody(body), version: loop.version + 1, updatedAt: this.now() }));
  }
  async startLoop(id: string): Promise<LoopDto> {
    this.calls.push('startLoop');
    const loop = this.#loop(id);
    if (loop.archivedAt) throw new ApiError('LOOP_ARCHIVED', 409, 'archived');
    if (loop.status === 'active') throw new ApiError('LOOP_ALREADY_ACTIVE', 409, 'already running');
    return toLoop(this.#save({ ...loop, status: 'active', executionCount: loop.executionCount + 1 }));
  }
  async stopLoop(id: string): Promise<LoopDto> {
    this.calls.push('stopLoop');
    const loop = this.#loop(id);
    if (loop.status !== 'active') throw new ApiError('LOOP_NOT_ACTIVE', 409, 'already stopped');
    return toLoop(this.#save({ ...loop, status: 'stopped', activeRun: null, activeRuns: [], nextRunAt: null }));
  }
  async duplicateLoop(id: string): Promise<LoopDto> {
    this.calls.push('duplicateLoop');
    const src = this.#loop(id);
    return toLoop(this.seedLoop({ ...src, id: this.#id('loop'), name: `${src.name} (copy)`, status: 'stopped', executionCount: 0, iterations: 0, currentExecution: null, activeRun: null, activeRuns: [], lastRun: null, longestExecution: null, runCount: 0, archivedAt: null, version: 1 }));
  }
  async archiveLoop(id: string): Promise<void> {
    this.calls.push('archiveLoop');
    const loop = this.#loop(id);
    if (loop.status === 'active') throw new ApiError('LOOP_IS_ACTIVE', 409, 'running');
    this.#save({ ...loop, archivedAt: this.now() });
  }
  async restoreLoop(id: string): Promise<LoopDto> {
    this.calls.push('restoreLoop');
    return toLoop(this.#save({ ...this.#loop(id), archivedAt: null }));
  }
  async listExecutions(loopId: string, _page?: PageRequest): Promise<Page<ExecutionDto>> {
    this.calls.push('listExecutions');
    this.#loop(loopId);
    const items = [...this.executions.values()].filter((e) => e.loopId === loopId).sort((a, b) => b.seq - a.seq);
    return { items: items.map(({ runs: _r, sessionIds: _s, ...e }) => e), nextCursor: null };
  }
  async getExecution(id: string): Promise<ExecutionDetailDto> {
    this.calls.push('getExecution');
    const e = this.executions.get(id);
    if (!e) throw new ApiError('EXECUTION_NOT_FOUND', 404, 'not found');
    return e;
  }
  async listRuns(loopId: string, _page?: PageRequest): Promise<Page<RunDto>> {
    this.calls.push('listRuns');
    this.#loop(loopId);
    return { items: [...this.runs.values()].filter((r) => r.loopId === loopId).reverse(), nextCursor: null };
  }
  async getRun(id: string): Promise<RunDto> {
    this.calls.push('getRun');
    const r = this.runs.get(id);
    if (!r) throw new ApiError('RUN_NOT_FOUND', 404, 'not found');
    return r;
  }
  async getRunLogs(id: string, after = 0): Promise<LogLineDto[]> {
    this.calls.push('getRunLogs');
    await this.getRun(id);
    return (this.logs.get(id) ?? []).filter((l) => l.seq > after);
  }
  async getTranscriptPage(runId: string, before?: number): Promise<TranscriptPageDto> {
    this.calls.push('getTranscriptPage');
    await this.getRun(runId);
    const page = this.transcriptPages.get(`${runId}:${before ?? 'end'}`);
    if (!page) throw new ApiError('TRANSCRIPT_NOT_FOUND', 404, 'not found');
    return page;
  }
  async schedulePreview(cron: string): Promise<SchedulePreviewDto> {
    this.calls.push('schedulePreview');
    return { cron, description: cron, nextRuns: [], warnings: [] };
  }
  async listExecutors(): Promise<ExecutorDto[]> {
    this.calls.push('listExecutors');
    return [{ kind: 'mock', label: 'Mock', cancelWithinMs: 1000, configSchema: {} }];
  }
  /** Counted from the seeded data (runs today = every seeded run except skipped ones; errors = failed + timed_out + interrupted). */
  async overview(tz = 'Asia/Ho_Chi_Minh'): Promise<OverviewDto> {
    this.calls.push('overview');
    const loops = [...this.loops.values()];
    const live = loops.filter((l) => !l.archivedAt);
    const runs = [...this.runs.values()];
    const now = this.now();
    return {
      activeLoops: live.filter((l) => l.status === 'active').length,
      runningRuns: runs.filter((r) => r.status === 'running').length,
      runsToday: runs.filter((r) => r.status !== 'skipped').length,
      errors24h: runs.filter((r) => ['failed', 'timed_out', 'interrupted'].includes(r.status)).length,
      loops: {
        all: live.length,
        active: live.filter((l) => l.status === 'active').length,
        stopped: live.filter((l) => l.status === 'stopped').length,
        archived: loops.length - live.length,
      },
      timezone: tz,
      todayFrom: now,
      now,
    };
  }
  async listRepos(): Promise<RepoListItemDto[]> {
    this.calls.push('listRepos');
    return [...this.repos.values()].map((r) => ({ ...r, exists: true, loopCount: [...this.loops.values()].filter((l) => l.repo.id === r.id).length }));
  }
  async createRepo(body: RepoInputBody): Promise<RepoDto> {
    this.calls.push('createRepo');
    const repo: RepoDto = { id: this.#id('repo'), name: body.name?.trim() || body.path, path: body.path, createdAt: this.now() };
    this.repos.set(repo.id, repo);
    return repo;
  }
  async deleteRepo(id: string): Promise<void> {
    this.calls.push('deleteRepo');
    if (!this.repos.delete(id)) throw new ApiError('REPO_NOT_FOUND', 404, 'repo not found');
  }
  /** Fake folder by path (seeded by the test); missing -> an error at field `path` like the server. Empty = `folderHome`. */
  readonly folders = new Map<string, FolderDto>();
  folderHome = '';
  places: FolderPlacesDto = { platform: 'win32', home: 'C:\\Users\\alice', places: [], roots: [], nearRepos: [] };
  async browseFolder(path?: string): Promise<FolderDto> {
    this.calls.push('browseFolder');
    const dir = this.folders.get(path?.trim() || this.folderHome);
    if (!dir) throw new ApiError('VALIDATION_FAILED', 400, 'no such folder', { issues: [{ field: 'path', code: 'notDirectory', message: 'not found' }] });
    return dir;
  }
  async folderPlaces(): Promise<FolderPlacesDto> {
    this.calls.push('folderPlaces');
    return this.places;
  }
  async health(): Promise<HealthResponse> {
    this.calls.push('health');
    if (this.healthState === 'unreachable') throw new ApiError('NETWORK', 0, 'cannot reach the server');
    return this.healthState;
  }

  #loop(id: string): LoopDetailDto {
    const loop = this.loops.get(id);
    if (!loop) throw new ApiError('LOOP_NOT_FOUND', 404, 'not found');
    return loop;
  }
  #save(loop: LoopDetailDto): LoopDetailDto {
    this.loops.set(loop.id, loop);
    return loop;
  }
  #checkName(name: string, exceptId?: string): void {
    if (!name.trim()) throw new ApiError('VALIDATION_FAILED', 400, 'name missing', { issues: [{ field: 'name', code: 'required', message: 'Required' }] });
    for (const l of this.loops.values()) {
      if (l.id !== exceptId && l.name.toLowerCase() === name.trim().toLowerCase()) throw new ApiError('LOOP_NAME_TAKEN', 409, 'name taken');
    }
  }
  #id(prefix: string): string {
    this.#seq += 1;
    return `${prefix}-${this.#seq}`;
  }
}

function fromBody(body: LoopInputBody): Partial<LoopDetailDto> {
  return {
    name: body.name.trim(),
    description: body.description ?? '',
    prompt: body.prompt,
    repo: FAKE_REPO,
    cron: body.cron,
    timezone: body.timezone ?? 'Asia/Ho_Chi_Minh',
    timeoutSec: body.timeoutSec ?? null,
    maxConcurrent: body.maxConcurrent ?? 1,
    executor: { kind: body.executor?.kind ?? 'mock', config: body.executor?.config ?? {} },
  };
}

function toLoop(l: LoopDetailDto): LoopDto {
  const { longestExecution: _longest, runCount: _runCount, ...loop } = l;
  return loop;
}
