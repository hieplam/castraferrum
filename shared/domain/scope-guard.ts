// Scope guard of the gate (spec section 2.9): a pull request must not lower its own bar.
// `checkScope` decides from the changed paths whether a PR passes, is a plan PR (adds keys to a verify file only),
// or touches a guarded path and needs the owner. Pure functions, no Node module, no zod.
//
// Every path form is treated as an attack. A path is compared in one normal form, and a form that cannot be
// normalised with certainty (`..`, a colon, a quote, a short 8.3 name, a control character) is `guarded`.

export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T';

export interface ChangedFile {
  /** Git status letter, with or without a score ("R100"). An unknown letter is `guarded`. */
  status: string;
  path: string;
  /** The old path of a rename or a copy. */
  oldPath?: string;
}

/** The text of one verify file at the base commit and at the head commit (`null`: the file does not exist). */
export interface VerifyChange {
  path: string;
  base: string | null;
  head: string | null;
}

/** The text of `package.json` at the base commit and at the head commit. */
export interface PackageChange {
  base: string;
  head: string;
}

export interface ScopeInput {
  changed: ChangedFile[];
  guarded: string[];
  verifyChanges: VerifyChange[];
  packageChange?: PackageChange;
}

export type ScopeVerdict =
  | { verdict: 'pass' }
  | { verdict: 'plan'; addedKeys: string[] }
  | { verdict: 'guarded'; paths: string[]; reason: string };

export interface VerifyTask {
  green: { run: string; expect: string[] }[];
  stub: { run: string } | { none: string };
}

export interface VerifyFile {
  v: 1;
  tasks: Record<string, VerifyTask>;
}

