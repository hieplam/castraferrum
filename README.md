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

This section gives the console the address `https://castra.home.arpa` on your home network. Three programs on the PC
do the work: Technitium DNS Server (the name), nginx (HTTPS) and mkcert (the certificate). The design is in
[ADR 0005](docs/adr/0005-local-name-through-dns-and-reverse-proxy.md) and the files are in
[`deploy/local-name/`](deploy/local-name/README.md). In the commands, `<pc-ip>` is the IP address of this PC on the home
network. `%LOCALAPPDATA%` is the Windows folder of your user data.

Read these two conditions first:

- The router must give the PC as the **only** DNS server. A device asks any DNS server that it knows. A public
  second server answers that the name does not exist, so the name then fails at random.
- If the router also gives IPv6 DNS servers, turn that off for the same reason.

When the PC is off, the Wi-Fi finds no names until the PC starts again.

1. Install the three programs. Run each command in a normal PowerShell.

   ```powershell
   winget install --id nginxinc.nginx        # nginx (nginx.org/en/download.html is the other source)
   winget install --id FiloSottile.mkcert    # mkcert
   ```

   Technitium DNS Server has no winget package. Download the installer from <https://technitium.com/dns/> and run it.
   It installs a Windows service that starts at boot.
2. Open the Technitium web page (`http://localhost:5380`). Make the primary zone `home.arpa`. Add the A record
   `castra` with the value `<pc-ip>`. In Settings, Proxy & Forwarders, set the forwarder `1.1.1.1`.
3. Make the certificate. The `tls` folder must exist first.

   ```powershell
   mkcert -install
   New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\castraferrum\tls"
   Set-Location "$env:LOCALAPPDATA\castraferrum\tls"
   mkcert castra.home.arpa
   ```

   The files `castra.home.arpa.pem` and `castra.home.arpa-key.pem` stay in that folder. Never commit them.
4. Copy `deploy/local-name/nginx.conf` into the nginx folder, for example `C:\nginx\conf\castra.conf`. In the copy,
   replace `CERT_DIR` with the `tls` folder from step 3, written with forward slashes. Then check the copy:

   ```powershell
   nginx -t -c C:/nginx/conf/castra.conf
   ```

   The output must say `syntax is ok` and `test is successful`.
5. Make nginx start at boot. nginx for Windows has no service mode, so use Task Scheduler. Run this in an
   administrator PowerShell, with the real paths:

   ```powershell
   $action  = New-ScheduledTaskAction -Execute "C:\nginx\nginx.exe" -Argument "-c C:/nginx/conf/castra.conf" -WorkingDirectory "C:\nginx"
   $trigger = New-ScheduledTaskTrigger -AtStartup
   Register-ScheduledTask -TaskName "Castraferrum nginx" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest
   Start-ScheduledTask -TaskName "Castraferrum nginx"
   ```
6. Open the firewall for DNS and HTTPS on the Private profile only, and close port 7070. Run this in an
   administrator PowerShell:

   ```powershell
   New-NetFirewallRule -DisplayName "Castraferrum DNS" -Direction Inbound -Protocol UDP -LocalPort 53 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "Castraferrum nginx" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Private
   Remove-NetFirewallRule -DisplayName "Castraferrum 7070"
   ```
7. In the router, open the DHCP settings. Set the DNS server to `<pc-ip>` and leave the second DNS server empty.
   If the router gives IPv6 DNS servers, turn that off. Then renew the lease on each device (or reconnect it to the
   Wi-Fi).
8. Start Castraferrum **without** `--remote`, so that only nginx can reach port 7070. Put this in `.env`:

   ```text
   LOOPS_PUBLIC_URL=https://castra.home.arpa
   ```

   The startup log then prints `Open: https://castra.home.arpa`.
9. Check the whole chain: DNS, certificate, redirect, live updates and the closed port.

   ```bash
   npm run local-name:check
   ```

   The last line is `local name: 8/8 checks pass` when all is well. The script `local-name:check` comes from the
   task N0 of the same epic, so it can arrive on `main` before or after this section.
10. On each phone, copy `rootCA.pem` from the folder that `mkcert -CAROOT` prints, and trust it (on iOS: install the
    profile, then turn it on in Settings, General, About, Certificate Trust Settings). Turn "Private DNS" (Android) or
    any DNS profile (iOS) off, or set it to automatic. Then open `https://castra.home.arpa`.

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
| `npm run local-name:check -- [--pc-ip=<address>] [--nginx-conf=<path>]` | Tests the local name chain on this PC (`castra.home.arpa`): DNS, nginx, TLS, redirect, live updates, port 7070. Prints `PASS` or `FAIL <id>: <reason>` for 8 checks and `local name: <n>/8 checks pass`. Exit 0 only when all 8 pass. It only reads; it changes no setting. |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, flows, persistence, tests.
- [docs/USE-CASES.md](docs/USE-CASES.md): the use cases.
- [design/README.md](design/README.md): the design system and how a UI change starts from it.
- [docs/API.md](docs/API.md): the HTTP surface.
- [docs/adr/](docs/adr/): decision records.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on the code.
