# ADR 0006: the console name through a Cloudflare named tunnel that Castraferrum starts

- Status: proposed (2026-11-20). The owner chose the direction on 2026-11-20 (the same name, one start flag) and
  reviews this document in the docs pull request before any build task starts.
- Spec: [../specs/2026-10-21-remote-access.md](../specs/2026-10-21-remote-access.md), "Update 2026-11-20"
- Plan: [../plans/2026-10-21-remote-access.md](../plans/2026-10-21-remote-access.md), "Update 2026-11-20"
- Changes: [ADR 0005](0005-local-name-through-dns-and-reverse-proxy.md). The console name stops pointing to the PC, so
  nginx, win-acme and the DNS setting of each device have no job any more.

## Context

Phase 3 (ADR 0005) gives the console an HTTPS name on the home network. The sample name is `castra.example.com`. A
public "DNS only" record points that name to `<pc-ip>`, the private address of the PC. nginx on the PC serves the name
with a Let's Encrypt certificate, and win-acme renews it. Outside the home, `<pc-ip>` is not reachable, so a phone on
mobile data cannot open the console.

Task R6 of phase 2 adds access from the internet through a Cloudflare named tunnel. The owner wants two things:

1. The same name as today, from anywhere.
2. A simple start: the tunnel runs when the owner starts Castraferrum with one flag, and stops when Castraferrum
   stops. Nothing starts by itself at boot.

Terms used below:

- **Named tunnel:** a tunnel that has a fixed ID in the Cloudflare account. `cloudflared` on the PC makes outbound
  connections to Cloudflare, and Cloudflare sends the requests for a public host name through these connections.
  No port of the home router opens.
- **Tunnel token:** the secret that `cloudflared tunnel run` needs for a tunnel that the Cloudflare dashboard manages.
  A person who has the token can run a connector for the tunnel and receive its requests.
- **Cloudflare edge:** the Cloudflare servers that receive the requests for the name from the internet. They hold the
  certificate of the name.
- **Child process:** a program that Castraferrum starts, and that runs only while Castraferrum runs.

## Decision

### 1. The tunnel uses the console name itself

The record `castra.example.com` changes from "DNS only" to the tunnel. The owner deletes the A record, and the
Cloudflare dashboard makes a proxied record for the tunnel when the owner adds the public host name.

| | The same name (chosen) | A separate name |
|---|---|---|
| What the person must know | One address, at home and outside | Two addresses |
| DNS | One proxied record to the tunnel | The home record stays, plus a second record |
| Device DNS setting (ADR 0005, spec D14) | Not needed. Any DNS server gives a public Cloudflare address, and the router keeps it. | Still needed for the home name |
| Home path | Gone. Each home request goes out to Cloudflare and back. | Stays in the home |
| Internet down | The console does not open, also at home. `http://127.0.0.1:7070` still works on the PC. | The home name still works |
| nginx, win-acme, the Cloudflare API token, the firewall rule for 80 and 443 | No job | Still needed |
| Phase 3 checks | `dns-public` and the nginx checks fail, so they retire | Stay at 10/10 |

One name cannot hold the "DNS only" A record and the tunnel record together. Two answers for one name need a DNS
server in the home, and the owner removed the DNS server from the PC (ADR 0005). The owner prefers one address and no
device setting, and accepts the costs in the table (2026-11-20).

### 2. The tunnel ends at the console

The public host name of the tunnel sends each request to `http://127.0.0.1:7070`. Through the tunnel, the console gets
`CF-Connecting-IP` (the address of the device on the internet) and `X-Forwarded-Proto: https`. It gets no
`X-Real-IP`. These two facts come from the Cloudflare documentation and are not verified on this PC.

- `clientKey` (`server/services/auth-service.ts`) reads `CF-Connecting-IP` first, and only from a loopback socket.
  The socket of `cloudflared` is loopback, so each device on the internet gets its own count of failed sign-ins.