export interface GateConfig {
  v: 1;
  setup: string[];
  verify: string[];
  env: Record<string, string>;
  guarded: string[];
  testGlobs: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Paths

export interface NormalPath {
  /** The comparison form: forward slashes, no `.` segment, no trailing dot or space, case folded. */
  norm: string;
  /** True when the form cannot be compared with certainty. A caller treats it as guarded. */
  unsafe: boolean;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// An NTFS short name such as GOALS~1 or GOALS~1.JSO names a long file that we cannot resolve here.
const SHORT_NAME = /^[^.]{1,6}~\d+(\..{0,3})?$/;

/** Normalise one repository path. Windows and macOS see these forms as the same file, so they get one form. */
export function normalizePath(raw: string): NormalPath {
  if (typeof raw !== 'string' || raw === '') return { norm: '', unsafe: true };
  // NFKC folds look-alike characters. Upper then lower folds the cases that only one direction folds.
  const text = raw.normalize('NFKC').replaceAll('\\', '/').toUpperCase().toLowerCase();
  let unsafe = CONTROL.test(text) || text.includes('"') || text.includes(':');
  const kept: string[] = [];
  for (const segment of text.split('/')) {
    if (segment === '' || segment === '.') continue; // `//`, a leading `/`, `./`
    if (segment === '..') {
      unsafe = true;
      continue;
    }
    // Windows drops trailing dots and spaces: `goals./x` and `goals /x` are `goals/x`.
    const trimmed = segment.replace(/[. ]+$/, '');
    if (trimmed === '' || trimmed === '.git' || SHORT_NAME.test(trimmed)) unsafe = true;
    kept.push(trimmed === '' ? segment : trimmed);
  }
  if (kept.length === 0) unsafe = true;
  return { norm: kept.join('/'), unsafe };
}

const UNSUPPORTED_GLOB = /[?[\]{}()!+@]/;

/** A glob of the gate file: `*` stops at `/`, `**` crosses it. `dir/**` also matches `dir` itself. */
export function globToRegExp(glob: string): RegExp {
  if (UNSUPPORTED_GLOB.test(glob)) throw new Error(`glob not supported: ${glob}`);
  const g = glob.normalize('NFKC').replaceAll('\\', '/').toUpperCase().toLowerCase().replace(/^(\.\/)+/, '');
  let out = '';
  for (let i = 0; i < g.length; ) {
    if (g.startsWith('/**', i) && i + 3 === g.length) {
      out += '(?:/.*)?';
      i += 3;
    } else if (g.startsWith('**/', i) && (i === 0 || g[i - 1] === '/')) {
      out += '(?:.*/)?';
      i += 3;
    } else if (g.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (g[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else {
      out += g[i]!.replace(/[.+^$|\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${out}$`, 's');
}

export function matchesGlob(path: string, globs: string[]): boolean {
  const { norm } = normalizePath(path);
  return globs.some((glob) => globToRegExp(glob).test(norm));
}

// ---------------------------------------------------------------------------------------------------------------
// Parsers (no zod)

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(what: string, why: string): never {
  throw new Error(`${what}: ${why}`);
}

function exactKeys(what: string, value: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(what, `missing key "${key}"`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(what, `unknown key "${key}"`);
}

function stringArray(what: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) fail(what, 'must be a list of strings');
  return value as string[];
}

function parseJson(what: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail(what, 'not valid JSON');
  }
}

/** Parse the text of `goals/gate.json`. Throws on a bad shape. */
export function parseGateConfig(text: string): GateConfig {
  const what = 'gate.json';
  const value = parseJson(what, text);
  if (!isObject(value)) return fail(what, 'must be an object');
  exactKeys(what, value, ['v', 'setup', 'verify', 'env', 'guarded', 'testGlobs']);
  if (value.v !== 1) fail(what, '"v" must be 1');
  const env = value.env;
  if (!isObject(env) || Object.values(env).some((item) => typeof item !== 'string')) {
    fail(what, '"env" must map names to strings');
  }
  const config: GateConfig = {
    v: 1,
    setup: stringArray(`${what} "setup"`, value.setup),
    verify: stringArray(`${what} "verify"`, value.verify),
    env: env as Record<string, string>,
    guarded: stringArray(`${what} "guarded"`, value.guarded),
    testGlobs: stringArray(`${what} "testGlobs"`, value.testGlobs),
  };
  for (const glob of [...config.guarded, ...config.testGlobs]) globToRegExp(glob); // throws on an unsupported glob
  return config;
}

function parseTask(what: string, value: unknown): VerifyTask {
  if (!isObject(value)) return fail(what, 'must be an object');
  exactKeys(what, value, ['green', 'stub']);
  if (!Array.isArray(value.green)) fail(what, '"green" must be a list');
  const green = value.green.map((entry: unknown, index: number) => {
    const at = `${what} green[${index}]`;
    if (!isObject(entry)) return fail(at, 'must be an object');
    exactKeys(at, entry, ['run', 'expect']);
    if (typeof entry.run !== 'string' || entry.run === '') fail(at, '"run" must be a non-empty string');
    return { run: entry.run as string, expect: stringArray(`${at} "expect"`, entry.expect) };
  });
  const stub = value.stub;
  if (!isObject(stub)) return fail(what, '"stub" must be an object');
  if (Object.hasOwn(stub, 'run')) {
    exactKeys(`${what} stub`, stub, ['run']);
    if (typeof stub.run !== 'string' || stub.run === '') fail(what, 'stub "run" must be a non-empty string');
    return { green, stub: { run: stub.run as string } };
  }
  exactKeys(`${what} stub`, stub, ['none']);
  if (typeof stub.none !== 'string' || stub.none === '') fail(what, 'stub "none" must give a reason');
  return { green, stub: { none: stub.none as string } };
}

/** Parse the text of a `goals/verify/<slug>.json` file. Throws on a bad shape. */
export function parseVerifyFile(text: string): VerifyFile {
  const what = 'verify file';
  const value = parseJson(what, text);
  if (!isObject(value)) return fail(what, 'must be an object');
  exactKeys(what, value, ['v', 'tasks']);
  if (value.v !== 1) fail(what, '"v" must be 1');
  if (!isObject(value.tasks)) return fail(what, '"tasks" must be an object');
  const tasks: Record<string, VerifyTask> = Object.create(null) as Record<string, VerifyTask>;
  for (const [key, task] of Object.entries(value.tasks)) tasks[key] = parseTask(`${what} task "${key}"`, task);
  return { v: 1, tasks };
}

// ---------------------------------------------------------------------------------------------------------------
// Deep equality (key order does not matter)

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
    );
  }
  if (!isObject(a) || !isObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

// ---------------------------------------------------------------------------------------------------------------
// package.json rule

const MIN_FLAG = /(--min[ =])(\d+)(?![\w.])/g;

/** True when `head` differs from `base` only by higher numbers after `--min`. */
function onlyHigherMin(base: string, head: string): boolean {
  const baseNumbers: number[] = [];
  const headNumbers: number[] = [];
  const baseShape = base.replace(MIN_FLAG, (_all, flag: string, n: string) => (baseNumbers.push(Number(n)), `${flag}#`));
  const headShape = head.replace(MIN_FLAG, (_all, flag: string, n: string) => (headNumbers.push(Number(n)), `${flag}#`));
  if (baseShape !== headShape || baseNumbers.length !== headNumbers.length) return false;
  return headNumbers.every((n, i) => Number.isSafeInteger(n) && Number.isSafeInteger(baseNumbers[i]) && n >= baseNumbers[i]!);
}

/** The rule of 2.9: `scripts` deep-equal, or a higher `--min` in `scripts.verify` and nothing else. Returns a reason on refusal. */
function packageRefusal(change: PackageChange | undefined, changed: ChangedFile[]): string | null {
  if (change === undefined) return 'package.json changed with no packageChange';
  if (changed.some((c) => isPackageJson(c.path) && c.status.toUpperCase().charAt(0) !== 'M')) {
    return 'package.json was added, deleted, renamed or copied';
  }
  if (changed.some((c) => c.oldPath !== undefined && isPackageJson(c.oldPath))) return 'package.json was renamed or copied';
  let base: unknown;
  let head: unknown;
  try {
    base = JSON.parse(change.base);
    head = JSON.parse(change.head);
  } catch {
    return 'package.json is not valid JSON';
  }
  if (!isObject(base) || !isObject(head)) return 'package.json must be an object';
  const baseScripts = base.scripts;
  const headScripts = head.scripts;
  if (!isObject(baseScripts) || !isObject(headScripts)) return 'package.json scripts must be an object';
  if (deepEqual(baseScripts, headScripts)) return null;
  const others = (scripts: Record<string, unknown>) => {
    const { verify: _verify, ...rest } = scripts;
    return rest;
  };
  const baseVerify = baseScripts.verify;
  const headVerify = headScripts.verify;
  if (
    typeof baseVerify === 'string' &&
    typeof headVerify === 'string' &&
    deepEqual(others(baseScripts), others(headScripts)) &&
    onlyHigherMin(baseVerify, headVerify)
  ) {
    return null;
  }
  return 'package.json scripts changed in a way other than a higher --min';
}

function isPackageJson(path: string): boolean {
  const { norm, unsafe } = normalizePath(path);
  return !unsafe && norm === 'package.json';
}

// ---------------------------------------------------------------------------------------------------------------
// Plan PR

const VERIFY_FILE = /^goals\/verify\/[^/]+\.json$/;
const PLAN_DOCS = /^docs\/plans\/.+$/;

function isVerifyFile(path: string): boolean {
  const { norm, unsafe } = normalizePath(path);
  return !unsafe && VERIFY_FILE.test(norm) && norm !== 'goals/verify/.json';
}

function isPlanDoc(path: string): boolean {
  const { norm, unsafe } = normalizePath(path);
  return !unsafe && PLAN_DOCS.test(norm);
}

/** Added task keys of a verify file, or a reason that the change is not "only add keys". */
function addedKeysOf(change: VerifyChange | undefined, status: string, path: string): { keys: string[] } | { why: string } {
  if (change === undefined) return { why: `no verifyChanges row for ${path}` };
  if (change.head === null) return { why: `${path} has no head text` };
  let head: VerifyFile;
  let base: VerifyFile;
  try {
    head = parseVerifyFile(change.head);
    if (change.base === null) {
      if (status !== 'A') return { why: `${path} is modified but has no base text` };
      base = { v: 1, tasks: Object.create(null) as Record<string, VerifyTask> };
    } else {
      base = parseVerifyFile(change.base);
    }
  } catch (error) {
    return { why: `${path}: ${(error as Error).message}` };
  }
  if (base.v !== head.v) return { why: `${path}: "v" changed` };
  for (const [key, task] of Object.entries(base.tasks)) {
    if (!Object.hasOwn(head.tasks, key)) return { why: `${path}: task "${key}" was removed` };
    if (!deepEqual(task, head.tasks[key])) return { why: `${path}: task "${key}" was changed` };
  }
  const keys = Object.keys(head.tasks).filter((key) => !Object.hasOwn(base.tasks, key));
  for (const key of keys) {
    if (head.tasks[key]!.green.length === 0) return { why: `${path}: added task "${key}" has an empty green` };
  }
  return { keys };
}

// ---------------------------------------------------------------------------------------------------------------
// checkScope

const KNOWN_STATUS = new Set(['A', 'M', 'D', 'R', 'C', 'T']);

function letter(status: string): string {
  return typeof status === 'string' ? status.toUpperCase().charAt(0) : '';
}

function refuse(paths: string[], reason: string): ScopeVerdict {
  return { verdict: 'guarded', paths: [...new Set(paths)], reason };
}

export function checkScope(input: ScopeInput): ScopeVerdict {
  const { changed, guarded, verifyChanges, packageChange } = input;
  const allPaths = changed.flatMap((c) => (c.oldPath === undefined ? [c.path] : [c.path, c.oldPath]));

  // 1. A form that cannot be compared with certainty, or a status that we do not know.
  const odd = changed.filter(
    (c) => !KNOWN_STATUS.has(letter(c.status)) || normalizePath(c.path).unsafe || (c.oldPath !== undefined && normalizePath(c.oldPath).unsafe),
  );
  if (odd.length > 0) return refuse(odd.flatMap((c) => (c.oldPath === undefined ? [c.path] : [c.path, c.oldPath])), 'unsafe path or unknown status');

  // 2. package.json has its own rule.
  const touchesPackage = changed.filter((c) => isPackageJson(c.path) || (c.oldPath !== undefined && isPackageJson(c.oldPath)));
  if (touchesPackage.length > 0) {
    const why = packageRefusal(packageChange, changed);
    if (why !== null) return refuse(allPaths.filter(isPackageJson), why);
  }

  // 3. Which changes touch a guarded path (the path, or the old path of a rename or a copy)?
  const touchesGuarded = (c: ChangedFile) => matchesGlob(c.path, guarded) || (c.oldPath !== undefined && matchesGlob(c.oldPath, guarded));
  const guardedChanges = changed.filter(touchesGuarded);
  if (guardedChanges.length === 0) return { verdict: 'pass' };

  // 4. A plan PR: only verify files (A or M) and plan docs, and only added keys.
  const planVerify = (c: ChangedFile) => isVerifyFile(c.path) && c.oldPath === undefined;
  const planDoc = (c: ChangedFile) => isPlanDoc(c.path) && (c.oldPath === undefined || isPlanDoc(c.oldPath));
  if (!changed.every((c) => planVerify(c) || planDoc(c))) {
    const mixed = guardedChanges.some(planVerify);
    return refuse(
      mixed ? allPaths : guardedChanges.flatMap((c) => (c.oldPath === undefined ? [c.path] : [c.path, c.oldPath])),
      mixed ? 'a verify file changed with other files' : 'a guarded path changed',
    );
  }

  const addedKeys: string[] = [];
  const seen = new Set<string>();
  for (const c of changed.filter(planVerify)) {
    const status = letter(c.status);
    if (status !== 'A' && status !== 'M') return refuse([c.path], `${c.path} has status ${status}`);
    const key = normalizePath(c.path).norm;
    if (seen.has(key)) return refuse([c.path], `${c.path} is listed twice`);
    seen.add(key);
    const rows = verifyChanges.filter((row) => normalizePath(row.path).norm === key);
    if (rows.length > 1) return refuse([c.path], `${c.path} has more than one verifyChanges row`);
    const result = addedKeysOf(rows[0], status, c.path);
    if ('why' in result) return refuse([c.path], result.why);
    addedKeys.push(...result.keys);
  }
  return { verdict: 'plan', addedKeys: addedKeys.sort() };
}

// ---------------------------------------------------------------------------------------------------------------
// Files that `npm run verify` reaches

const NO_FILE = new Set(['tsc', 'vitest', 'playwright', 'vite']);
const SHELL_META = /[;|&`$<>(){}\n\r'"\\*?~]/;

function splitCommands(line: string): string[] {
  return line.split('&&').map((part) => part.trim());
}

/**
 * The script files that one script of package.json runs, following `npm run <x>` (and the `pre<x>` and `post<x>`
 * hooks that npm runs by itself). Throws on a command it does not know, so a new command cannot slip in.
 */
export function verifyEntryFiles(scripts: Record<string, string>, entry = 'verify'): string[] {
  const files: string[] = [];
  const done = new Set<string>();
  const walk = (name: string, trail: string[]): void => {
    if (trail.includes(name)) fail('scripts', `"${name}" calls itself: ${[...trail, name].join(' > ')}`);
    if (!Object.hasOwn(scripts, name)) fail('scripts', `no script "${name}"`);
    if (done.has(name)) return;
    done.add(name);
    for (const hook of [`pre${name}`, name, `post${name}`]) {
      if (hook !== name) {
        if (Object.hasOwn(scripts, hook)) walk(hook, [...trail, name]);
        continue;
      }
      for (const command of splitCommands(scripts[name]!)) runCommand(command, [...trail, name]);
    }
  };
  const runCommand = (command: string, trail: string[]): void => {
    if (command === '') fail('scripts', `empty command in "${trail.at(-1)}"`);
    if (SHELL_META.test(command)) fail('scripts', `shell syntax that we do not follow: ${command}`);
    const words = command.split(/\s+/);
    const [program, ...rest] = words as [string, ...string[]];
    if (NO_FILE.has(program)) return;
    if (program === 'npm' && (rest[0] === 'run' || rest[0] === 'run-script')) {
      const target = rest[1];
      if (target === undefined || target.startsWith('-')) fail('scripts', `cannot read: ${command}`);
      if (rest.length > 2 && rest[2] !== '--') fail('scripts', `cannot read: ${command}`);
      walk(target, trail);
      return;
    }
    if (program === 'node') {
      let at = 0;
      if (rest[0] === '--import') {
        if (rest[1] !== 'tsx') fail('scripts', `unknown --import: ${command}`);
        at = 2;
      }
      const file = rest[at];
      if (file === undefined || file.startsWith('-')) fail('scripts', `cannot find the file of: ${command}`);
      files.push(file);
      return;
    }
    fail('scripts', `unknown command: ${command}`);
  };
  walk(entry, []);
  return [...new Set(files)];
}
