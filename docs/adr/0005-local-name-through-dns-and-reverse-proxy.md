# ADR 0005: a local name and HTTPS through public DNS and a reverse proxy

- Status: superseded by [ADR 0006](0006-internet-access-through-a-named-tunnel.md) on 2026-11-20: the name moved to the
  tunnel. Before that: accepted (2026-11-19). Amended 2026-11-19: the name and the certificate issuer. Amended 2026-11-20: a bought
  domain replaces the DNS server on the PC and the own issuer.
- Related: [ADR 0006](0006-internet-access-through-a-named-tunnel.md) (proposed 2026-11-20): the console name moves to a
  Cloudflare tunnel.
- Spec: [../specs/2026-11-19-local-name.md](../specs/2026-11-19-local-name.md)

## Context

With `--remote`, a phone on the same Wi-Fi opens the console at `http://<pc-ip>:7070`
([lan-access spec](../specs/2026-10-21-lan-access.md)). That address has three problems:

1. A person must remember an IP address and a port number.
2. The traffic has no encryption. The sign-in page sends the password, and every request sends the session cookie,
   as plain text over the Wi-Fi. Castraferrum marks the cookie `Secure` only when `X-Forwarded-Proto: https`
   arrives (`server/http/auth-routes.ts`), and no request carries it today.
3. Port 7070 is open to every device on the network, because Castraferrum listens on `0.0.0.0`.

The owner wants a short name that behaves like a real public host. The first design (2026-11-19) had to cost
nothing: no bought domain and no paid service. It used a DNS server on the PC and an own certificate issuer. On
2026-11-20 the owner removed the DNS server from the PC and bought a domain at Cloudflare. "Alternatives considered"
gives the reasons.

A name needs two separate jobs:

- A **DNS server** changes the name into the IP address of the PC. With a bought domain, the public DNS servers of
  the DNS provider do this job.
- A **reverse proxy** (TCP port 443) receives the HTTPS request on that address, holds the certificate, and sends the
  request to Castraferrum on `127.0.0.1:7070`.

The home router has **DNS rebinding protection**: it deletes an answer from a public DNS server when the answer is a
private address, for example `192.168.x.x`. This protects home devices from websites that send a browser to a home
address. Measured on 2026-11-20: through the router, the public test names `192.168.1.10.nip.io` and
`10.0.0.5.sslip.io` give an empty answer, and `8.8.8.8.nip.io` gives `8.8.8.8`. Through `1.1.1.1`, all three names
give their address. The router's web interface has no page for DNS records.

## Decision

The local name is a machine setup outside the console. The console only learns to work behind a reverse proxy.

- **Name:** each machine sets its own name under a domain that its owner holds. The repository holds only the sample
  name `castra.example.com` (spec D13), because the owner does not want a personal name in a public repository.
  Later apps get other names under the same domain.
- **DNS:** a public A record at the DNS provider changes the name into the IP address of the PC. At Cloudflare the
  record is "DNS only" (proxy off), because the Cloudflare proxy cannot reach a private address. No DNS server runs on
  the PC, and the router does not change. The router deletes the answer (see Context). So each device that opens the
  console asks a public DNS server directly: the PC through its network adapter, a phone through its DNS setting
  (spec D14). A device without that setting cannot open the console, for example a guest's phone or a TV. The owner
  accepts this limit (2026-11-20).
- **Address of the PC:** the record holds a fixed address. A DHCP reservation in the router gives that address to the
  PC each time (spec D15).
- **Reverse proxy:** nginx on the PC, on TCP ports 443 (HTTPS) and 80 (a redirect to HTTPS). The repository holds the
  nginx configuration. nginx sends every request to `127.0.0.1:7070` and adds `X-Forwarded-Proto: https` and
  `X-Real-IP`. It does not buffer responses, so Server-Sent Events arrive at once.
- **Certificate:** Let's Encrypt, a public certificate authority, signs a certificate for the console name only.
  Every phone and browser trusts Let's Encrypt, so no device needs a step for the certificate. The PC proves control
  of the name with the ACME DNS-01 challenge: the ACME client writes a TXT record at the DNS provider, and Let's
  Encrypt reads it. Let's Encrypt never connects to the PC, so no port opens to the internet. The ACME client is
  win-acme, a Windows program. It gets the certificate, renews it through its own Task Scheduler task, writes the PEM
  files for nginx, and then runs `nginx -s reload`. win-acme writes the TXT records through a Cloudflare API token.
  The token has two permissions, Zone DNS Edit and Zone Zone Read, for all zones of the account (owner decision of 2026-11-20 in issue 489: the win-acme plugin needs that scope). The owner creates the
  token and types it into win-acme. The token never enters a chat, the repository, `.env` or a log.

  The risks are smaller than with the own issuer of the first design:
  1. A stolen token can change the DNS records of every zone of the account. It cannot change the Cloudflare
     account itself, and the owner can delete the token in Cloudflare at any time. The owner accepted this on
     2026-11-20.
  2. A stolen server key can pretend to be the console name only. No device trusts another website because of it.
  3. Let's Encrypt publishes each certificate in Certificate Transparency logs, so the console name becomes public.
     The record shows a private address, which the internet cannot reach.
