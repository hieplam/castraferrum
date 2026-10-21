# CLAUDE.md - Castraferrum

Castraferrum is a local web console that runs many coding-agent loops, one fresh agent session per tick.
It was extracted from the owner's private game-server repository, where it was called "Loop Console";
the source was imported as one snapshot commit.

- Contributing guide (workflow, language rule, tests): [CONTRIBUTING.md](CONTRIBUTING.md)
- Architecture, use cases, API, decisions: [docs/](docs/) ([ARCHITECTURE.md](docs/ARCHITECTURE.md),
  [USE-CASES.md](docs/USE-CASES.md), [API.md](docs/API.md), [adr/](docs/adr/))
- Spec: [docs/specs/2026-10-20-extraction.md](docs/specs/2026-10-20-extraction.md)
- Plan: [docs/plans/2026-10-20-extraction.md](docs/plans/2026-10-20-extraction.md)
- Design system: [design/README.md](design/README.md); the UI uplift (epic #63):
  [spec](docs/specs/2026-10-21-ui-uplift.md), [plan](docs/plans/2026-10-21-ui-uplift.md)

## Language rule (non-negotiable)

**Everything that lands in this repository is English**: file contents, file and folder names, code comments,
test names, log and error messages, commit messages, branch names, PR and issue titles and bodies, review comments.
This holds even when the owner writes to you in Vietnamese. Chat replies to the owner may follow the owner's
language; the repository may not.

The single exception is the Vietnamese locale file `shared/i18n/vi.ts` (a translation is a feature).
Nothing else may contain Vietnamese text, including tests of that locale: they read their expected strings
from the locale file instead of repeating them.

Why: the repository is meant to be published, and no commit in its history may contain Vietnamese.
History cannot be cleaned after the fact without rewriting it, so the rule is enforced on every commit:
the hooks in `.githooks/` (installed by `npm ci` through the `prepare` script) run `node scripts/lang-scan.mjs --staged`
and `--message`, and CI scans the whole history and each pull request's title, body and branch name.

## Design system first (non-negotiable)

Every UI change, however small (a button, a label, a colour, a gap, a new row), starts from the design system and
stays inside it:

- Read the system before you change the UI. The new system lives in `design/ds/` (`SYSTEM.md` first, then
  `tokens.css` and `components.css`). Until the cut-over of the UI uplift (epic #63, task U25) the classic UI follows
  the classic system in `design/` (start at `design/README.md`).
- Use the existing tokens and components. Never write a colour, size, spacing or radius value, never add a class the
  system does not define, never use a native `title` tooltip. From task U0 of epic #63 on, `npm run ratchets` (in
  `verify` and CI) fails when you do.
- If the system has no component, state or rule for what the change needs, do not invent one inline and do not let
  it slip: open an issue labelled `design-system` (template "Design system gap") naming the gap and the feature that
  needs it. Then either extend the system first (drawn in the design-system page and the preview, approved by the
  owner in `design/APPROVED.md`) or block the feature on that issue.
- Every pull request that touches `web/` or `design/` says in its body which components it used, or which
  `design-system` issue it opened (the pull request template asks).

Why: the classic UI drifted (native tooltips, hover-only actions, dark tokens with no value) because small changes
skipped the system. The owner made this rule on 2026-10-21.

## Workflow

- Every change goes through a branch and a pull request; never commit directly to `main`.
- Branch names: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
- Open the PR with `gh pr create`, then merge it yourself with `gh pr merge --squash --delete-branch`.
  The owner reviews after the fact unless they ask to review a specific PR first.
- Use a separate git worktree per task (`git worktree add ../castraferrum-<topic> -b <branch>`),
  and remove the worktree and the branch once the PR is merged.

## Definition of done

Every task in a plan carries its own Verify block (Goal, Red, Green, Stub check) and a ratchet number
measured before and after with a committed tool. A task is done only when its Green command has been run
and its output matches what the plan says.
