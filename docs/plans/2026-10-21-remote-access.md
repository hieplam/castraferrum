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

**Update 2026-11-20:** R6 and R7 are replaced by R6a, R6b, R6c, R6d and a new R7. See the last section of this file.

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

**Update 2026-11-19 (R5):** `docs/USE-CASES.md` had already given UC-35 to the gate (later epics added UC-35 to UC-39),
so sign-in is **UC-40** there and in the e2e tag (`@UC-40`), and `uc-coverage` goes from 39/39 to 40/40 (the verify floor
`--min` from 38 to 39). The visual test is `tests/visual/ds/signin.visual.ts`, run with
`npx playwright test --project=visual tests/visual/ds/signin.visual.ts`. The evidence log (section R5) records why.

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

**Update 2026-11-20:** this section and the R7 section below are replaced by the section "Update 2026-11-20: R6 and R7
for a named tunnel on the owner's domain" at the end of this file. They stay here as the record of the first design.

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

---

## Update 2026-11-20: R6 and R7 for a named tunnel on the owner's domain

Status: proposed. The owner reviews it in the docs pull request before any build task starts.

Spec: the section "Update 2026-11-20" of [the remote-access spec](../specs/2026-10-21-remote-access.md) (decisions
D7 to D10 and D14 to D21, goals G5 to G11). Decision record:
[ADR 0006](../adr/0006-internet-access-through-a-named-tunnel.md).

Rules for these tasks, from phase 3:

- The repository, its issues and its pull requests show only the sample names `castra.example.com` and
  `castra-remote.example.com`, and `<pc-ip>` for the address of the PC.
- An administrator step on the PC is one script, started through `Start-Process -Verb RunAs`, with a log file. A
  secret comes from the clipboard, never from `Read-Host`. The owner clicks one prompt. The agent never sees a secret.
- A program that runs as SYSTEM needs SYSTEM for its signals (`nginx -s reload` works only as SYSTEM).
- Repository files have LF line endings. Never write them with PowerShell `Set-Content`. Before each commit, run
  `git ls-files --eol | grep -E "^i/(crlf|mixed)"`, and expect no output.
- Run each goal manifest from the main checkout too, because a lane worktree hides the effects of `.env`.
- Lanes follow `.worktrees/.lanes/PARALLEL-RULES.md` (own test database, own e2e port, one heavy run at a time).

The evidence log stays `docs/plans/2026-10-21-remote-access-evidence.md`. Each task adds a section `## R6a` (and so
on) with its before and after numbers.

### Task overview

| Task | What | Goals | Waits for | Model |
|---|---|---|---|---|
| R6a | nginx deletes `CF-Connecting-IP` on the home path (D21) | G8 | - | Sonnet |
| R6b | The console refuses tunnel requests when sign-in is off (D8); the tunnel mode of the fake proxy; UC-41 | G5 | - | Sonnet |
| R6c | The check tool `scripts/tunnel-check.mjs`, the real-tunnel test, the deploy scripts, the README section, `goals/tunnel.json` | G6, G9, G10, G11 (the oracles) | - | Opus |
| R6d | **Machine setup on the owner's PC** (needs a person: the Cloudflare login, the Zero Trust sign-up, the tokens, the administrator prompt) | G6, G8 to G11 | R6a, R6c | Opus |
| R7 | Verify every goal and do the agent acceptance | G5 to G11 | R6b, R6d | Opus |

R6a, R6b and R6c touch different files and can run at the same time. Only R6d carries `loop:needs-human`. R7 loses
`loop:needs-human`: it is the agent acceptance, as N4 was in phase 3. The owner's use of a real phone on mobile data
is a follow-up outside the epic, and no goal waits for it.

### R6a - nginx deletes `CF-Connecting-IP` on the home path

**Files:** `deploy/local-name/nginx.conf` (the line `proxy_set_header CF-Connecting-IP "";` next to `X-Real-IP`, with
a comment that gives the reason), `tests/tools/nginx-config.test.ts` (the new directive),
`tests/support/fake-reverse-proxy.mjs` (nginx mode deletes `cf-connecting-ip`, as nginx now does),
`tests/api/auth-api.test.ts` or a new api test (6 failures with 6 values), `scripts/local-name-check.mjs` (check
`nginx-test` also finds the line in the deployed file; the count of checks stays 10), its unit test,
`docs/plans/2026-10-21-remote-access-evidence.md` (section `## R6a`).

**Verify**
- **Goal:** G8.
- **Red:** write the tests first. `npx vitest run --project unit tests/tools/nginx-config.test.ts` fails: the file
  has no `CF-Connecting-IP` directive. The api test fails: through the fake proxy, the sixth failed sign-in with a new
  `CF-Connecting-IP` value answers 401, not 429.
