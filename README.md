# Castraferrum

Castraferrum is a UI that runs, watches and manages agent loops. A loop is a prompt, a cron schedule and a
repository. Each time the schedule fires, one new Claude Code session starts in that repository.

## How it works

```mermaid
flowchart TB
  engineer(["Engineer<br/>runs and watches agent loops"])

  subgraph castra["Castraferrum"]
    ui["Web UI<br/>React, Vite<br/>shows loops, runs and transcripts"]
    server["Server<br/>Node, Fastify, one process<br/>schedules loops and controls runs"]
    db[("Database<br/>PostgreSQL in Docker<br/>holds loops, runs and logs")]
  end

  claude["Claude Code<br/>external, uses the machine's login<br/>one new session per run"]
  repo[/"Registered repositories<br/>on the same machine"/]
  sessions[/"Session files<br/>JSONL, written by Claude Code"/]

  engineer -- "uses" --> ui
  ui -- "sends commands<br/>HTTP JSON" --> server
  server -- "sends live updates<br/>SSE" --> ui
  server -- "reads and writes<br/>SQL" --> db
  server -- "starts a session<br/>Agent SDK" --> claude
  claude -- "changes code" --> repo
  claude -- "writes" --> sessions
  server -- "reads the transcript" --> sessions
```

The engineer works in the Web UI, and the Server does the work. The Server keeps the schedule and the run history
in PostgreSQL. The Server fires each schedule by itself, so no browser needs to be open. For each run, the Server starts one new Claude
Code session in the registered repository, with the Claude Code login of the machine. The Server reads the session
file that Claude Code writes, so PostgreSQL holds no copy of the transcript. The components in the Server and the
full flow of a run are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Screens

![The Loops page (light)](design/ds/preview/shots/loops-overview-light.png)

![A running loop (dark)](design/ds/preview/shots/loop-running-dark.png)

The screens follow the design system in [design/ds/](design/ds/) ([SYSTEM.md](design/ds/SYSTEM.md), the
design-system page `design/ds/index.html` and the approved preview `design/ds/preview/`); see
[design/README.md](design/README.md).

## Requirements

- Node 24 or newer (`node --version`).
- Docker (Docker Desktop on Windows and macOS) for PostgreSQL only.
- Claude Code installed and logged in on the same machine. The console uses that login; it never uses an
  `ANTHROPIC_API_KEY`.

## Quickstart

```bash
npm ci
docker compose up -d
npm run build
npm start
```

Then open <http://127.0.0.1:7070>. `npm ci` also downloads Chromium for the Playwright tests (about 150 MB the
first time). `docker compose up -d` starts Postgres on `127.0.0.1:55432` with the databases `loops` (real use)
and `loops_test` (tests). To serve on another port, set `LOOPS_PORT` before `npm start`:

```bash
LOOPS_PORT=7170 npm start      # PowerShell: $env:LOOPS_PORT = '7170'; npm start
npm start -- --port=7170       # the same, as a flag
npm start --remote             # listen on every interface (phones on the same Wi-Fi); same as --host=0.0.0.0
```

The server does not start by itself: leave the `npm start` window open while you use the UI. The UI is served
from `dist/web`, so rerun `npm run build` after pulling new code. The first thing to do in the UI is register a
repository on the Repos page (**Add a repo** opens a folder picker), then create a loop that uses it.

## Open from another device

To use the console from a phone on the same Wi-Fi, start it with `--remote`:

```bash
npm start --remote                     # listen on every IPv4 interface (same as --host=0.0.0.0)
npm start -- --host=192.168.1.20       # the second form: listen on one address only
```

The startup log lists the addresses to open on the phone, one line for each non-internal IPv4 address:

```text
Castraferrum: http://127.0.0.1:7070  (DB postgres://loops:***@127.0.0.1:55432/loops)
On your network: http://192.168.1.20:7070
Warning: anyone on this network can open the console and run agents on this machine.
Set --username and --password to require sign-in.
```

**Read the warning.** The console runs agents with full permissions in your repositories.
Use `--remote` only on a network that you trust. To require a sign-in, set a username and a password (at least 8
characters), best in `.env` as `LOOPS_USERNAME` and `LOOPS_PASSWORD`: a command line is visible to other processes
and to shell history. With both set, the startup log prints `Sign-in: on (user <name>)` instead of the warning.
Setting only one of them, or a shorter password, stops the server with exit code 2.

