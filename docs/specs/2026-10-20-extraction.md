# Spec: extracting Loop Console into Castraferrum

- Date: 2026-10-20
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
| `docs/loop-console/` | Vision, spec phase 1 and 2, architecture, plan (about 350 KB) |
| wiki pages about the console | Measurements and research notes (transcript format, folder browsing on Windows and macOS, executor behaviour) |

### Measured starting point (2026-10-20, source repo `main` at `2b7e9d9`)

| | Value |
|---|---|
| Tracked files under the two paths | 879, of which 841 contain Vietnamese |
| Lines with Vietnamese diacritics | about 10 900 (docs 2 255, tests 1 638, server 1 517, shared 868 of which most is `vi.ts`, web 649, design 3 511 in HTML/JS/MD, scripts 187, configs and README the rest) |
| Lines with unaccented Vietnamese in code | at least 45 (found with a small word list; diacritic search misses them) |
| Identifiers | English, with a handful of exceptions (a Vietnamese local variable in `shared/i18n/i18n.test.ts`) |
| File names | Mostly English; some design files under `design/directions/` are unaccented Vietnamese |
| `design/` | 521 PNG screenshots (about 65 MB) of the Vietnamese UI; 335 of them are compare shots and diffs |
| UI locales | `shared/i18n/vi.ts` (source of `MessageKey`) and `shared/i18n/en.ts`; default locale is `vi` (`web/prefs/prefs.tsx`) |
| References into the source repo | about 150 `#NNN` issue refs and 250 `LC-NN` task refs in code; test fixtures with the owner's real home paths and the source repo's name; `scripts/uc-coverage.mjs` and one executor test read `docs/loop-console/SPEC-phase-*.md` |
| Runtime data | Postgres volume `loop_console_pg` (explicit name, container `loop_console_pg`) holding the owner's loops and ticks |
| Git history | 37 commits touching the two paths, all with Vietnamese messages |

These numbers are approximate; the first plan task replaces them with exact numbers from a committed tool.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **No history is carried over.** The code enters this repository as one snapshot commit, after it has been translated. Development history stays in the source repo. | Every old commit contains Vietnamese (messages and file contents). Rewriting history is expensive and easy to get wrong. |
| D2 | **Translate in place in the source repo first, extract second.** | The full verification suite (`npm run verify`, 31+ use cases with green e2e tests) keeps running while text changes, so a broken translation shows up immediately. |
| D3 | **Docs are rewritten short, not translated.** New set: `README.md`, `docs/ARCHITECTURE.md`, `docs/USE-CASES.md`, `CONTRIBUTING.md`, `docs/adr/*`. The phase specs, plan and vision stay in the source repo as history. | Most of the 350 KB is historical planning. Only the knowledge a new contributor needs moves. |
| D4 | **`vi.ts` stays; English becomes the default locale**, and `MessageKey` is derived from `en.ts`. The language scanner skips `shared/i18n/vi.ts` (and only that file), so the target count is exactly 0. | A translation is a feature. Everything else in the repository is English. |
| D5 | **Feature freeze** on the console until extraction is done. No new features (including the "stop condition" epic and phase 3). The source repo keeps getting features for its own domain. | A moving target makes translation and parity checks unreliable. |
| D6 | **Name: Castraferrum.** Repository `hieplam/castraferrum`, package name `castraferrum`; the UI title changes from "Loop Console" to "Castraferrum". No "Claude" in the name. | Owner's choice. npm and GitHub had no project with this name on 2026-10-20. Avoiding vendor trademarks also leaves room for non-Claude executors. |
| D7 | **Use-case IDs (`UC-NN`) stay**; task IDs (`LC-NN`) and issue refs (`#NNN`) from the source repo are removed from code, tests and docs. | UC IDs are part of the product's test contract (e2e tags, `uc-coverage`). LC and issue numbers point to a tracker the public will never see. |
| D8 | **Test fixtures use neutral data**: no real home paths, user names or the source repo's name. | The repository will be public. |
| D9 | **Screenshots are regenerated in English**; stale compare shots and diffs are dropped rather than migrated. | Images cannot be scanned for text cheaply, so the rule is: every PNG in the snapshot comes from a run with the English locale. |
| D10 | **Runtime data survives the move.** The Postgres volume and container keep working when the console runs from a clone of this repository. | The owner's existing loops and tick history must still be there after cut-over. |
| D11 | **Guardrails from day one** in this repository: a commit-msg hook, a CI job and `CLAUDE.md` rules that reject Vietnamese outside `vi.ts`, in files, commit messages, branch names and PR titles and bodies. | Agents working for the owner receive instructions in Vietnamese. Without guardrails, Vietnamese drifts back in. |

## 3. Goals

Each goal states what the owner or a newcomer sees, and the oracle that proves it. The oracle has the same
kind as the claim, and it must fail for an empty or stub implementation.

