# Plan: a local name and HTTPS on the home network (phase 3)

- Date: 2026-11-19
- Spec: [../specs/2026-11-19-local-name.md](../specs/2026-11-19-local-name.md) (goals G1 to G7, decisions D1 to D12)
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

Machine facts in this plan use `<pc-ip>` for the IP address of the owner's PC. The repository never holds the real
address. The check tool finds it at run time.

## Task overview

| Task | What | Goals | Waits for |
|---|---|---|---|
| N0 | Baseline numbers; the check tool `scripts/local-name-check.mjs` | G1 to G4 (the oracle) | - |
| N1 | Castraferrum behind a reverse proxy: `X-Real-IP` for the sign-in limit, `--public-url`, UC-42 | G5, G6 | - |
| N2 | The nginx configuration, the README section, the real e2e file | G7, G2 | - |
| N3 | **Machine setup on the owner's PC and router** (needs a person: the router password and administrator rights) | G1 to G4, G7 | N0, N1, N2 |
| N4 | Verify every goal and do the agent acceptance | G1 to G7 | N3 |

N0, N1 and N2 can run at the same time. They touch different files.

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

## N3 - Machine setup on the owner's PC and router

**Who:** an agent and the owner. The issue carries `loop:needs-human`, because two steps need what only the owner
has: the router's admin password (step 7) and the Windows administrator prompt (steps 1, 5 and 6). The agent does the
other steps and prepares each command for the owner.

**Files:** `docs/plans/2026-11-19-local-name-evidence.md` (section `## N3`). No code.

**Steps:** the README section of N2, in order, on the owner's PC.

**Verify**
- **Goal:** G1 to G4 and G7 on the real machine.
- **Red:** `npm run local-name:check` prints the N0 baseline, for example `local name: 0/8 checks pass`, and exits 1.
- **Green:** `npm run local-name:check` prints 8 `PASS` lines and `local name: 8/8 checks pass`, and exits 0.
- **Stub check:** each check talks to the real program on the real port. A step that is not done leaves its check at
  `FAIL`.
- **Ratchet:** `local name: <n>/8` goes from the N0 baseline to 8/8.

## N4 - Verify every goal and do the agent acceptance

**Files:** `goals/verify/local-name.json` (new: one entry per goal G1 to G7, with the command and its expected
output), `docs/plans/2026-11-19-local-name-evidence.md` (section `## N4`).

The agent does what the owner would do, from the PC:
- `npm run goal:check -- goals/verify/local-name.json`;
- `LC_LOCAL_NAME=1 npx playwright test tests/e2e/local-name-real.spec.ts`: Chromium, with certificate errors not
  ignored, opens `https://castra.home.arpa`, signs in, starts a loop and sees Running within 2 seconds;
- `E check --dry-run` on N0 to N3.

**Verify**
- **Goal:** G1 to G7 hold together on `main` and on the real machine.
- **Red:** before the manifest exists, `npm run goal:check -- goals/verify/local-name.json` fails on the missing file.
- **Green:** (1) `npm run goal:check -- goals/verify/local-name.json` prints `goals passed: 7/7`. (2) The real e2e reports
  1 passed. (3) `E check --dry-run` gives PASS for N0 to N3.
- **Stub check:** a manifest entry with a command that always exits 0 is not allowed. Each entry runs one of the
  oracles of spec section 3. A failing goal becomes a fix issue that blocks this task.
- **Ratchet:** goals passed 0/7 to 7/7.

## Follow-up outside the phase

The real phone: copy `rootCA.pem` to the phone, open `https://castra.home.arpa`, and sign in. No goal waits for it.
