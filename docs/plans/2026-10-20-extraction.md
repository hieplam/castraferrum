# Plan: extracting Loop Console into Castraferrum

- Date: 2026-10-20
- Spec: [../specs/2026-10-20-extraction.md](../specs/2026-10-20-extraction.md) (goals G1 to G9, decisions D1 to D11)
- Evidence log: `docs/plans/2026-10-20-extraction-evidence.md` (created by T0; every task appends its before and after numbers)

## How to read this plan

- **Where** says which repository the task runs in. "Source repo" means the owner's private repository that
  hosts `loop-console/` today; its own workflow applies there (worktree, PR, self-merge). "This repo" means
  Castraferrum.
- Commit messages, PR titles and PR bodies of **every** task are English, in both repositories. Only the
  source repo's own docs (its `CLAUDE.md` and wiki) stay Vietnamese.
- Paths inside a task are relative to `loop-console/` in the source repo, and to the root here.
- Tasks run **in order**. T4 to T7 change the same baseline file, so they do not run in parallel.
- Each task can be handed to an agent; its Verify block is the contract. A task is done only when its Green
  command has been run and the output matches. "Suite green" alone never counts as Green.
- **Never decrease** (checked in every task from T1 on): unit, api and e2e test counts and `uc-coverage` k/N
  compared with the T0 baseline. A task that lowers one of them is not done, even if every other check passes.

## Task overview

| Task | Where | What | Goals |
|---|---|---|---|
| T0 | source repo | Freeze, record the baseline | G3, G9 |
| T1 | source repo | Language and coupling scanner, committed baseline, wired into `verify` | G1, G4, G7 |
| T2 | source repo | New English docs set; `uc-coverage` reads `docs/USE-CASES.md` | G5, G3 |
| T3 | source repo | Locale flip: English default, `MessageKey` from `en.ts`, `vi.ts` kept | G2 |
| T4 | source repo | Translate `server/` | G1 |
| T5 | source repo | Translate `shared/` and `web/` | G1 |
| T6 | source repo | Translate `tests/` | G1 |
| T7 | source repo | Translate `scripts/` and configs; rename the product to Castraferrum | G1, D6 |
| T8 | source repo | Remove coupling to the source repo | G4 |
| T9 | source repo | Design references: prune, translate, regenerate in English, shot manifest | G6 |
| T10 | source repo | Extraction gate | G1, G3, G4 |
| T11 | this repo | Snapshot import and guardrails (hooks, CI) | G1, G7 |
| T12 | this repo | Fresh-clone run and README quickstart | G4, G5 |
| T13 | both | Cut-over: runtime moves here, the console leaves the source repo | G8 |
| T14 | both | Owner acceptance | G9 |

---

## T0 - Freeze and baseline

**Where:** source repo, plus the evidence log in this repo.

Steps:
1. In the source repo's `CLAUDE.md`, add two rules: everything under `loop-console/` is written in English from
   now on, and the console is feature-frozen until this plan finishes (point to this plan).
2. Add the label `frozen` to the open console issues (the stop-condition epic and its four child issues, the
   phase 3 issue, and the open console bug). Do not close them.
3. Make sure no console loop is running (the owner already stopped all sessions). Record the source repo `main`
   commit as the **freeze commit**.
4. At the freeze commit, in `loop-console/`: run `npm run verify`. Record in the evidence log: exit code,
   unit / api / e2e test counts (passed, skipped), `uc-coverage` k/N. Record the numbers only, in English
   (the tool output is still Vietnamese at this point).
