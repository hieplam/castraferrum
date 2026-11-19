# Spec: a local name and HTTPS on the home network (phase 3)

- Date: 2026-11-19
- Status: approved by the owner (pull request 468, 2026-11-19)
- **Update 2026-11-19, after N0, N1 and N2 started:** the owner changed two decisions. (1) The owner chose a
  personal console name, with a parent name for later apps. That name never enters this repository (D13): the
  repository keeps the sample name `castra.home.arpa`, and each machine sets its own name. (2) The certificate comes
  from an own issuer that has a name limit, and its secret key leaves the PC after it signs (D6, goal G8). mkcert is
  not used, because it cannot write a name limit, and its issuer can sign any name. Task N5 changes the merged code
  and the README. The code that N0 and N2 merged uses mkcert, a fixed name and 8 checks. N5 replaces them. The
  diagrams and the risk are explained on the owner's page (linked in epic 46).
- Decision record: [ADR 0005](../adr/0005-local-name-through-dns-and-reverse-proxy.md)
- Plan: [../plans/2026-11-19-local-name.md](../plans/2026-11-19-local-name.md)
- Epic: #46 (network access). This is phase 3. It does not wait for phase 2 task R6 (the Cloudflare tunnel, on hold).

## 1. Context

Today a phone opens the console at `http://<pc-ip>:7070`, after the owner starts it with `--remote`. The three
problems of that address are in ADR 0005: a hard address, no encryption, and port 7070 open to the Wi-Fi.

This phase gives the console the address `https://castra.home.arpa` on the home network, for free. Two programs on the
PC do the work, and Castraferrum learns to work behind them:

1. **Technitium DNS Server** answers `castra.home.arpa` with the IP address of the PC.
2. **nginx** receives HTTPS on port 443 with a certificate from **an own issuer that has a name limit** (D6), and sends each request to
   `127.0.0.1:7070`.

The order of one request after this phase:

```text
Device              Router            DNS server (PC)      nginx (PC)            Castraferrum (PC)
  | <- "DNS is <pc-ip>" (DHCP, one time)
  | -- castra.home.arpa? ----------------> |
  | <------------------------- <pc-ip> --- |
  | -- TLS to <pc-ip>:443, name castra.home.arpa --------> |
  | <------------------------- certificate (own issuer) --- |
  | -- GET / (encrypted) --------------------------------> |
  |                                                        | -- GET / to 127.0.0.1:7070 ------> |
  |                                                        |    X-Forwarded-Proto: https       |
  |                                                        |    X-Real-IP: <device ip>         |
  |                                                        | <-------- page, Secure cookie ---- |
  | <------------------------------- page (encrypted) ---- |
```

Facts this design depends on. Each was checked on the owner's PC on 2026-11-19, unless marked "not verified":

- A device sends DNS questions to any server that DHCP gave it, not always to the first one. So every DNS server
  that the router gives must know `castra.home.arpa` (owner decision, 2026-11-19).
- No program listens on UDP port 53 or TCP ports 80 and 443.
- Docker Desktop is installed. nginx, mkcert and Technitium are not installed.
- Castraferrum adds `Secure` to the session cookie when `X-Forwarded-Proto` is `https` (`server/http/auth-routes.ts`).
- The sign-in limit counts failures per socket address, and it reads `CF-Connecting-IP` only from a loopback socket
  (`server/services/auth-service.ts`, `clientKey`). Behind nginx, every socket address is `127.0.0.1`.
  As a result, today one person who types a wrong password 5 times locks out every device.
