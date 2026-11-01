// A loop-owned task tracker for the API tests, in a folder and with no GitHub: `<world> next`, `<world> claim <key>`, `<world> release <key> ...`.
// A label is the folder `label-<key>`. It has the rules of `epic.mjs`: a claim on a label refuses, and a release of a task with no label writes
// nothing if it has `--if-claimed`. A plain release of such a task leaves the file `reopened-<key>`, which a test must never see.
// The file `stale-offers` makes `next` also offer a labelled task: the answer of a probe that another worker overtook.
// An entry of `queue.json` is a key, or `{key, resources}` for a task that needs a resource.
// The file `answer.json`, when it exists, is the line that `next` prints, word for word: a test uses it for `plan`, `done` and the other actions.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [world, command, key, ...rest] = process.argv.slice(2);
const path = (name) => join(world, name);
appendFileSync(path('calls.log'), `${JSON.stringify([command, key ?? null, ...rest])}\n`);

if (command === 'next' && existsSync(path('answer.json'))) {
  console.log(readFileSync(path('answer.json'), 'utf8').trim());
} else if (command === 'next') {
  const queue = JSON.parse(readFileSync(path('queue.json'), 'utf8'));
  const stale = existsSync(path('stale-offers'));
  const tasks = queue.map((entry) => (typeof entry === 'string' ? { key: entry } : entry));
  const ready = tasks.filter(({ key: k }) => !existsSync(path(`done-${k}`)) && (stale || !existsSync(path(`label-${k}`))));
  console.log(JSON.stringify(ready.length ? { v: 1, action: 'take', tasks: ready } : { v: 1, action: 'skip' }));
} else if (command === 'claim') {
  try {
    mkdirSync(path(`label-${key}`));
  } catch {
    console.error(`task ${key} is already claimed`);
    process.exit(1);
  }
} else if (command === 'release') {
  if (existsSync(path(`label-${key}`))) {
    rmSync(path(`label-${key}`), { recursive: true });
    if (!rest.includes('--excused')) writeFileSync(path(`done-${key}`), '');
  } else if (!rest.includes('--if-claimed')) {
    writeFileSync(path(`reopened-${key}`), '');
  }
} else {
  console.error(`unknown command ${command}`);
  process.exit(2);
}
