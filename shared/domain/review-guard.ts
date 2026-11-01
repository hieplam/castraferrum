// Review tool profile (decision 49): decides from the text of a tool call whether a process-review run may make the call.
// A review run reads the code and the first-pass file, writes only into `reports/process-review/`, and runs only the three review scripts.
// A scratch folder holds no session (issue 311), so this check, run as a PreToolUse hook, is the only limit.
// Limit: a script on the allowed list is trusted. It can write where its own code says. A link inside the folder that points outside is not resolved.

export const REVIEW_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Write'] as const;

export type ToolProfile = 'full' | 'review';

export type ReviewGuardResult = { deny: false } | { deny: true; rule: string; reason: string };

/** `undefined` gives `full`, an unknown word gives `null` (the run then fails before the executor). */
export function parseToolProfile(value: string | undefined): ToolProfile | null {
  if (value === undefined) return 'full';
  return value === 'full' || value === 'review' ? value : null;
}

const OUT_DIR = 'reports/process-review/';
/** The scripts of the review, with the options and words that they take. No quote, no `$`, no `;`, no `&`, no `|`, no `>`, no space inside a word. */
const SCRIPT_LINE = /^node( --import tsx)? scripts\/(process-review|process-file-issues|process-review-due)\.mjs( [\w./:@=+-]+)*$/;

const ALLOWED: ReviewGuardResult = { deny: false };

function refusal(rule: string, what: string): ReviewGuardResult {
  return {
    deny: true,
    rule,
    reason: `Refused by the review profile (rule ${rule}): ${what}. A review run reads files, writes only into reports/process-review/, and runs only the three review scripts.`,
  };
}

/** Change `\` to `/` and the case to lower case, and cut the slashes at the end. */
function normalPath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
}

function writeCheck(toolInput: unknown, reviewDir: string): ReviewGuardResult {
  const filePath = typeof toolInput === 'object' && toolInput !== null ? (toolInput as { file_path?: unknown }).file_path : undefined;
  if (typeof filePath !== 'string') return refusal('write-path', 'the Write call has no file_path');
  const prefix = `${normalPath(reviewDir)}/`;
  const path = normalPath(filePath);
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : null;
  if (rest === null || rest === '') return refusal('write-path', 'the file is not inside the review folder');
  if (rest.split('/').some((segment) => segment === '.' || segment === '..')) return refusal('write-path', 'the path has a . or .. segment');
  return ALLOWED;
}

function commandCheck(toolInput: unknown): ReviewGuardResult {
  const command = typeof toolInput === 'object' && toolInput !== null ? (toolInput as { command?: unknown }).command : undefined;
  if (typeof command !== 'string') return refusal('bad-input', 'the command is not a string');
  if (command.includes('..') || !SCRIPT_LINE.test(command)) return refusal('bash-not-listed', 'the command is not one of the three review scripts');
  const words = command.split(' ');
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const target = word === '--out' ? words[i + 1] : word.startsWith('--out=') ? word.slice('--out='.length) : undefined;
    if (word === '--out' || word.startsWith('--out=')) {
      if (target === undefined || !target.startsWith(OUT_DIR)) return refusal('bash-out', 'the value of --out is not inside reports/process-review/');
    }
  }
  return ALLOWED;
}

/** `toolName` is the name of the tool, `toolInput` is `tool_input`, `reviewDir` is the absolute path of `reports/process-review`. */
export function checkReviewTool(toolName: string, toolInput: unknown, reviewDir: string): ReviewGuardResult {
  switch (toolName) {
    case 'Read':
    case 'Grep':
    case 'Glob':
      return ALLOWED;
    case 'Write':
      return writeCheck(toolInput, reviewDir);
    case 'Bash':
    case 'PowerShell':
      return commandCheck(toolInput);
    default:
      return refusal('tool-not-listed', `the tool ${toolName} is not on the review list`);
  }
}
