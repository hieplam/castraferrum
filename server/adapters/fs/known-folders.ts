import { execFile } from 'node:child_process';

/** The user's real Desktop / Documents / Downloads; for any that are missing the browser uses `<home>/<English name>`. */
export type KnownFolders = Partial<Record<'desktop' | 'documents' | 'downloads', string>>;

// Windows: Desktop / Documents may be relocated by OneDrive and carry a localized name — measured 19/10/2026 on the project owner's machine: Desktop =
// `C:\Users\alice\OneDrive\<localized Desktop name>`, Documents = `C:\Users\alice\OneDrive\Documents`, and there is no `C:\Users\alice\Desktop`.
// Guessing `<home>\Desktop` is wrong → ask Windows (Known Folder) once. `reg query` prints in the OEM code page, which garbles accented text,
// so use PowerShell with UTF-8 output (~0.5 s, only the first time the "Browse…" dialog opens).
const SCRIPT = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  "$d = (New-Object -ComObject Shell.Application).Namespace('shell:Downloads')",
  "@{ desktop = [Environment]::GetFolderPath('Desktop'); documents = [Environment]::GetFolderPath('MyDocuments'); downloads = $(if ($d) { $d.Self.Path } else { '' }) } | ConvertTo-Json -Compress",
].join('; ');

/** Ask Windows for the real paths of Desktop / Documents / Downloads. Error / over 10 seconds → `{}` (the browser falls back to guessing). */
export function windowsKnownFolders(): Promise<KnownFolders> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { windowsHide: true, timeout: 10_000, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return resolve({});
        try {
          const raw = JSON.parse(stdout.trim()) as Record<string, unknown>;
          const out: KnownFolders = {};
          for (const k of ['desktop', 'documents', 'downloads'] as const) {
            const v = raw[k];
            if (typeof v === 'string' && v.trim()) out[k] = v.trim();
          }
          resolve(out);
        } catch {
          resolve({});
        }
      },
    );
  });
}
