# CLAUDE.md - Castraferrum

Castraferrum is a local web console that runs many coding-agent loops, one fresh agent session per tick.
It is being extracted from the owner's private game-server repository, where it was called "Loop Console".
Until the import task of the plan lands, this repository holds only documents.

- Spec: [docs/specs/2026-10-20-extraction.md](docs/specs/2026-10-20-extraction.md)
- Plan: [docs/plans/2026-10-20-extraction.md](docs/plans/2026-10-20-extraction.md)

## Language rule (non-negotiable)

**Everything that lands in this repository is English**: file contents, file and folder names, code comments,
test names, log and error messages, commit messages, branch names, PR and issue titles and bodies, review comments.
This holds even when the owner writes to you in Vietnamese. Chat replies to the owner may follow the owner's
language; the repository may not.

The single exception is the Vietnamese locale file `shared/i18n/vi.ts` (a translation is a feature).
Nothing else may contain Vietnamese text, including tests of that locale: they read their expected strings
from the locale file instead of repeating them.

Why: the repository is meant to be published, and no commit in its history may contain Vietnamese.
History cannot be cleaned after the fact without rewriting it, so the rule is enforced on every commit.

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
