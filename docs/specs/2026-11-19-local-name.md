# Spec: a local name and HTTPS on the home network (phase 3)

- Date: 2026-11-19
- Status: superseded by [ADR 0006](../adr/0006-internet-access-through-a-named-tunnel.md) on 2026-11-20: the console name
  moved to a Cloudflare tunnel, and this path is retired. Before that: approved by the owner (pull request 468, 2026-11-19). Updated 2026-11-19 (pull request 478) and 2026-11-20
  (pull request 487, approved and merged by the owner on 2026-11-20).
- **Update 2026-11-20, after N0, N1, N2 and N5 were merged:** the owner bought a domain at Cloudflare and removed the
  DNS server from the PC. Four changes follow:
  1. A public DNS record at Cloudflare gives the console name (D1, D2). No DNS server runs on the PC.
  2. The router deletes a public DNS answer that holds a private address (DNS rebinding protection, measured on
     2026-11-20). The owner does not change the router. So each device that opens the console asks Cloudflare DNS
     directly (D14).
  3. Let's Encrypt signs the certificate through the DNS-01 challenge, and win-acme renews it (D6, goal G9). The own
     issuer leaves the PC (D16, goal G8).
  4. The repository keeps a sample name, now `castra.example.com` (D13).

  This update changes D1, D2, D6 and D10 to D13, and goals G1, G2, G7 and G8. It adds D14 to D16 and goal G9. It
  replaces the update of 2026-11-19, except the per-machine name. Task N6 changes the merged code, and task N3 sets up
  the machine. The first design and the reasons for the change are in ADR 0005, "Alternatives considered".
- Decision record: [ADR 0005](../adr/0005-local-name-through-dns-and-reverse-proxy.md)
- Plan: [../plans/2026-11-19-local-name.md](../plans/2026-11-19-local-name.md)
- Epic: #46 (network access). This is phase 3. It does not wait for phase 2 task R6 (the Cloudflare tunnel). The
  owner takes R6 off hold after this phase (2026-11-20).

## 1. Context

Today a phone opens the console at `http://<pc-ip>:7070`, after the owner starts it with `--remote`. The three
problems of that address are in ADR 0005: a hard address, no encryption, and port 7070 open to the Wi-Fi.

This phase gives the console an HTTPS address on the home network. The sample address in this repository is
`https://castra.example.com`. Each machine uses a name under the domain of its owner (D13). Three parts do the work,
and Castraferrum learns to work behind them:

1. **A public DNS record** at the DNS provider (Cloudflare) answers the console name with the IP address of the PC.
2. **nginx** on the PC receives HTTPS on port 443 with a certificate from **Let's Encrypt**, and sends each request to
   `127.0.0.1:7070`.
3. **win-acme** on the PC gets the certificate from Let's Encrypt and renews it.

The order of one request after this phase. The device asks Cloudflare DNS, not the router (D14):

```text
Device (DNS: Cloudflare)   Cloudflare DNS        nginx (PC)                 Castraferrum (PC)
  | -- castra.example.com? -> |
  | <-------- <pc-ip> ------- |
  | -- TLS to <pc-ip>:443, name castra.example.com --> |
  | <----------------- certificate (Let's Encrypt) --- |
  | -- GET / (encrypted) -----------------------------> |
  |                                                    | -- GET / to 127.0.0.1:7070 ------> |
  |                                                    |    X-Forwarded-Proto: https       |
  |                                                    |    X-Real-IP: <device ip>         |
  |                                                    | <-------- page, Secure cookie ---- |
  | <------------------------------- page (encrypted) - |
```

Why a device that asks the router finds no address:

```text
Device (DNS: router)       Router                     Cloudflare DNS
  | -- castra.example.com? -> |                           |
  |                           | -- castra.example.com? -> |
  |                           | <--------- <pc-ip> ------ |
  |                           | private address: the router deletes the answer
  | <------- empty answer --- |
  X  the browser cannot find the name
```

The order of one renewal. The win-acme task starts it, and no person takes part:

```text
win-acme (PC)               Let's Encrypt             Cloudflare DNS            nginx (PC)
  | -- order for the name -----> |                          |                        |
  | <-- challenge value -------- |                          |                        |
  | -- TXT record _acme-challenge.<name>, with the API token -> |                    |
  | -- "ready" ----------------> |                          |                        |
  |                              | -- reads the TXT record > |                        |
  | <-- certificate ------------ |                          |                        |
  | -- deletes the TXT record --------------------------------> |                    |
  | -- writes the PEM files, then nginx -s reload ---------------------------------> |
```

