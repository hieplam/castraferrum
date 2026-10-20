# Plan: extracting Loop Console into Castraferrum

- Date: 2026-10-20 (revision 2, after an adversarial review of revision 1)
- Spec: [../specs/2026-10-20-extraction.md](../specs/2026-10-20-extraction.md) (goals G1 to G9, decisions D1 to D11)
- Evidence log: `docs/plans/2026-10-20-extraction-evidence.md` in this repo (created by T0; every task appends its
  before and after numbers, in English, numbers and commands only)

## How to read this plan

- **Where:** "source repo" is the owner's private repository that hosts `loop-console/` today; its own workflow
  applies there (one worktree per task, PR, self-merge). "This repo" is Castraferrum. Paths inside a task are
  relative to `loop-console/` in the source repo, and to the root here.
- **Language:** commit messages, PR titles and PR bodies of every task are English, in both repositories. Only
  the source repo's own docs (its `CLAUDE.md`, README and wiki) stay Vietnamese.
- **Order:** tasks run one at a time, in order. Several tasks lower the same baseline file.
- **Execution:** each task is handed to one implementing agent; its Verify block is the contract. The
  coordinating session reruns the Green commands itself before starting the next task. A task is done only when
  its Green has been run and the output matches. "Suite green" alone never counts.
- **Never decrease** (from T1 on, checked in every task): unit, api and e2e test counts, and `uc-coverage` 32/32,
  compared with T0. A task that lowers one of them is not done.
- **Suite stays green between tasks:** every task ends with `npm run verify` exit 0 in its worktree. The e2e
  server serves `dist/web`, so any Playwright run is preceded by `npm run build`.

## Task overview

| Task | Where | What | Goals |
|---|---|---|---|
| T0 | source repo | Freeze, baseline numbers, "before" pictures | G3, G9 |
| T1 | source repo | Language and coupling scanner, committed baseline, wired into `verify` | G1, G4, G7 |
| T2 | source repo | English docs set; tests and scripts read `docs/USE-CASES.md` and `docs/API.md` | G5, G3 |
| T3 | source repo | English default UI and English reference shots, in one step | G2, G6 |
| T4 | source repo | Design folder: prune and size budget | G6 |
| T5 | source repo | Translate `server/` | G1 |
| T6 | source repo | Translate `shared/` and `web/` | G1 |
| T7 | source repo | Translate `tests/`; rename architecture rules and fixtures | G1 |
| T8 | source repo | Translate scripts and configs; product rename; overridable compose names | G1, D6, D10 |
| T9 | source repo | Remove remaining coupling to the source repo | G4 |
| T10 | source repo | Extraction gate | G1, G3, G4 |
| T11 | this repo | Snapshot import and guardrails | G1, G7 |
| T12 | this repo | Fresh-clone run, quickstart, size | G4, G5, G6 |
| T13 | both | Cut-over: runtime moves here, the console leaves the source repo | G8 |
| T14 | both | Owner acceptance | G9 |

---

## T0 - Freeze, baseline, "before" pictures

**Where:** source repo; evidence log in this repo.

Steps:
1. In the source repo's `CLAUDE.md`, add two rules (in that repo's language): everything under `loop-console/` is
   written in English from now on, and the console is feature-frozen until this plan finishes; link this plan.
2. Add the label `frozen` to the open console issues (the stop-condition epic and its four children, the phase 3
   issue, the open console bug). Do not close them.
3. Check that no console loop is running. Record the source repo `main` SHA as the **freeze commit**.
4. At the freeze commit, in a clean worktree: `npm ci`, `npm run verify`. Record in the evidence log: exit code,
   unit / api / e2e test counts (passed, skipped), `uc-coverage` k/N.