On Windows the first start shows a firewall dialog for `node.exe`. Allow access on the **Private** network profile only.
To add the rule yourself, run this once in an administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Castraferrum 7070" -Direction Inbound -Protocol TCP -LocalPort 7070 -Action Allow -Profile Private
```

If the phone cannot connect, check that the phone and the machine are on the same network and that the network profile is Private.

## Open with a name on your network

This section gives the console the address `https://castra.example.com` on your home network. It needs a domain that
you own. Three parts do the work: a public DNS record (the name), nginx (HTTPS) and win-acme (a free Let's Encrypt
certificate that renews itself). The design is in [ADR 0005](docs/adr/0005-local-name-through-dns-and-reverse-proxy.md)
and the files are in [`deploy/local-name/`](deploy/local-name/README.md). In the commands, `<pc-ip>` is the IP address
of this PC on the home network, `<name>` is your console name, and `<repo>` is the folder of this repository.
The repository holds only the sample name `castra.example.com`. Your own name stays on your machine (spec D13).

Two limits to know first:

- The public record points to a private address (`<pc-ip>`). Many routers delete such an answer. So each device that
  opens the console must ask Cloudflare DNS directly (step 4). A device without that setting cannot open the console,
  for example a guest's phone or a TV.
- When the PC is off, the console does not open.

1. Choose the two values and put them in `.env` (they are commented in `.env.example`):

   | Value | Meaning | Sample |
   |---|---|---|
   | `LOCAL_NAME` | The name of the console on this machine. | `castra.example.com` |
   | `LOOPS_PUBLIC_URL` | `https://` plus `LOCAL_NAME`. | `https://castra.example.com` |

   Write your own name instead of the sample.
2. At your DNS provider, add an A record for `LOCAL_NAME` with the value `<pc-ip>`. At Cloudflare, set it to "DNS only"
   (proxy off): the Cloudflare proxy cannot reach a private address. Test it:

   ```powershell
   Resolve-DnsName <name> -Server 1.1.1.1 -DnsOnly
   ```

   The answer is `<pc-ip>`.
3. In the router, reserve `<pc-ip>` for this PC (the router page often called "Reserved IP" or "static lease"). The
   record holds a fixed address. When the PC gets another address, the name points to the old one.
4. Set the DNS servers of each device that opens the console. The router deletes the answer of a public name that points
   to a private address, so the device must not ask the router. On the PC, in an administrator PowerShell
   (`Get-NetAdapter` lists the adapter names):

   ```powershell
   Set-DnsClientServerAddress -InterfaceAlias "<adapter>" -ServerAddresses ("1.1.1.1","1.0.0.1","2606:4700:4700::1111","2606:4700:4700::1001")
   ```

   Both address families are needed. Otherwise Windows can ask the IPv6 DNS address of the router and get an empty
   answer. The menu names below are not verified on every phone:
   - Android: Settings, Network & internet, Private DNS, "Private DNS provider hostname", `one.one.one.one`.
   - iPhone: Settings, Wi-Fi, the "i" of your network, Configure DNS, Manual. Delete the old servers and add the same
     four servers.
