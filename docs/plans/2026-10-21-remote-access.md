# Plan: username and password sign-in, Cloudflare Tunnel (phase 2)

- Date: 2026-10-21
- Spec: [../specs/2026-10-21-remote-access.md](../specs/2026-10-21-remote-access.md) (goals G1 to G7, decisions D1 to D14)
- Evidence log: `docs/plans/2026-10-21-remote-access-evidence.md` (created by R1; every task appends a section
  headed `## R<k>` with its before and after numbers: commands and literal output only)

## How to read this plan

The rules of the phase 1 plan apply unchanged ([2026-10-21-lan-access.md](2026-10-21-lan-access.md), "How to read
this plan"): one task, one pull request that carries the code, the tests and the evidence section, with
`Closes #<task issue>` and a `## Verify` section; tasks run in order; tests first, Red kept, Green run and
matched; counts never decrease; `npm run verify` exits 0 at the end of every task; the running console on
`127.0.0.1:7070` is off limits; no `docker compose up` from a worktree, never `docker compose down -v`.

Baseline for this phase: the counts of the last phase 1 evidence section (L5 or a later follow-up), re-measured
by R1 on `main`.

Layering ([docs/ARCHITECTURE.md](../ARCHITECTURE.md)): the session store and the tunnel runner are ports with
adapters; `AuthService` is a service (interface in `contracts.ts`, `DefaultAuthService` class) and imports no Node
module. Crypto (random tokens, digest compare) goes through a port. Changing a layer rule follows CONTRIBUTING
(table, `.dependency-cruiser.cjs`, a violating file in `tests/arch-fixtures/`).

## Task overview

| Task | What | Goals |
|---|---|---|
| R1 | Baseline; flags `--username`, `--password` | G1 |
| R2 | Sign-in on the server: auth routes, session cookie, 401 everywhere, login limit | G2, G3 |
| R3 | Sign-in screen preview (desktop and phone) | G4 |
| R4 | Owner approval of the sign-in preview | G4, G7 |
| R5 | Sign-in screen and sign-out in the app; UC-35 | G3, G4 |
| R6 | Cloudflare Tunnel: `--tunnel-token`, the `cloudflared` runner, UC-36, the real-tunnel test | G5, G6 |
| R7 | Owner acceptance through a real tunnel from a phone on mobile data | G6, G7 |

---

## R1 - Baseline; flags `--username`, `--password`

**Files:** `docs/plans/2026-10-21-remote-access-evidence.md` (new, section `## R1` with the `main` SHA and the
counts), `server/config.ts` (`Config.auth?: { username, password }`, validation, `USAGE` lines including the
command-line visibility note), `server/config.test.ts`, `server/main.ts` (startup lines of spec D12), the process
test file from L1, `README.md` (Configuration: the two flags, `.env` recommended), `.env.example`
(commented `LOOPS_USERNAME=` and `LOOPS_PASSWORD=` lines).

**Verify**
- **Goal:** G1.
- **Red:** first run `npm run verify` on `main` and record the counts (the ratchet baseline). Then write the tests.
  `npx vitest run --project unit server/config.test.ts` fails: `loadConfig({}, ['--username=u', '--password=password1']).auth`
  is `undefined`.
- **Green:** (1) the unit command passes, with at least these cases: both flags; the space form; `npm_config_username`
  plus `npm_config_password`; `LOOPS_USERNAME` plus `LOOPS_PASSWORD`; the precedence order; only `--username` throws
  `--password is missing`; only `--password` throws `--username is missing`; a 7-character password throws
  `the password needs at least 8 characters`; neither gives `auth` undefined. (2) The process test: a server started
  with `--username=u --password=password1` prints `Sign-in: on (user u)`, and the string `password1` appears in
  none of its output lines; `--username=u` alone exits 2 with `--password is missing`. (3) `npm run verify`
  exits 0 with counts at least the baseline.
- **Stub check:** a config that ignores the flags fails every case. A main that logs the whole config fails the
  "password not in output" check.
- **Ratchet:** unit and api counts above the R1 baseline.

## R2 - Sign-in on the server

**Files:** `server/ports/session-store.ts`, `server/ports/secrets.ts` (random token, constant-time compare),
`server/adapters/memory/session-store.ts`, `server/adapters/crypto/` (Node `crypto` implementation), 
`server/services/auth-service.ts` with `auth-service.test.ts` (in-memory store, wound clock),
`server/services/contracts.ts` (`AuthService`), `server/http/auth-routes.ts`, `server/http/app.ts` (an `onRequest`
guard that applies spec D5), `server/http/errors.ts` (`UNAUTHENTICATED` 401, `INVALID_CREDENTIALS` 401,
`TOO_MANY_ATTEMPTS` 429, `AUTH_NOT_CONFIGURED` 404), `shared/contracts/auth.ts`, `server/compose.ts`
(`auth` option), `tests/api/auth-api.test.ts`, `docs/API.md` (the three rows of spec section 5, the new codes,
a sentence on the guard), `docs/ARCHITECTURE.md` (the guard, the ports, the cookie).

The guard checks the cookie against `AuthService.session(token)`. It skips the D5 public routes and every route
when auth is not configured. Responses that set or clear the cookie follow D3 exactly. Login timing: compare both
username and password digests every time (no early return on a wrong username).

**Verify**
- **Goal:** G2, G3.
- **Red:** write the tests first. `npx vitest run --project unit server/services/auth-service.test.ts` fails on
  the missing module. `npx vitest run --project api tests/api/auth-api.test.ts` fails: `GET /api/loops` without a
  cookie answers 200 on a server composed with credentials.
- **Green:** (1) the unit command passes: login success and failure, the limit (5 failures, then
  `tooManyAttempts` with seconds left, cleared by a success, reset after 15 wound minutes), expiry after 30 wound
  days, logout, client key from `CF-Connecting-IP` only for a loopback socket. (2) The api command passes:
  every route row of `docs/API.md` without a cookie gives 401 `UNAUTHENTICATED` (SSE rows included, checked on a
  real listen with `fetch`), except the exact D5 public list. With the cookie, `GET /api/loops` gives 200 and
  `/api/events` opens with `:ok`. The cookie attributes match D3, and `Secure` is present only with
  `X-Forwarded-Proto: https`. A composition without credentials answers `/api/loops` 200 and `/api/auth/login`
  404 `AUTH_NOT_CONFIGURED`. (3) `tests/api/api-surface.test.ts` passes with the new rows and codes. (4)
  `npm run verify` exits 0 and `npm run arch` prints `dependency-cruiser: 0 violations`.
- **Stub check:** a guard that only checks that a cookie is present fails the expiry and logout cases. A
  guard missing on SSE fails the stream rows. No limiter fails the sixth-attempt case. A new code without a test
  fails `api-surface`.
- **Ratchet:** unit and api counts above R1; API rows and error codes up by the section 5 additions.

## R3 - Sign-in screen preview

**Update 2026-10-21:** this task waits for the cut-over of epic #63 (ui-uplift U25) and follows its design system.
Draw the states in `design/ds/preview/` (rows in `design/ds/STATES.md`, the `phone-*` form for the phone states) with
the components of `design/ds/components.css` and the rules of `design/ds/SYSTEM.md`. Read the paths below with that
change. A component the system lacks becomes a `design-system` issue first (CLAUDE.md, "Design system first").

**Files:** `design/preview/states.js`, `preview.js`, `design/STATES.md` (rows and D-UI decisions),
`design/components.css` (a sign-in block reading only existing tokens), `shared/i18n/en.ts` and `vi.ts` (the
sign-in texts: title, username, password, Sign in, wrong credentials, too many attempts with the wait, Sign out,
signed in as), `design/preview/shots/signin-*.png`, `design/README.md`.

States, light and dark: `signin` (desktop), `signin-error` (wrong credentials), `signin-locked` (too many
attempts, wait shown), `signin-phone` and `signin-error-phone` (`vp: [390, 844]`), `signin-topbar` (the list with
the signed-in user and the Sign out control, desktop), `signin-topbar-phone`, `vi-signin` (Vietnamese).

**Verify**
- **Goal:** G4 needs an approved reference.
- **Red:** `npm run design:states` prints `states with shots: N/N` on `main` (record N). After adding the rows and
  before shooting, it exits 1 naming the missing `signin-*` shots.
- **Green:** (1) `npm run design:states` exits 0 with N + 8 or more. (2) `git diff --stat main -- design/preview/shots`
  lists only added `signin-*` and `vi-signin*` files. (3) The `shared/i18n` key-set test passes (every new key in
  `en` and `vi`, none empty). (4) `npm run verify` exits 0. (5) The PR body embeds or links every new light
  shot and lists the D-UI decisions.
- **Stub check:** rows without shots fail `design:states`. A key only in `en` fails the i18n test. A CSS leak
  into existing screens turns their visual tests red.
- **Ratchet:** preview states N to N + 8 or more.

## R4 - Owner approval of the sign-in preview

**Who:** the owner. The issue carries `loop:needs-human`.

Same procedure as L4: the owner looks at every `signin-*` state in `design/preview/index.html`, answers on the
issue, and on approval an entry goes into `design/APPROVED.md` with the owner's words.

**Verify**
- **Goal:** G4 (the reference is ratified), G7.
- **Red:** not applicable. Approval is a human judgement.
- **Green:** `design/APPROVED.md` on `main` has a sign-in preview entry quoting the owner, and the owner closed
  this issue.
- **Stub check:** only the owner's own words count.

## R5 - Sign-in screen and sign-out in the app; UC-35

**Update 2026-10-21:** build the screen with the kit of the new UI (`web/ui/kit/`), and compare it in
`tests/visual/ds/` against `design/ds/preview/shots/` (epic #63).

**Files:** `web/api/` (`LoopsApi` gains `session()`, `login()`, `logout()`; a 401 `UNAUTHENTICATED` from any call
raises a typed error), `web/data/` (a session query; on that error, or on an SSE failure followed by
`signedIn: false`, go to `/signin?next=<path>`), `web/pages/` and `web/features/` (the sign-in screen), `web/app/TopBar.tsx`
(user and Sign out when `required`), `web/api/fake-loops-api.ts`, unit tests for the new pure logic,
`tests/visual/signin.visual.ts`, `tests/e2e/signin.spec.ts` (a `ServerProcess` launched with credentials),
`docs/USE-CASES.md` (UC-35), `package.json` (`--min 35`).

**Verify**
- **Goal:** G3 (in the browser), G4.
- **Red:** write the tests first. `npm run build` then `npx playwright test --project chromium tests/e2e/signin.spec.ts`
  fails: opening `/` on a server with credentials shows the list's error state, not the sign-in form.
  `npx playwright test --project visual tests/visual/signin.visual.ts` fails: no sign-in screen to compare.
- **Green:** (1) the e2e command passes. The `@UC-35` test on desktop and on 390x844 touch: opening `/loops/new`
  shows the sign-in screen; a wrong password shows the `en.ts` error text; the right one returns to `/loops/new`;
  a live update arrives within 2 seconds; Sign out returns to sign-in, and `GET /api/loops` from the page then
  answers 401; six wrong attempts show the too-many-attempts text. A second test on the shared e2e server (no
  credentials) shows no sign-in screen and no Sign out. (2) The visual command passes for every `signin-*` state,
  light and dark, under `MAX_RATIO`. (3) `npm run verify` exits 0, and `uc-coverage` prints
  `UCs with a green e2e: 35/35`. (4) `npm run phone:check -- --max 0` still passes.
- **Stub check:** no redirect on 401 leaves the list error state on screen. A Sign out that only clears client state
  leaves `/api/loops` at 200. Missing CSS fails the visual diffs.
- **Ratchet:** `uc-coverage` 34/34 to 35/35; e2e and visual counts above R2.

## R6 - Cloudflare Tunnel

**Files:** `server/config.ts` (`--tunnel-token`, `--cloudflared`, `--public-url`, the D8 rule), `server/ports/tunnel.ts`
(`TunnelRunner`: `start()`, `stop()`, `state()`), `server/adapters/tunnel/cloudflared-runner.ts` with unit tests,
`server/services/health-service.ts` (reads the tunnel state), `shared/contracts/health.ts` (`tunnel`),
`server/compose.ts` and `server/main.ts` (start after `listen`, stop first on shutdown; secure cookies and the client key
already come from R2), `tests/support/fake-cloudflared.mjs` (spec G5: honours `--metrics`, serves `/ready`,
reads `TUNNEL_TOKEN`, exits 1 with `Unauthorized: Invalid tunnel secret` for the token `bad`, otherwise runs a
streaming reverse proxy from `FAKE_TUNNEL_PORT` to `FAKE_TUNNEL_ORIGIN` that adds `X-Forwarded-Proto: https` and
`CF-Connecting-IP: 203.0.113.7`; it prints `INF Registered tunnel connection` once ready), `tests/e2e/tunnel.spec.ts`,
`tests/e2e/tunnel-real.spec.ts` (spec G6; skipped with a printed reason unless `LC_REAL_TUNNEL=1`),
`docs/USE-CASES.md` (UC-36), `package.json` (`--min 36`), `docs/API.md` (health), `docs/ARCHITECTURE.md`,
`README.md` (section "Reach it from outside": install `cloudflared` with
`winget install --id Cloudflare.cloudflared`; in the Cloudflare dashboard create a named tunnel and a public host
name pointing at `http://localhost:7070`; put `LOOPS_TUNNEL_TOKEN`, `LOOPS_USERNAME`, `LOOPS_PASSWORD` and
`LOOPS_PUBLIC_URL` in `.env`; `npm start`; why quick tunnels are not supported; how to run the real-tunnel test).

The e2e uses `http://localhost:<proxy port>` (not `127.0.0.1`) as the tunnel address, because Chromium treats
`localhost` as a secure context and stores the `Secure` cookie there. If that does not hold, the fake serves HTTPS
with a self-signed certificate and the test sets `ignoreHTTPSErrors`; record which one was needed in the evidence.

**Verify**
- **Goal:** G5, and the test for G6.
- **Red:** write the tests first. `npx vitest run --project unit server/adapters/tunnel` fails on the missing
  module. `npm run build` then `npx playwright test --project chromium tests/e2e/tunnel.spec.ts` fails: nothing
  answers on the proxy port, and `/api/health` has no `tunnel` field.
- **Green:** (1) the unit command passes: token present in the child's `TUNNEL_TOKEN` and absent from its
  arguments and from every forwarded log line; states `connecting` then `connected` (fake `/ready`); exit leads
  to `down`, then restarts at 1, 2 and 4 wound seconds; `stop()` ends the child within 5 seconds; `ENOENT` gives
  the `winget install --id Cloudflare.cloudflared` message. (2) Config unit cases: `--tunnel-token` without
  credentials throws `a tunnel needs --username and --password`; the `.mjs` rule for `--cloudflared`. (3) The e2e
  command passes. The `@UC-36` test in a 390x844 touch context through the proxy is sent to sign-in, signs in,
  starts a loop, and sees Running and a live log line within 2 seconds. Health through the proxy says
  `tunnel: connected`. After `shutdown()` the fake's process has exited. A second test: startup with the token but
  no credentials exits 2 with the D8 message. A third: the token `bad` makes startup report the tunnel `down` and
  print `[cloudflared] ` with the fake's error line. (4) `npx playwright test --project chromium tests/e2e/tunnel-real.spec.ts`
  without `LC_REAL_TUNNEL` reports 1 skipped with the reason. (5) `npm run verify` exits 0, and `uc-coverage`
  prints `UCs with a green e2e: 36/36`.
- **Stub check:** a runner that never spawns leaves the proxy port closed. Passing the token as an argument fails
  the argv check. No restart logic fails the backoff case. A guard skipped on the proxied path fails the "sent to
  sign-in" step.
- **Ratchet:** `uc-coverage` 35/35 to 36/36; unit and e2e counts above R5.

## R7 - Owner acceptance through a real tunnel

**Who:** the owner. The issue carries `loop:needs-human`.

The owner pulls `main`, runs `npm run build`, and follows the README "Reach it from outside" section word for
word: installs `cloudflared`, creates the named tunnel and the public host name, and fills `.env`. Then:
`npm start`; `LC_REAL_TUNNEL=1 npx playwright test --project chromium tests/e2e/tunnel-real.spec.ts` must print
`1 passed`. On a phone with Wi-Fi off (mobile data), the owner opens the public URL, signs in, starts and stops a
loop, watches the live log, and signs out.

**Verify**
- **Goal:** G6, G7.
- **Red:** not applicable. Acceptance is a human judgement. Before the tunnel is set up, the public URL does not
  answer.
- **Green:** the real-tunnel test prints `1 passed` (the owner pastes the line on the issue), and the owner closes
  the issue with a sign-off comment. Rejections become follow-up sub-issues of phase 2.
- **Stub check:** only the owner's own comment counts; the real-tunnel test cannot pass without a working tunnel.