- **Green:** (1) the unit command passes. (2) The api test passes: the sixth attempt answers 429
  `TOO_MANY_ATTEMPTS`. (3) The unit test of `local-name-check.mjs` passes: a deployed file without the line gives
  `FAIL nginx-test` with a reason that names `CF-Connecting-IP`. (4) `npm run verify` exits 0.
- **Stub check:** a configuration without the line fails (1). A fake proxy that keeps the header fails (2).
- **Ratchet:** unit and api counts above the main baseline.

The deployed copy on the PC changes in R6d, step 3, because the reload needs SYSTEM.

### R6b - The console refuses tunnel requests when sign-in is off; UC-41

**Files:** `server/http/app.ts` (an `onRequest` hook before the auth guard: no credentials and a `cf-connecting-ip` or
`cf-ray` header give 403 `SIGN_IN_REQUIRED`), `server/http/errors.ts` (`SIGN_IN_REQUIRED` 403),
`docs/API.md` (the code and one sentence on the rule), `tests/api/tunnel-guard.test.ts`,
`tests/support/fake-reverse-proxy.mjs` (a `mode: 'tunnel'` option: it sets `CF-Connecting-IP` from `x-test-client`,
adds `Cf-Ray: test-<n>` and `X-Forwarded-Proto: https`, and sets no `X-Real-IP`), `tests/e2e/tunnel.spec.ts`
(`@UC-41`), `docs/USE-CASES.md` (UC-41: "Reach the console through a tunnel"), `package.json` (`uc-coverage --min 41`),
`docs/ARCHITECTURE.md` (the hook), the evidence section `## R6b`.

If R6a is merged first, rebase and keep both changes to `fake-reverse-proxy.mjs`.

**Verify**
- **Goal:** G5.
- **Red:** write the tests first. `npx vitest run --project api tests/api/tunnel-guard.test.ts` fails: a server
  without credentials answers 200 to `GET /api/health` with `Cf-Ray: x`. `npm run build` then
  `npx playwright test --project chromium tests/e2e/tunnel.spec.ts` fails: the fake proxy has no tunnel mode.
- **Green:** (1) the api command passes: without credentials, `GET /`, `GET /api/health` and `GET /api/loops` answer
  403 `SIGN_IN_REQUIRED` with `Cf-Ray`, and also with `CF-Connecting-IP` only; without either header they answer 200;
  with credentials, the same requests with `Cf-Ray` answer as before (200, 200, 401). (2) The e2e command passes:
  in a 390x844 touch context through the tunnel mode, device A fails 5 times and sees the too-many-attempts text;
  device B signs in, gets a `castra_session` cookie with `Secure`, starts a loop, and sees Running and a live log line
  in 2 seconds. (3) `tests/api/api-surface.test.ts` passes with the new code. (4) `npm run verify` exits 0, and
  `uc-coverage` prints one more UC with a green e2e than on `main`.
- **Stub check:** without the hook, (1) gets 200. A hook that checks only `CF-Connecting-IP` fails the `Cf-Ray`
  case. Without the tunnel mode, device B shares the count of device A and sees 429.
- **Ratchet:** `uc-coverage` up by one; api and e2e counts above the main baseline.

### R6c - The check tool, the real-tunnel test, the deploy scripts, the README

**Files:**
- `scripts/tunnel-check.mjs` and `package.json` (`"tunnel:check": "node scripts/tunnel-check.mjs"`). It reads
  `TUNNEL_NAME`, `LOCAL_NAME`, `LOOPS_USERNAME`, `LOOPS_PASSWORD`, `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`
  from the main `.env`. It prints one line per check (`PASS <id>` or `FAIL <id>: <reason>`), then
  `tunnel: <passed>/11 checks pass`, and exits 0 only when all pass. It never prints a secret, and a unit test proves
  it. It runs as the normal user.
