// Request / response of the folder-browsing API - the "Browse..." box of the Repo page (SPEC-phase-2 section "API contract").
// Every path is in the canonical form of the machine running the console (Windows `C:\...`, Mac / Linux `/...`) - the web never joins / splits
// paths itself, it only uses the strings the server returns (parent folder, breadcrumb, path of each child folder).
import { z } from 'zod';

/** `GET /folders?path=` - empty = the home folder; accepts `~` / `~/x`. */
export const folderQuery = z.object({ path: z.string().optional() });

export const folderEntryDto = z.object({
  name: z.string(),
  path: z.string(),
  /** Has a `.git` inside - only a hint (a repo does not have to be git). */
  git: z.boolean(),
  /** Hidden by the operating system's convention (the web hides it by default, with a "show hidden folders" box). */
  hidden: z.boolean(),
  /** The repo name if this folder is already registered. */
  repo: z.string().nullable(),
});
export type FolderEntryDto = z.output<typeof folderEntryDto>;

/** `GET /folders` - one folder + its children. A path that is not absolute / does not exist -> 400 `VALIDATION_FAILED` at field `path`. */
export const folderDto = z.object({
  path: z.string(),
  name: z.string(),
  /** `null` at the root (`C:\`, `/`). */
  parent: z.string().nullable(),
  crumbs: z.array(z.object({ name: z.string(), path: z.string() })),
  git: z.boolean(),
  repo: z.string().nullable(),
  entries: z.array(folderEntryDto),
  /** The folder has too many children - only the first part is returned (by name). */
  truncated: z.boolean(),
  /** The folder exists but cannot be listed: no permission / the drive does not answer. */
  unreadable: z.enum(['denied', 'timeout']).nullable(),
});
export type FolderDto = z.output<typeof folderDto>;

export const folderPlatform = z.enum(['win32', 'darwin', 'linux']);
export type FolderPlatformDto = z.output<typeof folderPlatform>;

/** `GET /folders/places` - the "Quick access" column + the operating system of the machine running the console (so the path box hints in the right style). */
export const folderPlacesDto = z.object({
  platform: folderPlatform,
  home: z.string(),
  places: z.array(z.object({ kind: z.enum(['home', 'desktop', 'documents', 'downloads']), path: z.string() })),
  /** Windows: drives; Mac: the boot volume (real name, points at `/`) + external volumes; Linux: `/`. */
  roots: z.array(z.object({ name: z.string(), path: z.string() })),
  /** Folders holding registered repos (except those already in `places`), with the names of the repos inside. */
  nearRepos: z.array(z.object({ path: z.string(), name: z.string(), repos: z.array(z.string()) })),
});
export type FolderPlacesDto = z.output<typeof folderPlacesDto>;

/**
 * `POST /__test/folders` (test mode): replaces the browser's "machine" with a fake world - operating system, home folder, Known
 * Folders, the folder tree (`<folder>\.git` = has git), unreadable folders, symlinks. `world: null` = back to the real machine.
 */
export const testFoldersBody = z
  .object({
    world: z
      .object({
        platform: folderPlatform,
        home: z.string(),
        known: z.object({ desktop: z.string().optional(), documents: z.string().optional(), downloads: z.string().optional() }).strict().optional(),
        dirs: z.array(z.string()),
        denied: z.array(z.string()).optional(),
        links: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type TestFoldersBody = z.output<typeof testFoldersBody>;
