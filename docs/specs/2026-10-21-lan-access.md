# Spec: local network access and phone layout (phase 1)

- Date: 2026-10-21
- Status: approved by the owner in conversation; owner reviews this document after merge
- Plan: [../plans/2026-10-21-lan-access.md](../plans/2026-10-21-lan-access.md)
- Next phase: [2026-10-21-remote-access.md](2026-10-21-remote-access.md) (sign-in with username and password,
  Cloudflare Tunnel)

## 1. Context

The server listens on `127.0.0.1` only (`server/main.ts`: `app.listen({ host: '127.0.0.1', port })`), so the console
can be opened only from the machine that runs it. The port comes from `LOOPS_PORT`; there are no command-line flags.

The UI was designed for a desktop: every approved reference shot is 1440x900, and the only responsive rule is
one media query below 1100px (`--bp-split`, `design/components.css`) that drops the list/main split. Row actions
(Stop, the row menu) appear on hover, which a touch screen does not have. Nobody has looked at the console on a
phone-sized screen.

This phase adds two features:

1. **Network access, opt-in:** a `--host` flag makes the server listen on another interface (for example
   `0.0.0.0`), so other devices on the same local network can open the console at `http://<machine-ip>:<port>/`.
   The startup output lists those addresses. Without the flag nothing changes.
2. **Phone layout:** every console screen works on a 390px-wide touch screen. You can create a loop, start and
   stop it, follow the live log and transcript, and register a repo, all without scrolling sideways. The layout is
   first drawn as an approved preview, like every earlier UI change.

The baseline numbers (test counts, `uc-coverage`, phone overflow count) are measured by the first plan task with
committed tools, never copied from this document.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Listening beyond loopback is opt-in** through `--host=<address>` (or `LOOPS_HOST`). The default stays `127.0.0.1`. | The console runs agents with full permissions in the owner's repositories. Exposing it must be a deliberate act, and existing users must see no change. |
| D2 | **Command-line flags** are parsed by `server/config.ts` (the environment layer). `npm start -- --host=0.0.0.0 --port=7170` and `npm start --host=0.0.0.0 --port=7170` both work. In the second form npm keeps the flag and hands it to the script as `npm_config_host`. Precedence: argument, then `npm_config_<name>`, then `LOOPS_<NAME>` from the environment or `.env`, then the default. An unknown flag or a flag without a value stops the server with exit code 2 and the usage text; `--help` prints the usage text and exits 0. | The owner asked for flags on `npm start`. npm 11 accepts the form without `--` but warns `Unknown cli config "--host". This will stop working in the next major version of npm.` (measured 2026-10-21, npm 11.17.0), so the README recommends the `--` form and the code supports both. Typos such as `--hots` must not silently fall back to the default. |
| D3 | **Startup lists every address the console answers on.** With `--host=0.0.0.0` the log prints `Castraferrum: http://127.0.0.1:<port>` and one `On your network: http://<ipv4>:<port>` line per non-internal IPv4 address (`os.networkInterfaces()`). With a specific address it prints that address. | A phone user needs the machine's IP address, and finding it by hand on Windows means reading `ipconfig`. |
| D4 | **No sign-in in this phase.** When the server listens beyond loopback without credentials, it prints one warning line: `Warning: anyone on this network can open the console and run agents on this machine.` Phase 2 adds `--username` and `--password` and changes the hint. | The owner scoped sign-in to phase 2. The warning keeps the risk visible. |
| D5 | **The phone layout is a new approved preview** first: phone states in `design/preview/states.js` with `vp: [390, 844]` and ids starting with `phone-`, shot in light and dark. The owner approves them before any app CSS changes. New rules stay in `design/components.css` and read only `design/tokens.css`; a missing value becomes a token only after owner approval (the rule in `design/README.md`). | Every UI change here follows "the preview is the source of truth" (`design/APPROVED.md`). The visual tests compare the app with approved shots, so the shots must exist first. |
| D6 | **Touch has no hover.** On the phone layout, every action that is hover-only on the desktop (row Stop, row menu) has a visible, tappable control at least 44x44 CSS pixels. The preview decides where. | Without it a phone cannot stop a loop from the list. 44px is the common minimum touch target. |
| D7 | **The Windows firewall is documented, not automated.** The README explains the first-run "allow access" dialog, the Private network profile, and the one PowerShell command that adds an inbound rule for the port. | Adding a firewall rule needs administrator rights and is the owner's decision. The console should not do it silently. |
| D8 | **Out of scope:** HTTPS on the local network, a local host name (mDNS), installing as an app (PWA), IPv6 addresses in the startup list (`--host=::` may work but is not tested). | Keep the phase small. Phase 2 brings HTTPS through the tunnel. |