- The SSE (Server-Sent Events) routes send `:ping` every 15 seconds (`server/http/sse.ts`).
- The nginx project calls its Windows build "beta" quality (not verified on this machine).
- The winget package ids of nginx, mkcert and Technitium: not verified. Task N2 checks them.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **The name is set per machine (D13). The sample name in the repository is `castra.home.arpa`.** Later apps get names under the name limit of D6, for example `nas.castra.home.arpa` in the sample. | `home.arpa` is reserved for home networks (RFC 8375). Nobody can buy it, so it never points to a stranger. The owner chose the name on 2026-11-19 and wants room for more apps. |
| D2 | **DNS server: Technitium DNS Server on the PC, as a Windows service.** Zone `home.arpa`, one A record `castra` (the full name `castra.home.arpa`) to the PC's IP address. Technitium sends other names to `1.1.1.1`. The router's DHCP gives the PC as the **only** DNS server, with no second server. If the router also gives IPv6 DNS servers, that must be off, for the same reason. On a phone, "Private DNS" (Android) or a DNS profile (iOS) must be off or automatic. | It runs on Windows natively, starts at boot without a sign-in, and local zones are its main job (ADR 0005). Devices send questions to any DNS server that they know. A public second server answers that the name does not exist, so the name fails at random. The owner chose this on 2026-11-19 and accepts that, when the PC is off, the Wi-Fi finds no names. |
| D3 | **Reverse proxy: nginx on the PC.** Port 443 serves HTTPS for `castra.home.arpa`. Port 80 answers every request with `301` to `https://castra.home.arpa$request_uri`. The repository holds the configuration in `deploy/local-name/nginx.conf`. | The owner chose nginx (2026-11-19). A person who types the name without `https://` arrives at port 80 first. |
| D4 | **The nginx configuration sends** every request to `http://127.0.0.1:7070` with `proxy_http_version 1.1`, `Connection ""`, `Host $host`, `X-Forwarded-Proto https`, `X-Real-IP $remote_addr`, `proxy_buffering off` and `proxy_read_timeout 1h`. | Without `proxy_buffering off`, nginx holds back SSE lines, and live updates do not arrive. The `1h` limit is far above the 15-second `:ping`. `X-Real-IP` is set, not appended, so a device cannot add a false value. |
| D5 | **nginx starts at boot through a Windows Task Scheduler task** named `Castraferrum nginx`, which runs as SYSTEM at startup. | nginx for Windows has no service mode of its own. Task Scheduler is part of Windows, so no extra tool is needed. |
| D6 | **Certificate: an own issuer (CA, Certificate Authority) with a name limit, made with `openssl`.** (A) The issuer certificate has `basicConstraints = critical, CA:true, pathlen:0` and `nameConstraints = critical, permitted;DNS:castra.home.arpa`, from the committed config `deploy/local-name/ca.cnf`. (B) The issuer signs one server certificate for `castra.home.arpa` (825 days, `extendedKeyUsage = serverAuth`). Then the issuer's secret key `local-ca-key.pem` leaves the PC: the owner moves it to a USB stick, or deletes it. (C) Only the PC and the phones that need the console trust the issuer: the PC through `certutil -user -addstore Root local-ca.pem`, each phone by hand. The folder `%LOCALAPPDATA%\castraferrum\tls\` holds `local-ca.pem` (public), the server certificate and the server key. No key file enters the repository. | A device that trusts an issuer trusts every certificate that it signs. Without a limit, a stolen issuer key can fake any website, a bank too, and on this Wi-Fi the PC is also the DNS server. With the limit, a stolen key can sign only names under `castra.home.arpa`. With the key off the PC, no program on the PC can steal it. mkcert cannot write a name limit. The owner ratified A, B and C on 2026-11-19. 825 days is the longest validity that iPhones accept for a server certificate (not verified on the owner's phone). |
| D7 | **Castraferrum listens on `127.0.0.1`** behind nginx, so it starts without `--remote`. | Then only programs on the PC reach port 7070, and the Wi-Fi reaches only nginx. |
| D8 | **`X-Real-IP` counts for the sign-in limit, only from a loopback socket.** `clientKey` reads `CF-Connecting-IP` first, then `X-Real-IP`, and uses either one only when the socket address is loopback. Otherwise it uses the socket address. | Each device gets its own count of failures. A device on the LAN connects from a non-loopback address, so it cannot forge its address with the header. |
| D9 | **`--public-url=<https URL>` (`LOOPS_PUBLIC_URL`)** is a new flag. Startup prints `Open: <url>`. A value that is not an absolute `https://` URL stops startup with exit code 2 and `--public-url must start with https://`. | The owner sees the name to open. Phase 2 (spec D7 of remote-access) planned the same flag for the tunnel. This phase adds it first, with the same meaning. |
| D10 | **Windows Firewall rules** for UDP 53 and TCP 80 and 443, on the Private profile only. The old rule for TCP 7070 is removed. The README gives each command. A person runs them, because they need administrator rights. | The same rule as lan-access D7: the console never changes the firewall. |
| D11 | **A committed check tool, `scripts/local-name-check.mjs`,** tests the whole chain on the real machine and prints one line per check and the line `local name: <passed>/<total> checks pass`. It exits 0 only when every check passes. | It is the oracle of goals G1 to G4 and the ratchet of the phase. |
| D12 | **Out of scope:** a bought domain, Let's Encrypt, the Cloudflare tunnel (R6), IPv6, a script that installs the programs, the trust of the CA on other devices by a script, and more than one name. | Keep the phase small. A real domain later changes only the DNS server and the certificate (ADR 0005). |
| D13 | **The repository holds only the sample name `castra.home.arpa`.** Each machine sets three values: `LOCAL_NAME` (the console name), `LOCAL_NAME_LIMIT` (the name limit of the issuer, the console name or a parent of it) and `LOOPS_PUBLIC_URL` (`https://` plus `LOCAL_NAME`). `deploy/local-name/ca.cnf` reads `$ENV::LOCAL_NAME` and `$ENV::LOCAL_NAME_LIMIT`. `deploy/local-name/nginx.conf` holds the placeholder `LOCAL_NAME`, which the README step replaces in the deployed copy, the same way as `CERT_DIR`. The check tool reads the name from `LOOPS_PUBLIC_URL` and the limit from `LOCAL_NAME_LIMIT`. | The owner's name holds a word that the language rule forbids in the repository (`lang-scan` stopped the commit on 2026-11-19), and a personal name does not belong in a public repository. A sample name keeps every test and document readable. |