5. Take screenshots of every screen in the Vietnamese UI (`npm run design:shots`) and keep them **outside**
   both repositories (the owner's scratch folder). T14 uses them for the side-by-side comparison.

**Verify**
- **Goal:** G3 needs a baseline to compare against; G9 needs the "before" pictures.
- **Red:** not applicable. This task adds no code; it measures.
- **Green:** `npm run verify` exits 0 at the freeze commit. The evidence log contains a "T0 baseline" section
  with the freeze commit SHA, the three test counts and `uc-coverage k/N`. `ls` of the scratch folder shows
  one PNG per screen and state.
- **Stub check:** an evidence log without the SHA and the counts gives later tasks nothing to compare with,
  and T10 cannot pass.

## T1 - Language and coupling scanner

**Where:** source repo, `scripts/lang-scan.mjs`, `tests/tools/lang-scan.test.ts`, `scripts/lang-baseline.json`.

Behaviour, as specified in spec section 4:
- `node scripts/lang-scan.mjs [--path <dir>] [--list] [--max <n>]` prints `vietnamese: <n>`, a per-folder
  breakdown and `comment-lines: <n>`.
- `--coupling` adds `coupling: <n>`. Generic committed patterns: absolute home paths whose user segment is not
  a neutral fixture name (`alice`, `bob`, `user`, `runner`), `docs/loop-console`, `LC-\d+`, issue refs written
  as `#\d+` in comments and strings (CSS hex colours excluded). Owner-specific strings (the source repo's name,
  bot account names) come from a gitignored file `.lang-scan.local.json`, so the scanner never contains them.
  `docs/specs/` and `docs/plans/` are excluded from the coupling scan: they describe the move by necessity.
- `--message <file>`, `--history`, `--diff <base>` modes for hooks and CI (used from T11 on).
- Skip list: exactly `shared/i18n/vi.ts`, pinned by a unit test.
- `--check-baseline` compares every folder with `scripts/lang-baseline.json` and exits 1 if any folder went up.
  Add it to `npm run verify`, right after `typecheck`.
- The test file contains no Vietnamese literals; samples come from Unicode escapes and from the word list.

**Verify**
- **Goal:** G1, G4 and G7 all depend on this ratchet.
- **Red:** write the tests first. `npx vitest run tests/tools/lang-scan.test.ts` fails with
  `Failed to load url ../../scripts/lang-scan.mjs` (module missing).
- **Green:** the same command passes. Cases: a diacritic sample is flagged; an unaccented-word sample is
  flagged; an English sentence that shares spellings is not flagged; a Vietnamese file name is flagged;
  `vi.ts` is skipped; the skip list has exactly one entry; a CSS colour `#123456` is not an issue ref; a home
  path with `alice` is not coupling while any other user segment is. Then
  `node scripts/lang-scan.mjs --coupling` prints `vietnamese: B` and `coupling: C` with B and C greater than 0.
  B is in the range of the spec's estimate (about 10 400 once `vi.ts` is skipped). Both numbers go into
  `lang-baseline.json` and the evidence log. `npm run verify` is green.
- **Stub check:** a scanner that returns 0 fails the diacritic and unaccented cases. A scanner that flags
  everything fails the English and `vi.ts` cases. Without the `verify` wiring, a test PR that adds a Vietnamese
  comment passes `verify`; with it, `--check-baseline` exits 1. Run this once as a throwaway check and record it.
- **Ratchet:** introduces B and C. From here on they only go down.

## T2 - English docs set

**Where:** source repo, new folder `loop-console/docs/` (it moves with the code), plus `loop-console/README.md`.

Files:
- `README.md`: what it is, requirements (Node 24, Docker), quickstart (`npm ci`, `docker compose up -d`,
  `npm start`, open `http://127.0.0.1:7070`), scripts table, link to the docs.
- `docs/ARCHITECTURE.md`: ports and adapters layout, scheduler, executors (fake and Claude), transcript source,
  HTTP API and SSE, persistence, test pyramid and `verify`. Distil the general findings from the source repo's
  wiki: Claude Code transcript JSONL layout, the empty-thinking case, folder browsing rules on Windows and macOS,
  how a tick waits for background tasks.
- `docs/USE-CASES.md`: the UC catalogue as a table `| UC-NN | title | ... |`, in English, the same IDs as the
  phase 1 and phase 2 specs.
- `CONTRIBUTING.md`: language rule (copy of this repo's `CLAUDE.md` rule), workflow, `npm run verify`.
- `docs/adr/0001-fresh-session-per-tick.md`, `0002-ports-and-adapters.md`, `0003-hand-written-i18n.md`, and more
  only if a decision would otherwise be lost.
- Point `scripts/uc-coverage.mjs` (`DEFAULT_SPECS`) and the executor test that reads the spec to
  `docs/USE-CASES.md`.

**Verify**
- **Goal:** G5 (docs a newcomer can follow) and G3 (UC count unchanged).
- **Red:** `npm run uc-coverage -- --spec docs/USE-CASES.md` fails because the file does not exist.
- **Green:** `npm run uc-coverage` (new default) reports the same k/N as T0.
  `node scripts/lang-scan.mjs --path docs` prints `vietnamese: 0`, and the same for `README.md` and
  `CONTRIBUTING.md`. The executor test passes. The quickstart is executed word for word in this worktree and the
  console answers on port 7070 (`curl -s http://127.0.0.1:7070/api/loops` returns JSON).
- **Stub check:** an empty or partial `USE-CASES.md` gives an N lower than T0. A README whose quickstart is
  wrong fails the word-for-word run.
- **Ratchet:** B for `loop-console/README.md` goes to 0 (old `docs/loop-console/` is left in place until T13, and
  it is outside the scanned folder).

## T3 - Locale flip

**Where:** source repo, `shared/i18n/`, `web/prefs/`, e2e tests.

Steps:
1. Derive `MessageKey` from `en.ts`; `vi.ts` becomes `Record<MessageKey, string>`.
2. Default language `en` in `web/prefs/prefs.tsx` (empty or unreadable storage gives English). Order the
   language toggle `en`, `vi`.
3. Rewrite `shared/i18n/i18n.test.ts` and `web/prefs/messages.test.ts` in English. Assertions about Vietnamese
   output read the expected text from `vi.ts` (for example, `translate('vi', k, p)` equals `vi[k]` with `p`
   substituted); no Vietnamese literals in tests.
4. Change e2e selectors that match visible text so they work with the English default (prefer `data-testid`;
   otherwise strings from `en.ts`).
5. New e2e test `@UC-18` (the existing "no missing translation" use case) "first visit is English": clean
   context, visit every screen, assert `en.ts` strings; toggle, assert `vi.ts` strings.

**Verify**
- **Goal:** G2.
- **Red:** the new e2e test, run against the current code, fails on the first English assertion (the page shows
  `vi.ts` text). Record the failing line.
- **Green:** `npx playwright test --grep "first visit is English"` passes; `npm run verify` is green; test counts
  are at least T0 plus one.
- **Stub check:** without step 2 the new test stays red. If tests were deleted to make selectors pass, the e2e
  count would drop below T0.
- **Ratchet:** B goes down by the lines in the two rewritten test files; the evidence log records before and
  after.

## T4 - Translate `server/`

**Where:** source repo, `server/`.

Translate comments, JSDoc, test names (`describe` / `it`), log lines and error messages. Error codes and API
shapes do not change. Fix the one Vietnamese identifier if it lives here. Do not delete comments; rewrite them.

**Verify**
- **Goal:** G1.
- **Red:** `node scripts/lang-scan.mjs --path server` prints `vietnamese: S` with S greater than 0 (about 1 500).
  Record S and `comment-lines: K`.
- **Green:** the same command prints `vietnamese: 0`, and `comment-lines` is at least 0.9 times K. Then
  `npm run test:unit` and `npm run test:api` pass with counts at least T0, and
  `node scripts/lang-scan.mjs --check-baseline` exits 0 after `lang-baseline.json` is lowered.
- **Stub check:** an untouched tree keeps S. Deleting comments instead of translating them fails the 0.9 times K
  check. Deleting tests fails the count check.
- **Ratchet:** `server` S goes to 0 in `lang-baseline.json`.

## T5 - Translate `shared/` and `web/`

**Where:** source repo, `shared/` (except `shared/i18n/vi.ts`) and `web/`.

Same rules as T4. Includes comments in `shared/contracts`, `shared/domain`, `web/prefs/format.ts`, components and
fake APIs. UI strings already live in the locale files, so this task does not change visible text.

**Verify**
- **Goal:** G1.
- **Red:** `node scripts/lang-scan.mjs --path shared` and `--path web` print totals greater than 0. Record them
  and the comment-line counts.
- **Green:** both print `vietnamese: 0`; comment lines at least 0.9 times before; `npm run typecheck`,
  `npm run test:unit`, `npm run build` and `npm run test:e2e` pass with counts at least T0; `--check-baseline`
  exits 0.
- **Stub check:** as in T4.
- **Ratchet:** `shared` and `web` go to 0.

## T6 - Translate `tests/`

**Where:** source repo, `tests/` (api, contract, e2e, fixtures, support, tools, visual, arch fixtures).

Test titles keep their `@UC-NN` tags and the same UC IDs. Fixture content that is Vietnamese prose becomes
English prose.

**Verify**
- **Goal:** G1, while keeping G3 intact.
- **Red:** `node scripts/lang-scan.mjs --path tests` prints `vietnamese: T` (about 1 600); record T and comment
  lines.
- **Green:** `vietnamese: 0`; comment lines at least 0.9 times before; `npm run verify` green; `uc-coverage`
  equals T0 (same k/N, so no UC tag was lost); test counts at least T0.
- **Stub check:** dropping a UC tag lowers k. Deleting a test lowers the counts.
- **Ratchet:** `tests` goes to 0.

## T7 - Translate scripts and configs; rename the product

**Where:** source repo, `scripts/` (`.mjs` and `.ps1`), `compose.yml`, `pg-init/`, `.env.example`,
`.dependency-cruiser.cjs`, `playwright.config.ts`, `vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`,
`tsconfig*.json`, `package.json`.

Steps:
1. Translate all comments and messages, including the output of `uc-coverage`, `test-contract`, `arch-check`,
   `api-smoke` and the restart script.
2. Rename the product: `package.json` `name` becomes `castraferrum`, the description is English; `app.title`
   and every "Loop Console" string in `en.ts` (and the matching `vi.ts` entries) become "Castraferrum"; the
   page `<title>` changes too. **Keep** the Postgres container and volume names `loop_console_pg` and the compose
   project name (spec D10, open question 2).
3. `.ps1` files stay ASCII with a UTF-8 BOM (Windows PowerShell 5.1 requirement).

**Verify**
- **Goal:** G1 and decision D6.
- **Red:** `node scripts/lang-scan.mjs --path scripts` and a scan of the root config files print totals greater
  than 0. `grep -rn "Loop Console" shared/i18n/en.ts web/index.html` finds matches.
- **Green:** both scans print `vietnamese: 0`; the grep finds none; `npm run verify` green; the restart script's
  own test (`scripts/test-restart-console.ps1`) passes; `docker compose config` still shows volume
  `loop_console_pg`.
- **Stub check:** an untouched tree keeps the counts and the grep hits. A renamed volume shows up in
  `docker compose config` and would orphan the owner's data.
- **Ratchet:** `scripts` and root configs go to 0.

## T8 - Remove coupling to the source repo

**Where:** source repo, whole `loop-console/`.

Steps:
1. Replace real home paths and user names in fixtures with neutral ones (`C:\Users\alice\code\demo`,
   `/Users/alice/code/demo`, `/home/alice/code/demo`); replace the source repo's name with `demo`.
2. Remove `LC-NN` and issue refs from comments, test names and docs. Where a ref explains *why*, keep the
   explanation in words.
3. Make sure no script or test reads a file outside `loop-console/` (after T2 the spec reads should be gone;
   check again).
4. Remove the bot account names from fixtures.

**Verify**
- **Goal:** G4.
- **Red:** `node scripts/lang-scan.mjs --coupling` prints `coupling: C` (from T1), greater than 0.
  `grep -rn "\.\./\.\./docs\|\.\./docs" scripts server tests web` finds matches.
- **Green:** `coupling: 0`; the grep finds nothing; `npm run verify` green with counts at least T0.
- **Stub check:** deleting the tests that hold the fixtures lowers C but fails the count check. Without the local
  pattern file the scan misses owner-specific names, so the task runs the scan with `.lang-scan.local.json`
  present and records that in the evidence log.
- **Ratchet:** C goes to 0 in `lang-baseline.json`.

## T9 - Design references

**Where:** source repo, `design/`, `scripts/design-*.mjs`.

Steps:
1. Keep the current references: `design/preview/`, `design/system/`, `tokens.css`, `components.css`, and
   `APPROVED.md`, `STATES.md`, `README.md` rewritten in English.
2. Delete the exploration folder `design/directions/` (historical; file names are unaccented Vietnamese) and the
   generated outputs `design/compare/shots`, `design/compare/diff`, `design/compare/results`; add the generated
   folders to `.gitignore`.
3. Translate the preview prototype's text (`design/preview/*.js`, `*.html`) to English.
4. Make `design:shots` and `design:states` write `design/shots-manifest.json`
   (`{ path, sha256, lang, generatedAt }` per PNG) and run them with the English locale. Add a check (part of
   `lang-scan --tree`) that fails when a tracked PNG is missing from the manifest or has `lang` other than `en`.

**Verify**
- **Goal:** G6.
- **Red:** the new manifest check, run on the current tree, fails and lists 521 PNGs without a manifest entry.
  `du -sh design` prints about 65 MB.
- **Green:** the manifest check passes; `node scripts/lang-scan.mjs --path design` prints `vietnamese: 0`;
  `du -sh design` is under 25 MB; `npm run design:compare` runs without error. **Visual:** a side-by-side page
  (old Vietnamese shot from T0 next to the new English shot, per screen and state) is produced in the scratch
  folder, and the owner looks at it in T14.
- **Stub check:** untouched PNGs have no manifest entry. Deleting all shots passes the manifest check but leaves
  the side-by-side page empty, and the owner rejects it in T14.
- **Ratchet:** `design` B goes to 0; size about 65 MB goes under 25 MB.

## T10 - Extraction gate

**Where:** source repo, `loop-console/`.

**Verify**
- **Goal:** G1, G3 and G4 hold on the exact tree that will be imported.
- **Red:** not applicable. This is a check-only task; if any check fails, go back to the task that owns it.
- **Green:** all of these, on one commit (the **export commit**), recorded in the evidence log:
  - `node scripts/lang-scan.mjs --tree --coupling` (with `.lang-scan.local.json`) prints `vietnamese: 0` and
    `coupling: 0`;
  - `npm run verify` exits 0; `uc-coverage` equals T0 k/N; unit, api and e2e counts are at least T0;
  - `git ls-files | node scripts/lang-scan.mjs --names` prints `vietnamese: 0` (file names).
- **Stub check:** any skipped task leaves one of these numbers above 0 or below T0.

## T11 - Snapshot import and guardrails

**Where:** this repo, branch `feat/import`.

Steps:
1. `git -C <source repo> archive --format=tar <export commit>:loop-console | tar -x -C <worktree>`.
2. Merge `README.md` and `CLAUDE.md` by hand: the imported README replaces the placeholder; this repo's
   `CLAUDE.md` keeps its language rule and gains a pointer to `CONTRIBUTING.md` and `docs/`. The
   `docs/specs/` and `docs/plans/` folders of this repo stay.
3. Guardrails:
   - `.githooks/pre-commit` runs `node scripts/lang-scan.mjs --diff --cached`; `.githooks/commit-msg` runs
     `node scripts/lang-scan.mjs --message "$1"`; `package.json` `prepare` sets `git config core.hooksPath .githooks`.
   - `.github/workflows/ci.yml`: job `lang-scan` runs `--tree --history --coupling` and checks the PR title, body
     and branch name (from the event payload); job `checks` runs `typecheck`, `arch`, `test:unit`,
     `test:contract`, `build`. The full `verify` (real-Claude e2e) stays a local command and is documented in
     `CONTRIBUTING.md`.
4. One commit: `Import Castraferrum source (snapshot of Loop Console at the export commit)`. Open a PR and merge it.

**Verify**
- **Goal:** G1 (this repo holds no Vietnamese at any commit) and G7 (it stays that way).
- **Red:** before step 3, in a scratch clone, this commit succeeds:
  `git commit --allow-empty -m "$(node -e "console.log('th\u1eed nghi\u1ec7m')")"`. Record it.
- **Green:**
  - `node scripts/lang-scan.mjs --tree --history` prints `vietnamese: 0` on `main` after merge;
  - the same throwaway commit is now refused (exit 1, the hook prints the offending line);
  - a throwaway PR whose title is built the same way fails CI job `lang-scan`; the PR is then closed without
    merging, and its branch deleted;
  - CI is green on the import PR.
- **Stub check:** without hooks the throwaway commit goes through; without the CI job the throwaway PR shows green.
- **Ratchet:** history count stays 0. It is checked on every PR from now on.

## T12 - Fresh-clone run

**Where:** this repo, a new temporary folder.

**Verify**
- **Goal:** G4 and G5.
- **Red:** not applicable. The previous tasks are expected to make this pass on the first run; any failure goes back
  to its owner task.
- **Green:** with the old console stopped, in a new temporary folder:
  `git clone git@github.com:hieplam/castraferrum.git`, then the README quickstart word for word, then
  `npm run verify`. The console answers on port 7070; `verify` exits 0 and its `uc-coverage` equals T0. The full
  log goes into the evidence log (English output only, since T7).
- **Stub check:** any hidden dependency on the source repo (a relative path, a missing file) fails here, because
  the temp folder has no source repo next to it.

## T13 - Cut-over

**Where:** both.

Steps:
1. With the old console still running from the source repo: record `GET /api/loops` (ids and names) and the tick
   count per loop in the evidence log (ids and counts only; prompts are the owner's data and are not copied).
2. Stop the old console. Clone this repo to the owner's usual repo folder, `npm ci`, `npm start`. Compose uses the
   same project and volume names, so the existing Postgres volume is reused.
3. In the source repo (its own workflow and language): delete `loop-console/` and `docs/loop-console/`. Update its
   `CLAUDE.md` row, its README and its wiki guide pages about the console so they point to Castraferrum. Wiki
   measurement pages stay as history. Add a migration note if any source repo script referenced the console.
4. Update the owner's memory notes that mention the console's path.

**Verify**
- **Goal:** G8.
- **Red:** before step 2, starting a console from a scratch clone against a **new** volume
  (`LOOPS_PG_PORT` and volume overridden) returns 0 loops. Record that, to show the check can tell the difference.
- **Green:** the console started from the Castraferrum clone returns the same loop ids and the same tick counts as
  step 1. In the source repo, `git ls-files loop-console docs/loop-console` prints nothing, and
  `git grep -n "loop-console/" -- CLAUDE.md README.md` points only to Castraferrum.
- **Stub check:** an empty database fails the id comparison; a forgotten folder shows up in `git ls-files`.

## T14 - Owner acceptance

**Where:** both. Creates an acceptance issue in this repo, in English.

The owner looks at:
- the side-by-side shots (T0 Vietnamese next to T9 English) for every screen and state;
- the running console from the Castraferrum clone, with the language toggle in both positions;
- `README.md`, `docs/ARCHITECTURE.md`, `docs/USE-CASES.md`;
- the evidence log with every before and after number.

**Verify**
- **Goal:** G9.
- **Red:** not applicable. Acceptance is a human judgement.
- **Green:** the owner closes the acceptance issue with a sign-off comment. Whatever they reject becomes a
  follow-up issue here, and the plan is not done until those are closed or explicitly waived by the owner.
- **Stub check:** an agent cannot close it on the owner's behalf. Only the owner's own comment counts.
