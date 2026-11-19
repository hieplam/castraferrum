# deploy/local-name

Files for the local name of a machine on the home network. The sample name is `https://castra.home.arpa`.
The steps are in the "Open with a name on your network" section of the main [README](../../README.md).
The design is in [ADR 0005](../../docs/adr/0005-local-name-through-dns-and-reverse-proxy.md).

| File | What it is |
|---|---|
| `nginx.conf` | A complete nginx main file. Port 80 redirects to HTTPS. Port 443 serves HTTPS and sends each request to `http://127.0.0.1:7070`. |
| `ca.cnf` | The `openssl` configuration of the name-limited issuer. Section `ca_ext` makes the issuer certificate. Section `server_ext` signs the server certificate. |

## The three values (spec D13)

The repository holds only the sample name. Each machine sets three values:

| Value | Meaning | Sample |
|---|---|---|
| `LOCAL_NAME` | The name of the console. `ca.cnf` reads it for the server certificate, and `nginx.conf` holds it as a placeholder. | `castra.home.arpa` |
| `LOCAL_NAME_LIMIT` | The only name that the issuer may sign: `LOCAL_NAME` or a parent of it. `ca.cnf` reads it. | `castra.home.arpa` |
| `LOOPS_PUBLIC_URL` | `https://` plus `LOCAL_NAME`. The check tool reads the name from it. | `https://castra.home.arpa` |

Set `LOCAL_NAME` and `LOCAL_NAME_LIMIT` in the shell before any `openssl` command that reads `ca.cnf`. The commands are in
step 3 of the main README.

## LOCAL_NAME
`nginx.conf` holds the placeholder `LOCAL_NAME` in `server_name`, in the redirect target and in the two certificate file
names. Replace it with your name in the copy that nginx runs, never in this file.

## CERT_DIR

`nginx.conf` holds the placeholder `CERT_DIR` in two lines: `ssl_certificate` and `ssl_certificate_key`.
`CERT_DIR` is the `castraferrum/tls` folder under `%LOCALAPPDATA%`, where step 3 of the main README wrote
`LOCAL_NAME.pem` and `LOCAL_NAME-key.pem`. Write it with forward slashes and the full path.

Replace `CERT_DIR` in the copy that nginx runs, never in this file. The certificates and the keys never enter the repository.

## Check the file

```powershell
nginx -t -c <path to the copy>
```

Expected output: `syntax is ok` and `test is successful`.
