// The API surface table of docs/API.md, read as rows. `tests/api/api-surface.test.ts` checks that every row has a route and every
// code a test; `tests/api/auth-api.test.ts` calls every row without a session (remote-access spec G2).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export type ApiRow = { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; description: string; codes: string[] };

/** Row `| GET | \`/loops/:id\` | ... | \`LOOP_NOT_FOUND\` |` -> route; `/start | /stop` is joined to the prefix of the first path. */
export function apiTableRows(text: string = readFileSync(join(ROOT, 'docs', 'API.md'), 'utf8')): ApiRow[] {
  const rows: ApiRow[] = [];
  for (const line of text.split('\n')) {
    const m = /^\| (GET|POST|PUT|DELETE) \| (.+?) \| (.+?) \| (.+?) \|$/.exec(line);
    if (!m) continue;
    const paths = [...m[2]!.matchAll(/`([^`]+)`/g)].map((x) => x[1]!.replace(/\?.*$/, ''));
    const first = paths[0]!;
    const prefix = first.slice(0, first.lastIndexOf('/'));
    const codes = [...m[4]!.matchAll(/`([A-Z_]+)`/g)].map((x) => x[1]!);
    for (const p of paths) rows.push({ method: m[1] as ApiRow['method'], path: p === first ? p : prefix + p, description: m[3]!, codes });
  }
  return rows;
}
