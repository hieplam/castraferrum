// A loop-owned probe that answers from a list, for the end-to-end tests of the probe tick: `<dir>/lines.json` is an array of probe lines (strings).
// Each call appends one line to `<dir>/calls.log` and prints entry `n`, where `n` is the number of calls before this one. After the end it prints the last entry.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const calls = join(dir, 'calls.log');
const before = existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter((l) => l !== '').length : 0;
appendFileSync(calls, `call ${before + 1}\n`);
const lines = JSON.parse(readFileSync(join(dir, 'lines.json'), 'utf8'));
process.stdout.write(`${lines[Math.min(before, lines.length - 1)]}\n`);
