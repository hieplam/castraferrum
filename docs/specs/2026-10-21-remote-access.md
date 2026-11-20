# Spec: username and password sign-in, Cloudflare Tunnel (phase 2)

- Date: 2026-10-21
- Status: approved by the owner in conversation; owner reviews this document after merge
- Plan: [../plans/2026-10-21-remote-access.md](../plans/2026-10-21-remote-access.md)
- Previous phase: [2026-10-21-lan-access.md](2026-10-21-lan-access.md) (`--host`, the flag parser, phone layout).
  This phase starts only after phase 1 is accepted.
- **Update 2026-11-20 (tasks R6 and R7, proposed for the owner's review):** see the section "Update 2026-11-20: a named
  tunnel on the owner's domain" at the end of this file. It replaces D7 to D10 and goals G5 to G7, changes D8 and D14,
  and adds D15 to D21 and goals G8 to G11. Decision record: [ADR 0006](../adr/0006-internet-access-through-a-named-tunnel.md).

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

## Update 2026-11-20: a named tunnel on the owner's domain

Status: proposed. The owner reviews it in the docs pull request before any build task starts.

Tasks R1 to R5 are merged, and phase 3 ([2026-11-19-local-name.md](2026-11-19-local-name.md)) is closed. The owner
now has a Cloudflare account and a domain on it. The home name (sample `castra.example.com`) is a "DNS only" record to
`<pc-ip>`, and nginx serves it with a Let's Encrypt certificate. The console listens on `127.0.0.1:7070`.

This update writes R6 and R7 again for that setup. [ADR 0006](../adr/0006-internet-access-through-a-named-tunnel.md)
gives the reasons and the alternatives. In short:

- The tunnel uses a separate name, sample `castra-remote.example.com`. The home name does not change.
- The tunnel ends at `http://127.0.0.1:7070`, not at nginx.
- A SYSTEM Task Scheduler task runs `cloudflared`. The console does not run it.
- Cloudflare Access stands in front of the tunnel name. The console sign-in stays.
- The tunnel token is in a folder that only SYSTEM and Administrators can read.

### The order of one request from outside

```text
Phone (mobile data)    Cloudflare edge           cloudflared (PC, SYSTEM)     Castraferrum (127.0.0.1:7070)
  | -- castra-remote.example.com? (any DNS) -> answer: a Cloudflare address
  | -- TLS, edge certificate --> |
  |                              | Access: no CF_Authorization cookie
  | <-- 302 to the Access page --|
  | -- email + one-time PIN ---> |
  | <-- CF_Authorization cookie -|
  | -- GET / ------------------> |
  |                              | -- through the tunnel connection -> |
  |                              |    Cf-Access-Jwt-Assertion           | checks the Access token (D17)
  |                              |                                      | -- GET / --------------------------> |
  |                              |                                      |    CF-Connecting-IP: <phone ip>      |
  |                              |                                      |    X-Forwarded-Proto: https          |
  |                              |                                      | <-- sign-in page, then Secure cookie |
  | <------------------------------------------------------------- page |
```

The home path of phase 3 stays as it is: the device asks Cloudflare DNS, gets `<pc-ip>`, and connects to nginx.

### Facts this update depends on

Each fact comes from the Cloudflare documentation unless marked "measured". None is verified on this PC yet. Task
R6d records each one in the evidence log.

- A dashboard-managed tunnel needs only its token to run. A person who has the token can run the tunnel
  ([tunnel tokens](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens)).
- The public host name of a tunnel can require a valid Access token: `cloudflared` then checks the
  `Cf-Access-Jwt-Assertion` header and refuses a request without one
  ([origin parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cloudflared-parameters/origin-parameters/)).
- `cloudflared tunnel run` accepts `--token-file <path>`. Only a third-party reading of the source code says this. The
  official run parameters page shows only `--token`. R6d runs `cloudflared tunnel run --help` first. If the flag is
  missing, the task runs a wrapper (D18).
- The free Zero Trust plan covers up to 50 users. Third-party sources say that it needs no payment card.
- Universal SSL (the free edge certificate) covers the domain and one level of names under it.
- The Cloudflare edge adds `CF-Connecting-IP` and `Cf-Ray` to each request to the origin, and replaces a
  `CF-Connecting-IP` that a device sends.
- Measured (phase 3, 2026-11-20): a normal user cannot read a Task Scheduler task that runs as SYSTEM
  (`schtasks /query` gives `ERROR: Access is denied.`).
- Measured (2026-11-20): `cloudflared` is not installed on the PC (`where cloudflared` finds no file).

### Decisions changed by this update

| # | Decision | Why |
|---|---|---|
| D7 (replaced) | **No tunnel flags in the console.** `--tunnel-token` and `--cloudflared` are not built. `--public-url` stays as phase 3 made it: the home address. Each machine sets `TUNNEL_NAME` (the tunnel name, without `https://`) in `.env`. Only the check tool and the real-tunnel test read it. | The console does not run the tunnel (D9). |
| D8 (replaced) | **With sign-in off, the console refuses tunnel requests.** When no credentials are set, every request that carries `CF-Connecting-IP` or `Cf-Ray` gets 403 `SIGN_IN_REQUIRED`, on every route, the static bundle and `/api/health` included. With credentials set, nothing changes. | The console cannot refuse to start, because it does not start the tunnel. A request through the tunnel always carries both headers (Facts). A request from the PC or through nginx carries neither (D21). |
| D9 (replaced) | **A SYSTEM Task Scheduler task runs `cloudflared`.** The task `Castraferrum cloudflared` runs as SYSTEM at startup, starts the program again 1 minute after a failure, and has no time limit. It runs `cloudflared.exe tunnel --no-autoupdate --metrics 127.0.0.1:20241 run --token-file C:\ProgramData\castraferrum\tunnel\token`. | Every loop agent can read `.env`, and a stolen token gives a stranger the tunnel name and the owner's password. The tunnel then also runs when the console restarts. nginx and win-acme run the same way (ADR 0005). ADR 0006, decision 4. |
| D10 (replaced) | **`GET /api/health` gets no `tunnel` field.** The check tool reads `GET http://127.0.0.1:20241/ready` of `cloudflared`. | The console does not own the tunnel. |
| D11 | Unchanged: named tunnels only. | |
| D14 (changed) | Cloudflare Access is now in scope (D17). The other items stay out of scope. | The console becomes reachable from the internet. |
| D15 | **The tunnel uses a separate name with one label under the domain.** Sample: `castra-remote.example.com`. The dashboard makes its proxied CNAME when the owner adds the public host name. The home record does not change. | Two answers for one name need split DNS, and the owner removed the DNS server from the PC. The phase 3 checks stay at 10/10. Universal SSL covers one level. ADR 0006, decision 1. |
| D16 | **The tunnel ends at the console.** The public host name has the service `http://127.0.0.1:7070`. The console gets `CF-Connecting-IP` and `X-Forwarded-Proto: https`, and no `X-Real-IP`. `clientKey` already reads `CF-Connecting-IP` first, from a loopback socket only. | One hop fewer. nginx adds nothing for the tunnel. ADR 0006, decision 2. |
| D17 | **Cloudflare Access protects the tunnel name.** One self-hosted application for the tunnel name, with two policies: "owner" (Allow, the owner's email address, one-time PIN by email, session 24 hours) and "check" (Service Auth, one service token named `castraferrum check`). The public host name requires a valid Access token. The console sign-in stays. | The password and the limit for each address are the only wall today. Access stops a stranger at the Cloudflare edge. The service token lets the agent run the G6 checks without a person. ADR 0006, decision 5. |
| D18 | **Secrets, typed by the owner only.** (A) The tunnel token: the owner copies it in the dashboard. An administrator script, `deploy/tunnel/setup-tunnel.ps1`, reads it from the clipboard, writes it to `C:\ProgramData\castraferrum\tunnel\token`, sets the folder ACL to SYSTEM and Administrators only (no inheritance), empties the clipboard, and logs only the length of the token. (B) If `--token-file` does not exist, the script also writes `run-tunnel.cmd` in the same folder, which sets `TUNNEL_TOKEN` from the file and starts `cloudflared`, and the task runs that file. (C) The Access service token: a normal-user script, `deploy/tunnel/set-access-token.ps1`, reads the client ID and then the client secret from the clipboard into the main `.env` as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. No secret enters a chat, the repository, a log or an issue. To change the tunnel token, the owner refreshes it in the dashboard and runs (A) again. | The phase 3 rule: read a secret from the clipboard, never from `Read-Host`. The service token passes Access only, and the console password stays a second wall. `.env` already holds `LOOPS_PASSWORD` at the same level of protection. |
| D19 | **Install:** `winget install --id Cloudflare.cloudflared`, machine scope. `--no-autoupdate`, because a program that SYSTEM runs must not change itself. The owner updates it with `winget upgrade`. | A known version, as for nginx and win-acme. |
| D20 | **No firewall rule and no router change.** `cloudflared` makes outbound connections only. | Nothing on the PC listens for the internet. |
| D21 | **nginx deletes `CF-Connecting-IP` on the home path:** `proxy_set_header CF-Connecting-IP "";` in `deploy/local-name/nginx.conf`. | Today a device on the Wi-Fi can send that header through nginx. The console sees a loopback socket, trusts the header, and counts each new value as a new client. As a result, the limit of 5 failures never stops that device. Found while writing this update, from `server/services/auth-service.ts:87-93` and `deploy/local-name/nginx.conf`. Not verified by a run. ADR 0006, decision 3. |

### Goals changed by this update

G1 to G4 stay as they are (R1 to R5 are merged). G5 to G7 are replaced. G8 to G11 are new.

| # | Goal (outcome) | Oracle | Why a stub fails |
|---|---|---|---|
| G5 (replaced) | Behind a tunnel, the console asks for sign-in, gives a `Secure` cookie, counts failed sign-ins for each device, and shows live updates on a phone. With sign-in off, the console refuses every request through a tunnel. | e2e `@UC-41` (`tests/e2e/tunnel.spec.ts`): a real `server/main.ts` on `127.0.0.1`, behind `tests/support/fake-reverse-proxy.mjs` in a tunnel mode that adds `CF-Connecting-IP` (from `x-test-client`), `Cf-Ray` and `X-Forwarded-Proto: https`. A 390x844 touch context: device A fails 5 times and gets 429; device B signs in, gets a `Secure` cookie, starts a loop and sees Running and a live log line in 2 seconds. An api test: a server without credentials answers 403 `SIGN_IN_REQUIRED` to `GET /`, `GET /api/health` and `GET /api/loops` with `Cf-Ray`, and 200 without it. | Without the D8 guard, the requests without sign-in get 200. Without the tunnel mode, device B shares the count of device A. |
| G6 (replaced) | From outside the home, a stranger gets only the Access page, and the owner's phone passes Access, signs in, starts a loop and sees live updates. | `npm run tunnel:check` (`scripts/tunnel-check.mjs`), checks `edge-path`, `access-wall`, `access-pass`, `sign-in-wall`, `secure-cookie` and `sse` (list in plan task R6c). Also `tests/e2e/tunnel-real.spec.ts` (only with `LC_REAL_TUNNEL=1`): Chromium in a 390x844 touch context, certificate errors not ignored, the home name mapped to "not found", the Access service token in the headers. It opens `https://<tunnel name>`, signs in, starts the loop "tunnel acceptance", sees Running in 2 seconds and a live log line, then stops and archives the loop. A second test without the service token sees a page on `*.cloudflareaccess.com`. | Without a tunnel the name does not answer. Without Access, `access-wall` gets the console's JSON. Through the home path, `edge-path` sees the nginx certificate. |
| G7 (replaced) | The agent accepts the result as the owner does, on `main`, from the main checkout. | Task R7: `npm run goal:check -- goals/tunnel.json` prints `goals passed: 7/7`, from the main checkout and from the lane worktree. The agent reads each screenshot of the real-tunnel test. `E check --dry-run` passes for R6a to R6d. | A manifest row that always exits 0 is not allowed. Each row runs an oracle of this table. |
| G8 | On the home path, a device cannot pick its own client address. | `tests/tools/nginx-config.test.ts` finds `proxy_set_header CF-Connecting-IP "";`. An api test through `fake-reverse-proxy.mjs` (nginx mode, which now deletes the header as D21 says): 6 failed sign-ins with 6 different `CF-Connecting-IP` values from one device give 429 on the sixth. On the machine, the check `nginx-test` of `local-name-check.mjs` also finds the line in the deployed file. | Without the line, the test does not find it, and the sixth attempt gets 401. |
| G9 | The tunnel runs without the console and without a person. | Checks `connector` (`/ready` on `127.0.0.1:20241` answers 200 with at least 1 connection) and `runner` (a `cloudflared` process exists, and its parent process is not `node.exe`). Task R6d, one time: an administrator script stops the `cloudflared` process, and in 2 minutes `connector` passes again. | Without the task, `/ready` does not answer. A `cloudflared` that the console starts has `node.exe` as its parent. |
| G10 | Only SYSTEM and Administrators can read the tunnel token. | Check `token-guarded`: as the normal user, opening the token file fails with `EPERM` or `EACCES` (not `ENOENT`); the command line of the `cloudflared` process is empty for the normal user or holds no token; `.env` holds no value that starts with `eyJhIjoi` (the start of a tunnel token); `git grep` finds no such value in the tracked files. | A token in `.env` or in a file that the user can read fails the check. |
| G11 | The home path of phase 3 keeps working. | `npm run local-name:check` prints `local name: 10/10 checks pass`, and check `dns-home` of the tunnel tool: `1.1.1.1` still answers the home name with `<pc-ip>`. | The same name for both (ADR 0006, decision 1) fails `dns-public` and `dns-home`. |

### Ratchets

- `tunnel: <passed>/11 checks pass` (new tool, `npm run tunnel:check`). Before R6c the tool does not exist. After
  R6c, on the PC before the setup, it prints its baseline (expected 1/11: only `dns-home`). After R6d: 11/11.
- `local name: 10/10 checks pass` stays at 10/10.
- `uc-coverage`: UC-41 (reserved by phase 3 for the tunnel) gets a green e2e, so the count goes up by one, and the
  verify floor `--min` goes from 40 to 41.
- `goals passed: <n>/7` for `goals/tunnel.json` (goals G5 to G11): 0/7 at R6c, 7/7 at R7.

### Out of scope of this update

The real phone on mobile data (a follow-up outside the epic, as in phase 3), more than one Access user, an identity
provider other than the one-time PIN, a tunnel for other apps of the domain, and Cloudflare WAF rules.