- `scripts/cloudflare-ips.json`: a copy of the Cloudflare address ranges (IPv4 and IPv6) with the date of the copy.
- Unit tests `tests/tools/tunnel-check.test.ts`, with fake DNS, fake HTTP and a fake process list.
- `tests/e2e/tunnel-real.spec.ts` (spec G6; skipped with a printed reason unless `LC_REAL_TUNNEL=1`).
- `goals/tunnel.json` (goals G5 to G11, each with its command and expected output) and the line
  `Goal manifest: goals/tunnel.json` in the phase 2 issue body (#55).
- `deploy/tunnel/setup-tunnel.ps1` (administrator: the token file from the clipboard, the folder ACL, the task
  `Castraferrum cloudflared`, a log file in `%TEMP%`; spec D9 and D18 (A) and (B)),
  `deploy/tunnel/set-access-token.ps1` (normal user: D18 (C)), `deploy/tunnel/README.md`.
- `README.md`: the section "Reach it from outside" is written again for D15 to D20: install `cloudflared`; in the
  Cloudflare dashboard, make the tunnel, the public host name with the service `http://127.0.0.1:7070` and "require a
  valid Access token", the Access application and its two policies, and the service token; run the two scripts; set
  `TUNNEL_NAME` in `.env`; run `npm run tunnel:check`. The section names every place in the dashboard as "not
  verified" until R6d confirms it.
- The evidence section `## R6c`.

The checks, in this order:

| Check | What it proves | How |
|---|---|---|
| `dns-tunnel` | The tunnel name is public and points to Cloudflare | `1.1.1.1` answers the tunnel name. Every address is in `cloudflare-ips.json`, and none is private. |
| `dns-home` | The home name did not change (G11) | `1.1.1.1` answers the home name with the address of the PC (the same rule as `dns-public` of `local-name-check.mjs`). |
| `connector` | `cloudflared` is connected (G9) | `GET http://127.0.0.1:20241/ready` answers 200 with `readyConnections` of 1 or more. |
| `runner` | The tunnel runs without the console (G9) | A `cloudflared` process exists (`Get-CimInstance Win32_Process`), and its parent process is not `node.exe`. |
| `token-guarded` | Only SYSTEM and Administrators read the token (G10) | Opening `C:\ProgramData\castraferrum\tunnel\token` fails with `EPERM` or `EACCES`. The `CommandLine` of `cloudflared` is empty or has no `eyJhIjoi`. `.env` and `git grep` of the tracked files have no `eyJhIjoi`. |
| `edge-path` | A request takes the path of a phone on mobile data (G6) | TLS to an address from `dns-tunnel`, with the tunnel name as SNI, verified against Node's default roots. The certificate is not the certificate that nginx serves for the home name (another serial number). The response has a `cf-ray` header. |
| `access-wall` | A stranger gets only Access (G6) | `GET https://<tunnel name>/api/health` without Access headers answers 302 or 403, a `Location` (if any) on `*.cloudflareaccess.com`, and the body is not the console's health JSON. |
| `access-pass` | The service token passes Access (G6) | The same request with `CF-Access-Client-Id` and `CF-Access-Client-Secret` answers 200 with the console's health JSON. |
| `sign-in-wall` | Behind Access, the console still asks for sign-in (G6) | With the Access headers, `GET /api/loops` answers 401 `UNAUTHENTICATED`. |
| `secure-cookie` | The console sees HTTPS through the tunnel (G6, D16) | With the Access headers, `POST /api/auth/login` with `LOOPS_USERNAME` and `LOOPS_PASSWORD` answers 204 with a `castra_session` cookie that has `Secure`. Then `POST /api/auth/logout`. |
| `sse` | Live updates pass the tunnel and Access (G6) | With the Access headers and the session cookie, `GET /api/events` delivers `:ok` and then `:ping` in 20 seconds. |

**Verify**
- **Goal:** the oracles of G6, G9, G10 and G11 exist and fail on a PC without a tunnel.
- **Red:** before the tool exists, `npm run tunnel:check` fails with `Missing script: "tunnel:check"`. Write the unit
  tests first: `npx vitest run --project unit tests/tools/tunnel-check.test.ts` fails on the missing module.
- **Green:** (1) the unit command passes, with one passing and one failing case for each of the 11 checks, and a case
  that proves that no output line holds the value of `LOOPS_PASSWORD`, `CF_ACCESS_CLIENT_SECRET` or a token. (2) On
  the PC, from the main checkout, after the merge: `npm run tunnel:check` prints 11 lines, ends with
  `tunnel: 1/11 checks pass` (only `dns-home`), and exits 1. Record the output in the evidence. (3)
  `npx playwright test --project chromium tests/e2e/tunnel-real.spec.ts` without `LC_REAL_TUNNEL` reports 2 skipped
  with the reason. (4) `npm run goal:check -- goals/tunnel.json` prints a result below 7/7 and names the failing goals.
  (5) `npm run verify` exits 0.
- **Stub check:** a check that always passes fails its failing unit case. Before the setup, the real PC gives 1/11,
  not 11/11.
- **Ratchet:** `tunnel: 1/11` is the baseline that R6d moves to 11/11.

### R6d - Machine setup on the owner's PC

**Who:** an agent and the owner. The issue carries `loop:needs-human`, because these steps need what only the owner
has: the Cloudflare login, the Zero Trust sign-up, the tunnel token, the service token and the administrator prompt.
The agent prepares each step, runs each administrator step as one script through `Start-Process -Verb RunAs` with a
log file, and never sees a secret.

**Files:** `docs/plans/2026-10-21-remote-access-evidence.md` (section `## R6d`), and a fix to the README or to
`deploy/tunnel/` for each step that differs from R6c. No other code.

**Steps,** in the order of the README section of R6c:
1. Red: `npm run tunnel:check` prints `tunnel: 1/11 checks pass`. `npm run local-name:check` prints 10/10.
2. The agent installs `cloudflared` (`winget install --id Cloudflare.cloudflared`), records its version and the
   output of `cloudflared tunnel run --help`. If `--token-file` is missing, the script uses the D18 (B) wrapper.
3. The administrator script deploys the nginx configuration of R6a and reloads nginx as SYSTEM. Then
   `npm run local-name:check` prints 10/10.
4. The owner signs up for Zero Trust (free plan). If Cloudflare asks for a payment card, the owner decides, and the
   task records the answer.
5. The owner makes the tunnel in the dashboard and its public host name: the tunnel name, the service
   `http://127.0.0.1:7070`.
6. The owner makes the Access application for the tunnel name with the policies "owner" and "check", makes the
   service token, and turns on "require a valid Access token" for the public host name.
7. The owner copies the tunnel token. The agent starts `setup-tunnel.ps1`, and the owner clicks the prompt. The log
   shows the length of the token, the ACL of the folder and the task.
8. The owner copies the client ID and then the client secret. The agent runs `set-access-token.ps1`. The agent sets
   `TUNNEL_NAME` in the main `.env`.
9. `npm run tunnel:check` runs to 11/11.
10. Goal G9, one time: an administrator script stops the `cloudflared` process and writes the task state into its log.
    In 2 minutes, `npm run tunnel:check` prints `PASS connector` again.
11. The evidence records each fact of the spec update ("Facts") as measured or as different. A fact that is different
    becomes a fix issue that blocks R7.

**Verify**
- **Goal:** G6 and G8 to G11 on the real machine.
- **Red:** step 1.
- **Green:** (1) `npm run tunnel:check` prints 11 `PASS` lines and `tunnel: 11/11 checks pass`, and exits 0. (2)
  `npm run local-name:check` prints `local name: 10/10 checks pass`. (3) After step 10, `PASS connector` and
  `PASS runner` again, with a new process ID in the `runner` line.
- **Stub check:** each check talks to the real program, the real DNS and the real Cloudflare edge. A step that is not
  done leaves its check at `FAIL`.
- **Ratchet:** `tunnel: 1/11` to 11/11; `local name` stays at 10/10.

### R7 - Verify every goal and do the agent acceptance

**Who:** an agent. The label `loop:needs-human` is removed when this task is written again.

**Files:** `goals/tunnel.json` (fixes only, if R6d found a difference), the evidence section `## R7`, screenshots
of the real-tunnel test attached to the pull request (they show the sample name only if the page shows no real name;
otherwise they stay out of the pull request, and the evidence says so).

The agent does what the owner does, from the PC:
- `npm run goal:check -- goals/tunnel.json`, from the main checkout and from the lane worktree;
- `LC_REAL_TUNNEL=1 npx playwright test --project chromium tests/e2e/tunnel-real.spec.ts`, and it opens and reads
  each screenshot: the Access page without the service token; the sign-in screen, the loop at Running and the live log
  line with it;
- `E check --dry-run` on R6a, R6b, R6c and R6d.

**Verify**
- **Goal:** G5 to G11 hold together on `main` and on the real machine (G7).
- **Red:** not applicable as a new failure: the R6c run of `goal:check` (below 7/7) is the before number.
- **Green:** (1) `npm run goal:check -- goals/tunnel.json` prints `goals passed: 7/7` from both folders. (2) The real
  test reports `2 passed`. (3) `E check --dry-run` gives PASS for R6a to R6d. (4) `npm run local-name:check` prints
  10/10.
- **Stub check:** each manifest row runs an oracle of the spec update. A failing row becomes a fix issue that blocks
  this task.
- **Ratchet:** goals passed from the R6c number to 7/7.

### Follow-up outside the epic

- The owner opens the tunnel name on a real phone with Wi-Fi off, passes Access with the email PIN, signs in, and uses
  a loop. No goal waits for it.