5. Install nginx and win-acme. nginx has a winget package. win-acme has none (`winget search win-acme` finds no
   package), so download it:

   ```powershell
   winget install --id nginxinc.nginx
   ```

   - win-acme: download the release ZIP from <https://www.win-acme.com/> (its Download menu links to the GitHub
     releases). Measured with v2.4.1: take the asset `win-acme.v2.4.1.2444.x64.pluggable.zip`, because the trimmed
     build does not load plugins. `wacs.exe` is signed (SignPath Foundation). Unzip it to a folder that stays, for
     example `C:\Program Files\win-acme`.
   - The Cloudflare DNS plugin: the asset `plugin.validation.dns.cloudflare.v2.4.1.2444.zip` of the same release
     (<https://www.win-acme.com/reference/plugins/validation/dns/cloudflare>). Unzip it into the folder of
     `wacs.exe` and unblock the `.dll` files (file Properties, General, Unblock).
6. Make the Cloudflare API token (Cloudflare, My Profile, API Tokens, Create Token; checked on 2026-11-20). Use
   "Start from scratch", then add Policies with two permissions, Zone DNS Edit and Zone Zone Read. In the zone
   resources choose "All zones from an account". The win-acme plugin needs that scope: the owner accepted it on
   2026-11-20, and a token for a single zone is not supported. A stolen token can change the records of every zone of
   the account, so keep it only in win-acme. Set Token expiration to "No expiration". The default "1 year" stops the
   renewals after one year. The token goes only into win-acme. Never put it in a chat, in `.env`, in the repository
   or in a log.
7. Make the folder for the certificate files and limit it to SYSTEM and Administrators, in an administrator PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force C:\ProgramData\castraferrum\tls
   icacls C:\ProgramData\castraferrum\tls /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
   ```
8. In the same administrator PowerShell, in the win-acme folder, run win-acme with full options. This command ran
   on the owner PC on 2026-11-20 with win-acme v2.4.1. Replace `<token>` with your token and `<name>` with your
   name. The options are: Let's Encrypt as the certificate authority (win-acme v2.4.1 uses ZeroSSL by default, and
   the first run then stops with `ZeroSSL requires an account to use`), `--source manual` (the old option `--target` is not accepted),
   DNS validation through Cloudflare, the PEM store in that folder, a script step that reloads nginx, and the
   renewal task. `--emailaddress` is not needed for Let's Encrypt.

   ```powershell
   .\wacs.exe --baseuri https://acme-v02.api.letsencrypt.org/ --source manual --host <name> --validation cloudflare --cloudflareapitoken <token> --store pemfiles --pemfilespath C:\ProgramData\castraferrum\tls --installation script --script C:\nginx\nginx.exe --scriptparameters "-p C:/nginx/ -c C:/nginx/conf/castra.conf -s reload" --accepttos --setuptaskscheduler
   ```

   win-acme writes `<name>-chain.pem` (the certificate and its intermediate certificates) and `<name>-key.pem` into
   the folder. nginx uses these two files. win-acme also writes `<name>-crt.pem`, `<name>-chain-only.pem`,
   `<name>-chain-full.pem` and `<name>-chain-only-full.pem`, which nginx does not use. With `--setuptaskscheduler`
   win-acme makes its own Task Scheduler task for the renewal.

   The script step of this first run fails with `OpenEvent("Global\ngx_reload_<pid>") failed (5: Access is
   denied)`. The reason: this window runs as your user, and nginx runs as SYSTEM, so only SYSTEM can signal it. The
   renewal task runs as SYSTEM, so its reload works (measured: a forced renewal through a SYSTEM task gave `Script
   finished`, and nginx served the new certificate). To load the first certificate, run this reload once as
   SYSTEM, in the same administrator PowerShell (alternative: restart the task `Castraferrum nginx` of step 10):

   ```powershell
   $a = New-ScheduledTaskAction -Execute C:\nginx\nginx.exe -Argument "-p C:/nginx/ -c C:/nginx/conf/castra.conf -s reload" -WorkingDirectory C:\nginx; Register-ScheduledTask -TaskName "Castraferrum reload once" -Action $a -User SYSTEM -RunLevel Highest -Force; Start-ScheduledTask "Castraferrum reload once"; Unregister-ScheduledTask "Castraferrum reload once" -Confirm:$false
   ```
9. Copy `deploy/local-name/nginx.conf` into the nginx folder, for example `C:\nginx\conf\castra.conf`. In the copy,
   replace `LOCAL_NAME` with your name, and replace `CERT_DIR` with `C:/ProgramData/castraferrum/tls` (forward
   slashes). Then check the copy in the same administrator PowerShell. A normal user cannot read the certificate
   folder, so `nginx -t` fails there with an input/output error:

   ```powershell
   C:
ginx
ginx.exe -p C:/nginx/ -t -c C:/nginx/conf/castra.conf
   ```

   The output must say `syntax is ok` and `test is successful`. Without administrator rights, use
   `npm run local-name:check`: its `nginx-test` check tests the copy with a temporary key pair.
10. Make nginx start at boot. nginx for Windows has no service mode, so use Task Scheduler. Run this in an
    administrator PowerShell, with the real paths:

    ```powershell
    $action  = New-ScheduledTaskAction -Execute "C:\nginx\nginx.exe" -Argument "-c C:/nginx/conf/castra.conf" -WorkingDirectory "C:\nginx"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    Register-ScheduledTask -TaskName "Castraferrum nginx" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest
    Start-ScheduledTask -TaskName "Castraferrum nginx"
    ```
11. Open the firewall for HTTP and HTTPS on the Private profile only, and close port 7070. Run this in an
    administrator PowerShell:

    ```powershell
    New-NetFirewallRule -DisplayName "Castraferrum nginx" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Private
    Remove-NetFirewallRule -DisplayName "Castraferrum 7070"
    ```
12. Start Castraferrum **without** `--remote`, so that only nginx can reach port 7070. `LOOPS_PUBLIC_URL` is in `.env`
    (step 1). The startup log then prints `Open: <that address>`.
13. Check the whole chain: public DNS, the DNS servers of the PC, certificate, redirect, live updates and the closed port.

    ```bash
    npm run local-name:check
    ```

    The last line is `local name: 10/10 checks pass` when all is well. The tool reads the name from `LOOPS_PUBLIC_URL`.

### If you set up the first design

An earlier design of this section used Technitium DNS Server and an own issuer of certificates
(`CN=local home issuer`). Remove them. The check `own-issuer-absent` fails until you do.

```powershell
certutil -user -delstore Root "local home issuer"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\castraferrum\tls"
Remove-NetFirewallRule -DisplayName "Castraferrum DNS"
```

Uninstall Technitium DNS Server in Windows Settings, Apps. Then set the DNS servers of the PC as in step 4, because the
Technitium installer set them to `127.0.0.1` and `::1`. Also remove the DNS server that you gave in the DHCP settings of
the router.

## Configuration

Defaults work with no configuration. To change ports copy `.env.example` to `.env`; compose, the server, Vitest
and Playwright all read it.

| Variable | Flag | Default | Meaning |
|---|---|---|---|
| `LOOPS_PORT` | `--port` | 7070 | API and UI port |
| `LOOPS_HOST` | `--host` | `127.0.0.1` | Interface to listen on (`0.0.0.0` = every IPv4 interface). |
| `LOOPS_REMOTE` | `--remote` | off | `1` = same as `--host=0.0.0.0`. |
| `LOOPS_USERNAME` | `--username` | unset | Turns sign-in on; needs `LOOPS_PASSWORD`. |
| `LOOPS_PASSWORD` | `--password` | unset | At least 8 characters; needs `LOOPS_USERNAME`. Prefer `.env` to the flag (shell history). |
| `LOOPS_PG_PORT` | - | 55432 | Postgres port on the host |
| `LOOPS_E2E_PORT` | - | 7071 | Port of the e2e server |
| `DATABASE_URL` | - | derived from `LOOPS_PG_PORT` | Use when Postgres is elsewhere |
| `LOOPS_TEST_DATABASE_URL` | - | derived from `LOOPS_PG_PORT` | Test database |
| `LOOPS_COMPOSE_PROJECT` | - | `loop-console` | Docker Compose project name |
| `LOOPS_PG_CONTAINER` | - | `loop_console_pg` | Name of the Postgres container |
| `LOOPS_PG_VOLUME` | - | `loop_console_pg` | Name of the Postgres data volume (the default holds real loop history) |

`LOOPS_TEST_MODE=1` works only with a database whose name ends in `_test`. Several checkouts can run tests in
parallel on one container if each one sets its own `LOOPS_TEST_DATABASE_URL` and `LOOPS_E2E_PORT`.

## Scripts

| Script | What it does |
|---|---|
| `node scripts/logon-task.mjs [--console-dir <abs>] [--port 7070] [--task-name Castraferrum] [--out <file>]` | Prints Windows Task Scheduler XML that starts the console at log-on. With `--out` it writes the XML file and prints the one `schtasks /Create` line for you to run. The script never installs the task. |
| `node scripts/merge-audit.mjs -R <owner/name> --since <ISO date> [--json]` | Lists each PR merged since the date whose head commit has no `castraferrum/gate` status of `success`. Writes nothing to GitHub. Exit 0: none. Exit 1: incidents. Exit 2: a bad argument or a failed `gh` call. |
| `npm run local-name:check -- [--pc-ip=<address>] [--nginx=<path>] [--nginx-conf=<path>] [--name=<name>] [--public-dns=<address>]` | Tests the local name chain on this PC: the public DNS record, the DNS servers of the PC, nginx, TLS, the Let's Encrypt certificate and its age, the absence of the old own issuer, redirect, live updates, port 7070. The name is the host of `LOOPS_PUBLIC_URL` (`--name` replaces it); the public DNS server is `1.1.1.1` (`--public-dns` replaces it). Prints `PASS` or `FAIL <id>: <reason>` for 10 checks and `local name: <n>/10 checks pass`. Exit 0 only when all 10 pass. It only reads; it changes no setting. |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, flows, persistence, tests.
- [docs/USE-CASES.md](docs/USE-CASES.md): the use cases.
- [design/README.md](design/README.md): the design system and how a UI change starts from it.
- [docs/API.md](docs/API.md): the HTTP surface.
- [docs/adr/](docs/adr/): decision records.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on the code.
