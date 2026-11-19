# Plan: a local name and HTTPS on the home network (phase 3)

- Date: 2026-11-19
- Spec: [../specs/2026-11-19-local-name.md](../specs/2026-11-19-local-name.md) (goals G1 to G9, decisions D1 to D16)
- Decision record: [ADR 0005](../adr/0005-local-name-through-dns-and-reverse-proxy.md)
- Evidence log: `docs/plans/2026-11-19-local-name-evidence.md` (task N0 creates it; each task adds a section
  `## N<k>` with its before and after numbers: commands and literal output only)

## How to read this plan

The rules of the phase 1 plan apply ([2026-10-21-lan-access.md](2026-10-21-lan-access.md), "How to read this
plan"):

- One task is one pull request. It carries the code, the tests and the evidence section, says `Closes #<task issue>`,
  and has a `## Verify` section with Red, Green and Stub check, each with its result.
- Tests come first. Keep the Red output. Run Green and match its output.
- Counts never go down. `npm run verify` exits 0 at the end of each code task.
- The running console on `127.0.0.1:7070` is off limits for tests. Only N3 and N4 change how it starts.
- This plan file wins over the copy of a section in an issue.
- The spec update of 2026-11-20 (a bought domain) adds task N6 and rewrites N3 and N4. The sections of N0, N1, N2 and
  N5 stay as they were merged, with the old sample name `castra.home.arpa`. N6 says what changes in their files.

Machine facts in this plan use `<pc-ip>` for the IP address of the owner's PC. The repository never holds the real
address. The check tool finds it at run time.

## Task overview

| Task | What | Goals | Waits for |
|---|---|---|---|
| N0 | Baseline numbers; the check tool `scripts/local-name-check.mjs` | G1 to G4 (the oracle) | - |
| N1 | Castraferrum behind a reverse proxy: `X-Real-IP` for the sign-in limit, `--public-url`, UC-42 | G5, G6 | - |
| N2 | The nginx configuration, the README section, the real e2e file | G7, G2 | - |
| N5 | The per-machine name and the name-limited issuer (spec update of 2026-11-19) | G2, G7, G8 | N0, N1, N2 |
| N6 | The check tool v2, the deploy files and the README for a bought domain (spec update of 2026-11-20) | G1, G2, G7, G8, G9 (a) | N5 |
| N3 | **Machine setup on the owner's PC, the DNS record and the phones** (needs a person: the Cloudflare login and API token, the router password and administrator rights) | G1 to G4, G7 to G9 | N6 |
| N4 | Verify every goal and do the agent acceptance | G1 to G9 | N3 |

N0, N1 and N2 can run at the same time. They touch different files. N0, N1, N2 and N5 are merged (pull requests 480,
482, 476 and 483).

---

## N0 - Baseline numbers; the check tool

**Files:** `docs/plans/2026-11-19-local-name-evidence.md` (new: section `## N0` with the `main` SHA, the counts of
`npm run verify`, and the first output of the check tool), `scripts/local-name-check.mjs` (new),
`tests/tools/local-name-check.test.ts` (new), `package.json` (script `local-name:check`), `README.md` (one row in
"Scripts").

The tool runs these checks in this order. Each prints `PASS <id>` or `FAIL <id>: <reason>`. The last line is
`local name: <passed>/8 checks pass`. The exit code is 0 only when all 8 pass.

| Id | What it does |
|---|---|
| `dns-direct` | Asks `<pc-ip>:53` for the A record of `castra.home.arpa`. Expects `<pc-ip>`. |
| `dns-system` | Asks the system resolver 20 times. Expects `<pc-ip>` each time. |
| `dns-only-pc` | Reads the DNS servers of the active network adapter, IPv4 and IPv6 (`Get-DnsClientServerAddress` through `powershell.exe -NoProfile`). Expects exactly one address: `<pc-ip>`. |
| `nginx-test` | Runs `nginx -t -c <deployed nginx.conf>`. Expects `syntax is ok` and `test is successful`. |
| `tls` | Opens TLS to `castra.home.arpa:443` and verifies the certificate against `rootCA.pem` of `mkcert -CAROOT`. Then `GET /api/health` expects 200. |
| `redirect` | `GET http://castra.home.arpa/x` expects 301 and `Location: https://castra.home.arpa/x`. |
| `sse` | Signs in with `LOOPS_USERNAME` and `LOOPS_PASSWORD` from `.env`. Opens `/api/events` with the cookie. Expects `:ok`, then `:ping` within 20 seconds. |
| `port-closed` | A TCP connection to `<pc-ip>:7070` must be refused. A connection to `127.0.0.1:7070` must succeed. |

`<pc-ip>` is the first non-virtual, non-internal IPv4 address, the same rule as the startup list (lan-access D3).
`--pc-ip=<address>` replaces it. Each check has a 25-second limit. The tool reads the network, so the unit test
gives it fake functions (resolver, command runner, TLS and HTTP clients) through one exported `runChecks(deps)`.

**Verify**
- **Goal:** the oracle of G1 to G4 exists and reports the real state.
- **Red:** first run `npm run verify` on `main` and record the counts. Then write the test.
  `npx vitest run --project unit tests/tools/local-name-check.test.ts` fails on the missing module.
- **Green:** (1) The unit command passes, with at least: all fakes good gives 8 `PASS` lines, `local name: 8/8 checks
  pass` and exit 0; a resolver that answers `1.1.1.1` once in 20 gives `FAIL dns-system`; two DNS servers give
  `FAIL dns-only-pc`; a certificate that the CA did not sign gives `FAIL tls`; an SSE stream without `:ping` gives
  `FAIL sse` after the wound 20 seconds; an open `<pc-ip>:7070` gives `FAIL port-closed`; each failure gives exit 1.
  (2) `npm run local-name:check` on the owner's PC prints a last line `local name: <n>/8 checks pass`. Record `<n>` in
  the evidence log as the baseline. Expected today: `0/8`, except `port-closed` when the console runs without
  `--remote`. (3) `npm run verify` exits 0 with counts at least the baseline.
- **Stub check:** a tool that always prints `8/8` fails every failure case. A tool that skips a check prints a total
  other than 8.
- **Ratchet:** `local name: <n>/8` measured here. It may only go up. Unit count above the baseline.

## N1 - Castraferrum behind a reverse proxy; UC-42

**Files:** `server/services/auth-service.ts` (`clientKey` of spec D8), `server/services/contracts.ts`
(`ClientAddress.realIp`), `server/http/auth-routes.ts` (pass `x-real-ip`), `server/services/auth-service.test.ts`,
`tests/api/auth-api.test.ts`, `server/config.ts` (`publicUrl`, D9, `USAGE` line), `server/config.test.ts`,
`server/main.ts` (the `Open: <url>` line), the process test of the flags, `tests/support/fake-reverse-proxy.mjs` (new:
a Node HTTP proxy on a free port that adds the D4 headers and `X-Real-IP` from a request header that the test sets),
`tests/e2e/reverse-proxy.spec.ts` (new, `@UC-42`), `docs/USE-CASES.md` (UC-42), `docs/API.md` (the header rule),
`docs/ARCHITECTURE.md` (one paragraph: behind a reverse proxy), `package.json` (`uc-coverage --min` up by one),
`.env.example` (commented `LOOPS_PUBLIC_URL=`).

**Verify**
- **Goal:** G5, G6.
- **Red:** write the tests first. (1) `npx vitest run --project unit server/services/auth-service.test.ts` fails:
  `clientKey({ socket: '127.0.0.1', realIp: '192.0.2.10' })` returns `127.0.0.1`. (2)
  `npx vitest run --project unit server/config.test.ts` fails: `loadConfig({}, ['--public-url=https://castra.home.arpa']).publicUrl`
  is `undefined`. (3) `npx playwright test tests/e2e/reverse-proxy.spec.ts` fails: device B gets 429 after device A
  failed 5 times.
- **Green:** (1) The unit commands pass, with at least: `realIp` from loopback is the key; `realIp` from
  `192.0.2.7` is ignored; `CF-Connecting-IP` wins over `realIp`; the flag, `npm_config_public_url`,
  `LOOPS_PUBLIC_URL`, and `--public-url=http://x` throws `--public-url must start with https://`. (2) The api test:
  through a loopback request with `X-Real-IP: 192.0.2.10`, 5 failures give 429 for that address, and a sixth request
  with `X-Real-IP: 192.0.2.11` gives 401, not 429. (3) The process test: `Open: https://castra.home.arpa` is printed,
  and `--public-url=http://x` exits 2. (4) The e2e passes: device A gets 429, device B signs in with a `Secure` cookie,
  starts a loop and sees Running within 2 seconds. (5) `npm run verify` exits 0, and `uc-coverage` shows one more use
  case than the N0 baseline.
- **Stub check:** without the `clientKey` change, device B gets 429. A proxy without `X-Forwarded-Proto` gives a cookie
  without `Secure`. A flag that is parsed but not printed fails the process test.
- **Ratchet:** unit, api and e2e counts above N0. `uc-coverage` up by one.

## N2 - The nginx configuration, the README section, the real e2e file

**Files:** `deploy/local-name/nginx.conf` (new: spec D3 and D4; the certificate paths as
`%LOCALAPPDATA%\castraferrum\tls\` placeholders that N3 fills in the deployed copy), `deploy/local-name/README.md`
(new: what each file is), `tests/tools/nginx-config.test.ts` (new), `tests/e2e/local-name-real.spec.ts` (new: runs only
with `LC_LOCAL_NAME=1`; otherwise `test.skip` with the reason), `README.md` (new section "Open with a name on your
network", after "Open from another device").

The README section has these steps, each with its command:
1. Install Technitium, nginx and mkcert. Find the winget package ids with `winget search` and write the ids that
   work. If a program has no winget package, give its download page.
2. In Technitium: make the zone `home.arpa` and the A record `castra` to `<pc-ip>`. Set the forwarder `1.1.1.1`.
3. Run `mkcert -install`, then `mkcert castra.home.arpa` in `%LOCALAPPDATA%\castraferrum\tls\`.
4. Copy `deploy/local-name/nginx.conf` into the nginx folder and fill in the certificate paths.
5. Add the Task Scheduler task `Castraferrum nginx` (spec D5).
6. Add the firewall rules for UDP 53 and TCP 80 and 443 on the Private profile. Remove the rule for TCP 7070
   (spec D10).
7. In the router: set the DHCP DNS server to `<pc-ip>` only, with no second server. If the router gives IPv6 DNS
   servers, turn that off.
8. Start Castraferrum without `--remote`, with `LOOPS_PUBLIC_URL=https://castra.home.arpa` in `.env`.
9. Run `npm run local-name:check`.
10. On each phone: copy `rootCA.pem` from `mkcert -CAROOT` and trust it. Turn "Private DNS" off or to automatic.

**Verify**
- **Goal:** G7, and the file that proves G2 in a browser.
- **Red:** `npx vitest run --project unit tests/tools/nginx-config.test.ts` fails: `deploy/local-name/nginx.conf` does
  not exist.
- **Green:** (1) The unit command passes. It finds in the file: `listen 443 ssl`, `server_name castra.home.arpa`,
  `listen 80` with `return 301 https://castra.home.arpa$request_uri`, `proxy_pass http://127.0.0.1:7070`,
  `proxy_http_version 1.1`, `proxy_set_header Connection ""`, `proxy_set_header Host $host`,
  `proxy_set_header X-Forwarded-Proto https`, `proxy_set_header X-Real-IP $remote_addr`, `proxy_buffering off`,
  `proxy_read_timeout 1h`, and no `proxy_add_x_forwarded_for`. (2) `npx playwright test tests/e2e/local-name-real.spec.ts`
  without `LC_LOCAL_NAME` reports 1 skipped and 0 failed. (3) `node scripts/lang-scan.mjs --check-baseline` exits 0.
  (4) `npm run verify` exits 0.
- **Stub check:** an empty `nginx.conf` fails each directive case. A configuration with `proxy_buffering on` fails
  that case.
- **Ratchet:** unit count above N0.

## N5 - The per-machine name and the name-limited issuer

The owner changed spec D1 and D6 on 2026-11-19, after N0, N1 and N2 started, and spec D13 keeps the owner's own name
out of the repository (spec, "Update 2026-11-19"). This task changes the merged configuration, the check tool and
the README to match. It does not change the server code of N1. Every file keeps the sample name `castra.home.arpa`.

**Files:**
- `deploy/local-name/ca.cnf` (new): the `openssl` configuration of spec D6 and D13. Section `[ca_ext]`:
  `basicConstraints = critical, CA:true, pathlen:0`, `keyUsage = critical, keyCertSign, cRLSign`,
  `nameConstraints = critical, permitted;DNS:$ENV::LOCAL_NAME_LIMIT`, `subjectKeyIdentifier = hash`. Section
  `[server_ext]`: `basicConstraints = critical, CA:false`, `keyUsage = critical, digitalSignature, keyEncipherment`,
  `extendedKeyUsage = serverAuth`, `subjectAltName = DNS:$ENV::LOCAL_NAME`, `authorityKeyIdentifier = keyid`.
  Comments say which command uses which section, and that both variables must be set.
- `deploy/local-name/nginx.conf`: the placeholder `LOCAL_NAME` in `server_name`, in the redirect target and in the
  certificate file names (`CERT_DIR/LOCAL_NAME.pem`, `CERT_DIR/LOCAL_NAME-key.pem`).
- `deploy/local-name/README.md`: the files, the three values of spec D13, and the commands of README step 3 below.
- `scripts/local-name-check.mjs` and `tests/tools/local-name-check.test.ts`: the name comes from the host of
  `LOOPS_PUBLIC_URL` (`--name=<name>` replaces it) and the limit from `LOCAL_NAME_LIMIT` (`--limit=<name>`). A missing
  value fails the checks that need it, with the reason. `tls` verifies against
  `%LOCALAPPDATA%\castraferrum\tls\local-ca.pem` (`--ca=<path>` replaces it) instead of the mkcert folder. Two new
  checks come after `tls`: `ca-name-limit` (the trusted `local-ca.pem` has a critical name limit equal to
  `LOCAL_NAME_LIMIT`, read with `openssl x509 -text`) and `ca-key-absent` (no `local-ca-key.pem` in the tls folder,
  and no file there holds a private key except `<name>-key.pem`). The last line becomes
  `local name: <passed>/10 checks pass`.
- `tests/tools/ca-name-limit.test.ts` (new): spec G8 (a), with `LOCAL_NAME=castra.home.arpa` and
  `LOCAL_NAME_LIMIT=castra.home.arpa`. It finds `openssl` on `PATH`, or at
  `C:\Program Files\Git\usr\bin\openssl.exe` on Windows, and makes every file in a temporary folder.
- `tests/tools/nginx-config.test.ts`: `server_name LOCAL_NAME` and `return 301 https://LOCAL_NAME$request_uri`.
- `tests/e2e/local-name-real.spec.ts`: the address comes from `LOOPS_PUBLIC_URL`.
- `.env.example`: commented `LOCAL_NAME=castra.home.arpa` and `LOCAL_NAME_LIMIT=castra.home.arpa` lines.
- `README.md`, the section "Open with a name on your network": a first step sets the three values of spec D13 in
  `.env` and in the PowerShell session. Step 2 makes the zone and the A record of `LOCAL_NAME`. Step 3 replaces mkcert
  with these steps, each with its command:
  1. In `%LOCALAPPDATA%\castraferrum\tls\`, make the issuer: `openssl req -x509 -newkey ec -pkeyopt
     ec_paramgen_curve:P-256 -nodes -keyout local-ca-key.pem -out local-ca.pem -days 3650 -subj "/CN=local home
     issuer" -config <repo>/deploy/local-name/ca.cnf -extensions ca_ext`.
  2. Make the server key and request, then sign it: `openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes
     -keyout "$env:LOCAL_NAME-key.pem" -out server.csr -subj "/CN=$env:LOCAL_NAME"`, then `openssl x509 -req -in
     server.csr -CA local-ca.pem -CAkey local-ca-key.pem -CAcreateserial -days 825 -extfile
     <repo>/deploy/local-name/ca.cnf -extensions server_ext -out "$env:LOCAL_NAME.pem"`.
  3. Trust the issuer on the PC, for the current user only: `certutil -user -addstore Root local-ca.pem`.
  4. Move `local-ca-key.pem` to a USB stick and keep the stick out of the PC, or delete the file. Without it, a new
     server certificate needs a new issuer (spec D6, rule B).

  Step 4 (nginx) replaces both placeholders, `LOCAL_NAME` and `CERT_DIR`, in the deployed copy. Step 10 copies
  `local-ca.pem` (renamed to `local-ca.crt`) only to the phones that need the console (rule C), with the iPhone and
  Android steps and how to remove it. It says in one sentence why the issuer key must never be copied. Write the
  exact menu names as "not verified on every phone".

**Verify**
- **Goal:** G8 (a), and G2 and G7 with a per-machine name.
- **Red:** (1) `npx vitest run --project unit tests/tools/ca-name-limit.test.ts` fails on the missing
  `deploy/local-name/ca.cnf`. (2) `npx vitest run --project unit tests/tools/nginx-config.test.ts` fails after the
  test change, because the file still says `server_name castra.home.arpa`.
- **Green:** (1) The ca-name-limit test passes. The client that trusts only the throwaway issuer connects to the
  server for `castra.home.arpa`. The connection to the server for `bank.example` fails with an error whose code is
  not empty (record the literal code). A second case makes an issuer without `nameConstraints` and shows that the
  same client then accepts `bank.example`, so the test can see the difference. (2)
  `npx vitest run --project unit tests/tools/local-name-check.test.ts tests/tools/nginx-config.test.ts` passes, with
  the new cases: a `local-ca.pem` without the limit gives `FAIL ca-name-limit`; a `local-ca-key.pem` in the folder
  gives `FAIL ca-key-absent`; no `LOOPS_PUBLIC_URL` gives a FAIL with the reason; all fakes good give
  `local name: 10/10 checks pass`. (3) `node scripts/lang-scan.mjs --check-baseline` prints `baseline check: ok`.
  (4) `npm run verify` exits 0, or fails only with the failures that `main` has at the time (write them down).
- **Stub check:** a `ca.cnf` without `nameConstraints` makes the `bank.example` case connect, so Green (1) fails. A
  check tool that only counts to 10 without the two checks fails the new cases.
- **Ratchet:** unit count up by the new cases.

## N6 - The check tool v2, the deploy files and the README for a bought domain

The spec update of 2026-11-20 replaces the DNS server on the PC and the own issuer (spec D1, D2, D6, D13 to D16).
This task changes the merged files of N0, N2 and N5 to match. It does not change the server code of N1. Every file
uses the sample name `castra.example.com`.

**Files:**
- `scripts/local-name-check.mjs` and `tests/tools/local-name-check.test.ts`: the 10 checks below, in this order. Each
  prints `PASS <id>` or `FAIL <id>: <reason>`. The last line stays `local name: <passed>/10 checks pass`. The flags
  `--limit` and `--ca` and the value `LOCAL_NAME_LIMIT` go away. A new flag `--public-dns=<address>` replaces the
  default `1.1.1.1`. No check gives a `ca` option to TLS or HTTPS: every connection uses Node's default trusted roots.

  | Id | What it does |
  |---|---|
  | `dns-public` | Asks the public DNS server (`1.1.1.1`) directly for the A record of the name. Expects `<pc-ip>`. The reason of a FAIL names both addresses. |
  | `dns-pc-servers` | Reads the DNS servers of the PC's adapter, IPv4 and IPv6 (the PowerShell function of the old `dns-only-pc`). Asks each server directly. Expects `<pc-ip>` from each one. The reason of a FAIL names each server that gave another answer or an empty answer. An IPv6 server is written `[<address>]:53`. |
  | `dns-system` | Unchanged: the system resolver, 20 times. |
  | `nginx-test` | Unchanged. |
  | `tls` | Opens TLS to `<name>:443` with Node's default trusted roots and no `ca` option. Then `GET /api/health` expects 200. |
  | `cert-issuer` | Opens its own TLS connection to `<name>:443` and reads the certificate (`getPeerCertificate`). Expects the issuer organization `Let's Encrypt`, the name in the subject alternative names, and an age below 3/4 of the lifetime: `now - valid_from < 0.75 * (valid_to - valid_from)`. The line prints `serial <serialNumber>, valid <valid_from> to <valid_to>` after `PASS cert-issuer` and after the reason of a FAIL. |
  | `own-issuer-absent` | Asks PowerShell (`powershell.exe -NoProfile`) for the certificates in `Cert:\CurrentUser\Root` and `Cert:\LocalMachine\Root` with the subject `CN=local home issuer`. Expects none. Also expects no folder `%LOCALAPPDATA%\castraferrum\tls\`, or an empty one. |
  | `redirect` | Unchanged. |
  | `sse` | Unchanged, without the `ca` option. |
  | `port-closed` | Unchanged. |
- `deploy/local-name/nginx.conf`: `ssl_certificate CERT_DIR/LOCAL_NAME-chain.pem` (the certificate and its
  intermediate certificates, as win-acme writes them) and `ssl_certificate_key CERT_DIR/LOCAL_NAME-key.pem`. The
  comments name Let's Encrypt and the folder `C:/ProgramData/castraferrum/tls` for `CERT_DIR`.
- `deploy/local-name/README.md`: the files, the two values of spec D13, and `CERT_DIR`.
- `deploy/local-name/ca.cnf` and `tests/tools/ca-name-limit.test.ts`: deleted (spec D16).
- `tests/tools/nginx-config.test.ts`: the two certificate lines.
- `.env.example`: commented `LOCAL_NAME=castra.example.com` and `LOOPS_PUBLIC_URL=https://castra.example.com` lines,
  and no `LOCAL_NAME_LIMIT`.
- The sample name: each `castra.home.arpa` outside `docs/` becomes `castra.example.com`. Today it is in
  `server/config.test.ts`, `tests/api/sign-in-startup.test.ts`, `tests/e2e/local-name-real.spec.ts`, the check tool
  test, the deploy files and the README.
- `README.md`, the section "Open with a name on your network", rewritten. Each step has its command:
  1. Choose the two values of spec D13 and put them in `.env`.
  2. At the DNS provider, add the A record of the name with the value `<pc-ip>`. At Cloudflare, set it to "DNS only".
     Test it: `Resolve-DnsName <name> -Server 1.1.1.1 -DnsOnly` answers `<pc-ip>`.
  3. In the router, reserve `<pc-ip>` for this PC (spec D15).
  4. Set the DNS of each device that opens the console (spec D14). The PC, in an administrator PowerShell:
     `Set-DnsClientServerAddress -InterfaceAlias "<adapter>" -ServerAddresses ("1.1.1.1","1.0.0.1","2606:4700:4700::1111","2606:4700:4700::1001")`.
     Android and iPhone: the menus of D14, marked "not verified on every phone". Two sentences give the reason (the
     router deletes the answer) and the limit (a device without the setting cannot open the console).
  5. Install nginx (`winget install --id nginxinc.nginx`) and win-acme with its Cloudflare plugin. Find the win-acme
     winget id with `winget search win-acme`. If it has none, give the download page. Give the page of the plugin.
  6. Make the Cloudflare API token: the two permissions of spec D6 (C), for the one zone. The token goes only into
     win-acme.
  7. Make the folder `C:\ProgramData\castraferrum\tls` and limit it to SYSTEM and Administrators, in an administrator
     PowerShell: `icacls C:\ProgramData\castraferrum\tls /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"`.
  8. In the same administrator PowerShell, run win-acme with full options: a manual name, DNS validation through
     Cloudflare, the PEM store in that folder, and a script step that runs
     `C:\nginx\nginx.exe -p C:/nginx/ -c C:/nginx/conf/castra.conf -s reload`. Mark the menu texts "not verified".
     Task N3 corrects them.
  9. Copy `deploy/local-name/nginx.conf`, replace `LOCAL_NAME` and `CERT_DIR` in the copy, and run `nginx -t`.
  10. The Task Scheduler task `Castraferrum nginx` (unchanged).
  11. The firewall rule for TCP 80 and 443 on the Private profile, and the removal of the rule for TCP 7070.
  12. Start Castraferrum without `--remote`.
  13. `npm run local-name:check`: the last line is `local name: 10/10 checks pass`.

  A last part, "If you set up the first design", removes the issuer
  (`certutil -user -delstore Root "local home issuer"`), deletes `%LOCALAPPDATA%\castraferrum\tls`, and removes
  Technitium and the firewall rule `Castraferrum DNS` if they exist.

**Verify**
- **Goal:** the oracles of G1, G2, G8 and G9 (a) in the check tool, and G7 with the file names of win-acme.
- **Red:** (0) Record the counts of `npm run verify` on `main`. On the owner's PC, run `npm run local-name:check` and
  record the old last line. (1) Write the test cases first.
  `npx vitest run --project unit tests/tools/local-name-check.test.ts` fails: `CHECK_IDS` has no `dns-public`,
  `dns-pc-servers`, `cert-issuer` or `own-issuer-absent`. (2)
  `npx vitest run --project unit tests/tools/nginx-config.test.ts` fails: the file says `CERT_DIR/LOCAL_NAME.pem`.
- **Green:** (1) `npx vitest run --project unit tests/tools/local-name-check.test.ts tests/tools/nginx-config.test.ts`
  passes, with at least these cases:
  - all fakes good: 10 `PASS` lines, `local name: 10/10 checks pass`, exit 0;
  - the public server answers another address: `FAIL dns-public` with both addresses;
  - the adapter lists `192.0.2.53` and `fd00::53`, and `fd00::53` gives an empty answer: `FAIL dns-pc-servers` that
    names `fd00::53`, and the fake resolver received `[fd00::53]:53`;
  - the TLS and HTTPS fakes record their options: no check gives a `ca` option;
  - the real TLS function against a local TLS server with a self-signed certificate: `FAIL tls` (record the literal
    error code);
  - an issuer organization other than `Let's Encrypt`: `FAIL cert-issuer`. A certificate without the name:
    `FAIL cert-issuer`. A certificate at 80 % of its lifetime: `FAIL cert-issuer`. At 50 %: `PASS cert-issuer` with
    its serial number;
  - one Root certificate `CN=local home issuer`: `FAIL own-issuer-absent`. One file in the old tls folder:
    `FAIL own-issuer-absent`;
  - each failure gives exit 1.

  (2) `git ls-files deploy/local-name/ca.cnf tests/tools/ca-name-limit.test.ts` prints nothing. (3)
  `git grep -n -e "home.arpa" -e "Technitium" -e "mkcert" -e "LOCAL_NAME_LIMIT" -- . ":!docs"` prints only the lines
  of the README part "If you set up the first design". (4) `node scripts/lang-scan.mjs --check-baseline` prints
  `baseline check: ok`. (5) `npm run verify` exits 0, or fails only with the failures that `main` has at the time
  (write them down). (6) On the owner's PC, `npm run local-name:check` prints the 10 new ids and a last line
  `local name: <n>/10 checks pass`. Record `<n>` as the baseline of N3.
- **Stub check:** a tool that keeps the old checks fails each case of a new id. A `tls` check that gives the old
  `local-ca.pem` as `ca` fails the "no `ca` option" case. A `cert-issuer` that reads only the issuer passes the 80 %
  certificate, so that case fails.
- **Ratchet:** the 4 cases of `tests/tools/ca-name-limit.test.ts` go away with the deleted file. The unit count after
  N6 must still be above the count before N6. `local name: <n>/10` with the new checks is the baseline of N3.

## N3 - Machine setup on the owner's PC, the DNS record and the phones

**Who:** an agent and the owner. The issue carries `loop:needs-human`, because some steps need what only the owner
has: the Cloudflare login (the record and the token), the token itself, the router password (step 3) and the Windows
administrator prompt. The agent prepares each command. It runs each administrator step as one script through
`Start-Process -Verb RunAs` with a log file, so the owner clicks one prompt. The agent never sees or types the token
or a password.

**Files:** `docs/plans/2026-11-19-local-name-evidence.md` (section `## N3`). No code.

**Steps:** the README section of N6, in order, on the owner's PC, with these points:
1. Red: `npm run local-name:check` prints the baseline of N6.
2. The owner adds the A record in Cloudflare, "DNS only". The agent tests it with `Resolve-DnsName` against `1.1.1.1`.
3. The router: the owner makes or confirms the DHCP reservation of `<pc-ip>` (spec D15).
4. The DNS of the PC (spec D14), through the administrator script. Then `Get-DnsClientServerAddress` of the Wi-Fi
   adapter shows only the four Cloudflare addresses.
5. The owner makes the token and types it into win-acme in the administrator window. The agent records the PEM file
   names and the name of the win-acme task. If the file names differ from `<name>-chain.pem` and `<name>-key.pem`, the
   agent opens a fix issue for `deploy/local-name/nginx.conf` that blocks this task.
6. nginx: the deployed `C:\nginx\conf\castra.conf` gets the new name and `CERT_DIR` = `C:/ProgramData/castraferrum/tls`.
   `nginx -t` passes, then nginx reloads.
7. The own issuer leaves the PC (spec D16).
8. The `.env` of the main checkout: `LOCAL_NAME` and `LOOPS_PUBLIC_URL` with the new name, and no `LOCAL_NAME_LIMIT`.
   The console starts without `--remote`.
9. The check runs to 10/10.
10. Goal G9 (b) and (c): an administrator script makes win-acme renew at once (`wacs.exe --renew --force`, not
    verified), and writes the win-acme task (`Get-ScheduledTask`, `Get-ScheduledTaskInfo`) into its log. Then the
    check runs again. This uses 2 of the 5 certificates that Let's Encrypt gives for one name in 7 days.

**Verify**
- **Goal:** G1 to G4 and G7 to G9 on the real machine.
- **Red:** `npm run local-name:check` prints the baseline of N6 and exits 1.
- **Green:** (1) `npm run local-name:check` prints 10 `PASS` lines and `local name: 10/10 checks pass`, and exits 0.
  (2) After step 10, the `cert-issuer` line shows a serial number other than the one in (1), and the tool still prints
  `local name: 10/10 checks pass`. (3) The log of the step 10 script shows the win-acme task with a daily trigger and
  an action that runs `wacs.exe` with `--renew`.
- **Stub check:** each check talks to the real program on the real port. A step that is not done leaves its check at
  `FAIL`. Without the reload step of win-acme, (2) shows the old serial number.
- **Ratchet:** `local name: <n>/10` goes from the baseline of N6 to 10/10.

## N4 - Verify every goal and do the agent acceptance

**Files:** `goals/verify/local-name.json` (new: one entry per goal G1 to G9, with the command and its expected
output), `docs/plans/2026-11-19-local-name-evidence.md` (section `## N4`).

The agent does what the owner does, from the PC:
- `npm run goal:check -- goals/verify/local-name.json`;
- `LC_LOCAL_NAME=1 npx playwright test tests/e2e/local-name-real.spec.ts`: Chromium, with certificate errors not
  ignored, opens the address of `LOOPS_PUBLIC_URL`, signs in, starts a loop and sees Running in 2 seconds;
- `E check --dry-run` on N0, N1, N2, N3, N5 and N6.

The entry of G9 runs the check tool and expects `PASS cert-issuer`. Its parts (b) and (c) need administrator rights,
so the entry cites the N3 evidence section and does not run them again.

**Verify**
- **Goal:** G1 to G9 hold together on `main` and on the real machine.
- **Red:** before the manifest exists, `npm run goal:check -- goals/verify/local-name.json` fails on the missing file.
- **Green:** (1) `npm run goal:check -- goals/verify/local-name.json` prints `goals passed: 9/9`. (2) The real e2e reports
  1 passed. (3) `E check --dry-run` gives PASS for N0, N1, N2, N3, N5 and N6.
- **Stub check:** a manifest entry with a command that always exits 0 is not allowed. Each entry runs one of the
  oracles of spec section 3. A failing goal becomes a fix issue that blocks this task.
- **Ratchet:** goals passed 0/9 to 9/9.

## Follow-up outside the phase

- The real phone: set its DNS (spec D14), open the name, and sign in. No goal waits for it.
- Task R6 (the Cloudflare tunnel, issue 61): the owner takes it off hold after this phase (2026-11-20).
