# deploy/local-name

Files for the local name of a machine on the home network. The sample name is `https://castra.example.com`.
The steps are in the "Open with a name on your network" section of the main [README](../../README.md).
The design is in [ADR 0005](../../docs/adr/0005-local-name-through-dns-and-reverse-proxy.md).

| File | What it is |
|---|---|
| `nginx.conf` | A complete nginx main file. Port 80 redirects to HTTPS. Port 443 serves HTTPS with a Let's Encrypt certificate and sends each request to `http://127.0.0.1:7070`. |

## The two values (spec D13)

The repository holds only the sample name. Each machine sets two values:

| Value | Meaning | Sample |
|---|---|---|
| `LOCAL_NAME` | The name of the console. `nginx.conf` holds it as a placeholder. | `castra.example.com` |
| `LOOPS_PUBLIC_URL` | `https://` plus `LOCAL_NAME`. The check tool reads the name from it. | `https://castra.example.com` |

## LOCAL_NAME

`nginx.conf` holds the placeholder `LOCAL_NAME` in `server_name`, in the redirect target and in the two certificate file
names. Replace it with your name in the copy that nginx runs, never in this file.

## CERT_DIR

`nginx.conf` holds the placeholder `CERT_DIR` in two lines: `ssl_certificate` and `ssl_certificate_key`.
`CERT_DIR` is `C:/ProgramData/castraferrum/tls`, the folder where win-acme writes the PEM files. Only SYSTEM and the
Administrators group can read it. win-acme writes `LOCAL_NAME-chain.pem` (the certificate and its intermediate
certificates) and `LOCAL_NAME-key.pem` (the private key). Write `CERT_DIR` with forward slashes and the full path.

Replace `CERT_DIR` in the copy that nginx runs, never in this file. The certificates and the keys never enter the repository.

## Check the file

```powershell
nginx -t -c <path to the copy>
```

Expected output: `syntax is ok` and `test is successful`.
