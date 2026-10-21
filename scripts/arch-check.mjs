// npm run arch: the layer rules (docs/ARCHITECTURE.md, "Layers and the dependency rule"). Two jobs, both must pass:
//   1. real code: 0 dependency-cruiser violations + 0 network calls outside web/api/
//   2. tests/arch-fixtures/: all k/k deliberate violations are caught (empty config / wrong rule -> missed ones -> red)
import { checkFixtures, checkSources } from './arch-lib.mjs';

const sources = await checkSources();
console.log(`dependency-cruiser: ${sources.depcruise.length} violations`);
for (const v of sources.depcruise) console.log(`  ✗ ${v.rule}: ${v.from} → ${v.to}`);
console.log(`network calls outside web/api: ${sources.network.length} violations`);
for (const v of sources.network) console.log(`  ✗ ${v.rule}: ${v.from}`);

const fx = await checkFixtures();
console.log(`arch-fixtures: ${fx.caught}/${fx.expected} violations caught`);
for (const m of fx.missing) console.log(`  ✗ not caught: ${m}`);
for (const u of fx.unexpected) console.log(`  ✗ undeclared violation (add a // violates: line or fix the rule): ${u}`);
for (const r of fx.rulesWithoutFixture) console.log(`  ✗ rule without a deliberately violating file: ${r}`);

const ok =
  sources.depcruise.length === 0 &&
  sources.network.length === 0 &&
  fx.expected > 0 &&
  fx.caught === fx.expected &&
  fx.unexpected.length === 0 &&
  fx.rulesWithoutFixture.length === 0;
process.exitCode = ok ? 0 : 1;
