// Merge guard (spec 2.15): decides from the text of a tool call whether the call can merge a pull request, write a status, or ratify a gate job.
// It does not parse a shell. A nested form (`bash -c`, `xargs`, `node -e`) gives the same result as the plain form.
// The cost is a false refusal when a command only names these words, for example in `git commit -m`: put the words in a file.
// Limit: a script file that holds the merge (`bash m.sh`) or an encoded command passes this check. The audit finds that merge.

export type MergeGuardResult = { deny: false } | { deny: true; rule: string; reason: string };

const ALLOWED: MergeGuardResult = { deny: false };

/** Delete the quote and escape signs, change to lower case and join runs of white space. */
function normalForm(command: string): string {
  return command.replace(/["'`\\^]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const GRAPHQL_NAMES = ['mergepullrequest', 'enablepullrequestautomerge', 'mergebranch', 'enqueuepullrequest', 'createcheckrun', 'updatecheckrun'];
const WRITE_SIGNS = /(?:-x|--method)[ =]*(?:post|patch)|(?:^|\s)-f\s|--field|--raw-field|--input/;
const MCP_WORDS = ['merge_pull', 'merge_branch', 'auto_merge', 'commit_status'];

/** The first rule that matches the normal form of a command, or `null`. */
function commandRule(text: string): string | null {
  if (text.includes('pr merge')) return 'pr-merge';
  if (/pulls\/[^\s/]+\/merge(?![\w-])|\/merges(?![\w-])/.test(text)) return 'rest-merge';
  if (text.includes('/statuses/')) return 'status';
  if (/\/ratify(?![\w-])/.test(text)) return 'ratify';
  if (text.includes('check-runs') && WRITE_SIGNS.test(text)) return 'check-run';
  if (GRAPHQL_NAMES.some((name) => text.includes(name))) return 'graphql';
  if (/\bgit\b.*\bpush\b.*(?:[\s:]|refs\/heads\/)(?:main|master)(?![\w./-])/.test(text)) return 'push-main';
  if (/(?<![\w.-])gh(?:\.exe)?\s*\$/.test(text)) return 'gh-dynamic';
  return null;
}

function refusal(rule: string): MergeGuardResult {
  return {
    deny: true,
    rule,
    reason: `Refused by the merge guard (rule ${rule}). Only the gate merges a pull request or writes a status, and only a person ratifies a gate job. If the command only names these words, for example in git commit -m, put the words in a file.`,
  };
}

/** `toolName` is the name of the tool, `command` is `tool_input.command`. A tool that is not `Bash`, `PowerShell` or `mcp__*` is allowed. */
export function checkMergeCommand(toolName: string, command: unknown): MergeGuardResult {
  if (toolName.toLowerCase().startsWith('mcp__')) {
    const name = toolName.toLowerCase();
    return MCP_WORDS.some((word) => name.includes(word)) ? refusal('mcp') : ALLOWED;
  }
  if (toolName !== 'Bash' && toolName !== 'PowerShell') return ALLOWED;
  if (typeof command !== 'string') return refusal('bad-input');
  const rule = commandRule(normalForm(command));
  return rule === null ? ALLOWED : refusal(rule);
}
