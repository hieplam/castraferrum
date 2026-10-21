// HTTP interface of the web (ARCHITECTURE.md section "Web-side layers"): each route of the API table in
// SPEC-phase-1.md section "API contract" is one function. It only uses the types of shared/contracts - the layers above do not know HTTP exists.
// Real: http-loops-api.ts (only web/main.tsx creates it); fake for tests: fake-loops-api.ts.
import type { ApiErrorCode, ValidationIssueDto } from '../../shared/contracts/common';
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

export type LoopListFilter = {
  status?: 'active' | 'stopped';
  q?: string;
  /** `true` = only archived loops; empty = only unarchived loops. */
  archived?: boolean;
  /** Only the loops of this repo (UC-25). */
  repoId?: string;
};

export type PageRequest = { cursor?: string; limit?: number };
export type Page<T> = { items: T[]; nextCursor: string | null };

export interface LoopsApi {
  listLoops(filter?: LoopListFilter): Promise<LoopDto[]>;
  createLoop(body: LoopInputBody): Promise<LoopDto>;
  getLoop(id: string): Promise<LoopDetailDto>;
  updateLoop(id: string, body: LoopUpdateBody): Promise<LoopDto>;
  startLoop(id: string): Promise<LoopDto>;
  stopLoop(id: string): Promise<LoopDto>;
  duplicateLoop(id: string): Promise<LoopDto>;
  archiveLoop(id: string): Promise<void>;
  restoreLoop(id: string): Promise<LoopDto>;
  listExecutions(loopId: string, page?: PageRequest): Promise<Page<ExecutionDto>>;
  getExecution(id: string): Promise<ExecutionDetailDto>;
  listRuns(loopId: string, page?: PageRequest): Promise<Page<RunDto>>;
  getRun(id: string): Promise<RunDto>;
  getRunLogs(id: string, after?: number): Promise<LogLineDto[]>;
  /** One transcript page of a run (SPEC-phase-2 section "Transcript"): empty `before` = the last page; oldest first. */
  getTranscriptPage(runId: string, before?: number): Promise<TranscriptPageDto>;
  schedulePreview(cron: string, tz?: string, lang?: 'vi' | 'en'): Promise<SchedulePreviewDto>;
  listExecutors(): Promise<ExecutorDto[]>;
  /** Registered repos (SPEC-phase-2 section "API contract"); each repo carries `exists` + `loopCount` (D-UI11). */
  listRepos(): Promise<RepoListItemDto[]>;
  createRepo(body: RepoInputBody): Promise<RepoDto>;
  deleteRepo(id: string): Promise<void>;
  /** The "Browse..." box: one folder + its children on the machine running the console; empty = the home folder. */
  browseFolder(path?: string): Promise<FolderDto>;
  /** The Quick access column + the operating system of the machine running the console. */
  folderPlaces(): Promise<FolderPlacesDto>;
  /** `GET /stats?tz=` - the overview bar + loops per tab (UC-03); "today" in time zone `tz`. */
  overview(tz?: string, repoId?: string): Promise<OverviewDto>;
  /** `/api/health` - also returns on 503 (`{ ok: false, db: 'down' }`); only throws when the server cannot be reached. */
  health(): Promise<HealthResponse>;
}

/** Error codes the web sees: the API codes + `NETWORK` (cannot reach the server - connection lost, server off). */
export type UiErrorCode = ApiErrorCode | 'NETWORK';

/** Error of every `LoopsApi` function. The web translates by `code` (`t('error.' + code)`), never by `message`. */
export class ApiError extends Error {
  readonly code: UiErrorCode;
  /** HTTP status; `0` when the server cannot be reached. */
  readonly status: number;
  readonly details: unknown;

  constructor(code: UiErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Field errors of `VALIDATION_FAILED` (`details.issues`) - empty for every other error. */
  get issues(): ValidationIssueDto[] {
    const issues = (this.details as { issues?: unknown } | undefined)?.issues;
    return Array.isArray(issues) ? (issues as ValidationIssueDto[]) : [];
  }

  /** First error of a field (`field` = field path, e.g. `name`, `executor.config.durationSec`). */
  issueFor(field: string): ValidationIssueDto | undefined {
    return this.issues.find((i) => i.field === field);
  }
}

export function isApiError(err: unknown, code?: UiErrorCode): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}