## 3. Goals

Each goal states what a person sees. Each oracle is of the same kind as the claim, and fails for an empty or stub
implementation. Goals G1 to G4 run on the owner's PC after task N3 (the machine setup). An agent can run all oracles.

| # | Goal (outcome) | Oracle | Why a stub fails |
|---|---|---|---|
| G1 | A device on the Wi-Fi changes `castra.home.arpa` into the PC's IP address, every time. | `node scripts/local-name-check.mjs`, checks `dns-direct` (asks `<pc-ip>:53`), `dns-system` (asks the resolver that the router gave, 20 times: all 20 answer the PC's IP address) and `dns-only-pc` (the DNS server list of the network adapter, IPv4 and IPv6, has the PC's IP address and no other address). | With no DNS server, the queries fail with `ENOTFOUND` or a time-out. With a public second server, `dns-only-pc` fails, and some of the 20 queries can fail. |
| G2 | `https://castra.home.arpa` opens the console with a trusted certificate, and `http://castra.home.arpa` goes to the HTTPS address. | Checks `tls` (a TLS connection that verifies the certificate against `local-ca.pem`, then `GET /api/health` gives 200) and `redirect` (`GET http://castra.home.arpa/x` gives 301 with `Location: https://castra.home.arpa/x`). Also `tests/e2e/local-name-real.spec.ts` (only with `LC_LOCAL_NAME=1`): Chromium, with certificate errors not ignored, opens the name and sees the sign-in screen. | Without nginx, the connection is refused. A self-signed certificate fails the verification. |
| G3 | Live updates work through nginx. | Check `sse`: `GET https://castra.home.arpa/api/events` with the session cookie delivers `:ok` and then `:ping` in 20 seconds. The real e2e signs in, starts a loop and sees it running in 2 seconds. | With buffering on, the `:ping` does not arrive in 20 seconds. |
| G4 | Port 7070 is closed to the network, and the console still works on the PC. | Check `port-closed`: a TCP connection to `<pc-ip>:7070` is refused, and one to `127.0.0.1:7070` succeeds. | A console started with `--remote` accepts the first connection. |
| G5 | Behind a reverse proxy, the sign-in works over HTTPS with a `Secure` cookie, live updates arrive, and each device has its own count of failed sign-ins. | e2e `@UC-42` (`tests/e2e/reverse-proxy.spec.ts`): a real `server/main.ts` on `127.0.0.1`, behind `tests/support/fake-reverse-proxy.mjs`, which adds the D4 headers. Device A fails 5 times and gets 429. Device B (a different `X-Real-IP`) then signs in, gets a `Secure` cookie, starts a loop and sees it running in 2 seconds. Unit and api tests of D8: the header from a non-loopback socket is ignored. | Without D8, device B shares the count of device A and gets 429. Without the proxy headers, the cookie has no `Secure`. |
| G6 | Startup shows the address to open. | A process test: a server started with `--public-url=https://castra.home.arpa` prints `Open: https://castra.home.arpa`. With `--public-url=http://x` it exits 2 with `--public-url must start with https://`. Unit tests of `loadConfig` for the flag, `npm_config_public_url` and `LOOPS_PUBLIC_URL`. | Without the flag, the unit tests fail and the line is not printed. |
| G7 | The nginx configuration in the repository holds every D3 and D4 rule, and nginx accepts it. | `tests/tools/nginx-config.test.ts` reads `deploy/local-name/nginx.conf` and finds each D3 and D4 directive. On the real machine, `nginx -t -c <the deployed file>` prints `syntax is ok` and `test is successful`. | An empty file fails each directive case. |
| G8 | A stolen issuer key cannot fake a name outside `castra.home.arpa`, and the issuer key is not on the PC. | (a) `tests/tools/ca-name-limit.test.ts`: it makes a throwaway issuer with `deploy/local-name/ca.cnf`, signs `castra.home.arpa` and `bank.example`, and serves each one on a local TLS server. A Node TLS client that trusts only that issuer accepts the first and rejects the second. (b) On the real machine, the check tool: `ca-name-limit` (the trusted `local-ca.pem` has the critical name limit `castra.home.arpa`) and `ca-key-absent` (no `local-ca-key.pem` exists in the tls folder, and no file there holds a private key except the server key). | An issuer without the limit accepts `bank.example`, so (a) fails. A key left on the PC fails `ca-key-absent`. |

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

Everything in D12. The real phone is a follow-up outside the phase: after the acceptance task, the owner can copy
`rootCA.pem` to the phone and open the name. No goal waits for it.
