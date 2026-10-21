// Request / response of the repo API (SPEC-phase-2 section "API contract").
import { z } from 'zod';
import { isoDate, listOf } from './common';

/**
 * Body of `POST /repos` (UC-19). `path` = the absolute path of an existing folder (git is not required); an empty `name`
 * = the folder name. The data rules are checked by the service -> `VALIDATION_FAILED` at field `path` / `name`.
 */
export const repoInputBody = z.object({ path: z.string(), name: z.string().optional() });
export type RepoInputBody = z.input<typeof repoInputBody>;

export const repoDto = z.object({
  id: z.string(),
  name: z.string(),
  /** Absolute path in canonical form (the server normalizes it at registration). */
  path: z.string(),
  createdAt: isoDate,
});
export type RepoDto = z.output<typeof repoDto>;

/**
 * One row of `GET /repos` (D-UI11): adds `exists` = the folder still exists (the server checks when reading, it blocks nothing -
 * runs of a loop that uses a missing repo fail with "Repo does not exist") and `loopCount` = loops using it (archived ones included).
 */
export const repoListItemDto = repoDto.extend({ exists: z.boolean(), loopCount: z.number().int() });
export type RepoListItemDto = z.output<typeof repoListItemDto>;
export const repoListDto = listOf(repoListItemDto);
