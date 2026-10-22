// postinstall, after `playwright install chromium`: installs WebKit for the phone project of the new UI (UI uplift, task U13),
// except on CI (CI is set), which runs Chromium only.
import { execSync } from 'node:child_process';

if (process.env.CI) console.log('install-webkit: CI is set, WebKit skipped');
else execSync('npx playwright install webkit', { stdio: 'inherit' });
