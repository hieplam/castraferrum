#!/usr/bin/env node
// Says whether a process review is due (spec 2.12, goal G14).
//   node scripts/process-review-due.mjs [--now ISO] [--dir reports/process-review] [--event period_ended|epic_closed]
// Prints {"due","reason","last"}. Due: no `<date>.json` in the folder, or the newest is 7 or more days old, or --event.
// Exit 2: an unknown event, or a --now that is not a date.
import { existsSync, readdirSync } from 'node:fs';

const EVENTS = ['period_ended', 'epic_closed'];
const DAY_MS = 86_400_000;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`process-review-due: --${name} needs a value`);
  return value;
}

const event = option('event');
if (event !== undefined && !EVENTS.includes(event)) fail(`process-review-due: unknown event ${event} (use ${EVENTS.join(' or ')})`);
const nowText = option('now');
const now = nowText === undefined ? new Date() : new Date(nowText);
if (Number.isNaN(now.getTime())) fail(`process-review-due: --now ${nowText} is not a date`);
const dir = option('dir') ?? 'reports/process-review';

const dates = existsSync(dir)
  ? readdirSync(dir)
      .map((n) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(n)?.[1])
      .filter(Boolean)
      .sort()
  : [];
const last = dates.at(-1) ?? null;

let due;
let reason;
if (event !== undefined) {
  due = true;
  reason = `event ${event}`;
} else if (last === null) {
  due = true;
  reason = 'no report yet';
} else {
  const days = Math.floor((now.getTime() - new Date(`${last}T00:00:00Z`).getTime()) / DAY_MS);
  due = days >= 7;
  reason = due ? `last report is ${days} days old` : `last report is ${days} days old, under 7`;
}
process.stdout.write(`${JSON.stringify({ due, reason, last })}\n`);
