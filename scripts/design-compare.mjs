// npm run design:compare — builds the app, then runs tests/visual/ (Playwright, project `visual`) writing into
// design/compare/: shots of the real app (shots/), diff images (diff/), report.json (mismatch ratio per region) and
// index.html — a side-by-side page approved preview | real app | diff for the owner. `npm run verify` runs the same tests
// but writes into reports/compare/.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (args, env = {}) => spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

let code = run(['node_modules/vite/bin/vite.js', 'build']);
// --reporter list: does not overwrite reports/e2e.json (the input of uc-coverage)
if (code === 0) code = run(['node_modules/@playwright/test/cli.js', 'test', '--project', 'visual', '--reporter', 'list'], { LOOPS_COMPARE_OUT: 'design/compare' });
if (code === 0) console.log('design/compare/index.html — preview | real app | diff');
process.exitCode = code;
