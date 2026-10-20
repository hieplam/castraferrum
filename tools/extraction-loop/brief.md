You are implementing task **{{T}}** of the Castraferrum extraction plan: GitHub issue hieplam/castraferrum#{{N}}
("{{TITLE}}", epic #{{EPIC}}). One task, one subagent, then you are done.

## 0. Read first, fully

- The issue: `gh issue view {{N}} -R hieplam/castraferrum --comments` (the task section is copied into it)
- Plan: `{{ROOT}}/docs/plans/2026-10-20-extraction.md` ("How to read this plan" and section {{T}}; the plan file wins)
- Spec: `{{ROOT}}/docs/specs/2026-10-20-extraction.md`
- Evidence log so far: `{{ROOT}}/docs/plans/2026-10-20-extraction-evidence.md` (T0 baseline: unit 382 passed / 2 skipped,
  contract 114, api 115, e2e 58, uc-coverage 32/32; later sections hold the latest scanner numbers)
- `{{ROOT}}/CLAUDE.md` (English-only rule) and `{{SOURCE}}/CLAUDE.md` (the source repo's rules and Git workflow)

Repositories:
- Source repo: `{{SOURCE}}`, the console lives in `loop-console/`. Its own docs are Vietnamese, but everything you
  write under `loop-console/`, and every commit message, branch name, PR title and PR body, is English.
- This repo: `{{ROOT}}` (hieplam/castraferrum). Everything here is English, ASCII only: before every commit run
  `grep -rlP '[^\x00-\x7F]' <changed files>` and make sure it prints nothing.

## 1. Fix the Verify block before building

Write down Goal, Red, Green and Stub check for {{T}} exactly as the plan states them (sharpen a command only if it is
wrong, and say why). Run Red and keep its literal output. If Red does not fail the way the plan says, stop and report
BLOCKED: the plan is wrong about the starting point.

## 2. Build

- One new worktree per repo you change, named `<repo folder>-{{T}}` next to the main checkout, branch
  `feat/castraferrum-{{T}}` (source repo) or `docs/{{T}}-evidence` (this repo). Do not touch worktrees you did not create.
- In a new source-repo worktree run `npm ci` in `loop-console/` (a real install, not a link to another checkout's
  `node_modules`). Never `rm -rf` a linked `node_modules`; remove worktrees with `git worktree remove --force`.
- Copy `loop-console/.lang-scan.local.json` from the source repo's main checkout into your worktree if it exists
  (it is gitignored; it holds owner-specific coupling patterns).
- **Never run `docker compose up` from a worktree**: it recreates the owner's Postgres container `loop_console_pg`
  with the worktree's label. Postgres is already running; if it is not, start it from `{{SOURCE}}/loop-console`.
  Never `docker compose down -v`, never remove the volume `loop_console_pg`.
- Feature freeze: no new features, no unrelated refactors. A bug you find that is outside {{T}} becomes a new issue in
  hieplam/castraferrum (English) instead of a fix.
- Keep the suite green: `npm run verify` must exit 0 in your worktree before you merge. A Playwright run needs
  `npm run build` first.
- Never decrease: unit, api and e2e test counts and uc-coverage 32/32.

## 3. Green and ratchet

Run every Green command of {{T}} and compare with the literal expected output. Run the scanner before and after:
`node scripts/lang-scan.mjs --tree --coupling` (from `loop-console/` while the console still lives in the source repo).
Its two counts may only go down; lower `scripts/lang-baseline.json` when they do.

## 4. PRs, merge, clean up

1. Source repo change (if any): commit, push, `gh pr create` (English title and body with a `## Verify` section),
   `gh pr merge --squash`, `git -C {{SOURCE}} pull`.
2. This repo: append a section headed exactly `## {{T}}` to `docs/plans/2026-10-20-extraction-evidence.md`:
   the Red output line, every Green result with literal numbers, the stub check result, scanner counts before and
   after, test counts, PR links. Open a PR whose body contains the line `Closes #{{N}}` and a `## Verify` section that
   mentions Red, Green and Stub check with their results. `gh pr merge --squash --delete-branch`, then `git pull` in
   `{{ROOT}}`.
3. Remove every worktree and branch you created (local and remote) in both repos; confirm with `git worktree list`.

Do not touch Claude memory files. Do not stop or restart game-server containers.

## 5. Final line (the coordinator reads it)

End your report with exactly one JSON line:

    {"issue":{{N}},"task":"{{T}}","result":"DONE","prs":["<url>","<url>"],"vietnamese":<n>,"coupling":<n>}

or, when you could not finish (merge nothing that is not done; leave a comment on the issue saying why):

    {"issue":{{N}},"task":"{{T}}","result":"BLOCKED","reason":"<one sentence>"}
