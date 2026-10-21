# Spec: username and password sign-in, Cloudflare Tunnel (phase 2)

- Date: 2026-10-21
- Status: approved by the owner in conversation; owner reviews this document after merge
- Plan: [../plans/2026-10-21-remote-access.md](../plans/2026-10-21-remote-access.md)
- Previous phase: [2026-10-21-lan-access.md](2026-10-21-lan-access.md) (`--host`, the flag parser, phone layout).
  This phase starts only after phase 1 is accepted.

## 1. Context

After phase 1 the console can listen on the local network (`--host`), has a command-line flag parser
(`server/config.ts`, precedence argument, then `npm_config_<name>`, then `LOOPS_<NAME>`), and has a phone layout.
Nobody signs in: anyone who reaches the port can create loops and run agents with full permissions.

This phase adds two features:

1. **Sign-in with a username and password**, turned on by `npm start -- --username=<u> --password=<p>`
   (or `npm start --username=<u> --password=<p>`, or `LOOPS_USERNAME` / `LOOPS_PASSWORD` in `.env`). With
   credentials set, every screen and every API route needs a signed-in session. Without credentials the console
   behaves exactly as before.
2. **Cloudflare Tunnel**, turned on by `--tunnel-token=<token>`: the console starts `cloudflared` as a child
   process, so the console is reachable at the public HTTPS host name configured for that tunnel in the
   Cloudflare dashboard. The console watches the tunnel and stops it on shutdown. A tunnel without credentials is
   refused.

Facts this design depends on, checked on 2026-10-21:

- Cloudflare quick tunnels (`cloudflared tunnel --url`, a random `trycloudflare.com` name, no account) do not
  support Server-Sent Events and cap in-flight requests at 200
  ([Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)).
  The UI depends on SSE (`/api/events`, log and transcript streams). A named tunnel, which needs a Cloudflare
  account and a domain on it, has neither limit.
- `cloudflared tunnel run` reads the token from the `TUNNEL_TOKEN` environment variable, and
  `--metrics <addr>` exposes `GET /ready` (200 once at least one connection to Cloudflare is registered).
- npm 11 passes `npm start --username=x` to the script as `npm_config_username` and warns that this form will
  stop working in the next major version of npm (measured with npm 11.17.0). The `--` form passes the flag as a
  real argument.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Credential flags:** `--username` and `--password` (environment `LOOPS_USERNAME`, `LOOPS_PASSWORD`), through the phase 1 parser and precedence. Both or neither; a password shorter than 8 characters, or only one of the two, stops startup with exit code 2 and a message naming the problem. One user only. | The owner asked for `npm start --username=xxx --password=yyy`. Half a configuration must not start an open console. |
