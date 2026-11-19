# deploy/local-name

Files for the local name `https://castra.home.arpa` on the home network.
The steps are in the "Open with a name on your network" section of the main [README](../../README.md).
The design is in [ADR 0005](../../docs/adr/0005-local-name-through-dns-and-reverse-proxy.md).

| File | What it is |
|---|---|
| `nginx.conf` | A complete nginx main file. Port 80 redirects to HTTPS. Port 443 serves HTTPS and sends each request to `http://127.0.0.1:7070`. |

## CERT_DIR

`nginx.conf` holds the placeholder `CERT_DIR` in two lines: `ssl_certificate` and `ssl_certificate_key`.
`CERT_DIR` is the folder where `mkcert castra.home.arpa` wrote `castra.home.arpa.pem` and `castra.home.arpa-key.pem`,
the `castraferrum/tls` folder under `%LOCALAPPDATA%`, written with forward slashes and the full path.

Replace `CERT_DIR` in the copy that nginx runs, never in this file. The certificate and the key never enter the repository.

## Check the file

```powershell
nginx -t -c <path to the copy>
```

Expected output: `syntax is ok` and `test is successful`.