5. "Before" pictures, kept **outside both repositories** (the owner's scratch folder, path recorded in the log):
   - real app: `LOOPS_COMPARE_OUT=<scratch>/before-app npm run design:compare` (writes `shots/` there);
   - approved preview: `git archive <freeze>:loop-console/design/preview/shots | tar -x -C <scratch>/before-preview`.
6. Create `docs/plans/2026-10-20-extraction-evidence.md` in this repo (PR, self-merge) with a "T0 baseline" section.

**Verify**
- **Goal:** G3 and G9 need a baseline and "before" pictures.
- **Red:** not applicable. This task adds no code; it measures.
- **Green:** `npm run verify` exits 0 at the freeze commit. The evidence log has the freeze SHA, the three test
  counts and `uc-coverage 32/32`. `ls <scratch>/before-app/shots | wc -l` and
  `ls <scratch>/before-preview | wc -l` are both greater than 0 and recorded. The six issues carry `frozen`
  (`gh issue list --label frozen` lists them).
- **Stub check:** an evidence log without SHA and counts leaves T10 nothing to compare with; empty picture
  folders leave T14 nothing to show.

## T1 - Language and coupling scanner

**Where:** source repo: `scripts/lang-scan.mjs`, `tests/tools/lang-scan.test.ts`, `scripts/lang-baseline.json`,
`.gitignore` (adds `.lang-scan.local.json`).

Build exactly what spec section 4 describes: four detection classes, hashed word list, exact one-path skip,
coupling patterns, every mode in the flag table, output format, comment-line counting.
Add `node scripts/lang-scan.mjs --check-baseline` to `npm run verify`, right after `typecheck`.
The owner-specific coupling file `.lang-scan.local.json` is created locally (gitignored) with the source repo's
name and the bot account names.

**Verify**
- **Goal:** G1, G4 and G7 depend on this ratchet.
- **Red:** write the tests first. `npx vitest run --project unit tests/tools/lang-scan.test.ts` fails with
  `Error: Cannot find module '../../scripts/lang-scan.mjs'`.
- **Green:** the same command passes, with at least these cases: diacritic sample flagged; unaccented sample
  (built from the hashed list's test vector) flagged; an English sentence that shares spellings not flagged;
  Vietnamese path name flagged; `shared/i18n/vi.ts` skipped while `tests/arch-fixtures/shared/i18n/vi.ts` is
  scanned; skip list has exactly one entry; `Run #{n}` and `#123456` are not issue refs while `#260` in a comment
  is; `/Users/alice` and `/Users/Shared` are not coupling while another user segment is; `--staged`,
  `--message`, `--history` (on a scratch repo created in the test's temp folder) and `--pr-event` (on a synthetic
  payload) each flag a Vietnamese sample and pass an English one; the scanner's own source scans to 0.
  Then `node scripts/lang-scan.mjs --tree --coupling` prints `vietnamese: B` (expected about 7 500) and
  `coupling: C` (C greater than 0); both go into `lang-baseline.json` and the evidence log. `npm run verify`
  exits 0.
- **Stub check:** a scanner that always says 0 fails every "flagged" case; one that flags everything fails every
  "not flagged" case. Throwaway check in the worktree, recorded and then reverted: add one Vietnamese comment
  (built with `node -e`), run `npm run verify` and see `--check-baseline` exit 1.
- **Ratchet:** introduces B and C. From here on they only go down.

## T2 - English docs set

**Where:** source repo: new `docs/` inside `loop-console/` (it moves with the code), `README.md`,
`CONTRIBUTING.md`.

Files:
- `README.md`: what it is; requirements (Node 24, Docker); quickstart, exactly:
  `npm ci`, `docker compose up -d`, `npm run build`, `npm start`, then open `http://127.0.0.1:7070`
  (and how to choose another port with `LOOPS_PORT`); scripts table; links.
- `CONTRIBUTING.md`: the language rule (as in this repo's `CLAUDE.md`), workflow, `npm run verify`, which e2e
  tests need a real Claude login.
- `docs/ARCHITECTURE.md`: ports and adapters, scheduler, executors, transcript source, HTTP API and SSE,
  persistence, startup recovery, test pyramid, `verify`. Distil the general findings from the source repo's wiki
  (Claude Code transcript layout, the empty-thinking case, folder browsing on Windows and macOS, how a tick waits
  for background tasks), and the cleanup message the executor test quotes.
- `docs/USE-CASES.md`: the 32 use cases as a table `| UC-NN | title | ... |`, same IDs, English.
- `docs/API.md`: the API surface table, in the format `tests/api/api-surface.test.ts` parses.
- `docs/adr/0001-fresh-session-per-tick.md`, `0002-ports-and-adapters.md`, `0003-hand-written-i18n.md`.
- Point `scripts/uc-coverage.mjs`, `tests/api/api-surface.test.ts` and the executor test at the new files.

**Verify**
- **Goal:** G5 and G3.
- **Red:** `git grep -nE "'\.\.', *'docs'|\.\./docs|docs/loop-console" -- scripts server tests web` lists the
  three readers. `npm run uc-coverage -- --spec docs/USE-CASES.md` fails (file missing).
- **Green:** the same `git grep` prints nothing. `npm run uc-coverage` reports `32/32`; the API surface test and
  the executor test pass. `node scripts/lang-scan.mjs --path docs` prints `vietnamese: 0`, and the same for
  `README.md` and `CONTRIBUTING.md`. The quickstart, run word for word in the worktree with `LOOPS_PORT=7170`,
  serves the UI: `curl -s http://127.0.0.1:7170/ | grep -c "<title>"` prints `1`. `npm run verify` exits 0.
- **Stub check:** a partial `USE-CASES.md` gives fewer than 32; a partial `API.md` fails the surface test; a
  quickstart without the build step serves no page.
- **Ratchet:** B drops by the old README's lines.

## T3 - English default UI and English reference shots

**Where:** source repo: `shared/i18n/`, `shared/domain/schedule.ts`, `shared/contracts/loops.ts`, `web/`,
`design/preview/`, `design/system/`, `scripts/design-*.mjs`, `tests/e2e/`, `tests/visual/`.

This is one task because the visual tests compare the real app with the reference shots: the locale, the
preview and the shots must change together or the suite goes red.

Steps:
1. Move every Vietnamese UI text into `shared/i18n/vi.ts`: the `TEXT.vi` block and the Vietnamese cron-description
   override from `schedule.ts`. `schedule.ts` keeps only locale-neutral logic and English.
2. Derive `MessageKey` from `en.ts`; `vi.ts` becomes `Record<MessageKey, string>` plus the schedule texts.
3. English default everywhere: `web/prefs/prefs.tsx` fallback, `.default('en')` in `shared/contracts/loops.ts`,
   locale defaults in `schedule.ts`, `<html lang="en">` in `web/index.html`. Toggle order `en`, `vi`.
4. Rewrite `shared/i18n/i18n.test.ts` and `web/prefs/messages.test.ts` in English; Vietnamese expectations are read
   from `vi.ts` (for example `translate('vi', k, p)` equals `vi[k]` with `p` substituted).
5. Rewrite the existing UC-18 e2e test: clean context shows English and `lang="en"` on every screen; the toggle
   switches to `vi.ts` strings and `lang="vi"`. Update UC-18's row in `docs/USE-CASES.md` to "English by default".
6. Change every e2e and visual assertion on visible text (about 212 lines in 17 files) to English, preferring
   `data-testid`, otherwise strings from `en.ts`.
7. Neutralise the visible demo data used by the preview and the visual tests (spec D8), so the shots are shot once.
8. Translate the preview prototype (`design/preview/*.html`, `preview.js`, `states.js`, `data.js`) to English.
   `messages.js` and `schedule.js` become build output of `design:shots` (written from the locale files) and are
   gitignored; `design-states.mjs` keeps checking them against their sources.
9. Regenerate `design/preview/shots` in English (`npm run design:shots`, `npm run design:states`), and
   `design/system/shots` (add a generator if none exists, or delete those three images and their references).

**Verify**
- **Goal:** G2, and the English half of G6.
- **Red:** with only the new UC-18 test written (steps 5, before steps 1 to 4), `npm run build` then
  `npx playwright test --grep "@UC-18"` fails on the first English assertion. Record the failing line.
- **Green:** `npm run build`, `npx playwright test --grep "@UC-18"` passes; `npm run verify` exits 0 (visual
  project included, at the existing `MAX_RATIO`); test counts are at least T0.
  `node scripts/lang-scan.mjs --path shared/domain` prints `vietnamese: 0`.
  Blob check: `git ls-tree -r HEAD -- design/preview/shots design/system/shots` shares no blob id with
  `git ls-tree -r <freeze> -- loop-console/design` (a one-line `comm -12` of the two sorted id lists prints
  nothing).
- **Stub check:** without the flip UC-18 stays red; with the flip but old shots the visual project fails;
  relabelled old shots fail the blob check; deleted tests lower the counts.
- **Ratchet:** B drops by the moved and translated lines (recorded per folder).

## T4 - Design folder: prune and size budget

**Where:** source repo: `design/`, `.gitignore`.

Steps:
1. Delete `design/directions/` (early explorations) and all of `design/compare/` (generated output, including its
   tracked `index.html` and `report.json`); gitignore `design/compare/`.
2. Rewrite `design/README.md`, `APPROVED.md`, `STATES.md` in English (short).

**Verify**
- **Goal:** G6 (size) and G1 for `design/`.
- **Red:** `git archive HEAD:design | wc -c` prints about 65 000 000; `node scripts/lang-scan.mjs --path design`
  prints a count greater than 0.
- **Green:** `git archive HEAD:design | wc -c` prints a number under 25 000 000;
  `node scripts/lang-scan.mjs --path design` prints `vietnamese: 0`; the blob check from T3 over all of
  `design/` prints nothing; `npm run verify` exits 0 (it writes compare output to `reports/compare`, not
  `design/`).
- **Stub check:** an untouched folder fails both numbers.
- **Ratchet:** design size about 65 MB to under 25 MB; `design` B to 0.

## T5 - Translate `server/`

**Where:** source repo, `server/`.

Translate comments, JSDoc, test names, log lines and error messages. Error codes and API shapes do not change.
Do not delete comments; rewrite them.

**Verify**
- **Goal:** G1.
- **Red:** `node scripts/lang-scan.mjs --path server` prints `vietnamese: S` (S about 1 500) and
  `comment-lines: K`; record both.
- **Green:** the same command prints `vietnamese: 0` and `comment-lines` of at least 0.9 times K;
  `npm run verify` exits 0 with counts at least T0; `lang-baseline.json` lowered and `--check-baseline` exits 0.
- **Stub check:** an untouched tree keeps S; deleting comments fails the 0.9 times K check; deleting tests fails
  the counts.
- **Ratchet:** `server` S to 0.

## T6 - Translate `shared/` and `web/`

**Where:** source repo, `shared/` (except `shared/i18n/vi.ts`) and `web/`.

Same rules as T5. Visible text does not change (it lives in the locale files since T3).

**Verify**
- **Goal:** G1.
- **Red:** `--path shared` and `--path web` print counts greater than 0; record them and their comment lines.
- **Green:** both print `vietnamese: 0`; comment lines at least 0.9 times before; `npm run verify` exits 0 with
  counts at least T0; `--check-baseline` exits 0.
- **Stub check:** as in T5.
- **Ratchet:** `shared` and `web` to 0.

## T7 - Translate `tests/`; rename architecture rules and fixtures

**Where:** source repo: `tests/`, `.dependency-cruiser.cjs`, `scripts/arch-lib.mjs`, `scripts/arch-check.mjs`.

Steps:
1. Translate test names, comments and fixture prose. Titles keep their `@UC-NN` tags.
2. In one commit: rename the 19 dependency-cruiser rules to English, rename the `// vi-pham:` marker (for example
   `// violates:`) in `arch-lib.mjs` and in every fixture that uses it, and rename the fixture files and folders
   with Vietnamese names.

**Verify**
- **Goal:** G1, keeping G3 intact.
- **Red:** `--path tests` prints `vietnamese: T` (about 1 600) and its comment lines;
  `node scripts/lang-scan.mjs --names` and the same scan of `.dependency-cruiser.cjs` print counts greater than 0.
- **Green:** all three print 0; comment lines at least 0.9 times before; `npm run arch` passes and still reports
  the expected violations for every fixture (its own test, `tests/tools/arch-fixtures.test.ts`, passes);
  `npm run verify` exits 0; `uc-coverage` 32/32; counts at least T0.
- **Stub check:** a dropped UC tag lowers k; a renamed marker that `arch-lib` no longer parses makes the
  arch-fixtures test fail.
- **Ratchet:** `tests` and names to 0.

## T8 - Scripts and configs; product rename; overridable compose names

**Where:** source repo: `scripts/` (`.mjs`, `.ps1`), `compose.yml`, `pg-init/`, `.env.example`,
`playwright.config.ts`, `vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `tsconfig*.json`, `package.json`,
`shared/i18n/en.ts`, `shared/i18n/vi.ts`, `web/index.html`.

Steps:
1. Translate comments and output of every script (`uc-coverage`, `test-contract`, `arch-check`, `api-smoke`,
   `design-*`, `dev`, the restart script and its test).
2. `restart-console.ps1`: no hard-coded path; the console folder is the script's own parent
   (`$PSScriptRoot\..`). `.ps1` files stay ASCII with a UTF-8 BOM.
3. Product rename: `package.json` `name` = `castraferrum`, English description; "Loop Console" becomes
   "Castraferrum" in `en.ts`, `vi.ts` and `<title>`.
4. Compose names become overridable, defaults unchanged:
   `name: ${LOOPS_COMPOSE_PROJECT:-loop-console}`, `container_name: ${LOOPS_PG_CONTAINER:-loop_console_pg}`,
   volume `name: ${LOOPS_PG_VOLUME:-loop_console_pg}`; document the three in `.env.example` and the README.

**Verify**
- **Goal:** G1, D6, D10.
- **Red:** `--path scripts` and a scan of the root config files print counts greater than 0;
  `git grep -n "Loop Console" -- shared/i18n web/index.html package.json` finds matches; `docker compose config`
  with `LOOPS_PG_VOLUME=scratch_pg` still shows `loop_console_pg`.
- **Green:** both scans print 0; the grep prints nothing; `docker compose config` shows `loop_console_pg` without
  overrides and `scratch_pg` with `LOOPS_PG_VOLUME=scratch_pg`; `scripts/test-restart-console.ps1` passes on
  Windows; `npm run verify` exits 0.
- **Stub check:** an untouched tree keeps every red; a renamed default volume shows up in `docker compose config`
  and would orphan the owner's data.
- **Ratchet:** `scripts` and root configs to 0.

## T9 - Remove remaining coupling

**Where:** source repo, whole `loop-console/`.

Steps: neutral fixture paths and names (`alice`, `demo`); remove `LC-NN` and issue refs (keep the reason in words
where a ref explained why); remove bot account names; recheck readers outside the folder.

**Verify**
- **Goal:** G4.
- **Red:** with `.lang-scan.local.json` present, `node scripts/lang-scan.mjs --tree --coupling` prints
  `coupling: C'` greater than 0.
- **Green:** `coupling: 0` with the local file present (recorded); the T2 `git grep` still prints nothing;
  `npm run verify` exits 0 with counts at least T0.
- **Stub check:** deleting the tests that hold the fixtures lowers C' but fails the counts.
- **Ratchet:** coupling to 0 in `lang-baseline.json`.

## T10 - Extraction gate

**Where:** source repo, `loop-console/`.

**Verify**
- **Goal:** G1, G3, G4 on the exact tree to be imported.
- **Red:** not applicable. A check-only task; a failure goes back to the task that owns it.
- **Green:** on one commit (the **export commit**), recorded in the evidence log:
  `node scripts/lang-scan.mjs --tree --names --coupling` with the local file prints `vietnamese: 0` and
  `coupling: 0`; `npm run verify` exits 0; `uc-coverage` 32/32; counts at least T0;
  `git archive HEAD:design | wc -c` under 25 000 000.
- **Stub check:** any skipped task leaves one of these off target.

## T11 - Snapshot import and guardrails

**Where:** this repo, branch `feat/import`, one worktree.

Steps:
1. `git -C <source repo> archive --format=tar <export commit>:loop-console | tar -x -C <worktree>`.
2. Merge by hand: the imported README replaces the placeholder; this repo's `CLAUDE.md` keeps its language rule
   and links `CONTRIBUTING.md` and `docs/`; `docs/specs/` and `docs/plans/` stay.
3. Guardrails:
   - `.githooks/pre-commit` runs `node scripts/lang-scan.mjs --staged`; `.githooks/commit-msg` runs
     `node scripts/lang-scan.mjs --message "$1"`; both committed with the exec bit
     (`git update-index --chmod=+x .githooks/*`); `package.json` `prepare` runs `git config core.hooksPath .githooks`.
   - `.github/workflows/ci.yml`, checkout with `fetch-depth: 0`:
     job `lang-scan` runs `--history --coupling` and, on pull requests, `--pr-event "$GITHUB_EVENT_PATH"`;
     job `checks` runs `typecheck`, `arch`, `test:unit`, `build`, and `test:contract` with a Postgres service that
     has the `loops_test` database (from `pg-init/`). The full `verify` stays local (real-Claude e2e) and
     `CONTRIBUTING.md` says so.
4. One commit, `Import Castraferrum source (snapshot of Loop Console at the export commit)`, PR, self-merge.

**Verify**
- **Goal:** G1 and G7.
- **Red** (in a scratch clone of this repo with step 3 not yet applied; Vietnamese input built with
  `node -e "console.log(String.fromCodePoint(0x74,0x68,0x1eed))"`):
  a commit with that text as message succeeds; a commit that stages a file containing it succeeds; a commit that
  stages a file whose name contains it succeeds. Record each.
- **Green:**
  - in a fresh scratch clone after merge (`npm ci` runs `prepare`), the same three commits are refused (exit 1,
    offending line printed);
  - `node scripts/lang-scan.mjs --pr-event <scratch>/event.json` exits 1 for synthetic payloads with that text in
    the title, then in the body, then in the head branch name, and exits 0 for an English payload;
  - `node scripts/lang-scan.mjs --history` exits 1 in a scratch repo that has one Vietnamese blob in an old commit;
  - on this repo's `main` after merge: `node scripts/lang-scan.mjs --history --coupling` prints
    `vietnamese: 0` and `coupling: 0`; CI is green on the import PR.
  No Vietnamese commit, branch or PR is ever created in this repository; all red inputs live in scratch folders.
- **Stub check:** without the hooks the three scratch commits go through; without `--pr-event` or `--history`
  the synthetic inputs pass.
- **Ratchet:** history count 0, checked on every PR from now on.

## T12 - Fresh-clone run, quickstart, size

**Where:** this repo, a new temporary folder.

**Verify**
- **Goal:** G4, G5, G6 (size).
- **Red:** not applicable. Earlier tasks are expected to make this pass on the first run; a failure goes back to
  its owner task.
- **Green**, with `LOOPS_COMPOSE_PROJECT=cf-scratch`, `LOOPS_PG_CONTAINER=cf_scratch_pg`,
  `LOOPS_PG_VOLUME=cf_scratch_pg`, `LOOPS_PG_PORT=55532`, `LOOPS_PORT=7170` (so the owner's database is never
  touched):
  - `git clone git@github.com:hieplam/castraferrum.git` into the temp folder, then the README quickstart word for
    word; `curl -s http://127.0.0.1:7170/ | grep -o "<title>Castraferrum</title>"` prints the title;
  - `npm run verify` exits 0, `uc-coverage` 32/32;
  - `git count-objects -vH` shows `size-pack` under 30 MiB;
  - `docker inspect loop_console_pg` still shows the owner's container untouched (same `Created` time as before).
  Afterwards remove the scratch container and volume.
- **Stub check:** a hidden dependency on the source repo fails in a folder that has no source repo next to it;
  compose names that are not overridable would hit `loop_console_pg`.

## T13 - Cut-over

**Where:** both.

Steps:
1. With the old console still running from the source repo, record loop ids and tick counts per loop
   (`GET /api/loops` and the runs endpoint) in the evidence log; ids and counts only.
2. Stop the old console. Clone this repo into the owner's usual repo folder, `npm ci`, `npm run build`, then
   `docker compose up -d` **from the new clone** (default names, so the existing volume is reused), then
   `npm start`.
3. In the source repo (its own workflow and language): delete `loop-console/` and `docs/loop-console/`; update its
   `CLAUDE.md`, README and console guide pages in the wiki to point here; measurement pages stay as history.
4. Update the owner's memory notes that mention the console's path.

**Verify**
- **Goal:** G8.
- **Red:** before step 2,
  `docker inspect loop_console_pg --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`
  prints the source repo's console folder.
- **Green:** the same command prints the new clone's folder; the new console returns the same loop ids and tick
  counts as step 1; in the source repo `git ls-files loop-console docs/loop-console` prints nothing and
  `git grep -n "loop-console/" -- CLAUDE.md README.md` points only to Castraferrum.
- **Stub check:** an empty database fails the id comparison; a container still owned by the old folder shows the
  old label; a forgotten folder shows up in `git ls-files`.

## T14 - Owner acceptance

**Where:** both. An acceptance issue in this repo, in English.

The owner looks at: the "before" pictures from T0 next to the English shots from T3, screen by screen; the running
console from the Castraferrum clone with the toggle in both positions; `README.md`, `docs/ARCHITECTURE.md`,
`docs/USE-CASES.md`; the evidence log.

**Verify**
- **Goal:** G9.
- **Red:** not applicable. Acceptance is a human judgement.
- **Green:** the owner closes the acceptance issue with a sign-off comment. Whatever they reject becomes a
  follow-up issue here; the plan is done when those are closed or waived by the owner.
- **Stub check:** only the owner's own comment counts.