| D2 | **The README recommends `.env` for the password** (`LOOPS_PASSWORD=...`; `.env` is gitignored) and shows the flag forms as well. Startup never prints the password, and `--help` says that a command line is visible to other processes and to shell history. | A password on a command line can be read from the process list and from shell history. |
| D3 | **Sessions are cookies, not HTTP Basic.** `POST /api/auth/login` sets `castra_session=<random 32 bytes, base64url>` with `HttpOnly`, `SameSite=Lax`, `Path=/` and `Max-Age` of 30 days, plus `Secure` when the request arrived over HTTPS (`X-Forwarded-Proto: https`, which `cloudflared` sets). Sessions live in memory: sign-out or a server restart ends them. | Basic auth has no sign-out and shows a bare browser prompt on a phone. `EventSource` cannot send headers, but it sends same-origin cookies. In-memory sessions need no table and no secret on disk. |
| D4 | **Credentials stay in memory**, compared in constant time (`timingSafeEqual` over SHA-256 digests of the given and the configured value). | No password file, no timing leak. |
| D5 | **What needs a session:** every `/api/*` route except `GET /api/health`, `GET /api/auth/session` and `POST /api/auth/login`. Without a session they answer 401 `UNAUTHENTICATED`; SSE routes answer 401 before opening the stream. The static UI bundle stays public because it contains no data, and the app asks `GET /api/auth/session` and shows the sign-in screen. The test-only routes (`/api/__test/*`) are not protected; they exist only in test mode. | One rule that is easy to test over the whole API table. The e2e server and the database lamp poll `/api/health`. |
| D6 | **Login attempts are limited:** 5 failed attempts per client within 15 minutes; then `POST /api/auth/login` answers 429 `TOO_MANY_ATTEMPTS` with `Retry-After` until the window passes. A success clears the client's count. The client is the socket address, except when the socket address is loopback and `CF-Connecting-IP` is present (`cloudflared` runs on the same machine): then it is that header. Time comes from the `Clock` port, so tests wind it. | Through a tunnel the login is on the internet. Trusting the header only from loopback stops a LAN client from forging its address. |
| D7 | **Tunnel flags:** `--tunnel-token=<token>` (`LOOPS_TUNNEL_TOKEN`), `--cloudflared=<path>` (`LOOPS_CLOUDFLARED`, default `cloudflared` on `PATH`; a path ending in `.mjs` runs with the current Node binary, which is how tests plug in a fake), `--public-url=<https URL>` (`LOOPS_PUBLIC_URL`, only printed and used by the real-tunnel test). | The token comes from the Cloudflare dashboard; the host name is configured there, not in the console. |
| D8 | **A tunnel requires credentials.** `--tunnel-token` without `--username` and `--password` stops startup with exit code 2: `a tunnel needs --username and --password`. | A tunnel without sign-in would put an agent runner on the internet. |
| D9 | **Running `cloudflared`:** `cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:<free port> run`, with the token in the child's `TUNNEL_TOKEN` environment, never in its arguments, and never logged. Its output is forwarded to the console log with the prefix `[cloudflared] `, with the token redacted. State: `connecting` until `GET /ready` answers 200, then `connected`; `down` when the process exits. On an unexpected exit, restart after 1, 2, 4, 8, 16, then every 30 seconds. On shutdown, stop it (graceful, then kill after 5 seconds) before the database closes. If the binary cannot start (`ENOENT`), startup stops with exit code 1 and names the install command (`winget install --id Cloudflare.cloudflared`). | Token in argv would show in the process list. `/ready` is the tunnel's own readiness signal and is sturdier than parsing log text. |
| D10 | **`GET /api/health` gains `tunnel`:** `off`, `connecting`, `connected` or `down`. It carries no other new data. | Gives the real-tunnel test and the startup log one oracle. It stays public (D5). |
| D11 | **Named tunnels only; quick tunnels are not supported.** | Quick tunnels drop SSE (section 1), so live updates would never arrive. |
| D12 | **The phase 1 warning changes:** listening beyond loopback without credentials prints the D4 warning of phase 1 plus `Set --username and --password to require sign-in.`. With credentials it prints `Sign-in: on (user <username>)`. | The warning now points at the fix. |
| D13 | **Sign-in screen first as an approved preview**, desktop (1440x900) and phone (390x844), light and dark, English and Vietnamese. All text goes through `shared/i18n/en.ts` and `vi.ts`. | Same rule as every UI change (`design/APPROVED.md`). |
| D14 | **Out of scope:** several users, roles, password reset, persistent sessions across restarts, Cloudflare Access policies, quick tunnels, HTTPS without a tunnel. | Keep it small; one owner, one machine. |

## 3. Goals

