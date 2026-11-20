# ADR 0006: access from the internet through a Cloudflare named tunnel and Cloudflare Access

- Status: proposed (2026-11-20). The owner reviews it in the docs pull request before any build task starts.
- Spec: [../specs/2026-10-21-remote-access.md](../specs/2026-10-21-remote-access.md), "Update 2026-11-20"
- Plan: [../plans/2026-10-21-remote-access.md](../plans/2026-10-21-remote-access.md), "Update 2026-11-20"
- Replaces: decisions D7 to D10 of the remote-access spec (the console runs `cloudflared` as a child process with
  `--tunnel-token`). Keeps: ADR 0005 (the home name, nginx, Let's Encrypt) without a change to its decisions.

## Context

Phase 3 ([ADR 0005](0005-local-name-through-dns-and-reverse-proxy.md)) gives the console an HTTPS name on the home
network. The sample name is `castra.example.com`. A public "DNS only" record points that name to `<pc-ip>`, the
private address of the PC. Outside the home, `<pc-ip>` is not reachable, so a phone on mobile data cannot open the
console.

Task R6 of phase 2 adds access from the internet through a Cloudflare named tunnel. The R6 design (2026-10-21) was
written before the owner had a Cloudflare account and a domain. It had these parts:

- The console starts `cloudflared` as a child process when it gets `--tunnel-token=<token>`.
- The token is in `.env` as `LOOPS_TUNNEL_TOKEN`.
- Cloudflare Access is out of scope (spec D14).

The owner now has a Cloudflare account and a domain on it (phase 3). This ADR records the design for that setup.

Terms used below:

- **Named tunnel:** a tunnel that has a fixed ID in the Cloudflare account. `cloudflared` on the PC makes outbound
  connections to Cloudflare, and Cloudflare sends the requests for a public host name through these connections.
  No port of the home router opens.
- **Tunnel token:** the secret that `cloudflared tunnel run` needs for a tunnel that the Cloudflare dashboard manages.
  A person who has the token can run a connector for the tunnel and receive its requests.
- **Cloudflare edge:** the Cloudflare servers that receive the requests from the internet for the public host name.
- **Cloudflare Access:** a Cloudflare Zero Trust product. It shows its own sign-in page before a request reaches the
  tunnel, and it lets only the people that its policy names through.
- **Access service token:** a client ID and a client secret that a program sends in the headers
  `CF-Access-Client-Id` and `CF-Access-Client-Secret`, so that it passes Access without a person.

## Decision

### 1. The tunnel uses a separate name

The tunnel uses a second name under the same domain. The sample name is `castra-remote.example.com`. The home name
`castra.example.com` does not change.

| | A separate name (chosen) | The same name |
|---|---|---|
| DNS | Two records. The home record stays "DNS only" to `<pc-ip>`. The tunnel record is a proxied CNAME to the tunnel. | One record can hold only one answer. Cloudflare does not keep a "DNS only" A record and a tunnel CNAME on the same name. |
| Home devices | They use nginx and `<pc-ip>`, as in phase 3. The traffic stays in the home. | The record must change to the tunnel. Then each home request goes out to Cloudflare and back. Two answers for one name need a DNS server in the home that gives a different answer (split DNS). The owner removed the DNS server from the PC (ADR 0005), and the router has no DNS page. |
| Phase 3 checks | `npm run local-name:check` stays at 10/10. | The check `dns-public` fails, because the public answer becomes a Cloudflare address. |
| Cloudflare Access | Access protects only the tunnel name. Home devices do not see the Access page. | Access protects every request, also at home. |
| What the person must know | Two addresses: one at home, one outside. | One address. |
| Sessions | The session cookie belongs to one name. A person signs in one time for each name. | One sign-in. |

The separate name costs a second address and a second sign-in. The same name costs the home path and the phase 3
checks, and it needs a DNS server that the owner removed. So the separate name wins.

The tunnel name has one label under the domain (`castra-remote.example.com`, not `remote.castra.example.com`).
Cloudflare's free edge certificate (Universal SSL) covers the domain and one level of names under it. This fact
comes from the Cloudflare documentation and is not verified on this account.

### 2. The tunnel ends at the console, not at nginx

The public host name of the tunnel sends each request to `http://127.0.0.1:7070`. nginx is not in this path.

- Through the tunnel, the console gets `CF-Connecting-IP` (the address of the device on the internet) and
  `X-Forwarded-Proto: https` from the Cloudflare edge. It gets no `X-Real-IP`.
- `clientKey` (`server/services/auth-service.ts`) reads `CF-Connecting-IP` first, and only from a loopback socket.
  The socket of `cloudflared` is loopback, so each device on the internet gets its own count of failed sign-ins.
- The session cookie gets `Secure`, because `X-Forwarded-Proto` is `https`.
- The Cloudflare edge sets `CF-Connecting-IP` itself and replaces a value that a device sends. This fact comes from
  the Cloudflare documentation. The headers that arrive at the console are not verified on this PC. The plan measures
  them in task R6d (spec G6, check `secure-cookie`).

The other option sends the tunnel to nginx on port 443. That option adds a hop and needs a second `server` block,
a TLS check of the origin name, and a rule for `CF-Connecting-IP` in nginx. It gives the console nothing more. nginx
holds the Let's Encrypt certificate for the home name, and the tunnel does not use that certificate, because the
Cloudflare edge holds the certificate of the tunnel name.

### 3. nginx deletes `CF-Connecting-IP` on the home path

This design found a defect in phase 3. Today nginx passes each request header to the console, and the nginx
configuration has no rule for `CF-Connecting-IP` (`deploy/local-name/nginx.conf`). The chain is:

1. A device on the Wi-Fi sends `CF-Connecting-IP: <any value>` to nginx.
2. nginx passes the header to the console on `127.0.0.1:7070`.
3. The console sees a loopback socket, so `clientKey` uses the header (`server/services/auth-service.ts:87-93`).
4. The device sends a new value with each attempt. As a result, the limit of 5 failed sign-ins in 15 minutes never
   stops it.

The fix: nginx sets `proxy_set_header CF-Connecting-IP "";`. An empty value makes nginx drop the header. This chain
comes from reading the code. It is not verified by a run. Task R6a proves it with a test first.

### 4. A SYSTEM Task Scheduler task runs `cloudflared`, not the console

`cloudflared` runs as the Task Scheduler task `Castraferrum cloudflared`. The task runs as SYSTEM at startup and
starts the program again after a failure. nginx and win-acme run the same way (ADR 0005).

Reasons against the console as the parent process (the old D9):

1. The old design kept the token in `.env` of the repository folder. Every loop agent runs as the owner's Windows user,
   with full permissions, in a worktree of this repository. Each agent can read `.env`, and each agent reads issue text
   and web pages that strangers write. A stolen token lets a stranger run a connector for the tunnel name and receive
   the owner's password.
2. The tunnel then stops each time the console restarts. A restart of the console is frequent during development.
3. Each start of the console then has a second job, and the code needs a port, an adapter, a fake `cloudflared` and
   a backoff. The SYSTEM task needs none of these.

The task reads the token from `C:\ProgramData\castraferrum\tunnel\token`. Only SYSTEM and the Administrators group
can read that folder. A loop agent runs without administrator rights, so it cannot read the token.

Reason against `cloudflared service install <token>`: that command writes the token into the command line of the
Windows service, in the registry. A normal user can read that registry value (not verified).

### 5. Cloudflare Access stands in front of the console

From R6 on, the console is reachable from the internet, and it runs agents with full permissions on the PC. The
console's own sign-in is one password and a limit of 5 failures in 15 minutes for each address. A person with many
addresses gets 5 attempts from each one.

So a Cloudflare Access application protects the tunnel name:

- Policy "owner": Allow, for the owner's email address only. The sign-in method is a one-time PIN that Cloudflare
  sends by email. The email address exists only in the Cloudflare account, never in the repository.
- Policy "check": Service Auth, for one Access service token. The agent's checks use it (spec G6).
- The public host name of the tunnel requires a valid Access token (the dashboard setting that makes `cloudflared`
  check the `Cf-Access-Jwt-Assertion` header). So `cloudflared` refuses a request that did not pass Access, also if
  the Access application is deleted by mistake.
- The console sign-in stays. A person passes two walls: Access first, then the console password.

Cost: the free Zero Trust plan covers up to 50 users. Third-party sources say that it needs no payment card. This is
not verified. If Cloudflare asks for a card, the owner decides, because a card is money.

### 6. The console refuses tunnel requests when sign-in is off

The console does not start the tunnel, so it cannot refuse to start without credentials (the old D8). Instead, when
the console has no credentials, it answers each request that carries `CF-Connecting-IP` or `Cf-Ray` with 403
`SIGN_IN_REQUIRED`. Every route gets this answer, the static bundle and `/api/health` included. A request through
the tunnel always carries both headers, because the Cloudflare edge adds them. A request from the PC or through nginx
carries neither, after fix 3.

### 7. How the agent checks "outside the home" on this PC

A phone on mobile data asks its DNS server for the tunnel name, gets a Cloudflare edge address, and connects to that
address. The agent does the same steps from the PC:

1. It asks `1.1.1.1` for the tunnel name and gets a Cloudflare edge address.
2. It connects to that address. The request leaves the home through the internet connection, arrives at the
   Cloudflare edge, and comes back through the tunnel to `cloudflared`.
3. The response proves the path: the certificate belongs to the Cloudflare edge, not to nginx (another issuer and
   another serial number), and the response has a `cf-ray` header.

The browser journey runs Chromium in a 390x844 touch context. It maps the home name to "not found", so the page
cannot use the home path. The real phone on mobile data is a follow-up outside the epic.

## Consequences

- The console code changes in one place: the guard of decision 6. The old R6 code list (the tunnel runner port, the
  adapter, `tests/support/fake-cloudflared.mjs`, the flags `--tunnel-token` and `--cloudflared`, the health field
  `tunnel`) is not built.
- A new check tool, `scripts/tunnel-check.mjs`, measures the tunnel on the real machine, the same way as
  `scripts/local-name-check.mjs` for the home name.
- The PC gets one more SYSTEM task, one more protected folder, and the program `cloudflared`.
- The owner signs in two times from outside (Access, then the console), and one time at home.
- The owner gets a public name that strangers can find (Certificate Transparency logs and DNS). Access stops them
  before any request reaches the PC.

## Alternatives considered

- **The same name for home and tunnel:** rejected. See decision 1.
- **The tunnel to nginx on port 443:** rejected. See decision 2.
- **The console runs `cloudflared` (the old D7 to D10):** rejected. See decision 4.
- **A Windows service made by `cloudflared service install`:** rejected. See decision 4.
- **A tunnel that a configuration file on the PC manages (`cloudflared tunnel login`, `config.yml`):** rejected. The
  login writes `cert.pem`, which can make and delete every tunnel of the account. The dashboard-managed tunnel needs
  only its own token.
- **No Cloudflare Access, the console password only:** rejected. See decision 5.
- **Access with a one-time PIN, without a service token:** rejected. Then no agent can run the checks of spec G6, and
  each check needs a person.
- **A port forward on the router:** rejected. It opens the PC to the whole internet, and it changes the router, which
  the owner does not change (ADR 0005).
- **Tailscale:** rejected before (ADR 0005): it needs an app on each device.
- **A check through an outside website that fetches the URL:** not chosen. It sends the tunnel name to a third party.
  The check of decision 7 proves the same path without one.
