# ADR 0002: ports and adapters with machine-checked layering

- Status: accepted

## Context

The code talks to Postgres, the Claude Agent SDK, the filesystem, the clock and the network. Tests must be fast
and deterministic (a fake clock, no real Claude), and the real database and real Claude must still be covered.
Layering rules that live only in a document drift.

## Decision

Services contain the use cases and depend only on interfaces (ports) in `server/ports/` and on pure domain
code. Adapters in `server/adapters/` implement the ports; `server/compose.ts` is the only place that wires them
together, and API tests call the same `composeServer` so there is no second wiring.

The dependency table in [ARCHITECTURE.md](../ARCHITECTURE.md) is enforced by `npm run arch`
(dependency-cruiser, mostly allow-lists, plus a text scan for "only `web/api/` touches the network").
`tests/arch-fixtures/` holds one deliberately violating file per rule, so the check fails when a rule stops
working, not only when code breaks it.

Two test doubles are kept honest by construction:

- the in-memory repositories enforce the same named constraints as Postgres, and one contract suite runs on both;
- every executor passes one executor contract suite, so replacing a fake with the real SDK cannot change what
  `RunService` sees.

## Consequences

- The Agent SDK is imported in exactly one adapter folder; a new library needs an allow-list entry on purpose.
- Services cannot import Node modules such as `node:fs`; they go through a port (directory probe, folder
  browser, transcript source).
- Adding a rule costs a table row, a config entry and a violating fixture file; that is the price of a rule that
  cannot rot.
