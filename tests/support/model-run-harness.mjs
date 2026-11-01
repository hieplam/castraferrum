// Runs `runModelCommand` of scripts/process-review/model-run.mjs with a scripted model and scripted rows, as a child
// process, so that a test sees its real stdout and every file that it leaves. Nothing here reads a database or starts a model.
//   node --import tsx tests/support/model-run-harness.mjs <job.json>
// job: { options, rest, ruleIds, reply, cost }. `rest` and `ruleIds` take the place of the rows of the real database.
import { readFileSync } from 'node:fs';
import { runModelCommand } from '../../scripts/process-review/model-run.mjs';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));

async function* query() {
  yield { type: 'result', subtype: 'success', result: job.reply, total_cost_usd: job.cost };
}

process.exitCode = await runModelCommand(job.options, {
  query,
  readRest: async () => ({ rest: job.rest, ruleIds: job.ruleIds }),
  print: (line) => process.stdout.write(`${line}\n`),
});
