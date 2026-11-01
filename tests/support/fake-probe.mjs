// A loop-owned probe for the API tests: prints the file that its argument names. A missing file gives exit 1 (a real failure).
import { readFileSync } from 'node:fs';

try {
  process.stdout.write(readFileSync(process.argv[2], 'utf8'));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