- **The own issuer of the first design leaves the owner's PC:** its certificate leaves the Root store of the current
  user, and its files leave `%LOCALAPPDATA%\castraferrum\tls` (spec D16).
- **Castraferrum** listens on `127.0.0.1` again (no `--remote`). So only nginx can reach port 7070. Behind the proxy,
  the sign-in attempt limit reads `X-Real-IP`, but only when the socket address is loopback. This is the same rule
  that it uses for `CF-Connecting-IP`. `--public-url` prints the name at startup.

The change of 2026-11-20 confirms a claim of the first design: a bought domain changes only DNS and the certificate.
nginx and Castraferrum stay the same.

## Alternatives considered

### Replaced on 2026-11-20

- **Technitium DNS Server on the PC as the only DNS server** (the first decision): replaced. The router's DHCP had to
  give the PC as the only DNS server, because a public second server answers that a `home.arpa` name does not exist.
  So when the PC is off, every device on the Wi-Fi finds no names. The owner removed Technitium on 2026-11-20.
- **The PC as the first DNS server and a public server as the second:** rejected by the owner (2026-11-20). On
  Windows it worked: 200 of 200 answers were correct, and with Technitium stopped Windows used the second server
  after 131 ms. But the owner rejected a DNS server on the PC in any form.
- **An own issuer with a name limit, made with `openssl`** (the first decision): replaced. Each phone needed a manual
  trust step, and the issuer certificate stayed a risk on each device that trusts it. Let's Encrypt needs no step on
  any device.

### Rejected on 2026-11-20

- **The router's DNS for every device:** not possible. The router deletes the answer (see Context), and its web
  interface has no page to allow one name.
- **Public DNS servers for every device through the router's DHCP:** rejected by the owner (2026-11-20). It changes
  the router, and it removes the rebinding protection for every device on the Wi-Fi.
- **The Cloudflare proxy on the record ("Proxied"):** rejected. The proxy sends each request from Cloudflare's
  servers, which cannot reach a private address.
- **The Cloudflare named tunnel (task R6) in this phase:** not chosen. The name then points to Cloudflare, so the
  router keeps the answer and no device needs a setting. But each request leaves the home, and the console becomes
  reachable from the internet. The owner takes R6 off hold after this phase (2026-11-20).
  [ADR 0006](0006-internet-access-through-a-named-tunnel.md) (proposed 2026-11-20) moves the console name to the
  tunnel, so nginx, win-acme and the device DNS setting of this ADR retire.
- **The HTTP-01 challenge:** not possible. Let's Encrypt then connects to port 80 of the name from the internet, and
  the internet cannot reach a private address.
- **A wildcard certificate for every name of the domain:** not chosen. One key then serves every name of the domain.
  A certificate for the names in use on this PC keeps a stolen key to those names.
- **Posh-ACME or lego with an own Task Scheduler task:** not chosen. win-acme makes its renewal task and runs a
  script after each renewal by itself. The other two stay possible, because nginx reads only the PEM files.

### Alternatives of the first design (2026-11-19)

- **The `hosts` file on each device:** rejected. A phone cannot edit it.
- **The router's own DNS page:** rejected. Only some routers have one, and the owner's router has none.
- **A wildcard DNS service such as `nip.io`:** rejected. The name must contain the IP address, so it is not short.
- **AdGuard Home or Pi-hole as the DNS server:** rejected. Their main job is ad blocking, and Pi-hole needs Linux or
  Docker.
- **The DNS server in a Docker container:** rejected. Docker Desktop starts only after a person signs in to Windows,
  so DNS stops for the whole Wi-Fi when nobody is signed in.
- **Caddy as the reverse proxy:** rejected by the owner, who chose nginx (2026-11-19). Caddy makes its own
  certificates. nginx needs an outside tool for that.
- **mkcert as the issuer:** rejected (2026-11-19). mkcert cannot write a name limit, so its issuer can sign any name,
  and it keeps the issuer key in a folder on the PC.
- **Castraferrum terminates TLS itself:** rejected. Certificate handling then lives in the console, and the setup no
  longer matches a public host, where a proxy holds the certificate.
- **Tailscale, or DuckDNS with Let's Encrypt:** rejected. Both need an outside account, and Tailscale needs an app on
  each device.
- **A forward proxy:** rejected. It works for the devices, not for the server, so it cannot hold the certificate of
  the PC or close port 7070.