## 3. Goals

Each goal states what a person sees, and the oracle that proves it. The oracle has the same kind as the claim,
and it fails for an empty or stub implementation.

| # | Goal (outcome) | Oracle | Why a stub fails |
|---|---|---|---|
| G1 | Started with `--host=0.0.0.0`, the console answers at `http://<machine-ipv4>:<port>/` and works there. Started without `--host`, the same address refuses the connection, while `127.0.0.1` answers. | e2e `@UC-33` (`tests/e2e/network.spec.ts`): a real `server/main.ts` started with `--host=0.0.0.0` on a free port. A phone-sized browser context opens `http://<first non-internal IPv4>:<port>/`, sees the loop list, starts a loop and sees it running, then stops it. A second test starts the server without `--host`: `fetch` to the IPv4 address fails with `ECONNREFUSED`, and `/api/health` on `127.0.0.1` answers 200. | Doing nothing keeps `127.0.0.1`, so the IPv4 address is refused and the first test is red. Always binding `0.0.0.0` turns the second test red. |
| G2 | The startup output tells the person where to point the phone: one `On your network: http://<ipv4>:<port>` line per address, plus the D4 warning. | The same e2e reads the server's stdout and finds `On your network: http://<that ipv4>:<port>` and the warning line. A unit test of the URL-list function covers `0.0.0.0` with two interfaces, a specific address, and loopback (no network line, no warning). | Without the change the log has neither line. A hard-coded address fails the two-interface unit case. |
| G3 | Flags work in both npm forms and fail loudly on mistakes: `npm start -- --host=X --port=Y`, `npm start --host=X --port=Y`, `LOOPS_HOST` in `.env`; `--help` prints the usage; an unknown flag exits 2. | Unit tests of `loadConfig(env, argv)` for each source and the precedence order, each invalid input, and the usage text. A process test spawns `node --import tsx server/main.ts --nope`, then `--help`, and asserts the exit codes 2 and 0 and the usage text. | No parser: `--nope` is ignored, the exit code is not 2, and the unit tests fail on the missing export. |
| G4 | On a 390x844 touch screen every console screen matches the approved phone preview, and the core actions work without sideways scrolling: create a loop, start it, stop it, follow the live log and the transcript of a run, register a repo. | (a) Visual: `tests/visual/phone.visual.ts` compares every `phone-*` state with its approved shot, light and dark, per region, under `MAX_RATIO`. (b) Behaviour: e2e `@UC-34` at 390x844 with touch performs each action by tapping. (c) Measurement: `npm run phone:check` prints `phone overflow: 0/6 screens`, while the baseline measured before any CSS change is above 0. | Without phone CSS the visual diffs exceed the threshold, the overflow count stays at the baseline, and the hover-only Stop cannot be tapped. |
| G5 | Someone who has never set this up can open the console from a phone by following the README alone, including the Windows firewall step. | Owner acceptance: the owner follows the README "Open from another device" section word for word on the real phone and home network. | An absent section gives the owner nothing to follow. |
| G6 | The owner accepts the result. | The owner opens the console from a real phone on the same network, starts and stops a loop, compares the phone screens with the approved phone preview, and signs off on the acceptance issue. | Only the owner's own comment counts. |

## 4. The flag set after this phase

| Flag | Environment | Default | Meaning |
|---|---|---|---|
| `--host=<address>` | `LOOPS_HOST` | `127.0.0.1` | Interface to listen on; `0.0.0.0` = every IPv4 interface |
| `--port=<1-65535>` | `LOOPS_PORT` | 7070 | API and UI port (the existing variable, now also a flag) |
| `--help` | - | - | Print the usage text and exit 0 |

Value syntax: `--name=value` or `--name value`. Phase 2 adds `--username`, `--password`, `--tunnel-token`,
`--cloudflared` and `--public-url` to the same parser.

## 5. Use cases added

| ID | Use case | Observable result |
|---|---|---|
| UC-33 | **Open the console from another device on the local network** - start with `--host=0.0.0.0` | The console answers and works at `http://<machine-ipv4>:<port>/`; the startup output lists that URL and the warning; without `--host` the address refuses the connection |
| UC-34 | **Use the console on a phone** - 390px wide, touch | Every screen matches the approved phone preview; create, start, stop, live log, transcript and repo registration all work by tapping, with no sideways scrolling |

`npm run verify` raises `uc-coverage --min` from 32 to 34 over the phase.

## 6. Out of scope

Everything in D8, sign-in (phase 2), and changes to the desktop layout. The desktop reference shots must stay
unchanged: every existing visual test stays green with its current threshold.
