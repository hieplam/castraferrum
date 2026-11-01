# Plan, issue 215: the process review finds repeated causes and files one issue each (wave 1)

Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md).
Epic: [castraferrum#217](https://github.com/hieplam/castraferrum/issues/217). Evidence log: `2026-11-01-goal-driven-loop-evidence.md`.
Wave 1 holds R1 and R3. R2 and R4 to R9 come in later waves.

## R1 - Count rule lines, rule-lint

**Files:** `scripts/rule-lint.mjs`, `scripts/rule-lint-baseline.json`, `tests/tools/rule-lint.test.ts`, fixture roots `tests/tools/fixtures/rule-lint/{ok,new-unlinked,new-linked,bad-link,stale}/` (each: `CLAUDE.md`, `package.json`, `scripts/{check.mjs,rule-lint-baseline.json}`), `package.json` (script `rule-lint`; `verify` runs it with `--base main`), `.github/workflows/ci.yml` (a step like Ratchets, `--base origin/main`).

**Definition.** Rule files: `CLAUDE.md`, `CONTRIBUTING.md` (the baseline `files`). A block is a list item or a paragraph, its lines joined by a space. Headings, table rows and fenced code are no block. A rule line is a block that matches `/\b(must|never|always|do not|don't|non-negotiable|may only|may not|is forbidden)\b/i`. It has a check if it holds an existing path `(scripts|tests|.githooks|.github)/...`, or `npm run <x>` with `<x>` in `package.json`, or `No machine check:` and 4 or more words. Id: 12 hex of sha256 of `<file>\n<block>`.

**Steps** (G16): `node scripts/rule-lint.mjs [--root d] [--base ref|--base-file f] [--count] [--write-baseline]`. Baseline: `{"v":1,"files":[],"unchecked":[{"file","id","preview"}]}` under `<root>/scripts/`; `--write-baseline` only if absent. Exit 1 on `NEW <file>: <preview>` (unchecked, not in baseline), `STALE <id>` (entry matches no unchecked line), `GROWN <id>` (with `--base`: entry not in the base; no base file: skip). A missing rule file: exit 2. Success: `rule-lint: ok (rule lines N, without a check U, new 0)`. `--count`: `rule lines: N`, `without a check: U`.

**Goal:** G16. A new rule line in a rule file with no link to a check is refused, and the number of rule lines with no check is printed.

**Red:** write 10 tests: count of `ok`; `ok` passes; `new-unlinked` refused; `new-linked` passes; `bad-link` refused (missing path, missing npm script, short `No machine check:`); `stale`; `--base-file` growth; `--write-baseline` will not overwrite; missing rule file exits 2; the repository passes. `npx vitest run --project unit tests/tools/rule-lint.test.ts` shows `Tests  10 failed (10)`.

**Green:** same command: `Tests  10 passed (10)`. `npm run rule-lint -- --base main` ends with `rule-lint: ok (rule lines 13, without a check 8, new 0)` (counts at commit 32252ca; the baseline file holds the true ones).

**Stub check:** a script with only `process.exit(0)` fails `new-unlinked`, `bad-link`, `stale` and growth. One that counts every rule as unchecked fails `new-linked`.

**Ratchet:** `rule-lint --count`, `without a check`: no tool before, 8 after (the G16 first measure). It only falls.

## R3 - process-file-issues, review-due

**Files:** `scripts/process-file-issues.mjs`, `scripts/process-review-due.mjs`, `tests/tools/process-file-issues.test.ts`, `tests/tools/fixtures/process-review/*.json`. Needs F2 (`tests/support/fake-gh.mjs`; read its header to seed and read the world).

**Decision, fingerprint.** T4 owns `shared/domain/fingerprint.ts` (spec 2.11). R3 does not copy it. It reads `cluster.fingerprint` (12 hex, spec 2.12) as the key. R5 (the task that writes the review file) fills the field with T4's function, so R5 needs T4. A model must not compute the hash itself. A cluster with no valid fingerprint: exit 2, no write.

**Steps** (spec 2.12, G14):
1. `process-file-issues.mjs <file> [--dry-run]`. No file: usage, exit 2. gh is `LOOPS_GH_BIN` or `gh`; a `.mjs` runs with `node`. Check every cluster (`v`, `id`, `cause`, `events`, `repo`, fingerprint) before any write.
2. Per cluster with `events >= 2`: `gh issue list -R <repo> --state all --search '"<fp>" in:body' --json number,state`. None: `gh issue create -R <repo> --title "process-review: <cause>" --body-file <f>`, body `<!-- fingerprint:<fp> -->`, cause, events, `firstAt` to `lastAt`, check kind, name, replay. Open: `gh issue comment` (events, `lastAt`). Closed: `gh issue reopen`, then comment.
3. Print `{"created":[],"updated":[],"skipped":[]}` (fingerprints), exit 0.
4. `process-review-due.mjs [--now ISO] [--dir reports/process-review] [--event period_ended|epic_closed]` prints `{"due","reason","last"}`. Due: no `<date>.json`, or the newest is 7 or more days old, or `--event`. Unknown event: exit 2.

**Goal:** G14. A cluster of 2 or more events opens one issue with no owner message. A repeat opens no second issue.

**Red:** write 14 tests: usage; no fingerprint (no write); 3 events create one issue; 1 event none; 2 events one; two clusters two; repeat on open issue comments, no second; repeat on closed reopens; `--dry-run`; due with no report; 6 days; 7 days; `--event`; unknown event. `npx vitest run --project unit tests/tools/process-file-issues.test.ts` shows `Tests  14 failed (14)`.

**Green:** `Tests  14 passed (14)`.

**Stub check:** a script with only `process.exit(0)` fails the create, comment and reopen tests. One that always creates fails both repeat tests.

**Ratchet:** tests in the file, 0 to 14, up only. F0 `causes-found` (G14): D7, baseline only.
