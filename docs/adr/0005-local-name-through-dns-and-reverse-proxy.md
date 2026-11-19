# ADR 0005: a local name and HTTPS through a DNS server and a reverse proxy

- Status: proposed (2026-11-19)
- Spec: [../specs/2026-11-19-local-name.md](../specs/2026-11-19-local-name.md)

## Context

With `--remote`, a phone on the same Wi-Fi opens the console at `http://<pc-ip>:7070`
([lan-access spec](../specs/2026-10-21-lan-access.md)). That address has three problems:

1. A person must remember an IP address and a port number.
2. The traffic has no encryption. The sign-in page sends the password, and every request sends the session cookie,
   as plain text over the Wi-Fi. Castraferrum marks the cookie `Secure` only when `X-Forwarded-Proto: https`
   arrives (`server/http/auth-routes.ts`), and no request carries it today.
3. Port 7070 is open to every device on the network, because Castraferrum listens on `0.0.0.0`.

The owner wants a short name, such as `https://castra.home.arpa`, that behaves like a real public host. It must cost
nothing: no bought domain, no paid service. The public path (a named Cloudflare tunnel, task R6 of epic #46) is on
hold, because the owner has no Cloudflare account.

A name needs two separate jobs:

- A **DNS server** (UDP port 53) changes the name into the IP address of the PC.
- A **reverse proxy** (TCP port 443) receives the HTTPS request on that address, holds the certificate, and sends the
  request to Castraferrum on `127.0.0.1:7070`.

One program cannot do both jobs. A reverse proxy such as nginx does not answer DNS questions.

## Decision

The local name is a machine setup outside the console. The console only learns to work behind a reverse proxy.

- **Name:** `castra.home.arpa`. The suffix `home.arpa` is reserved for home networks (RFC 8375). Nobody can buy it,
  so the name never belongs to a stranger, and a public CA never signs it.
- **DNS server:** Technitium DNS Server on the PC, as a Windows service. It holds the zone `home.arpa` with one A
  record, `castra`, that points to the IP address of the PC. Technitium sends every other name to a public DNS
  server. The router's DHCP setting gives the PC as the **only** DNS server. A second, public DNS server is not set,
  because devices send questions to either server, and a public server answers that `castra.home.arpa` does not
  exist. The owner accepts the result (2026-11-19): when the PC is off, the devices on the Wi-Fi cannot find any
  name until the PC starts again.
- **Reverse proxy:** nginx on the PC, on TCP ports 443 (HTTPS) and 80 (a redirect to HTTPS). The repository holds the
  nginx configuration. nginx sends every request to `127.0.0.1:7070` and adds `X-Forwarded-Proto: https` and
  `X-Real-IP`. It does not buffer responses, so Server-Sent Events arrive at once.
- **Certificate:** mkcert makes a local CA (Certificate Authority) and a certificate for `castra.home.arpa`. The PC
  trusts the CA through `mkcert -install`. Each other device trusts it after the owner copies the CA file to it one
  time. The key files stay outside the repository.
- **Castraferrum** listens on `127.0.0.1` again (no `--remote`). So only nginx can reach port 7070. Behind the proxy,
  the sign-in attempt limit reads `X-Real-IP`, but only when the socket address is loopback. This is the same rule
  that it uses for `CF-Connecting-IP`. `--public-url` prints the name at startup.

When the owner buys a domain later, only the DNS server and the certificate change. nginx and Castraferrum stay the
same. So this setup behaves like a public host.

## Alternatives considered

- **The `hosts` file on each device:** rejected. A phone cannot edit it.
- **The router's own DNS page:** rejected as the default. Only some routers have one, and the owner's router is not
  verified. The README names it as an option.
- **The PC as the first DNS server and `1.1.1.1` as the second:** rejected by the owner (2026-11-19). Phones and
  laptops often ask both servers, or change between them. When `1.1.1.1` answers, the name fails, so the name works
  only some of the time.
- **A wildcard DNS service such as `nip.io`:** rejected. The name must contain the IP address, so it is not short.
- **AdGuard Home or Pi-hole as the DNS server:** rejected. Their main job is ad blocking, and Pi-hole needs Linux or
  Docker. Technitium runs on Windows and local zones are its main job.
- **The DNS server in a Docker container:** rejected. Docker Desktop starts only after a person signs in to Windows,
  so DNS stops for the whole Wi-Fi when nobody is signed in.
- **Caddy as the reverse proxy:** rejected by the owner, who chose nginx (2026-11-19). Caddy makes its own
  certificates. nginx needs mkcert for that.
- **Castraferrum terminates TLS itself:** rejected. Certificate handling then lives in the console, and the setup no
  longer matches a public host, where a proxy holds the certificate.
- **Tailscale, or DuckDNS with Let's Encrypt:** rejected for now. Both need an outside account, and Tailscale needs an
  app on each device. They stay possible later, because nginx and Castraferrum do not change.
- **A forward proxy:** rejected. It works for the devices, not for the server, so it cannot hold the certificate of
  the PC or close port 7070.
