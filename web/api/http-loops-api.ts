// LoopsApi over real HTTP (fetch) - only web/main.tsx creates it. Responses are decoded with the very zod codecs of shared/contracts
// (D20): ISO string -> Date, a wrong shape -> throw early instead of letting a screen break silently.
import { z } from 'zod';
import { API_ERROR_CODES, errorBody } from '../../shared/contracts/common';
import { healthResponse } from '../../shared/contracts/health';
import {
  executionDetailDto,
  executionPageDto,
  executorListDto,
  logListDto,
  loopDetailDto,
  loopDto,
  loopListDto,
  overviewDto,
  runDto,
  runPageDto,
  schedulePreviewDto,
  type LoopInputBody,
  type LoopUpdateBody,
} from '../../shared/contracts/loops';
import { folderDto, folderPlacesDto } from '../../shared/contracts/folders';
import { repoDto, repoListDto, type RepoInputBody } from '../../shared/contracts/repos';
import { scoreboardDto } from '../../shared/contracts/scoreboard';
import { transcriptPageDto } from '../../shared/contracts/transcript';
import { ApiError, type LoopListFilter, type LoopsApi, type PageRequest } from './loops-api';

type Query = Record<string, string | number | boolean | undefined>;

export class HttpLoopsApi implements LoopsApi {
  readonly #base: string;
  readonly #fetch: typeof fetch;

  /** `base` = the API root (default `/api` same-origin - the build is served by Fastify, dev goes through the Vite proxy). */
  constructor(opts: { base?: string; fetch?: typeof fetch } = {}) {
    this.#base = opts.base ?? '/api';
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  listLoops(filter: LoopListFilter = {}) {
    return this.#call('GET', '/loops', { query: filter }, loopListDto).then((r) => r.items);
  }
  createLoop(body: LoopInputBody) {
    return this.#call('POST', '/loops', { body }, loopDto);
  }
  getLoop(id: string) {
    return this.#call('GET', `/loops/${enc(id)}`, {}, loopDetailDto);
  }
  updateLoop(id: string, body: LoopUpdateBody) {
    return this.#call('PUT', `/loops/${enc(id)}`, { body }, loopDto);
  }
  startLoop(id: string) {
    return this.#call('POST', `/loops/${enc(id)}/start`, {}, loopDto);
  }
  stopLoop(id: string) {
    return this.#call('POST', `/loops/${enc(id)}/stop`, {}, loopDto);
  }
  duplicateLoop(id: string) {
    return this.#call('POST', `/loops/${enc(id)}/duplicate`, {}, loopDto);
  }
  async archiveLoop(id: string) {
    await this.#call('POST', `/loops/${enc(id)}/archive`, {}, null);
  }
  restoreLoop(id: string) {
    return this.#call('POST', `/loops/${enc(id)}/restore`, {}, loopDto);
  }
  listExecutions(loopId: string, page: PageRequest = {}) {
    return this.#call('GET', `/loops/${enc(loopId)}/executions`, { query: page }, executionPageDto);
  }
  getExecution(id: string) {
    return this.#call('GET', `/executions/${enc(id)}`, {}, executionDetailDto);
  }
  listRuns(loopId: string, page: PageRequest = {}) {
    return this.#call('GET', `/loops/${enc(loopId)}/runs`, { query: page }, runPageDto);
  }
  getRun(id: string) {
    return this.#call('GET', `/runs/${enc(id)}`, {}, runDto);
  }
  getRunLogs(id: string, after = 0) {
    return this.#call('GET', `/runs/${enc(id)}/logs`, { query: { after } }, logListDto).then((r) => r.items);
  }
  getTranscriptPage(runId: string, before?: number) {
    return this.#call('GET', `/runs/${enc(runId)}/transcript`, { query: { before } }, transcriptPageDto);
  }
  listRepos() {
    return this.#call('GET', '/repos', {}, repoListDto).then((r) => r.items);
  }
  createRepo(body: RepoInputBody) {
    return this.#call('POST', '/repos', { body }, repoDto);
  }
  async deleteRepo(id: string) {
    await this.#call('DELETE', `/repos/${enc(id)}`, {}, null);
  }
  browseFolder(path?: string) {
    return this.#call('GET', '/folders', { query: { path } }, folderDto);
  }
  folderPlaces() {
    return this.#call('GET', '/folders/places', {}, folderPlacesDto);
  }
  schedulePreview(cron: string, tz?: string, lang?: 'vi' | 'en') {
    return this.#call('GET', '/schedule/preview', { query: { cron, tz, lang } }, schedulePreviewDto);
  }
  overview(tz?: string, repoId?: string) {
    return this.#call('GET', '/stats', { query: { tz, repoId } }, overviewDto);
  }
  scoreboard(tz?: string) {
    return this.#call('GET', '/process/scoreboard', { query: { tz } }, scoreboardDto);
  }
  listExecutors() {
    return this.#call('GET', '/executors', {}, executorListDto).then((r) => r.items);
  }
  health() {
    return this.#call('GET', '/health', { okStatuses: [200, 503] }, healthResponse);
  }

  async #call<S extends z.ZodType | null>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: { query?: Query; body?: unknown; okStatuses?: number[] },
    schema: S,
  ): Promise<S extends z.ZodType ? z.output<S> : void> {
    let res: Response;
    try {
      res = await this.#fetch(this.#base + path + qs(opts.query), {
        method,
        headers: opts.body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      });
    } catch (err) {
      throw new ApiError('NETWORK', 0, `Cannot reach ${method} ${path}: ${(err as Error).message}`);
    }
    const text = await res.text().catch(() => '');
    const json = parse(text);
    const ok = opts.okStatuses ? opts.okStatuses.includes(res.status) : res.ok;
    if (!ok) throw toApiError(res.status, json, `${method} ${path}`);
    if (schema === null) return undefined as never;
    return z.decode(schema, json as z.input<typeof schema>) as never;
  }
}

const enc = encodeURIComponent;

function qs(query: Query | undefined): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

function parse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * An error body that follows the contract -> ApiError carrying the server's `code`. The real server always returns a body that follows the contract (a 500 too), so
 * a 5xx that does not follow the contract comes from something in between (the Vite dev proxy when the server is off) -> `NETWORK`; an odd 4xx -> `BAD_REQUEST`.
 */
function toApiError(status: number, json: unknown, what: string): ApiError {
  const parsed = errorBody.safeParse(json);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(code, status, message, details);
  }
  const code = (json as { error?: { code?: string } } | null)?.error?.code;
  if ((API_ERROR_CODES as readonly string[]).includes(code ?? '')) return new ApiError(code as ApiError['code'], status, `${what} → HTTP ${status}`);
  return new ApiError(status >= 500 ? 'NETWORK' : 'BAD_REQUEST', status, `${what} → HTTP ${status}`);
}
