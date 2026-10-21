# Spec: extracting Loop Console into Castraferrum

- Date: 2026-10-20 (revision 2, after an adversarial review of revision 1)
- Status: approved by the owner in conversation; owner reviews this document after merge
- Plan: [../plans/2026-10-20-extraction.md](../plans/2026-10-20-extraction.md)

## 1. Context

"Loop Console" was built inside the owner's private game-server repository (called **the source repo** below)
to drive long-running agent work on that repository. It turned out to be useful for any repository, so it
becomes its own product, **Castraferrum**, in this repository: private first, open source later.

What it is: a local web UI (Node 24, Fastify, React, Postgres in Docker) that runs N agent loops. Each loop is
a prompt, a target repository and a schedule. Every tick starts a fresh Claude Code session in the target
repository; the console records each tick (session id, cost, duration, summary), shows the live transcript,
and lets the owner pause, stop and resume loops.

Where it lives today, in the source repo:

| Path | What |
|---|---|
| `loop-console/` | The application: `server/`, `shared/`, `web/`, `tests/`, `scripts/`, `design/`, configs |
| the console docs folder | Vision, spec phase 1 and 2, architecture, plan (about 350 KB) |
| wiki pages about the console | Measurements and research notes (transcript format, folder browsing on Windows and macOS, executor behaviour) |

### Measured starting point (2026-10-20, source repo `main` at `2b7e9d9`)

| | Value |
|---|---|
| Tracked files | 882 (876 under `loop-console/`, 6 in the console docs folder); 318 text files contain Vietnamese diacritics, and all 521 PNGs show the Vietnamese UI |
| Lines with Vietnamese diacritics | about 7 460 under `loop-console/` with `shared/i18n/vi.ts` excluded, plus about 2 390 in the console docs folder |
| Vietnamese UI text outside `vi.ts` | `shared/domain/schedule.ts` (a `TEXT.vi` block and a Vietnamese natural-language override for cron descriptions, about 107 lines); generated copies of the locale in `design/preview/messages.js` and `design/preview/schedule.js`; Vietnamese defaults (`.default('vi')` in `shared/contracts/loops.ts`, `locale = 'vi'` defaults in `schedule.ts`, `lang="vi"` in `web/index.html`, `'vi'` fallback in `web/prefs/prefs.tsx`) |
| Unaccented Vietnamese | at least 45 lines in code comments and strings, plus 19 architecture rule names in `.dependency-cruiser.cjs`, the old Vietnamese violation marker parsed by `scripts/arch-lib.mjs`, and about 25 fixture file names under `tests/arch-fixtures/` |
| Identifiers | English, except one Vietnamese local variable in `shared/i18n/i18n.test.ts` and the rule names above |
| Tests that assert Vietnamese text | about 212 assertion lines in 17 e2e and visual files; the existing UC-18 e2e test asserts that the default language is Vietnamese |
| `design/` | 521 PNGs (64.7 MB): `preview/shots` (184, about 23 MB, the approved reference the visual tests compare against), `compare/` (generated output, about 40 MB, partly tracked), `directions/` (early explorations, unaccented Vietnamese file names), `system/shots` (3, no generator script) |
| Locale wiring | `MessageKey` is derived from `vi.ts`; default locale is `vi` |
| References into the source repo | issue refs and `LC-NN` task refs in code; test fixtures with the owner's real home paths and the source repo's name; three readers of files outside the folder: `scripts/uc-coverage.mjs` (use-case table), `tests/api/api-surface.test.ts` (API table), one executor test (a quoted message) - all read the phase spec files in the console docs folder; `scripts/restart-console.ps1` hard-codes the owner's path |
| Use cases | 32 (UC-01 to UC-32); `npm run verify` requires all 32 with green e2e (`--min 32`) |
| Runtime | compose project `loop-console`, container and volume `loop_console_pg` (hard-coded names), Postgres on 55432, console on 7070, e2e console on 7071; `npm start` serves the UI only when `dist/web` exists; on startup, runs left open are marked interrupted |
| Git history | 37 commits touching the two paths, all with Vietnamese messages |