| # | Goal (outcome) | Oracle | Why a stub fails |
|---|---|---|---|
| G1 | No Vietnamese text exists anywhere in this repository, in any file at any commit or in any commit message, except `shared/i18n/vi.ts`. | `node scripts/lang-scan.mjs --tree --history` run in this repository prints `vietnamese: 0` and exits 0. The scanner's own tests show that it flags diacritics, unaccented Vietnamese words and file names, and that it skips only `vi.ts`. | A scanner that always reports 0 fails its own unit tests on known Vietnamese samples. Doing nothing leaves about 10 900 hits. |
| G2 | A first-time visitor sees the whole UI in English; switching the language toggle shows Vietnamese from `vi.ts`. | e2e: a clean browser context (empty storage) opens every screen and asserts English strings from `en.ts`; after the toggle, it asserts the matching `vi.ts` strings. | Today's default is `vi`, so the English assertion is red until the default changes. |
| G3 | Castraferrum does everything Loop Console did at the freeze point. | `npm run verify` is green in this repository, and `uc-coverage` reports the same `k/N` as the baseline recorded at freeze time in the source repo (N = number of use cases, k = use cases with green e2e tests). | Missing or skipped tests lower k. An empty `USE-CASES.md` gives N = 0, not the baseline N. |
| G4 | The repository works on its own: a fresh clone needs nothing from the source repo and carries no traces of it. | In a new temp folder: `git clone`, `npm ci`, `npm run verify` green. `node scripts/lang-scan.mjs --coupling` prints `coupling: 0`. Committed generic patterns: absolute home paths whose user segment is not a neutral fixture name, `docs/loop-console`, `LC-\d+`, issue refs `#\d+` (CSS colours excluded). Owner-specific patterns (the source repo's name, bot account names) come from a gitignored local file, so the scanner itself never names them. `docs/specs/` and `docs/plans/` are excluded, because they describe the move. | Today the coupling count is several hundred and two scripts read files outside the folder, so a fresh clone fails. |
| G5 | A newcomer can understand and run the project from English docs alone. | The README quickstart is executed word for word on a fresh clone and the console answers on `http://127.0.0.1:7070`. `uc-coverage` reads its use-case list from `docs/USE-CASES.md` and finds the baseline N. | Missing docs break the quickstart run and the N check. |
| G6 | Design reference images show the English UI, and the repository stays small enough to clone quickly. | Side by side: each new English shot next to its old Vietnamese counterpart, judged by the owner. `design/shots-manifest.json` (written by the shot scripts) lists every tracked PNG with `lang: "en"`; a check fails on any PNG missing from it. Packed repository size is under 30 MB (`git count-objects -vH`). | Untouched PNGs are missing from the manifest. Keeping all 521 old PNGs breaks the size budget. |
| G7 | After import, any attempt to add Vietnamese to this repository is rejected before it reaches `main`. | Red, then green: a commit whose message or content contains Vietnamese is refused by the commit-msg and pre-commit hooks (exit 1, offending line shown). A PR with a Vietnamese title or body, or a Vietnamese line in its diff, fails the CI job `lang-scan`. | Without hooks and CI, the same commit and PR go through. |
| G8 | The owner keeps working without loss: the console runs from this repository, existing loops and ticks are still there, and the source repo no longer contains the console. | Before cut-over: `GET /api/loops` and the tick count are recorded from the old console. After: the console started from a Castraferrum clone returns the same loops and counts. In the source repo, `loop-console/` and `docs/loop-console/` are gone and its docs point here. | A fresh empty database returns 0 loops. A leftover copy in the source repo is visible in its file listing. |
| G9 | The owner accepts the result. | The owner looks at the English UI next to the Vietnamese one at the freeze point, and reads the new README and ARCHITECTURE, then signs off on the acceptance issue. | Only the owner can close it. |

## 4. The language scanner (`scripts/lang-scan.mjs`)

The ratchet tool for G1, G4 and G7. Written first, before any translation, so every later task can report
a number before and after.

- **Hits** are counted per line, in four classes:
  1. Vietnamese letters with diacritics (Latin Extended Additional block plus the Vietnamese letters in Latin-1
     and Latin Extended-A, including U+0111 and U+0110).
  2. Unaccented Vietnamese: a word list of common Vietnamese function words and project vocabulary, matched as
     whole words in comments, strings and Markdown prose. It is tuned against the current tree so English words
     with the same spelling do not count; ambiguous words that cannot be tuned out are kept out of the list.
  3. File and folder names, checked with both classes above.
  4. With `--message <file>` or `--history`: commit messages, branch names and, in CI, PR titles and bodies.
- **Skip list**: exactly `shared/i18n/vi.ts`. The skip list is a constant in the scanner, and a unit test pins
  it to that single entry, so it cannot quietly grow.
- **Images** are not OCR-scanned. G6 covers them through the shot manifest.
- **Scanner tests contain no Vietnamese literals.** Samples are built from Unicode escapes (`'\u1ea1'`) and
  from the word list itself, so the test files pass the scanner.
- **Output**: `vietnamese: <n>` (and `coupling: <n>` with `--coupling`), a per-folder breakdown, and with
  `--list` every hit as `path:line`. `--max <n>` exits 1 when the count is above `n`. The baseline lives in a
  committed file `scripts/lang-baseline.json`, and each translation PR lowers it.
- **Comment retention**: the scanner also prints the number of comment lines. A translation that deletes
  comments instead of translating them would lower the Vietnamese count too, so each translation task also
  shows that its comment-line count stayed at 90 % or more of the count before the task.

## 5. Out of scope

- New features, bug fixes unrelated to the move, refactors (D5). Bugs found during translation become
  issues, not part of the translation PRs.
- Translating the source repo's wiki. The few general findings (Claude Code transcript format, folder browsing
  rules on Windows and macOS, executor behaviour) are rewritten into `docs/ARCHITECTURE.md` or an ADR.
- Choosing a license and going public. That is a separate decision once the extraction is done.
- Moving open issues from the source repo's tracker. The frozen console issues stay there, labelled `frozen`;
  the owner decides later which ones to recreate here, in English.

## 6. Open questions (owner decides; none blocks the plan)

1. License before going public (MIT, Apache-2.0, ...).
2. Whether to rename the Postgres volume and container to `castraferrum_*` (needs a one-time data copy)
   or keep the `loop_console_*` names forever. The plan keeps the old names, which satisfies D10 at no risk.
3. Which frozen issues to recreate here after the import.
