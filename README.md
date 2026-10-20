# Castraferrum

A local web console that runs and watches many long-running coding-agent loops at once.
Every tick of a loop starts a **fresh** agent session; state is handed from one tick to the next
through the target repository itself, not through an ever-growing chat context.

> **Status: pre-import.** The source code still lives in its original repository and is being
> translated to English there. This repository currently holds only the extraction spec and plan:
>
> - Spec: [docs/specs/2026-10-20-extraction.md](docs/specs/2026-10-20-extraction.md)
> - Plan: [docs/plans/2026-10-20-extraction.md](docs/plans/2026-10-20-extraction.md)

The repository is private for now and is intended to become open source.