| # | Goal (outcome) | Oracle | Why a stub fails |
|---|---|---|---|
| G1 | Credentials are set the way the owner asked, and wrong setups stop loudly: `npm start -- --username=u --password=p`, `npm start --username=u --password=p` and `.env` all turn sign-in on; only one of them, or a short password, exits 2 with a clear message; with neither, nothing changes. | Unit tests of `loadConfig` for each source, the precedence, and each invalid input. A process test asserts the exit codes, the messages, that `Sign-in: on (user u)` is printed, and that the password does not appear anywhere in stdout or stderr. The whole existing suite stays green without credentials. | No parsing: the unit tests fail. A server that prints the password fails the output check. |
| G2 | With sign-in on, nothing is reachable without signing in except the sign-in screen, the static bundle and the D5 public routes. | An API test reads every route row of `docs/API.md` (the parser of `tests/api/api-surface.test.ts`), calls each without a cookie and expects 401 `UNAUTHENTICATED`, SSE included. The public routes are the exact D5 list. With a valid cookie the same calls give their normal status. | Without the guard every route answers 200 or 4xx data errors, not 401. |
| G3 | The owner signs in with the right username and password and stays signed in for up to 30 days, until sign-out or restart. A wrong username or password shows an error. After 5 failures in 15 minutes further attempts are refused until the window passes. | API tests with a wound clock: a good login gives 204 with a `castra_session` cookie carrying the D3 attributes; a wrong one gives 401 `INVALID_CREDENTIALS`; the sixth failure gives 429 `TOO_MANY_ATTEMPTS` with `Retry-After`; winding past 15 minutes allows a login; winding past 30 days expires the session; logout ends it; `CF-Connecting-IP` counts only from loopback. e2e `@UC-35` covers the same flow in the browser. | A guard that accepts any cookie fails the expiry and logout cases. No limiter means the sixth attempt still answers 401. |
| G4 | The sign-in screen and the sign-out control match the approved sign-in preview on desktop and phone, in light and dark, in English and Vietnamese. | `tests/visual/signin.visual.ts` compares every `signin-*` state with its approved shot under `MAX_RATIO`. | Without the screen there is nothing to compare, and the diffs fail. |
| G5 | With `--tunnel-token` the console runs the tunnel itself: it starts `cloudflared`, reports `connecting` then `connected`, restarts it when it dies, stops it on shutdown, and refuses to start without credentials. Through the tunnel a phone signs in, starts a loop and sees it update live. | Unit tests of the tunnel adapter with a fake `cloudflared` (`tests/support/fake-cloudflared.mjs`): token only in `TUNNEL_TOKEN`, the state sequence, restart with backoff on a wound clock, stop on shutdown, the `ENOENT` message. e2e `@UC-36`: a real `server/main.ts` with credentials and `--cloudflared=<fake>`, where the fake runs a reverse proxy on a free port and adds `X-Forwarded-Proto: https` and `CF-Connecting-IP`. A 390x844 touch context opens the proxy URL, is sent to sign-in, signs in, starts a loop, and sees its state and a live log line arrive within 2 seconds over SSE. Health reports `tunnel: connected`. After a graceful shutdown the fake has exited. | Without the adapter nothing listens on the proxy port and health has no `tunnel`. A tunnel that ignores the credential rule fails the exit-2 test. |
| G6 | Through a real named Cloudflare tunnel, the console works from a phone on mobile data, live updates included. | `tests/e2e/tunnel-real.spec.ts`, run only with `LC_REAL_TUNNEL=1` and `LOOPS_PUBLIC_URL`, `LOOPS_USERNAME`, `LOOPS_PASSWORD` in `.env`, against the owner's running console. Read-only checks: health over the public URL says `tunnel: connected`; `/api/loops` without a cookie gives 401; sign-in gives a `Secure` cookie; `/api/events` delivers `:ok` and then a `:ping` within 20 seconds, which proves the stream is not buffered. Then the owner's sign-off from a real phone. | Without a working tunnel the public URL does not answer. A buffered stream never delivers the ping. |
| G7 | The owner accepts the result. | The owner follows the README "Reach it from outside" section, runs the real-tunnel test, uses the console from a phone on mobile data, and signs off on the acceptance issue. | Only the owner's own comment counts. |

## 4. The flag set after this phase

| Flag | Environment | Default | Meaning |
|---|---|---|---|
| `--host`, `--port`, `--help` | as in phase 1 | | |
| `--username=<name>` | `LOOPS_USERNAME` | none | Turns sign-in on (needs `--password`) |
| `--password=<secret>` | `LOOPS_PASSWORD` | none | At least 8 characters; prefer `.env` |
| `--tunnel-token=<token>` | `LOOPS_TUNNEL_TOKEN` | none | Starts a named Cloudflare tunnel (needs credentials) |
| `--cloudflared=<path>` | `LOOPS_CLOUDFLARED` | `cloudflared` | The binary; `.mjs` runs with Node (tests) |
| `--public-url=<url>` | `LOOPS_PUBLIC_URL` | none | The tunnel's public address, printed at startup |

## 5. API added

| Method | Path | Description | Error codes |
|---|---|---|---|
| GET | `/auth/session` | `{ required, signedIn, username? }`; public | - |
| POST | `/auth/login` | `{ username, password }`, answers 204 and sets the session cookie | `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, `AUTH_NOT_CONFIGURED` |
| POST | `/auth/logout` | ends the session, answers 204 and clears the cookie | `AUTH_NOT_CONFIGURED` |

Every protected route can also answer `UNAUTHENTICATED` (401). `AUTH_NOT_CONFIGURED` (404) is the answer of the
login and logout routes when no credentials are set. `GET /health` gains `tunnel`.

## 6. Use cases added

| ID | Use case | Observable result |
|---|---|---|
| UC-35 | **Sign in and sign out** - credentials set at startup | Every screen first shows the sign-in screen; wrong credentials show an error; the sixth failure in 15 minutes is refused; after signing in the console works and live updates arrive; Sign out returns to the sign-in screen; without credentials no sign-in exists |
| UC-36 | **Reach the console through a Cloudflare tunnel** - `--tunnel-token` | The console starts and watches `cloudflared`; through the tunnel a phone signs in, starts a loop and sees live updates within 2 seconds; without credentials startup is refused; on shutdown the tunnel stops |

`npm run verify` raises `uc-coverage --min` from 34 to 36 over the phase.