The first plan task replaces these numbers with exact output of a committed tool.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **No history is carried over.** The code enters this repository as one snapshot commit, after it has been translated. Development history stays in the source repo. | Every old commit contains Vietnamese. Rewriting history is expensive and easy to get wrong. |
| D2 | **Translate in place in the source repo first, extract second.** | The full verification suite keeps running while text changes, so a broken translation shows up immediately. |
| D3 | **Docs are rewritten short, not translated.** New set: `README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/USE-CASES.md`, `docs/API.md`, `docs/adr/*`. The phase specs, plan and vision stay in the source repo as history. | Most of the 350 KB is historical planning. Only the knowledge a new contributor needs moves. |
| D4 | **`shared/i18n/vi.ts` is the only place Vietnamese may live, and it stays.** Every piece of Vietnamese UI text moves into it (including the schedule texts and the cron-description override now in `schedule.ts`). English becomes the default everywhere; `MessageKey` is derived from `en.ts`. Generated copies of the locale (`design/preview/messages.js`, `schedule.js`) are no longer tracked. The scanner skips exactly that one repo-relative path, so the target count is 0. | A translation is a feature. Everything else in the repository is English, and one file is easy to police. |
| D5 | **Feature freeze** on the console until extraction is done. The source repo keeps getting features for its own domain. | A moving target makes translation and parity checks unreliable. |
| D6 | **Name: Castraferrum.** Repository `hieplam/castraferrum`, package name `castraferrum`; the UI title becomes "Castraferrum". No vendor name in the product name. | Owner's choice. npm and GitHub had no project with this name on 2026-10-20. |
| D7 | **Use-case IDs (`UC-NN`) stay**; task IDs (`LC-NN`) and issue refs from the source repo are removed. | UC IDs are part of the test contract. LC and issue numbers point to a tracker the public will never see. |
| D8 | **Test fixtures and demo data use neutral values**: no real home paths, user names or the source repo's name. | The repository will be public. |
| D9 | **Reference screenshots are regenerated in English, once, together with the locale flip.** Exploration folders and generated comparison output are dropped. | The visual tests compare the real app with the reference shots, so the two must change in the same task or the suite stays red. |
| D10 | **Runtime data survives the move**, and nothing else can touch it by accident. Compose names stay `loop-console` / `loop_console_pg` by default but become overridable through environment variables, so a scratch clone runs against a scratch database. | The owner's loops and tick history must still be there after cut-over, and a test run must not mark the owner's runs interrupted. |
| D11 | **Guardrails from day one** in this repository: hooks and a CI job reject Vietnamese outside `vi.ts` in file contents, file names, commit messages, branch names and PR titles and bodies. Guardrail tests that need Vietnamese input run in scratch repositories or on synthetic event payloads, never as real commits or PRs here. | Agents working for the owner receive instructions in Vietnamese. GitHub keeps closed PR refs and their commits forever, so a "throwaway" Vietnamese commit would break D1's promise. |

## 3. Goals

Each goal states what the owner or a newcomer sees, and the oracle that proves it. The oracle has the same
kind as the claim, and it must fail for an empty or stub implementation.

| # | Goal (outcome) | Oracle | Why a stub fails |
|---|---|---|---|
| G1 | No Vietnamese text exists anywhere in this repository - in any file content or file name at any commit, or in any commit message - except the file `shared/i18n/vi.ts`. | `node scripts/lang-scan.mjs --history` in this repository prints `vietnamese: 0`. It scans every blob reachable from any ref (`git rev-list --objects --all`), every path name and every commit message; only blobs at the exact path `shared/i18n/vi.ts` are skipped. The scanner's unit tests show each detection class works and that the skip is exact. | A scanner that always says 0 fails its own unit tests. Doing nothing leaves thousands of hits. |
| G2 | A first-time visitor sees the whole UI in English, including schedule descriptions; the language toggle switches to Vietnamese from `vi.ts`. | e2e (the rewritten UC-18 test): a clean browser context opens every screen and asserts strings from `en.ts`, and `document.documentElement.lang` is `en`; after the toggle it asserts the matching `vi.ts` strings and `lang` = `vi`. | Today the default is `vi`, so the English assertions are red until the flip. |
| G3 | Castraferrum does everything Loop Console did at the freeze point. | `npm run verify` is green in a clone of this repository; `uc-coverage` reports `32/32` (the T0 baseline k/N); unit, api and e2e test counts are at least the T0 counts. | Missing or skipped tests lower k or the counts. An empty `USE-CASES.md` gives N = 0. |
| G4 | The repository works on its own: a fresh clone needs nothing from the source repo and carries no traces of it. | In a new temp folder, with scratch compose names: `git clone`, the README quickstart, `npm run verify` green. `node scripts/lang-scan.mjs --tree --coupling` prints `coupling: 0` (patterns in section 4). | Three scripts read files outside the folder today, and the coupling count is in the hundreds. |
| G5 | A newcomer can understand and run the project from English docs alone. | The README quickstart, executed word for word in a fresh clone on port 7170, serves the UI: `curl -s http://127.0.0.1:7170/` contains `<title>Castraferrum</title>`. `uc-coverage` reads `docs/USE-CASES.md` and finds 32 use cases; the API surface test reads `docs/API.md`. | Without `npm run build` the server answers JSON but serves no page. A wrong port could hit an old console, so a scratch port and the new title are required. |
| G6 | Design reference images show the English UI, and the repository is small enough to clone quickly. | Side by side: each new English reference next to its Vietnamese counterpart from the freeze commit, judged by the owner in the acceptance task. Mechanical check: no tracked PNG under `design/` has a blob id that also exists under `design/` at the freeze commit (so every image was regenerated, not relabelled). Size: `git archive HEAD:design \| wc -c` under 25 MB in the source repo; in this repository `git count-objects -vH` reports `size-pack` under 30 MiB right after import. | Untouched PNGs keep their old blob ids. Keeping all 521 PNGs breaks the size budget. |
| G7 | After import, any attempt to add Vietnamese is rejected before it reaches `main`. | Each check is shown red and then green, on scratch input: the pre-commit hook rejects a staged Vietnamese line and a Vietnamese file name; the commit-msg hook rejects a Vietnamese message; the CI script rejects a synthetic pull-request event whose title, body or branch name is Vietnamese, and a history containing a Vietnamese blob. | Without hooks and the CI job, all the scratch inputs pass. |
| G8 | The owner keeps working without loss: the console runs from this repository, existing loops and ticks are still there, and the source repo no longer contains the console. | Before cut-over, loop ids and tick counts are recorded from the old console. After: the console started from the Castraferrum clone returns the same ids and counts, and the Postgres container's compose working-dir label points at the new clone. In the source repo, `git ls-files` on the console folder and its docs folder prints nothing. | An empty database returns 0 loops. A container still owned by the old folder shows the old label. |
| G9 | The owner accepts the result. | The owner looks at the English UI next to the Vietnamese one from the freeze point, reads the new docs, and signs off on the acceptance issue. | Only the owner can close it. |