Facts this design depends on. Each was checked on the owner's PC unless marked "not verified":

- The router deletes a public DNS answer that holds a private address. Through the router's IPv4 and IPv6 DNS
  addresses, the names `192.168.1.10.nip.io` and `10.0.0.5.sslip.io` gave an empty answer, and
  `8.8.8.8.nip.io` gave `8.8.8.8`. Through `1.1.1.1`, all three names gave their address (2026-11-20). The router's
  web interface has no page for DNS records.
- The Wi-Fi adapter of the PC has the router as its IPv4 DNS server and the router's IPv6 address as its IPv6 DNS
  server (`Get-DnsClientServerAddress`, 2026-11-20). Windows can ask either list, so the PC needs Cloudflare DNS in
  both.
- A program that runs as the normal user cannot read a Task Scheduler task that runs as SYSTEM:
  `schtasks /query /tn "Castraferrum nginx"` gives `ERROR: Access is denied.` (2026-11-20). So the check tool cannot
  read the renewal task of win-acme.
- Node v24.19.0 trusts the Let's Encrypt roots `ISRG Root X1` and `ISRG Root X2` by default (`tls.rootCertificates`,
  2026-11-20).
- nginx 1.31.9 runs from `C:\nginx`, started by the task `Castraferrum nginx`, and listens on ports 80 and 443
  (2026-11-20).
- Castraferrum adds `Secure` to the session cookie when `X-Forwarded-Proto` is `https` (`server/http/auth-routes.ts`).
- Since task N1, the sign-in limit reads `X-Real-IP` and `CF-Connecting-IP` only from a loopback socket
  (`server/services/auth-service.ts`, `clientKey`, D8).
- The SSE (Server-Sent Events) routes send `:ping` every 15 seconds (`server/http/sse.ts`).
- The Cloudflare API token for the DNS-01 challenge needs Zone DNS Edit and Zone Zone Read (the simple-acme and lego
  documentation; the win-acme page says only "read and write the DNS records of the zone"). Measured on 2026-11-20:
  a token with only these two permissions, for all zones of the account, let win-acme v2.4.1 issue the certificate.