- The session cookie gets `Secure`, because `X-Forwarded-Proto` is `https`.

### 3. Castraferrum runs `cloudflared` as a child process

`npm start -- --cloudflare=<tunnel token>` (or `LOOPS_CLOUDFLARE` in `.env`) makes Castraferrum start `cloudflared`
after it listens, watch it, start it again when it stops by itself, and stop it on shutdown. This is the design of
2026-10-21 (spec D7 to D10) with a shorter flag name. The flag name is the owner's choice.

- The token goes to `cloudflared` in its `TUNNEL_TOKEN` variable, never in its command line, and Castraferrum never
  writes it to a log.
- `--cloudflare` without `--username` and `--password` stops startup with exit code 2. A tunnel without sign-in
  puts an agent runner on the internet.
- The machine uses `.env` (`LOOPS_CLOUDFLARE=<token>`), so `scripts/restart-console.ps1`, which runs `npm start`,
  keeps the tunnel after each restart, and the shell history holds no token.

Accepted limit: every program that runs as the owner's Windows user can read `.env` and the command line of
Castraferrum, the loop agents included. A person with the token can run a connector for the name and receive the
owner's password. The owner accepts this for a simple setup (2026-11-20). The owner can rotate the token in the
dashboard at any time.

### 4. The home path of phase 3 retires

After the change, no device connects to `<pc-ip>:443`. So:

- The machine task stops and disables the Task Scheduler task `Castraferrum nginx`, deletes the win-acme renewal task,
  and removes the firewall rule for TCP 80 and 443. The owner deletes the Cloudflare API token of win-acme.
- The repository keeps `deploy/local-name/` as the record of phase 3, with one more line in `nginx.conf`:
  `proxy_set_header CF-Connecting-IP "";`. Without that line, a device on the Wi-Fi can send that header through nginx,
  the console sees a loopback socket and trusts the header, and the device gets a new count of failures with each
  value. This defect exists today (found while writing this ADR, from `server/services/auth-service.ts:87-93` and
  `deploy/local-name/nginx.conf`, not verified by a run). It ends when nginx stops, and the line keeps it closed if
  nginx returns for a later app.
- `goals/local-name.json` and `npm run local-name:check` stop being goals. Their records stay in the evidence log of
  phase 3.

### 5. Cloudflare Access is optional

Cloudflare Access (an email code in front of the console) is a dashboard setting and needs no code. It is not part of
this design. The real-tunnel test reads the optional headers `CF-Access-Client-Id` and `CF-Access-Client-Secret`
from `.env`, so it keeps working if the owner adds Access later.

## Consequences

- The console gets the tunnel code of the first R6 design: the flags, a tunnel runner port and adapter, a fake
  `cloudflared` for tests, and the health field `tunnel`.
- A new check tool, `scripts/tunnel-check.mjs`, measures the tunnel on the real machine.
- The console is reachable from the internet while it runs. The console password and the limit of 5 failures in
  15 minutes for each address are the only wall, unless the owner adds Access.
- The owner gets a public name that strangers can find (Certificate Transparency logs and DNS).

## Alternatives considered

- **A separate tunnel name next to the home name:** rejected by the owner (2026-11-20). See decision 1.
- **The tunnel to nginx on port 443:** rejected. nginx adds a hop and nothing else, because the Cloudflare edge gives
  HTTPS and the headers.
- **A SYSTEM Task Scheduler task or a Windows service for `cloudflared`, with the token in a folder that only
  Administrators read:** rejected by the owner (2026-11-20) for a simpler start. It keeps the token from the loop
  agents, and it keeps the tunnel up while Castraferrum restarts.
- **Cloudflare Access in the design:** not chosen now. See decision 5.
- **A port forward on the router:** rejected. It opens the PC to the whole internet and changes the router.
- **Tailscale:** rejected before (ADR 0005): it needs an app on each device.