## 4. The language scanner (`scripts/lang-scan.mjs`)

The ratchet tool for G1, G4 and G7. Written first, so every later task reports a number before and after.

**Detection classes** (counted per line):
1. Vietnamese letters with diacritics: the Latin Extended Additional block (U+1EA0 to U+1EF9) plus the Vietnamese
   letters in Latin-1 Supplement, Latin Extended-A and Latin Extended-B (including U+0110, U+0111, U+01A0, U+01A1,
   U+01AF, U+01B0).
2. Unaccented Vietnamese: whole-word matches against a word list. The list is **stored as SHA-256 hashes of
   lower-cased tokens**, so the scanner holds no Vietnamese and does not flag itself. It is tuned against the
   current tree; words that collide with common English spellings are left out.
3. Path names (files and folders), with classes 1 and 2.
4. Commit messages and pull-request metadata, with classes 1 and 2.

**Skip:** exactly the repo-relative path `shared/i18n/vi.ts` (not a suffix match: `tests/arch-fixtures/shared/i18n/vi.ts`
is scanned). A unit test pins the skip list to that single entry.

**Coupling patterns** (`--coupling`), not applied to `docs/specs/` and `docs/plans/` (they describe the move):
- absolute home paths (a Windows, macOS or Linux home folder) whose `<x>` is not one of `alice`, `bob`, `user`,
  `runner`, `Shared`, `Public`, `Default`;
- the old console docs folder name, the path-join form that climbs to a parent `docs` folder, and `LC-` followed by digits;
- issue refs `#\d{3,}`, except inside string literals that carry a `{n}`-style placeholder (UI text such as
  `Run #{n}`) and except CSS hex colours;
- owner-specific strings (the source repo's name, bot account names), read from a gitignored
  `.lang-scan.local.json`, so the committed scanner never names them. CI runs without that file.

**Modes** (every one has unit tests):

| Flag | Scans |
|---|---|
| `--tree` (default) | tracked files of the working tree, contents and names |
| `--path <dir>` | the tracked files under one folder |
| `--names` | path names only |
| `--staged` | added lines of the staged diff, and staged path names (pre-commit hook) |
| `--message <file>` | one commit message (commit-msg hook) |
| `--history` | every blob and path reachable from any ref, and every commit message |
| `--pr-event <file>` | a GitHub `pull_request` event payload: title, body, head branch name |
| `--coupling` | adds the coupling count |
| `--list` | prints every hit as `path:line` |
| `--check-baseline` | exits 1 if any folder's count is above `scripts/lang-baseline.json` |

**Output:** `vietnamese: <n>`, `coupling: <n>` (with `--coupling`), `comment-lines: <n>`, and a per-folder breakdown.

**Comment lines** (for the retention check in translation tasks): non-empty comment lines with at least three
letters, counted per syntax: `//` and `/* ... */` (including JSDoc ` * ` lines) in JS and TS, `#` in PowerShell,
YAML and shell, `<!-- -->` in HTML and Markdown.

**Scanner tests contain no Vietnamese literals.** Samples are built at run time with `String.fromCodePoint(...)`
and from the hashed word list's test vectors (the test computes the hash of a token it builds from code points).

## 5. Out of scope

- New features, unrelated bug fixes, refactors (D5). Bugs found during translation become issues.
- Translating the source repo's wiki. Its general findings are rewritten into `docs/ARCHITECTURE.md` or an ADR.
- Choosing a license and going public.
- Moving open issues from the source repo's tracker. The frozen console issues stay there, labelled `frozen`.

## 6. Open questions (owner decides; none blocks the plan)

1. License before going public.
2. Whether to rename the Postgres volume and container to `castraferrum_*` (one-time data copy) or keep the
   default `loop_console_*` names. The plan keeps them; D10's overrides make either choice safe.
3. Reference screenshots add about 23 MB per full re-shoot to this repository's history once it exists. Before
   going public: Git LFS, fewer reference shots, or both.
4. Which frozen issues to recreate here after the import.
