// One model run over the rows that no rule took (R6, spec 2.12, decisions 21 and 50). The model has no tools and keeps no
// session. Real rows can hold private text: the report holds only counts, a reason from this file, and the number of a
// cluster. `--show-causes` adds each cause, to stdout only. Nothing from a real run goes in a file.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupProblems } from './groups.mjs';

const PROMPT_FILE = join(dirname(fileURLToPath(import.meta.url)), 'prompt.md');
const REPLY_LINE = 'Do not run a command. Reply with the content of groups.json only, as JSON.';
const ROW_TEXT_LIMIT = 1000;

function buildPrompt(rest) {
  const rows = rest.map((e) => ({ id: e.id, text: e.text.slice(0, ROW_TEXT_LIMIT) }));
  return `${readFileSync(PROMPT_FILE, 'utf8')}\n${REPLY_LINE}\n\n${JSON.stringify({ rest: rows })}`;
}

/** The environment of the model: the login on this machine, and no token that can act on GitHub. */
function modelEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE/i.test(k) || k === 'CLAUDE_CONFIG_DIR'));
  delete env.ANTHROPIC_API_KEY;
  env.GH_TOKEN = 'invalid';
  return env;
}

/** The first balanced `{...}` in `reply` that parses as JSON, also inside a json fence. Null if there is none. */
function parseFirstObject(reply) {
  for (let start = reply.indexOf('{'); start !== -1; start = reply.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < reply.length; i += 1) {
      const c = reply[i];
      if (inString) {
        if (c === '\\') i += 1;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth += 1;
      else if (c === '}' && (depth -= 1) === 0) {
        try {
          return JSON.parse(reply.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

/** Each reason is a fixed sentence: the problem list of `groupProblems` holds words of the model, so it never goes in a verdict. */
function verdictOf({ groups, ruleIds, rest, spend, maxUsd, stopped }) {
  if (stopped) return 'FAIL, the model call did not end with a reply';
  if (spend === null) return 'FAIL, the model reported no spend';
  if (spend > maxUsd) return 'FAIL, the spend is over the limit';
  if (!Array.isArray(groups?.clusters)) return 'FAIL, the reply holds no clusters list';
  const pass = { rest, clusters: ruleIds.map((id) => ({ id, ids: [] })) };
  const problems = groupProblems(pass, groups).length;
  if (problems > 0) return `FAIL, the groups have ${problems} problems`;
  if (newCauseCount(groups.clusters, ruleIds) === 0) return 'FAIL, no cluster of 2 or more rows';
  return 'pass';
}

function newCauseCount(clusters, ruleIds) {
  return clusters.filter((c) => Array.isArray(c?.ids) && c.ids.length >= 2 && !ruleIds.includes(c.id)).length;
}

/** `rest`: rows with `id` and `text`. `ruleIds`: the rule ids, also of a rule that took no row. */
export async function modelRun({ rest, ruleIds, query, model, maxUsd, cwd }) {
  const options = {
    model,
    effort: 'low',
    tools: [],
    settingSources: [],
    persistSession: false,
    maxTurns: 1,
    maxBudgetUsd: maxUsd,
    cwd,
    env: modelEnv(),
  };
  let result = null;
  try {
    for await (const message of query({ prompt: buildPrompt(rest), options })) {
      if (message.type === 'result') result = message;
    }
  } catch {
    // The text of a failed call can quote the prompt. A `result` that came first still counts.
  }
  const spend = typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null;
  const reply = typeof result?.result === 'string' ? result.result : null;
  const groups = reply === null ? null : parseFirstObject(reply);
  const clusters = Array.isArray(groups?.clusters) ? groups.clusters : [];
  return {
    verdict: verdictOf({ groups, ruleIds, rest, spend, maxUsd, stopped: reply === null && spend !== null }),
    clusters,
    newCauses: newCauseCount(clusters, ruleIds),
    spend,
  };
}

/** The report lines. Without `showCauses` they hold no id, no cause and no text. */
export function formatReport(result, { showCauses = false } = {}) {
  const size = (c) => (Array.isArray(c?.ids) ? c.ids.length : 0);
  const lines = result.clusters.map((c, i) => `real-model cause ${i + 1} ${size(c)}`);
  lines.push(`real-model new causes ${result.newCauses}`, `real-model spend-usd ${(result.spend ?? 0).toFixed(4)}`, `real-model verdict: ${result.verdict}`);
  if (showCauses) {
    result.clusters.forEach((c, i) => lines.push(`real-model cause ${i + 1} ${size(c)}: ${String(c?.cause).replace(/\s+/g, ' ')}`));
  }
  return lines;
}

/** Only the four keys that `assemble` reads. */
const recordedGroup = (c) => ({ id: c.id, cause: c.cause, ids: c.ids, check: { kind: c.check.kind, name: c.check.name, replay: c.check.replay } });

function writeRecord(file, clusters) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ clusters: clusters.map(recordedGroup) }, null, 2)}\n`);
}

/**
 * The command `model-run`. `options` are the parsed options, already checked. Returns the exit code: 0 on pass, 1 on FAIL.
 * `deps`: `query` of the SDK; `readRest(options)` gives `{ rest, ruleIds }`; `print(line)` writes to stdout.
 */
export async function runModelCommand(options, { query, readRest, print }) {
  const { rest, ruleIds } = await readRest(options);
  print(`real rest ${rest.length}`);
  // The session of the model starts in an empty folder, and the folder goes away with it.
  const cwd = mkdtempSync(join(tmpdir(), 'lc-real-claude-r6-'));
  let result;
  try {
    result = await modelRun({ rest, ruleIds, query, model: options.model ?? 'haiku', maxUsd: Number(options['max-usd'] ?? 1), cwd });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
  for (const line of formatReport(result, { showCauses: options['show-causes'] === true })) print(line);
  if (result.verdict !== 'pass') return 1;
  if (options.record) writeRecord(options.record, result.clusters);
  return 0;
}