- Let's Encrypt certificates last 90 days today, and Let's Encrypt plans shorter lifetimes, down to 45 days (the
  Let's Encrypt page about profiles). So no check uses a fixed number of days.
- win-acme makes a Task Scheduler task that renews each certificate before it expires, and it can run a script after
  each renewal. Its PEM store writes `<name>-chain.pem` and `<name>-key.pem` (win-acme documentation). Measured on
  2026-11-20 with win-acme v2.4.1: it also writes `-crt.pem`, `-chain-only.pem`, `-chain-full.pem` and `-chain-only-full.pem`.
- Let's Encrypt gives at most 5 certificates for the same name in 7 days. Not verified today.
- The winget id of win-acme, and the download of its Cloudflare plugin: measured on 2026-11-20: `winget search win-acme` finds no package, and the GitHub release has the assets `win-acme.v2.4.1.2444.x64.pluggable.zip` and `plugin.validation.dns.cloudflare.v2.4.1.2444.zip`.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **The name is set per machine (D13), under a domain that the owner of the machine holds. The sample name in the repository is `castra.example.com`.** Later apps get other names under the same domain, for example `app2.example.com` in the sample. | A bought domain is a real public name, so a public issuer can sign it (D6). The owner bought a domain on 2026-11-20 and wants room for more apps. |
| D2 | **DNS: one public A record at the DNS provider, from the console name to `<pc-ip>`.** At Cloudflare, the record is "DNS only" (proxy off). No DNS server runs on the PC, and the router does not change. | Every public DNS server knows the record. The Cloudflare proxy sends each request from Cloudflare's servers, which cannot reach a private address. The owner removed the DNS server from the PC on 2026-11-20 (ADR 0005). |
| D3 | **Reverse proxy: nginx on the PC.** Port 443 serves HTTPS for the console name. Port 80 answers every request with `301` to `https://<name>$request_uri`. The repository holds the configuration in `deploy/local-name/nginx.conf`. | The owner chose nginx (2026-11-19). A person who types the name without `https://` arrives at port 80 first. |
| D4 | **The nginx configuration sends** every request to `http://127.0.0.1:7070` with `proxy_http_version 1.1`, `Connection ""`, `Host $host`, `X-Forwarded-Proto https`, `X-Real-IP $remote_addr`, `proxy_buffering off` and `proxy_read_timeout 1h`. | Without `proxy_buffering off`, nginx holds back SSE lines, and live updates do not arrive. The `1h` limit is far above the 15-second `:ping`. `X-Real-IP` is set, not appended, so a device cannot add a false value. |
| D5 | **nginx starts at boot through a Windows Task Scheduler task** named `Castraferrum nginx`, which runs as SYSTEM at startup. | nginx for Windows has no service mode of its own. Task Scheduler is part of Windows, so no extra tool is needed. |
| D6 | **Certificate: Let's Encrypt, through the ACME DNS-01 challenge, with win-acme.** (A) win-acme asks Let's Encrypt for one certificate for the console name. It proves control of the name with a TXT record that it writes through the Cloudflare API. It writes the PEM files into `C:\ProgramData\castraferrum\tls\`, and only SYSTEM and the Administrators group can read that folder. (B) win-acme renews the certificate through its own Task Scheduler task. After each renewal it runs `nginx -s reload`, so nginx serves the new certificate. (C) The Cloudflare API token has the permissions Zone DNS Edit and Zone Zone Read, for all zones of the account (owner decision of 2026-11-20: the win-acme plugin needs that scope, and the one-zone limit came from the first design). The owner creates it and types it into win-acme. The token never enters a chat, the repository, `.env` or a log. No key file enters the repository. | Every phone and browser trusts Let's Encrypt, so no device needs a certificate step. DNS-01 needs no connection from the internet to the PC. The renewal task runs as SYSTEM, which cannot use the owner's `%LOCALAPPDATA%`, so the files need a machine folder. A stolen token can change the records of every zone of the account, which the owner accepts. The owner chose a bought domain on 2026-11-20 (ADR 0005). |
| D7 | **Castraferrum listens on `127.0.0.1`** behind nginx, so it starts without `--remote`. | Then only programs on the PC reach port 7070, and the Wi-Fi reaches only nginx. |
| D8 | **`X-Real-IP` counts for the sign-in limit, only from a loopback socket.** `clientKey` reads `CF-Connecting-IP` first, then `X-Real-IP`, and uses either one only when the socket address is loopback. Otherwise it uses the socket address. | Each device gets its own count of failures. A device on the LAN connects from a non-loopback address, so it cannot forge its address with the header. |
| D9 | **`--public-url=<https URL>` (`LOOPS_PUBLIC_URL`)** is a new flag. Startup prints `Open: <url>`. A value that is not an absolute `https://` URL stops startup with exit code 2 and `--public-url must start with https://`. | The owner sees the name to open. Phase 2 (spec D7 of remote-access) planned the same flag for the tunnel. This phase adds it first, with the same meaning. |
| D10 | **A Windows Firewall rule** for TCP 80 and 443, on the Private profile only. No rule for UDP 53. The old rule for TCP 7070 is removed. The README gives each command. A person runs them, because they need administrator rights. | The same rule as lan-access D7: the console never changes the firewall. No DNS server runs on the PC. |
| D11 | **A committed check tool, `scripts/local-name-check.mjs`,** tests the whole chain on the real machine. It prints one line per check and the line `local name: <passed>/10 checks pass`, and it exits 0 only when every check passes. It runs as the normal user, without administrator rights. Plan task N6 lists the checks. | It is the oracle of goals G1 to G4, G8 and G9 (a), and the ratchet of the phase. A loop session has no administrator rights. |
| D12 | **Out of scope:** the Cloudflare tunnel (R6) and access from outside the home, a change to the router other than D15, an AAAA (IPv6) record, a wildcard certificate, a script that installs the programs, a script that sets the DNS of a phone, and more than one name. | Keep the phase small. The owner takes R6 off hold after this phase (2026-11-20). |
| D13 | **The repository holds only the sample name `castra.example.com`.** Each machine sets two values: `LOCAL_NAME` (the console name) and `LOOPS_PUBLIC_URL` (`https://` plus `LOCAL_NAME`). `deploy/local-name/nginx.conf` holds the placeholder `LOCAL_NAME`, which the README step replaces in the deployed copy, the same way as `CERT_DIR`. The check tool reads the name from `LOOPS_PUBLIC_URL`. `LOCAL_NAME_LIMIT` goes away with the own issuer. | The owner does not want a personal name in the public repository (2026-11-19, and again 2026-11-20). The language rule also stopped a commit with the first personal name (`lang-scan`, 2026-11-19). `example.com` is reserved for samples (RFC 2606), so it never points to a stranger. |
| D14 | **Each device that opens the console asks Cloudflare DNS directly.** The PC: the Wi-Fi adapter gets the IPv4 DNS servers `1.1.1.1` and `1.0.0.1` and the IPv6 DNS servers `2606:4700:4700::1111` and `2606:4700:4700::1001` (one administrator command). Android: "Private DNS" set to the host name `one.one.one.one`. iPhone: in the settings of the Wi-Fi network, "Configure DNS" set to Manual with the same four servers. The menu names on phones are not verified. A device without this setting cannot open the console, for example a guest's phone or a TV. | The router deletes the answer (section 1, Facts), and the owner does not change the router (2026-11-20). The PC needs both address families: otherwise Windows can ask the router's IPv6 DNS address and get an empty answer. The owner accepts the limit (2026-11-20). |
| D15 | **The router gives the PC the same address each time,** through a DHCP reservation (the router page "Reserved IP"). | The public record holds a fixed address. When the PC gets another address, the name points to the old one, and the console does not open. This is the only router setting of the phase. Without it, the check `dns-public` shows the new address, and the owner changes the record by hand. |
| D16 | **The own issuer of the first design leaves the owner's PC.** Its certificate `CN=local home issuer` leaves the Root store of the current user (`certutil -user -delstore Root "local home issuer"`), and the folder `%LOCALAPPDATA%\castraferrum\tls\` is deleted. The repository deletes `deploy/local-name/ca.cnf` and `tests/tools/ca-name-limit.test.ts`. | A device that trusts an issuer trusts every certificate that it signed, and nothing uses this issuer now. Its key is already deleted (2026-11-19), so it signs nothing new. But its certificate and the old server key stay on the PC until a person removes them. |

## 3. Goals

Each goal states what a person sees. Each oracle is of the same kind as the claim, and fails for an empty or stub
implementation. Goals G1 to G4, G8 and G9 run on the owner's PC after task N3 (the machine setup). An agent can run
all oracles, except the administrator steps of G9 (b) and (c), which N3 runs through one administrator prompt.

| # | Goal (outcome) | Oracle | Why a stub fails |
|---|---|---|---|
| G1 | A device that asks Cloudflare DNS changes the console name into the PC's IP address every time, and the PC asks no DNS server that deletes the answer. | `node scripts/local-name-check.mjs`, checks `dns-public` (asks `1.1.1.1` directly: the answer is `<pc-ip>`), `dns-pc-servers` (reads the DNS servers of the PC's adapter, IPv4 and IPv6, and asks each one directly: each answers `<pc-ip>`) and `dns-system` (asks the system resolver 20 times: all 20 answer `<pc-ip>`). | With no record, `dns-public` fails. With the router in the adapter's IPv4 or IPv6 list, `dns-pc-servers` fails on the router's empty answer. |
| G2 | `https://<name>` opens the console with a certificate that every device trusts without a setup step, and `http://<name>` goes to the HTTPS address. | Checks `tls` (a TLS connection that verifies the certificate against Node's default trusted roots only, with no extra issuer, then `GET /api/health` gives 200) and `redirect` (`GET http://<name>/x` gives 301 with `Location: https://<name>/x`). Also `tests/e2e/local-name-real.spec.ts` (only with `LC_LOCAL_NAME=1`): Chromium, with certificate errors not ignored, opens the name and sees the sign-in screen. | Without nginx, the connection is refused. A certificate of the own issuer, or a self-signed one, fails the default verification. |
| G3 | Live updates work through nginx. | Check `sse`: `GET https://<name>/api/events` with the session cookie delivers `:ok` and then `:ping` in 20 seconds. The real e2e signs in, starts a loop and sees it running in 2 seconds. | With buffering on, the `:ping` does not arrive in 20 seconds. |
| G4 | Port 7070 is closed to the network, and the console still works on the PC. | Check `port-closed`: a TCP connection to `<pc-ip>:7070` is refused, and one to `127.0.0.1:7070` succeeds. | A console started with `--remote` accepts the first connection. |
| G5 | Behind a reverse proxy, the sign-in works over HTTPS with a `Secure` cookie, live updates arrive, and each device has its own count of failed sign-ins. | e2e `@UC-42` (`tests/e2e/reverse-proxy.spec.ts`): a real `server/main.ts` on `127.0.0.1`, behind `tests/support/fake-reverse-proxy.mjs`, which adds the D4 headers. Device A fails 5 times and gets 429. Device B (a different `X-Real-IP`) then signs in, gets a `Secure` cookie, starts a loop and sees it running in 2 seconds. Unit and api tests of D8: the header from a non-loopback socket is ignored. | Without D8, device B shares the count of device A and gets 429. Without the proxy headers, the cookie has no `Secure`. |
| G6 | Startup shows the address to open. | A process test: a server started with `--public-url=https://castra.example.com` prints `Open: https://castra.example.com`. With `--public-url=http://x` it exits 2 with `--public-url must start with https://`. Unit tests of `loadConfig` for the flag, `npm_config_public_url` and `LOOPS_PUBLIC_URL`. | Without the flag, the unit tests fail and the line is not printed. |
| G7 | The nginx configuration in the repository holds every D3 and D4 rule and the file names that win-acme writes, and nginx accepts it. | `tests/tools/nginx-config.test.ts` reads `deploy/local-name/nginx.conf` and finds each D3 and D4 directive, `ssl_certificate CERT_DIR/LOCAL_NAME-chain.pem` and `ssl_certificate_key CERT_DIR/LOCAL_NAME-key.pem`. On the real machine, check `nginx-test`: `nginx -t -c <the deployed file>` prints `syntax is ok` and `test is successful`. | An empty file fails each directive case. |
| G8 | No own issuer is trusted on the PC, and none of its files is on the PC. | Check `own-issuer-absent`: no certificate with the subject `CN=local home issuer` in the Root store of the current user or of the machine, and no folder `%LOCALAPPDATA%\castraferrum\tls\` (or an empty one). | On the owner's PC today, the issuer is in the Root store and the folder holds its files, so the check fails until the D16 steps run. |
| G9 | The certificate comes from Let's Encrypt and renews itself without a person. | (a) Check `cert-issuer`: the certificate that nginx serves has the issuer organization `Let's Encrypt`, the console name in its names, and an age below 3/4 of its lifetime. Its line prints the serial number, the start date and the end date. (b) Task N3, one time: an administrator script makes win-acme renew the certificate at once. Then `cert-issuer` prints a new serial number and passes, and nobody restarted nginx by hand. (c) Task N3: the same script writes the win-acme Task Scheduler task into its log: the name, the daily trigger and the action that runs `wacs.exe` with `--renew`. | Without a renewal, the age passes 3/4 of the lifetime, and (a) fails before the certificate expires. Without the reload step, nginx still serves the old serial number after (b). |

## 4. The flag set after this phase

| Flag | Environment | Default | Meaning |
|---|---|---|---|
| `--host`, `--remote`, `--port`, `--help` | as in phase 1 | | |
| `--username`, `--password` | as in phase 2 | | |
| `--public-url=<https URL>` | `LOOPS_PUBLIC_URL` | none | The address that a person opens. Printed at startup as `Open: <url>`. |

## 5. Use case added

| ID | Use case | Observable result |
|---|---|---|
| UC-42 | **Use the console behind a reverse proxy** - Castraferrum on `127.0.0.1`, a reverse proxy in front of it that adds `X-Forwarded-Proto: https` and `X-Real-IP` | The sign-in gives a `Secure` cookie, a loop starts and shows Running in 2 seconds over SSE, and 5 failed sign-ins from one device give 429 to that device only |

UC-41 stays reserved for the tunnel (R6). `npm run verify` raises `uc-coverage --min` by one.

## 6. Out of scope

Everything in D12. The real phone is a follow-up outside the phase: after the acceptance task, the owner sets the DNS
of the phone (D14) and opens the name. No goal waits for it.
